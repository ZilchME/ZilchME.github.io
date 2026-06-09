---
title: 千问C端事业群-工程技术部-网盘研发组一面
tags:
  - Java
  - MySQL
  - Redis
  - 多线程
createTime: 2026/06/04 21:59:29
permalink: /blog/zu1c1ehe/
---

## 游标分页

MySQL 游标分页，也常叫 `Keyset Pagination` 或 `Seek Pagination`，核心思路是：

> 不再用 `offset` 跳过大量数据，而是记住上一页最后一条数据的位置，下次从这个位置之后继续往后查。

传统分页通常这样写：

```sql
select *
from orders
where user_id = 1001
order by created_time, id
limit 1000000, 20;
```

这个写法的问题是，MySQL 需要先按条件和排序找到前面 `1000000 + 20` 条数据，然后丢掉前 1000000 条，只返回最后 20 条。页码越深，扫描和丢弃的数据越多，所以越慢。

游标分页会改成这样，第一页直接查前 20 条：

```sql
select *
from orders
where user_id = 1001
order by created_time, id
limit 20;
```

假设第一页最后一条数据是：

```text
created_time = '2026-06-02 10:00:00'
id = 10086
```

下一页就用这个值作为游标：

```sql
select *
from orders
where user_id = 1001
and (
    created_time > '2026-06-02 10:00:00'
    or (created_time = '2026-06-02 10:00:00' and id > 10086)
)
order by created_time, id
limit 20;
```

这样 MySQL 不需要从第一页重新扫到第 1000000 条，而是可以借助索引直接从上一次结束的位置继续往后扫描。

它的关键是：==**排序字段必须稳定且唯一**==。

实际落地时，游标通常由“排序字段 + 唯一后缀”组成，查询条件也要和 `order by` 保持同样的方向与顺序；索引则要覆盖过滤条件和排序键，这样 MySQL 才能顺着索引连续扫描。

它适合“大范围顺序读取”或“深分页”场景，比如导出历史数据、日志分页、订单列表无限滚动、批量训练数据读取。

例如一次导出 50000 条：

```sql
select id, device_id, metric, value, timestamp
from aggregated_device_data
where sampling = ?
and timestamp >= ?
and timestamp < ?
and device_id in (...)
and (
    timestamp > ?
    or (timestamp = ? and device_id > ?)
    or (timestamp = ? and device_id = ? and metric > ?)
)
order by timestamp, device_id, metric
limit 50000;
```

这里的游标就是上一批最后一条记录的：

```text
lastTimestamp
lastDeviceId
lastMetric
```

下一次查询从它后面继续扫。

> 游标分页的本质是利用有序索引做连续扫描。传统 `offset` 分页需要扫描并丢弃前面大量数据，深分页性能会越来越差；游标分页通过记录上一页最后一条数据的排序键，下次查询从该排序键之后继续读取，避免大量 `offset` 跳过。它要求排序字段稳定、最好唯一，并且要建立匹配 `where` 和 `order by` 的联合索引。缺点是不能直接跳到第 N 页，更适合下一页、上一页、滚动加载和大批量顺序导出。

## 不稳定字段的分页查询如何设计

如果排序字段不稳定，比如只按 `created_time` 排序，而同一秒内有大量数据，或者按 `score`、`amount` 这种可能重复、可能变化的字段排序，那么直接做游标分页会遇到两个问题：

- 顺序不唯一，同一排序值下多条记录的顺序不确定，下一页可能重复或漏数据。
- 排序值会变化，比如按热度、更新时间、评分排序，分页过程中前面数据的位置发生变化，用户翻到下一页时可能看到重复数据，或者某些数据被跳过。

所以大规模数据分页的原则很简单：**先把排序变稳定，再决定是否需要快照。**

### 1. 先把排序变稳定

最常见的做法是给排序字段追加一个唯一后缀，组成稳定的组合排序键。

原来这样：

```sql
select *
from orders
order by created_time desc
limit 20;
```

如果 `created_time` 不唯一，应该改成：

```sql
select *
from orders
order by created_time desc, id desc
limit 20;
```

下一页用组合游标：

```sql
select *
from orders
where (
    created_time < ?
    or (created_time = ? and id < ?)
)
order by created_time desc, id desc
limit 20;
```

这样就能把非唯一排序键变成稳定排序键。

对应索引可以设计为：

```sql
create index idx_orders_time_id
on orders(created_time, id);
```

如果还有业务过滤条件，比如按用户查订单：

```sql
select id, order_no, created_time, amount
from orders
where user_id = ?
and (
    created_time < ?
    or (created_time = ? and id < ?)
)
order by created_time desc, id desc
limit 20;
```

索引可以设计为：

```sql
create index idx_orders_user_time_id
on orders(user_id, created_time, id);
```

### 2. 再处理可变字段

如果排序字段本身会变化，比如：

```sql
order by update_time desc, id desc
```

或者：

```sql
order by score desc, id desc
```

那么分页期间有数据更新，就可能导致位置变化。例如第一页查完后，第二页还没查，某条数据的 `score` 变高，被移动到第一页前面，这时后续分页就可能重复或漏掉。

#### 方案一：快照边界

比如按 `created_time desc, id desc` 查最新订单时，可以在第一次查询时记录一个最大边界：

```text
snapshot_time = 当前查询时刻
```

后续分页都加上：

```sql
where created_time <= snapshot_time
```

这样分页过程中，新产生的数据不会插入到当前分页结果里，当前这一轮分页更稳定。

例如第一页：

```sql
select id, created_time
from orders
where created_time <= '2026-06-08 10:00:00'
order by created_time desc, id desc
limit 20;
```

第二页：

```sql
select id, created_time
from orders
where created_time <= '2026-06-08 10:00:00'
and (
    created_time < ?
    or (created_time = ? and id < ?)
)
order by created_time desc, id desc
limit 20;
```

这种方式适合按创建时间、日志时间、事件时间这类“只增不改”的字段分页。

#### 方案二：版本号或快照 ID

如果排序字段会变，可以在查询开始时生成一个快照版本，比如把符合条件的数据 ID 写入临时结果集、Redis ZSet、搜索引擎 scroll 上下文，或者分页快照表。后续分页不再直接查实时表，而是基于这份快照分页。

比如秒杀名单、排行榜、报表导出、大批量数据导出可以这样做：

```text
第一次查询：生成 query_id，把符合条件的 id 按顺序固化
后续查询：根据 query_id + cursor 继续取下一批 id
再回表查询详情
```

这种方式稳定性最好，但会占用额外存储，需要设置过期时间。

#### 方案三：优先使用不可变排序字段

如果业务允许，不要用频繁变化的字段做深分页排序。比如订单列表优先使用：

```sql
order by created_time desc, id desc
```

不要使用：

```sql
order by update_time desc
```

因为订单状态一更新，`update_time` 就会变化，数据会在分页过程中跳动。

如果必须按热度、评分、销量排序，可以考虑定时计算一个榜单结果，把实时变化变成周期性快照。例如每 1 分钟或 5 分钟生成一次排行榜版本：

```text
rank_version = 202606081000
```

用户本轮分页固定使用这个版本的数据。

#### 方案四：使用搜索引擎或专门的分页能力

比如数据量很大、排序复杂、筛选条件多，可以把数据同步到 Elasticsearch，使用 `search_after` 做游标分页。它和 MySQL 游标分页类似，也要求排序字段稳定且唯一，通常写成：

```text
sort: [score desc, id desc]
search_after: [lastScore, lastId]
```

如果需要强一致快照，可以配合 PIT，也就是 `point in time`，固定一次查询视图，避免分页过程中数据变化影响结果。

## 设计建议

如果排序字段不稳定，先判断它到底是“重复”还是“会变化”。

| 场景 | 推荐方案 | 说明 |
| :--- | :--- | :--- |
| 字段值重复 | 追加唯一后缀，如 `order by created_time desc, id desc` | 用组合游标保证顺序稳定。 |
| 字段值会变化 | 快照边界、版本号、临时结果集、排行榜快照 | 让一次分页基于同一份数据视图。 |
| 结果必须稳定且复杂 | ES `search_after` + PIT | 适合大数据量、复杂排序和强一致快照。 |

总之，大规模分页优先考虑“稳定排序键 + 联合索引 + 游标分页”；如果排序复杂或结果必须稳定，再引入快照边界、版本号、临时结果集、Redis ZSet 或 Elasticsearch 的 `search_after` / PIT。

## Java创建线程需要注意什么

Java 创建线程常见有 4 种方式。

第一种是继承 `Thread`：

```java
class MyThread extends Thread {
    @Override
    public void run() {
        System.out.println("执行任务");
    }
}

new MyThread().start();
```

第二种是实现 `Runnable`：

```java
class MyTask implements Runnable {
    @Override
    public void run() {
        System.out.println("执行任务");
    }
}

new Thread(new MyTask()).start();
```

第三种是实现 `Callable`，配合 `FutureTask` 获取返回值：

```java
Callable<Integer> task = () -> {
    return 1 + 1;
};

FutureTask<Integer> futureTask = new FutureTask<>(task);
new Thread(futureTask).start();

Integer result = futureTask.get();
```

第四种，也是实际项目里更推荐的方式，是使用线程池：

```java
ExecutorService executor = Executors.newFixedThreadPool(10);

executor.submit(() -> {
    System.out.println("执行任务");
});
```

不过实际生产中不太建议直接用 `Executors.newFixedThreadPool()`，因为它底层使用的是无界队列，任务堆积时可能导致 OOM。更推荐手动创建 `ThreadPoolExecutor`。

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
        8,
        16,
        60,
        TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(1000),
        new ThreadPoolExecutor.CallerRunsPolicy()
);
```

创建线程时最容易犯的错误是调用 `run()`，而不是 `start()`。

```java
Thread t = new Thread(() -> {
    System.out.println("执行任务");
});

t.run();   // 普通方法调用，不会创建新线程
t.start(); // 真正启动新线程
```

`run()` 只是普通方法，在哪个线程调用，就在哪个线程执行。
`start()` 才会真正让 JVM 创建并启动一个新线程，然后由新线程去执行 `run()` 方法。

线程启动的大致过程是：

```text
new Thread()
→ 创建 Java 层 Thread 对象
→ 调用 start()
→ JVM 调用本地方法 start0()
→ 操作系统创建内核线程
→ 线程进入就绪状态
→ CPU 调度该线程运行
→ 执行 run() 方法
→ run() 执行结束，线程终止
```

也就是说，`Thread` 对象本身只是 Java 层的对象，真正的线程资源是在调用 `start()` 之后，由 JVM 通过操作系统创建的。

线程生命周期一般可以这样理解：

```text
NEW
→ RUNNABLE
→ BLOCKED / WAITING / TIMED_WAITING
→ TERMINATED
```

`NEW` 表示线程对象创建了，但还没调用 `start()`。

`RUNNABLE` 表示线程已经启动，可能正在运行，也可能在等待 CPU 时间片。

`BLOCKED` 表示线程在等待锁，比如进入 `synchronized` 代码块时锁被其他线程持有。

`WAITING` 表示无限期等待，比如调用了 `wait()`、`join()`、`LockSupport.park()`。

`TIMED_WAITING` 表示限时等待，比如 `sleep()`、`wait(timeout)`、`join(timeout)`。

`TERMINATED` 表示线程执行结束。

创建线程时要注意几个风险。

第一，不要无限制创建线程。线程不是越多越好，每个线程都需要占用栈内存和操作系统资源，线程太多会导致上下文切换频繁，严重时会 OOM 或把 CPU 打满。所以实际项目一般使用线程池控制线程数量。

第二，线程池参数要合理配置。需要关注核心线程数、最大线程数、队列大小、拒绝策略。不要无脑使用无界队列，否则请求堆积时容易撑爆内存。

第三，要注意线程安全。多个线程共享变量时，要考虑原子性、可见性、有序性问题，可以使用 `synchronized`、`ReentrantLock`、`volatile`、原子类、并发容器等。

第四，要注意异常处理。线程中的异常如果没有捕获，可能导致线程直接结束。在线程池中也要注意 `execute()` 和 `submit()` 的异常表现不同，`submit()` 的异常会被封装到 `Future` 里，需要通过 `future.get()` 才能感知。

第五，要正确关闭线程池。任务执行完后要调用：

```java
executor.shutdown();
```

或者在特殊情况下使用：

```java
executor.shutdownNow();
```

否则线程池中的非守护线程可能导致 JVM 无法退出。

停止线程一般使用中断机制：

```java
Thread t = new Thread(() -> {
    while (!Thread.currentThread().isInterrupted()) {
        // 执行任务
    }
});

t.start();
t.interrupt();
```

> Java 创建线程本质上是先创建 `Thread` 对象，然后调用 `start()`，由 JVM 通过本地方法向操作系统申请创建内核线程，线程进入就绪状态后等待 CPU 调度，最终执行 `run()` 方法。创建线程时要注意不要直接调用 `run()`，不要无限制创建线程，实际项目应优先使用线程池，并注意线程安全、异常处理、线程池关闭和中断机制。

## 任务进入线程池后，线程池的分配情况

假设 `ThreadPoolExecutor` 的参数为：

```java
corePoolSize = 2
maximumPoolSize = 4
workQueue = new ArrayBlockingQueue<>(10)
RejectedExecutionHandler = CallerRunsPolicy
```

当一次性提交 **50 个任务**时，线程池的分配与执行过程如下：

1. 核心线程执行（第 1 ~ 2 个任务）

线程池优先创建核心线程来执行新提交的任务。

- **当前状态**：运行中线程 `2`，队列任务 `0`。

1. 任务进入阻塞队列（第 3 ~ 12 个任务）

核心线程已满，新任务被放入阻塞队列等待。由于队列容量为 10，这 10 个任务正好将队列填满。

- **当前状态**：运行中线程 `2`，队列任务 `10`。

1. 创建非核心线程（第 13 ~ 14 个任务）

队列已满，但当前线程数（2）尚未达到最大线程数（4），因此线程池会继续创建非核心线程来执行新任务。

- **当前状态**：运行中线程 `4`，队列任务 `10`。

1. 触发拒绝策略（第 15 ~ 50 个任务）

此时核心线程已满、队列已满、最大线程数也已达到上限。后续提交的 36 个任务将触发拒绝策略。
由于配置了 `CallerRunsPolicy`，这些任务不会被直接丢弃，而是**由提交任务的线程（调用线程）自己同步执行**。

**最终任务分配结果**

在理想情况下（假设前期任务尚未执行完毕，瞬时提交 50 个任务），这 50 个任务的分配结果为：

- **线程池直接执行**：4 个任务（2 个核心线程 + 2 个非核心线程）
- **阻塞队列缓存**：10 个任务
- **调用线程自行执行**：36 个任务

`CallerRunsPolicy` 的意义是：线程池处理不过来时，不是直接丢弃任务，而是让提交任务的线程自己执行。这样可以形成一种“反压”效果。

> ThreadPoolExecutor 的执行顺序是：先创建核心线程，核心线程满了再入队，队列满了再创建非核心线程，达到最大线程数后触发拒绝策略。这个例子中最多 4 个任务同时在线程池执行，10 个任务排队，剩下的任务由调用线程自己执行。

## 高并发下如何保证 MySQL 写入的幂等性和最终一致性

在高并发场景下，MySQL 写入要同时解决两个问题：

- **幂等性**：同一请求重复到达，也只能落一份数据
- **最终一致性**：异步链路里即使有重试、延迟或失败，最终落库结果仍然正确

面试时可以按“**请求去重 → 数据库兜底 → 异步补偿**”来讲，这样逻辑最顺。

### 1. 请求先去重

高并发场景下，最先做的是给每次写入一个唯一标识，比如 `requestId`、订单号、消息 ID 或业务幂等 Key。

- 如果请求已经处理过，后续重复请求直接拒绝
- 如果请求第一次到达，才允许继续写数据库

常见做法有两种：

- **Redis 去重**：`SETNX` / `SET key value NX EX`
- **数据库去重**：主键或唯一索引

```text
请求进入 -> 先查 Redis 幂等 Key
    -> 成功：继续写库 / 发 MQ
    -> 失败：说明重复请求，直接丢弃
```

### 2. 数据库层兜底

即使前面做了去重，数据库仍然要再兜一层，因为 Redis、MQ 都可能出问题。数据库最稳的方式是“唯一约束 + 条件更新”。

#### 方式一：唯一索引 + UPSERT

适合“有则更新、无则插入”的场景。

```sql
INSERT INTO device_data(device_id, timestamp, value)
VALUES(1001, '2026-06-02 10:00:00', 25.3)
ON DUPLICATE KEY UPDATE
value = VALUES(value), timestamp = VALUES(timestamp);
```

如果还要防止旧数据覆盖新数据，可以把版本号或时间戳一起带上：

```sql
INSERT INTO device_data(device_id, timestamp, value, version)
VALUES(1001, '2026-06-02 10:00:00', 25.3, 10)
ON DUPLICATE KEY UPDATE
value = IF(VALUES(version) > version, VALUES(value), value),
version = GREATEST(version, VALUES(version));
```

#### 方式二：乐观锁

适合“只允许最新版本生效”的场景。

```sql
UPDATE device_data
SET value = 30.0,
    version = 13
WHERE device_id = 1001
AND version < 13;
```

- 条件不满足，说明有更新先到，当前写入应该丢弃或重试
- 适合冲突少、但要求“新值覆盖旧值”的场景

#### 方式三：悲观锁

适合热点记录、且写入冲突非常明显的场景。

```sql
SELECT value FROM device_data
WHERE device_id = 1001
FOR UPDATE;
```

InnoDB 会在事务里锁住当前行，其他事务只能排队，优点是简单直接，缺点是高并发下吞吐会下降。

### 3. 异步链路做最终一致性

如果写入链路跨了多个服务或节点，通常会把“写请求”改成“请求入队，消费落库”。

```text
1. 请求先写 Redis 幂等 Key
2. 成功后发送 MQ
3. 消费者按消息 ID / 版本号落库
4. 落库使用唯一索引、UPSERT 或乐观锁兜底
```

这一步的核心不是“让数据库自己保证所有事”，而是让每一层都只负责自己最擅长的部分：

- Redis 负责高并发下的快速去重
- MQ 负责削峰填谷和失败重试
- MySQL 负责最终的唯一性和正确性

## Redis 层面如何利用 lua 脚本保证幂等和最终一致性

### 1. 原理

- Redis 执行 Lua 脚本时，**脚本执行是原子的**：在脚本执行过程中不会被其他命令打断，避免了并发条件下 race condition。
- 可以在一次脚本中：
  1. 检查幂等标记（某个用户是否已经下单/写入过）
  2. 判断库存是否足够
  3. 扣减库存
  4. 记录订单或标记已处理

这样就避免了多条 Redis 命令在高并发下出现状态不一致的问题。

### **2. Lua 脚本示例（秒杀场景）**

假设每个商品的库存 key 是 `stock:sku_1001`，用户幂等 key 是 `user:1001:sku_1001`：

```lua
-- KEYS[1] = stock key
-- KEYS[2] = user key
-- ARGV[1] = 用户ID
-- ARGV[2] = 秒杀订单ID

-- 判断用户是否已经抢过
if redis.call("EXISTS", KEYS[2]) == 1 then
    return 0
end

-- 检查库存
local stock = tonumber(redis.call("GET", KEYS[1]))
if stock <= 0 then
    return -1
end

-- 扣减库存
redis.call("DECR", KEYS[1])

-- 设置用户标记，避免重复秒杀
redis.call("SET", KEYS[2], ARGV[2])

return 1
```

调用脚本示意：

```bash
EVALSHA <sha> 2 stock:sku_1001 user:1001:sku_1001 1001 order_abc123
```

返回值：

- `1`：秒杀成功，库存扣减，用户标记写入
- `0`：用户已经参与过，幂等拒绝
- `-1`：库存不足，秒杀失败

### **3. 优点**

1. **原子性**
   - 避免高并发下的 race condition，不会出现重复扣库存或重复下单。
2. **减少网络开销**
   - 原本需要 3~4 条 Redis 命令（检查用户、检查库存、扣库存、写标记），Lua 脚本一次完成，减少客户端往返。
3. **保证幂等性**
   - 用户标记在脚本里判断并写入，重复请求自动被拒绝。
4. **简化逻辑**
   - 原来需要在应用层用分布式锁或事务控制，现在可以把关键原子逻辑放在 Redis 里执行。

### **4. 注意事项**

1. **脚本执行时间不能太长**
   - Lua 脚本执行阻塞 Redis 主线程，如果脚本耗时太长，会阻塞其他请求。
   - 适合做快速判断和扣库存、写标记，复杂逻辑不要放 Lua 里。
2. **幂等标记设置过期时间**
   - 防止缓存永久占用，可以加过期时间，例如订单超时释放：

```lua
redis.call("SET", KEYS[2], ARGV[2], "EX", 3600)
```

1. **库存和数据库同步**
   - Redis 只是缓存，需要后台异步落库，保证最终一致性。
   - 可以把 Lua 脚本操作结果写入 MQ，后台消费生成 MySQL 订单，保证持久化。

> 在高并发场景下，Redis Lua 脚本可以保证幂等和最终一致性。通过一次原子执行，脚本同时判断用户是否已经处理过、检查库存、扣减库存、写入用户标记，避免多条命令在高并发下出现竞态。优点是原子性强、减少网络往返、保证幂等性，但要注意脚本不能过长、幂等标记要设置过期，同时需要后台异步将 Redis 操作同步到 MySQL 以保证持久化最终一致性。

## 为什么Redis 中 lua 脚本能保证原子性

Lua 脚本在 Redis 中之所以能保证原子性，是因为 **Redis 的单线程模型** + **脚本执行机制**。面试里可以从原理、流程、限制三个方面解释。

### 1. Redis 单线程模型

- Redis 的核心是 **单线程处理命令**（除了 I/O 多路复用，本身命令执行是单线程的）。
- 所有客户端发送到 Redis 的命令会按顺序排队执行，不会有两个命令同时修改同一份数据。
- 所以，如果在单线程里执行多条命令，Redis 保证 **不会被其他客户端命令打断**。

### 2. Lua 脚本执行机制

- 当你用 `EVAL` 或 `EVALSHA` 执行 Lua 脚本时，Redis 会把整个脚本作为 **一个命令**在单线程里执行。
- 脚本内部的所有 Redis 命令（`GET`、`SET`、`DECR` 等）都会连续执行，中间不会被其他客户端命令插入。

- 在这个脚本执行过程中，没有其他线程或客户端命令可以干扰它，因此 **整个逻辑是原子执行的**。
- 即使多个客户端同时发送脚本请求，Redis 会按顺序一个一个执行，每个脚本内部的操作不会被打断。

### 3. 原子性的优势

- 可以在一次 Lua 脚本里做：
  - 幂等判断（检查 key 是否存在）
  - 库存扣减
  - 用户标记写入
- 避免多条命令在高并发下出现竞态条件（race condition）
- 不需要在应用层加分布式锁也能保证原子操作

### 4. 限制与注意

1. **脚本执行必须快**
   - Lua 脚本运行期间会阻塞 Redis 处理其他命令
   - 脚本太长会影响性能
2. **脚本执行中不能依赖外部事务**
   - Redis Lua 脚本只保证 Redis 内部原子性，对外部数据库（如 MySQL）操作不保证原子
   - 通常结合 MQ 异步落库，保证最终一致性
3. **脚本执行不可中断**
   - 一旦执行开始，直到返回或出错，整个脚本算一次原子操作

> Redis Lua 脚本能保证原子性，是因为 Redis 是单线程处理命令的。在 Lua 脚本执行过程中，所有内部命令连续执行，不会被其他客户端命令打断，因此整个脚本逻辑是原子执行的。这个特性非常适合高并发场景，比如秒杀系统的库存扣减和幂等判断。需要注意的是，Lua 脚本原子性只针对 Redis 内部数据，不包括外部数据库或服务，所以通常结合异步落库保证最终一致性。

## MySQL 中的 INT(n)、CHAR(n)、VARCHAR(n) 区别是什么

可以按 **存储空间、类型本质、长度含义、性能差异** 来理解

### **1.** **INT(n)**

- **类型本质**：`INT` 是整型，占 **4 字节**
- **(n) 的作用**：在现代 MySQL 里 `(n)` 并不限制数值大小，它只是 **显示宽度**，只有在和 **ZEROFILL** 配合时才会用来左补零

例如：

```sql
INT(5) ZEROFILL
```

- 如果值是 42，查询时会显示 `00042`。
- **不影响存储**，存储依然占 4 字节。
- 如果不加 ZEROFILL，`INT(5)` 和 `INT(10)` 占用一样的空间、取值范围一样。

注意：MySQL 8.0.17 后，`INT(n)` 显示宽度功能已弃用，直接写 `INT` 就行。

### **2.** **CHAR(n)**

- **固定长度字符串**
- **占用空间**：`n` 字节（注意：如果是 utf8，每个字符可能占 3 字节，utf8mb4 每个字符 4 字节）
- **特点**：
  - 长度不足时，会**右补空格**
  - 查询时 MySQL 会自动去掉右边空格
  - 访问速度快，适合长度固定的字段，比如身份证号、性别、状态码
- **示例**：

```sql
CHAR(10) = 'abc'
存储：'abc       '（后面 7 个空格）
```

- **索引**：固定长度，索引查询性能略好，因为每条记录长度一致。

### **3.** **VARCHAR(n)**

- **可变长度字符串**
- **占用空间**：实际长度 + 1 字节（长度 ≤ 255）或 +2 字节（长度 > 255）
- **特点**：
  - 只占用实际字符长度空间，节省存储
  - 适合长度不固定的字段，比如名字、邮箱、地址
  - 查询速度略比 CHAR 慢，因为需要计算长度
- **示例**：

```sql
VARCHAR(10) = 'abc'
存储：'abc' + 1 字节长度信息
```

- **索引**：如果字段很长，索引前缀长度有限制，需要 `INDEX(col(100))` 这样的方式建前缀索引。

### **4.** **总结对比表**

| **类型**   | **长度含义**           | **存储方式**          | **优点**               | **缺点**                     |
| ---------- | ---------------------- | --------------------- | ---------------------- | ---------------------------- |
| INT(n)     | n 为显示宽度（已弃用） | 固定 4 字节           | 整型计算快，占用小     | 显示宽度无意义，不能限制范围 |
| CHAR(n)    | 固定字符数             | 固定 n 字节，右补空格 | 查询快，长度固定字段好 | 空间可能浪费                 |
| VARCHAR(n) | 最大字符数             | 实际长度 + 1/2 字节   | 节省空间，长度灵活     | 查询略慢，索引长字段要前缀   |

> **INT(n) 是整型，(n) 只是显示宽度，不影响存储；CHAR(n) 是固定长度字符串，长度不足会右补空格，访问快但可能浪费空间；VARCHAR(n) 是可变长度字符串，按实际长度存储，节省空间但查询略慢。选择时要根据字段特点：长度固定用 CHAR，长度不固定用 VARCHAR，数字用 INT。**

## MySQL InnoDB 的 B+ 树最多几层，如何估算一个表最大存储的数据量

MySQL InnoDB 的 B+ 树一般不会很高，实际业务中常见是 **2～4 层**，非常大的表可能到 **4～5 层**。面试里通常回答：**千万级、亿级数据下，B+ 树高度通常也就 3～4 层**。

原因是 B+ 树的一个页默认是 **16KB**，一个页里可以存很多个索引项，所以每一层的分叉非常大。

以 InnoDB 主键索引为例，B+ 树结构大概是：
非叶子节点：存索引 key 和子页指针
叶子节点：存完整行数据，也就是聚簇索引记录

对于非叶子节点，假设主键是 `BIGINT`，占 8 字节；页指针大概 6 字节；再加上一些额外开销，粗略按一个索引项 16 字节估算。

一个 16KB 页大概能放：

```text
16KB / 16B ≈ 1024 个索引项
```

也就是说，一个非叶子节点大约可以有 1000 个分叉。

如果 B+ 树高度是 3 层：

```text
根节点
中间节点
叶子节点
```

那么大概可以管理：

```text
1000 * 1000 = 100 万个叶子页
```

接下来要看一个叶子页能存多少行数据。

假设一行记录平均大小是 1KB，那么一个 16KB 页大概能存：

```text
16KB / 1KB = 16 行
```

所以 3 层 B+ 树大概可以存：

```text
1000 * 1000 * 16 = 1600 万行
```

如果一行平均大小是 500B，一个页能存约 32 行，那么 3 层大概可以存：

```text
1000 * 1000 * 32 = 3200 万行
```

当然这是非常粗略的理论估算，实际会受到行大小、页利用率、变长字段、页分裂、事务隐藏字段、索引字段大小、碎片等影响。

面试中更常用的估算方式是：

```text
单页大小 = 16KB
非叶子节点分叉数 ≈ 16KB / (索引字段大小 + 页指针大小 + 额外开销)
叶子节点行数 ≈ 16KB / 单行平均大小

总行数 ≈ 分叉数 ^ (树高 - 1) * 每个叶子页行数
```

举个常见面试估算：

假设主键是 `BIGINT`，非叶子节点一个索引项约 16B，一个页约 1000 个分叉。
 假设一行数据 1KB，一个叶子页约 16 行。

3 层 B+ 树：

```text
1000^2 * 16 ≈ 1600 万行
```

所以为什么 MySQL 查主键很快？因为即使是千万级、亿级数据，B+ 树高度也通常只有 3～4 层。一次主键查询大概只需要几次页访问，再加上根节点和部分中间节点通常会被缓存在 Buffer Pool 中，实际磁盘 IO 次数更少。

> InnoDB B+ 树的高度一般是 2～4 层。估算容量时，先用 16KB 页大小估算非叶子节点的分叉数，再估算叶子页能存多少行，最后用 **`分叉数^(树高-1) \* 叶子页行数`** 计算。由于每层分叉数很大，所以即使千万级、亿级数据，B+ 树高度也不会很高。

## AI Coding

```markdown
可配置工作流审批引擎设计与实现

# 任务描述
设计并实现一个本地运行的可配置审批引擎，支持请假、报销等业务流程的自定义流转。无需 Web 界面，通过 CLI 或脚本演示即可。

# 答题要求
阶段一：和考官澄清需求（该阶段不允许使用 AI）
- 这个阶段你可以和考官讨论并确定需求、详细的功能点及边界条件。建议新建一个 markdown 来记录

阶段二：编码实现
- 你可以和 AI 协同来完成该任务，并想办法来验证功能的正确性
```

示例：

```markdown
# 可配置工作流审批引擎设计与实现（CLI版本）

## 目标
设计一个本地可运行的审批引擎，支持：
- 请假、报销等业务流程的自定义流转
- 可通过 CLI 或脚本演示，无需 Web 界面
- 简单易扩展，面向面试展示核心设计能力

## 核心功能
1. **流程定义**
   - 支持动态配置流程节点（审批人、审批条件）
   - 支持分支条件（如金额大小决定审批层级）
   - 支持多流程类型（请假、报销等）

2. **任务流转**
   - 节点自动流转到下一审批人
   - 审批通过/拒绝操作
   - 支持并行审批节点（可选）

3. **数据管理**
   - 本地存储流程定义及审批状态（可用 JSON 或内存字典）
   - 支持查询任务状态、历史记录

4. **CLI 操作**
   - 创建流程实例
   - 执行审批动作
   - 查询流程状态
   - 简单脚本批量演示

## 边界条件
- **节点数量**：假设不超过 10 个节点
- **流程类型**：可支持多种类型，但每种类型节点顺序固定
- **审批条件**：仅支持金额阈值、角色匹配等简单条件
- **存储方式**：本地文件或内存，不考虑分布式或并发冲突

## 约束与假设
- 面试演示优先可读性与逻辑清晰，不要求高性能
- 用户输入假设合法，不考虑异常输入（可在扩展中加校验）
- 不涉及权限管理、身份认证
- 流程节点和审批人配置在程序启动前加载

## 简单示例流程
1. 请假流程：
   - 发起人提交请假单
   - 直属主管审批
   - HR 审批
   - 完成

2. 报销流程：
   - 发起人提交报销单
   - 财务审批
   - 主管审批（金额>5000）
   - 完成
   
## 技术选型建议
- 语言：Python / Java
- 数据存储：本地 JSON 文件 / SQLite
- 并发处理：
  - 并行节点可用线程池或 asyncio
- 测试：
  - 单元测试节点流转
  - 边界条件测试（节点缺失、循环、条件未命中）

## 核心设计思路
- **流程引擎核心**：
  ```text
  流程定义 -> 实例化 -> 当前节点 -> 审批动作 -> 更新状态 -> 下一节点
```
