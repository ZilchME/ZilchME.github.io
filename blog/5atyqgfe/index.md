---
url: /blog/5atyqgfe/index.md
---
## 讲一下 Full GC

### Full GC 概念

* \*\*Full GC（完全垃圾回收）\*\*是指对 **整个堆**（包括 **新生代和老年代**，以及方法区/元空间视 JVM 版本而定）进行垃圾回收。
* 与 **Minor GC**（只回收新生代 Eden + Survivor 区）相比，Full GC **耗时更长，会阻塞应用线程**（Stop-the-World）。

### Full GC 触发条件

1. **老年代内存不足**
   * 新生代对象经过多次 Minor GC 后仍然存活，晋升到老年代，但老年代空间不足。
   * JVM 触发 Full GC 回收老年代并整理碎片。
2. **永久代 / 元空间满**
   * JDK 7 及之前：永久代满 → Full GC。
   * JDK 8 及以后：元空间满 → Full GC。
3. **System.gc() 调用**
   * 手动调用 Full GC（虽然不推荐），会触发一次 Full GC。
4. **老年代空间不足 + 新生代对象过多**
   * Minor GC 后仍不足以腾出老年代空间，Full GC 是最终回收手段。
5. **CMS / G1 特定条件**
   * CMS：并发模式失败（Concurrent Mode Failure），会触发 Full GC。
   * G1：Old 区满或者混合回收失败，会触发 Full GC。

### Full GC 执行过程（以传统标记-清除 + 标记-整理为例）

1. **标记阶段**：标记堆中所有存活对象。
2. **清理阶段**：回收不可达对象，并释放内存。
   * 对老年代通常使用 **标记-整理**（Mark-Compact），整理内存碎片。
   * 新生代通常使用 **复制算法**（Minor GC 用 Eden → Survivor 复制）。
3. **压缩 / 整理**：整理内存空闲块，保证大对象可以顺利分配。

**特点**：

* 停止所有应用线程（Stop-the-World），所以耗时相对长。
* 回收范围大，包括新生代、老年代，有时还会回收方法区/元空间。

### Full GC 性能影响

* **阻塞应用线程**：长时间 Full GC 会导致请求延迟飙升，甚至服务卡顿。
* **频繁 Full GC**：可能是内存配置或对象创建问题导致 “频繁 GC” 或 “GC thrashing”。

### Full GC 调优思路

1. \*\*调整堆大小：\*\*新生代/老年代合理分配，减少对象晋升导致老年代频繁满。

   但是 Full GC 回收范围是整个老年代，如果堆本身很大，Full GC 的 **停顿时间会更长**，因为要扫描、标记和整理更多对象。

   所以堆大小是 Full GC **触发频率**和 **停顿时长**的一个权衡点。

2. \*\*减少大对象和长生命周期对象：\*\*避免直接创建过多大对象到老年代。

3. \*\*优化 GC 策略：\*\*G1、ZGC、Shenandoah 等低延迟 GC，减少 Full GC 停顿时间。

4. \*\*避免频繁调用 System.gc()：\*\*强制 Full GC 会阻塞所有线程，应避免。

5. \*\*监控 GC 日志：\*\*使用 `-XX:+PrintGCDetails -Xloggc:gc.log` 观察 Full GC 频率、停顿时间和对象存活率。

> Full GC 是 JVM 对整个堆进行的垃圾回收，包括新生代、老年代和方法区/元空间。它通常在老年代空间不足、元空间满、手动调用 System.gc() 或 GC 策略触发条件下发生。Full GC 会阻塞所有应用线程，耗时较长。优化方式包括合理配置堆大小、新生代比例、减少大对象创建、选择低延迟 GC 策略以及避免频繁手动触发 GC。

## 如何排查 Full GC 问题

首先确认是不是 Full GC 真的异常。因为偶尔 Full GC 不一定是问题，重点看 **频率、耗时、回收效果**。

比如通过监控或命令查看：

```bash
jstat -gcutil <pid> 1000
```

重点看：

```text
YGC   YGCT   FGC   FGCT   GCT
```

其中：

`FGC` 表示 Full GC 次数。
`FGCT` 表示 Full GC 总耗时。
如果 `FGC` 持续增长，而且 `FGCT` 很高，就说明 Full GC 比较严重。

也可以看堆各区域使用率：

```bash
jstat -gc <pid> 1000
jmap -heap <pid>
```

重点观察老年代、元空间、新生代的占用情况。

然后一定要看 GC 日志。常见 JVM 参数比如：

JDK 8：

```bash
-XX:+PrintGCDetails
-XX:+PrintGCDateStamps
-Xloggc:/path/gc.log
```

JDK 9+：

```bash
-Xlog:gc*:file=/path/gc.log:time,uptime,level,tags
```

分析 GC 日志时主要看几个点：

第一，看 Full GC 是什么原因触发的。比如老年代空间不足、元空间不足、`System.gc()`、晋升失败、G1 的 evacuation failure 等。

第二，看 Full GC 前后内存有没有明显下降。
如果 Full GC 后老年代占用仍然很高，比如从 95% 只降到 90%，说明大部分对象仍然存活，可能存在内存泄漏，或者确实有大量长生命周期对象。

第三，看 Full GC 是否频繁发生。
如果很短时间内连续 Full GC，通常说明堆空间不足、老年代被占满、对象晋升太快，或者内存泄漏。

第四，看停顿时间。
如果单次 Full GC 停顿很长，会直接影响接口响应时间和吞吐量。

如果怀疑是内存泄漏或对象占用异常，可以导出堆快照：

```bash
jmap -dump:format=b,file=heap.hprof <pid>
```

线上环境要谨慎，因为 dump 可能会造成停顿，也会生成很大的文件。更稳妥的方式是先在低峰期操作，或者从已经配置好的 OOM dump 文件分析：

```bash
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/path
```

拿到 dump 后，可以用 MAT、VisualVM、JProfiler、Arthas 等工具分析。重点看：

`Dominator Tree`：哪些对象占用内存最大。
`Retained Size`：某个对象实际保留了多少内存。
`GC Roots`：对象为什么没有被回收。
集合类：比如 `HashMap`、`ArrayList`、缓存、ThreadLocal 是否持续增长。

如果不能马上 dump，也可以先看类实例统计：

```bash
jmap -histo:live <pid> | head -50
```

或者用 Arthas：

```bash
dashboard
memory
jvm
heapdump
```

常见原因一般有这些：

一种是**内存泄漏**。比如静态集合一直添加数据、不清理的缓存、ThreadLocal 没有 remove、监听器或回调没有注销、连接对象没有释放等。表现是 Full GC 后老年代降不下来。

一种是**对象创建过快**。比如瞬时流量高、大量 JSON 序列化反序列化、大批量查询一次性加载很多对象、循环中频繁创建临时对象。表现是 Minor GC 很频繁，对象不断晋升到老年代，最后触发 Full GC。

一种是**堆参数不合理**。比如堆太小，新生代太小导致对象过早晋升，老年代很快被打满。可以考虑调整 `-Xms`、`-Xmx`、新生代比例、Survivor 比例等。

一种是**大对象问题**。比如大数组、大字符串、大集合、文件一次性读入内存。大对象可能直接进入老年代，导致老年代空间紧张。

一种是**元空间不足**。如果是 JDK 8 以后，类加载过多、动态代理、CGLIB、反射生成类过多，可能导致 Metaspace 不足触发 Full GC。可以观察 Metaspace 使用情况，并检查类加载是否异常增长。

一种是**显式调用** **`System.gc()`**。如果 GC 日志里看到 `System.gc()`，说明可能有代码或第三方库触发了 Full GC。可以通过参数禁用或转为并发处理，例如：

```bash
-XX:+DisableExplicitGC
```

排查思路可以总结成：

**先用 jstat、监控确认 Full GC 的频率和耗时，再分析 GC 日志确认触发原因和回收效果。如果 Full GC 后老年代降不下来，就重点怀疑内存泄漏，用 heap dump、MAT、jmap histo 分析对象引用链；如果是对象晋升太快，就看新生代大小、对象创建速率、大对象和流量峰值；如果是元空间问题，就排查类加载和动态生成类。最后根据原因做代码优化、缓存控制、分页处理、调整 JVM 参数或更换合适的 GC 收集器。**

## SQL语句分析

分析下列这条语句要如何优化

```sql
select * from orders 
where created_time > '2026-06-02' 
and status = 'PAID' 
and amount + 100 > 1000;
```

首先，`select *` 不推荐。它会把所有字段都查出来，增加网络传输、内存消耗，也可能导致无法使用覆盖索引。应该只查询业务真正需要的字段

第二个问题是：

```sql
amount + 100 > 1000
```

这个写法会对字段 `amount` 做表达式计算，可能导致 MySQL 无法直接利用 `amount` 上的索引进行范围查找。应该改写成：

```sql
amount > 900
```

这样条件是直接作用在字段上的，更容易走索引。

第三个问题是 `created_time > '2026-06-02'` 要注意时间边界。如果 `created_time` 是 `datetime` 类型，`'2026-06-02'` 会被当成：

```sql
'2026-06-02 00:00:00'
```

所以它表示的是查询 **2026-06-02 00:00:00 之后** 的数据，不只是 6 月 2 日当天。如果业务想查 6 月 2 日当天，应该写成范围：

```sql
created_time >= '2026-06-02 00:00:00'
and created_time < '2026-06-03 00:00:00'
```

如果业务确实是查 6 月 2 日之后的数据，那原条件没问题，但建议把时间写完整：

```sql
created_time > '2026-06-02 00:00:00'
```

第四个问题是索引设计。这个查询有三个过滤条件：

```sql
status = 'PAID'
created_time > ...
amount > ...
```

一般可以考虑联合索引：

```sql
create index idx_orders_status_created_amount
on orders(status, created_time, amount);
```

**原因是 `status = 'PAID'` 是等值条件，可以放在前面**；`created_time > ...` 是范围条件，适合放在等值条件后面；`amount > 900` 也是范围条件。需要注意，联合索引中遇到第一个范围条件后，后面的字段通常不能继续用于精确缩小索引扫描范围，但可能还能用于 ICP（Index Condition Pushdown）在索引层过滤，或者用于覆盖索引。

> 假设联合索引是 `(A, B, C)`：
>
> ```sql
> WHERE A = 10 AND B > 5 AND C = 100
> ```
>
> 执行过程：
>
> 1. `A = 10` 是精确匹配，可以快速定位到 `A=10` 的叶子节点范围。
> 2. `B > 5` 是范围条件，这时 B+ 树要扫描 **B>5 的所有记录**，这个扫描是连续区间扫描，而不是单个值定位。
>
> 问题来了：**C=100** 在叶子节点排序里存在，但我们现在扫描的是 `B>5` 的范围，不再是精确定位。
>
> * 因为范围内的 B 值是多个（B=6、B=7、B=8……），在这个范围里，C 的值可能是任意的。
> * B+ 树的排序结构不保证在一个 B 的范围里，C 可以直接做精确定位，所以 **C 不能再利用索引直接跳过不符合条件的行**。
> * MySQL 仍然会扫描 `B>5` 的所有记录，再在存储的叶子节点上用 **回表或条件过滤** 来判断 C。
>
> 这就是索引在范围条件之后，后面的列通常 **不能再精确用于索引扫描**，只能通过 **回表过滤** 或 **索引条件下推（ICP）** 来处理。

所以这个索引可以帮助 MySQL 先定位 `status = 'PAID'` 的数据，再按 `created_time` 范围扫描，并尽量利用 `amount` 做进一步过滤。

不过索引顺序不是绝对的，要看字段选择性和查询场景。如果 `created_time > '2026-06-02'` 过滤效果非常强，比如只查最近很小一段数据，而 `status = 'PAID'` 占比很高，那么也可能考虑：

```sql
create index idx_orders_created_status_amount
on orders(created_time, status, amount);
```

但在大多数订单表场景里，如果 `status` 是等值条件，`created_time` 是范围条件，常见设计是：

```sql
(status, created_time)
```

如果查询字段固定，还可以做覆盖索引，比如：

```sql
create index idx_orders_cover
on orders(status, created_time, amount, id, order_no);
```

然后 SQL 写成：

```sql
select id, order_no, created_time, status, amount
from orders
where status = 'PAID'
and created_time > '2026-06-02 00:00:00'
and amount > 900;
```

这样查询字段都在索引里，有机会走覆盖索引，减少回表。

## Spring 如何解决 Bean 循环依赖问题

Spring 解决 Bean 循环依赖（Circular Dependency） 的机制主要依赖 三级缓存 + 提前暴露对象

### 问题背景

假设有两个单例 Bean：

```java
@Component
class A {
    @Autowired
    B b;
}
@Component
class B {
    @Autowired
    A a;
}
```

直接创建 A → 需要 B → 创建 B → 需要 A → 又创建 A，就会出现死循环。如果不处理，Spring 就会报 BeanCurrentlyInCreationException。

### Spring 的解决思路

Spring 对 单例 Bean 使用 三级缓存（Singleton Factories / Early References / Fully Initialized Bean） 来解决循环依赖：

#### 三级缓存

* singletonObjects（一级缓存）
  * 存放已经创建完成并初始化完成的 Bean。
* earlySingletonObjects（二级缓存）
  * 存放“半成品”的 Bean（实例化完成，但属性可能还没填充完成的 Bean 对象）。
* singletonFactories（三级缓存）
  * 存放 Bean 的 ObjectFactory，可以生成 early reference，用于解决循环依赖。

### 创建 Bean 流程

以单例 Bean A 为例：

1. 实例化 Bean
   * Spring 调用构造器（或反射）创建对象实例，但属性还没注入。
2. 放入三级缓存 `singletonFactories`
   * 注册一个 `ObjectFactory`，用于创建早期引用（early reference）。
   * 这样如果循环依赖的另一个 Bean 需要 A，它可以先拿到 A 的早期引用。
3. 填充属性（依赖注入）
   * 注入 A 所依赖的 B。
   * B 在创建时，如果依赖 A，会先从 `earlySingletonObjects` 或 `singletonFactories` 获取 A 的早期引用。（此时==**B 是可以完全创建完成的**==）
4. 初始化（如调用 init 方法、Aware 回调、BeanPostProcessor）
   * 当 A 完全初始化完成后，会放入一级缓存 singletonObjects。
   * 同时从二三级缓存移除 early reference。

### 关键点

1. 只解决单例 Bean 的构造循环依赖：单例 Bean 在 Spring 容器启动时只创建一次。多例 Bean（prototype）不做三级缓存处理，所以循环依赖会直接报错
2. \*\*属性注入时可解决循环依赖，构造器注入无法解决：\*\*因为==构造器注入必须在实例创建时完成==，无法提前暴露 early reference
3. 依赖提前暴露（early reference）：Spring 提供了一个半成品 Bean，让其他 Bean 可以先引用，而不是等待完全初始化完成
4. `BeanPostProcessor` 的影响：如果有 AOP 或自定义 `BeanPostProcessor` 修改对象，`early reference` 可能不包含代理对象，注意有些循环依赖场景可能需要 ObjectFactory 延迟注入

> Spring 解决单例 Bean 循环依赖的核心是 三级缓存 + 提前暴露 Bean 对象。
> 创建 Bean 时，Spring 会先实例化 Bean，把半成品 Bean 放入三级缓存（`singletonFactories`），当依赖的另一个 Bean 需要该 Bean 时，可以先从缓存拿到早期引用，注入到依赖中。属性注入完成后，再初始化 Bean 并放入一级缓存。
> 这种机制只对 单例 Bean 的属性注入循环依赖 有效，对构造器注入或多例 Bean 循环依赖不起作用。

## 如何设计一个秒杀系统

### 需求分析

秒杀系统通常有以下特性：

1. **高并发请求**：短时间内可能有几十万、甚至上百万请求同时涌入。
2. **库存有限**：每个商品有固定数量，库存不能超卖。
3. **下单快速**：秒杀成功体验要快。
4. **可扩展性**：系统需要支持水平扩展。
5. **最终一致性**：库存、订单等需要保证一致性或可接受延迟一致性。

功能需求：

* 用户请求秒杀商品
* 系统判断库存是否足够
* 成功生成订单
* 异步处理支付、库存扣减等

***

### 系统架构设计

可以拆成以下几个层次：

1. **前端**
   * CDN、负载均衡（Nginx、LVS）
   * 防刷（限流、验证码、登录校验、请求签名）
2. **应用层**
   * **秒杀服务**：负责请求接入和库存校验
   * **异步队列**：把请求排队，削峰填谷（如 Kafka、RabbitMQ、RocketMQ）
3. **缓存层**
   * Redis / Memcached 缓存库存信息
   * 用 Redis 原子操作（`INCR/DECR`）控制库存
   * 通过缓存快速判断库存，减少 DB 压力
4. **数据库层**
   * MySQL / PostgreSQL 存储订单
   * 可能采用 **分库分表**，避免单表写入瓶颈
   * 库存表更新可以使用 **乐观锁 / 悲观锁** 或者依赖 Redis 扣减库存
5. **异步处理与消息队列**
   * 秒杀请求先写入消息队列
   * 异步消费生成订单、扣库存
   * 保证请求快速响应用户，同时避免数据库瞬时压力过大
6. **日志与监控**
   * 记录请求成功率、库存变化
   * 监控系统负载、异常请求、消息队列积压

***

### 核心模块设计

#### **（1）库存控制**

**方案一：Redis 原子扣减**

```lua
if redis.decr(stock_key) >= 0:
    // 秒杀成功，加入订单队列
else:
    // 库存不足
```

优点：快速、原子、避免数据库热点
缺点：如果 Redis 崩溃，需要恢复库存数据

**方案二：数据库行锁（悲观锁）**

```sql
update stock
set stock = stock - 1
where product_id = ? and stock > 0;
```

* 返回影响行数判断是否扣减成功
* 保证库存不超卖
* 缺点：高并发下数据库压力大，不建议单独用

**方案三：乐观锁 + 版本号**

```sql
update stock
set stock = stock - 1, version = version + 1
where product_id = ? and version = ? and stock > 0;
```

* 适合中等并发，结合重试机制
* 避免数据库死锁

#### **（2）请求削峰**

* **限流**：Nginx 限速、漏桶/令牌桶算法
* **排队**：秒杀请求先入队列，异步消费
* **缓存预热**：提前把商品库存加载到 Redis
* **分布式锁**（可选）：保证同一商品同时只有一个线程扣减库存

#### **（3）订单生成**

* 异步生成订单，保证库存优先扣减
* 可以先写入 **消息队列**，然后后台异步落库
* 如果队列积压，可以返回排队状态给用户

## 请求的链路

用户请求首先到达前端页面。秒杀开始前，商品详情、活动规则、库存展示这类静态或半静态数据会提前做缓存预热，放到 CDN、Nginx、本地缓存或 Redis 里，避免活动开始瞬间大量请求打到数据库。页面上通常不会直接暴露真实下单接口，而是通过登录态、活动时间校验、验证码、动态秒杀地址、请求签名等手段做第一层防刷。

用户点击秒杀按钮后，请求先进入网关层，比如 Nginx、API Gateway。网关会做一些通用校验和流量控制，比如用户是否登录、IP 限流、用户维度限流、接口 QPS 限流、黑名单校验、请求参数签名校验等。明显不合法的请求会在网关层直接拦截，避免进入后端服务。

通过网关后，请求进入秒杀服务。秒杀服务会先做业务前置校验，比如活动是否开始、活动是否结束、商品是否存在、用户是否有资格、是否已经秒杀过。这里通常会大量依赖 Redis，而不是查数据库。例如用 Redis 判断活动状态，用 Redis Set 或 Bitmap 判断用户是否已经参与过，防止同一个用户重复下单。

然后进入库存预扣阶段。秒杀系统一般不会直接去数据库扣库存，因为数据库扛不住瞬时高并发。常见做法是提前把库存加载到 Redis 中，比如：

```text
seckill:stock:sku_1001 = 100
```

请求到来后，使用 Redis 的原子操作或 Lua 脚本完成库存判断、扣减和用户去重。比如 Lua 脚本里同时做：

```text
判断用户是否已经秒杀过
判断库存是否大于 0
库存减 1
记录用户已秒杀
写入一条秒杀成功标记
```

用 Lua 的好处是这些操作在 Redis 中原子执行，避免并发下出现超卖或重复购买。

如果 Redis 判断库存不足，秒杀服务直接返回“已售罄”。如果用户重复请求，直接返回“请勿重复参与”或返回已有结果。如果 Redis 预扣库存成功，说明用户拿到了一个秒杀资格，但这时通常还不会同步创建完整订单。

接下来，秒杀服务会把成功请求写入消息队列，比如 RocketMQ、Kafka、RabbitMQ。消息内容一般包括用户 ID、商品 ID、活动 ID、请求 ID、预扣库存时间等。写入 MQ 成功后，接口可以快速返回给用户：

```text
秒杀请求已受理，正在排队中
```

或者返回：

```text
秒杀成功，请稍后查看订单
```

这一步的核心作用是削峰填谷。前端瞬间来了十万请求，但后端订单系统可以按自己的消费能力慢慢处理 MQ，避免数据库被打垮。

然后由订单消费服务异步消费消息。消费者拿到消息后，会先做幂等校验，比如检查这个用户在这个活动下是否已经创建过订单。数据库中通常会有唯一索引：

```sql
unique(user_id, activity_id, sku_id)
```

这样即使 MQ 重复投递，或者用户请求重试，也不会生成重复订单。

接着订单服务开始落库。它会创建订单记录，订单状态一般是“待支付”或“秒杀成功待支付”。同时要扣减数据库库存，或者同步 Redis 预扣结果到数据库。数据库层也要做最后一道防超卖保护，例如：

```sql
update seckill_stock
set stock = stock - 1
where sku_id = ? and stock > 0;
```

通过 `stock > 0` 和影响行数判断是否扣减成功。即使前面 Redis 出现异常或重复消息，数据库这里也能兜底防止库存扣成负数。

订单创建成功后，系统可以把结果写回 Redis，比如：

```text
seckill:result:userId:activityId = orderId
```

这样用户前端轮询查询结果时，不需要频繁查数据库。

用户收到“排队中”后，前端一般会轮询查询秒杀结果，或者通过 WebSocket、SSE 推送结果。查询结果接口会优先查 Redis：如果查到订单 ID，就告诉用户秒杀成功并跳转支付；如果查到失败标记，就提示失败；如果还没有结果，就提示继续排队。

如果用户在规定时间内完成支付，支付系统回调订单系统，订单状态变为“已支付”，库存扣减最终确认。如果用户超时未支付，则订单会被取消。取消时要释放库存：数据库库存加回，Redis 库存也需要补偿，或者通过库存流水和定时任务进行一致性修复。

整个链路还需要有异常补偿机制。比如 Redis 扣库存成功但 MQ 发送失败，就需要回滚 Redis 库存和用户标记；MQ 消费失败，要重试或进入死信队列；订单创建成功但结果写 Redis 失败，可以通过订单表兜底查询；支付超时未回调，要有定时任务扫描关闭订单。
