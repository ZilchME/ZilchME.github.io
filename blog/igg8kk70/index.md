---
url: /blog/igg8kk70/index.md
---
## 背景

在工业数据采集系统中，传感器通常按照固定频率上报数据。例如当前项目中，默认假设每台设备以 `1Hz` 的频率上报原始数据，也就是每秒一条。

在理想情况下，系统入口流量可以被稳定估算：

```text
入口 QPS = 设备数量 * 单设备上报频率
```

例如 200 台设备，每台设备每秒 1 条数据，Collector 入口正常流量约为：

```text
200 * 1 = 200 QPS
```

但真实系统中可能出现异常情况：

* 某个设备程序异常，短时间内高频发送数据
* 边缘节点重试逻辑失控，重复推送同一批数据
* 网络抖动后集中补发
* 客户端误配置，将 1Hz 变成 10Hz 甚至更高

即使数据库通过 `(device_id, timestamp)` 主键和 Upsert 能保证数据不重复落库，异常流量仍然会先经过：

```text
Collector -> Redis hot raw -> RabbitMQ -> Storage -> MySQL
```

如果不在入口提前拦截，异常突发流量会继续向后扩散，最终冲击 MQ 积压和 MySQL 写入。

因此，当前项目在 Collector 实时数据入口增加了按 `device_id` 维度的令牌桶限流。

## 为什么选择令牌桶

限流常见方案有固定窗口、滑动窗口、漏桶和令牌桶。

当前场景更适合令牌桶，原因是传感器虽然理论上稳定 `1Hz`，但实际链路允许存在短暂抖动。

如果使用严格滑动窗口，那么正常网络抖动也可能被误伤。比如设备第 1 秒的数据延迟了，在第 2 秒连续补发 2 条，这种行为不一定是异常，但会被严格窗口拒绝。

令牌桶更适合表达这种规则：

* 长期平均速率受限
* 短时间允许少量突发
* 持续高频一定会被拦截

当前项目的默认配置是：

```yaml
collector:
  rate-limit:
    device:
      enabled: true
      refill-rate-per-second: 1.2
      burst-capacity: 5
      key-prefix: "rate:device:"
      key-ttl-ms: 60000
      fail-open: true
```

含义是：

```text
每个设备每秒补充 1.2 个令牌
令牌桶最多存 5 个令牌
每接收一条实时数据消耗 1 个令牌
令牌不足时拒绝本次请求
```

这比严格的 `1/s` 多了一点余量，可以容忍正常网络抖动；但如果某个设备持续以 `10/s` 上报，很快就会耗尽令牌并被限流。

## 令牌桶原理

可以把令牌桶理解成一个容量有限的桶。

系统按照固定速度往桶里放令牌：

```text
refill-rate-per-second = 1.2
```

桶有最大容量：

```text
burst-capacity = 5
```

请求到达时：

```text
如果桶里令牌数 >= 1：
    消耗 1 个令牌，请求通过
否则：
    请求被限流
```

令牌数不会无限增长，最多只能达到桶容量。因此系统允许短暂突发，但不会允许长期超频。

举个例子：

```text
设备空闲 5 秒后，桶内最多累积 5 个令牌
设备随后瞬间发送 5 条数据，可以通过
第 6 条如果立刻到达，就会被拒绝
之后每过约 0.83 秒恢复 1 个令牌
```

这个行为非常适合传感器采集：

```text
正常 1Hz 上报：基本不会被限制
短暂补发几条：允许
持续异常高频：拦截
```

## Redis Lua 原子限流

每个设备一个 Redis key：

```
rate:device:{deviceId}
```

value 可以用 Redis Hash 存两个字段，令牌桶需要维护这两个核心状态：

```
tokens = 当前剩余令牌数
ts     = 上次刷新时间戳，单位毫秒
```

每次请求进来时，Lua 脚本完成以下步骤：

```text
1. 读取当前 tokens 和 ts
2. 根据 now - ts 计算应该补充多少令牌
3. tokens = min(capacity, tokens + elapsed * rate)
4. 如果 tokens >= 1，则扣减 1 个令牌并放行
5. 如果 tokens < 1，则拒绝
6. 写回 tokens 和 ts
7. 设置 key 过期时间
```

这里用 Lua 的原因是要保证这些操作是原子的。

```lua
-- KEYS[1] = rate limit key，例如 rate:device:{deviceId}

-- ARGV[1] = nowMillis 当前时间戳，毫秒
-- ARGV[2] = refillRatePerSecond 每秒补充令牌数，例如 1.2
-- ARGV[3] = burstCapacity 桶容量，例如 5
-- ARGV[4] = requestedTokens 本次请求消耗令牌数，一般是 1
-- ARGV[5] = ttlMillis key 过期时间，毫秒

local key = KEYS[1]

local nowMillis = tonumber(ARGV[1])
local refillRatePerSecond = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local ttlMillis = tonumber(ARGV[5])

local currentTokens = tonumber(redis.call('HGET', key, 'tokens'))
local lastRefillMillis = tonumber(redis.call('HGET', key, 'ts'))

if currentTokens == nil then
    currentTokens = capacity
end

if lastRefillMillis == nil then
    lastRefillMillis = nowMillis
end

local elapsedMillis = nowMillis - lastRefillMillis

if elapsedMillis < 0 then
    elapsedMillis = 0
end

local refillTokens = elapsedMillis * refillRatePerSecond / 1000
local newTokens = currentTokens + refillTokens

if newTokens > capacity then
    newTokens = capacity
end

local allowed = 0

if newTokens >= requested then
    allowed = 1
    newTokens = newTokens - requested
end

redis.call('HSET', key, 'tokens', newTokens, 'ts', nowMillis)
redis.call('PEXPIRE', key, ttlMillis)

return { allowed, newTokens }
```

这个脚本返回两个值：

* allowed   是否允许通过，1 表示通过，0 表示拒绝
* newTokens 本次计算后剩余令牌数

如果用多条 Redis 命令分别执行：

```text
GET tokens
GET ts
计算
SET tokens
SET ts
```

在高并发情况下，不同请求可能同时读到相同的旧值，导致限流失效。Lua 脚本在 Redis 内部一次执行完，可以避免并发竞争。

## fail-open 策略

当前实现中有一个配置：

```yaml
fail-open: true
```

它的含义是：如果 Redis 短暂异常导致限流判断失败，默认放行请求。

这样设计是因为采集入口属于数据链路的关键入口。如果 Redis 出现短暂抖动，直接拒绝所有设备数据会造成大面积数据缺失。

当然，这不是绝对规则。如果系统更关注保护后端数据库，也可以改成：

```yaml
fail-open: false
```

这样 Redis 限流不可用时会默认拒绝请求。

当前项目更偏向保证采集可用性，所以选择 `fail-open=true`。

## 返回行为

实时数据入口中，如果缺少 `deviceId`，直接返回业务错误：

```text
code = 400
message = deviceId is required
```

如果设备超过令牌桶限制，返回：

```text
code = 429
message = Device data rate limit exceeded
```

同时 Collector 会记录 warn 日志，后续可以接入监控指标，例如：

```text
单设备限流次数
限流设备数量
Redis 限流失败次数
MQ backlog
Storage 写入耗时
```

## 小结

在稳定频率的传感器采集系统中，限流的目标不是压低正常流量，而是阻断异常突发。

当前项目采用 Redis Lua 令牌桶，在 Collector 层按 `device_id` 限制实时数据入口：

```text
长期平均速率：1.2 条/秒
短暂突发容量：5 条
限流维度：device_id
限流位置：Collector 实时数据入口
补录接口：不参与限流
Redis 异常策略：fail-open
```

这个方案的价值在于：

```text
正常 1Hz 数据不会受影响
网络抖动和短暂补发可以通过
异常高频设备会在入口被拦截
RabbitMQ 和 MySQL 不会直接承受突发压力
```

对于后续扩展，可以继续增加滑动窗口统计，用来识别持续异常设备，并配合 Redis 短期黑名单做自动熔断。
