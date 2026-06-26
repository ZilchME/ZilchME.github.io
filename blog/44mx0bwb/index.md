---
url: /blog/44mx0bwb/index.md
---
## Java 如何实现跨平台

Java 源代码不直接编译成某个操作系统或 CPU 能执行的机器码，而是先编译成统一的**字节码**，再由不同平台上的 **JVM** 负责执行。

完整链路是：

```text
Java 源代码 .java
→ javac 编译
→ 字节码文件 .class
→ 不同平台的 JVM 加载并执行
→ 最终转换成本地机器指令运行
```

比如同一份 Java 代码：

```java
public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello Java");
    }
}
```

编译后生成的是 `.class` 字节码文件。这个 `.class` 文件不是 Windows、Linux 或 macOS 某个平台专属的机器码，而是一种 JVM 能识别的中间格式。

真正和操作系统、CPU 打交道的是 JVM。不同平台有不同版本的 JVM：

```text
Windows 上有 Windows 版本 JVM
Linux 上有 Linux 版本 JVM
macOS 上有 macOS 版本 JVM
```

这些 JVM 对外都遵循统一的 Java 虚拟机规范，都能识别同一种 `.class` 字节码；对内则负责把字节码解释或编译成当前平台能执行的机器指令。

所以跨平台不是说 JVM 本身跨平台，而是说：

**Java 字节码跨平台，JVM 屏蔽了底层操作系统和硬件差异。**

JVM 执行字节码时，主要有两种方式：

一种是**解释执行**，JVM 一条一条读取字节码并解释成机器指令执行。

另一种是 **JIT 即时编译**，也就是把热点代码编译成本地机器码，提高运行性能。比如某个方法被频繁调用，JVM 会认为它是热点代码，然后把它编译成本机机器码，后续执行就更快。

除了字节码和 JVM，Java 标准库也帮助屏蔽了平台差异。比如文件操作、网络通信、线程操作等，Java 提供统一 API，底层由不同平台的 JVM 或本地方法去适配。

> Java 跨平台的核心是 JVM。Java 源代码先编译成与平台无关的字节码 `.class` 文件，不同操作系统上安装对应平台的 JVM，由 JVM 负责加载、验证、解释执行或 JIT 编译成本地机器码。也就是说，Java 程序本身不用关心底层操作系统差异，平台差异由 JVM 屏蔽，因此实现了一次编译，处处运行。

## 并发编程的风险

并发编程下主要要注意 **线程安全、可见性、有序性、死锁、资源竞争、性能退化** 这些问题。

### 共享变量的线程安全问题

最核心的风险，比如多个线程同时对一个变量执行：

```java
count++;
```

这行代码看起来是一行，但底层不是原子操作，大致包含：

```text
读取 count
count + 1
写回 count
```

如果多个线程同时执行，就可能出现更新丢失。解决方式可以用 `synchronized`、`ReentrantLock`、`AtomicInteger`、`LongAdder`，或者尽量避免共享状态。

比如：

```java
AtomicInteger count = new AtomicInteger(0);
count.incrementAndGet();
```

或者：

```java
synchronized (this) {
    count++;
}
```

### 可见性问题

一个线程修改了变量，另一个线程不一定马上能看到。因为线程可能使用 CPU 缓存、工作内存等机制。

例如：

```java
boolean running = true;

while (running) {
    // do something
}
```

如果一个线程把 `running` 改成 `false`，另一个线程可能一直看不到变化，导致循环无法结束。

解决方式是使用 `volatile`、锁、原子类，或者并发容器。比如：

```java
volatile boolean running = true;
```

`volatile` 可以保证变量修改对其他线程可见，但它不能保证复合操作的原子性，比如 `count++` 只用 `volatile` 仍然不安全。

### 有序性问题

编译器和 CPU 可能会进行指令重排序，在单线程下结果不变，但多线程下可能出问题。

### 问题描述

典型例子是双重检查锁单例：

```java
private static volatile Singleton instance;

public static Singleton getInstance() {
    if (instance == null) {
        synchronized (Singleton.class) {
            if (instance == null) {
                instance = new Singleton(); // [!code highlight]
            }
        }
    }
    return instance;
}
```

这里 `instance` 必须加 `volatile`，否则对象创建过程可能发生重排序，另一个线程可能拿到一个还没初始化完成的对象。

关键在于：

```java
instance = new Singleton();
```

在 JVM 和 CPU 层面并不是一个原子操作，它大致会被拆成三个步骤：

关键在于：

```java
instance = new Singleton();
```

这看起来是一条语句，但在 JVM 和 CPU 层面并不是一个原子操作，它大致会被拆成三个步骤：

1. 分配内存
2. 调用构造函数，初始化对象
3. 将内存地址赋值给 `instance`

正常顺序：

```text
1 -> 2 -> 3
```

但是 JVM 为了优化性能，在不影响单线程语义的情况下，允许指令重排序：

```text
1 -> 3 -> 2
```

此时会出现线程安全问题。假设有两个线程：

`Thread A` 执行：

```java
instance = new Singleton();
```

由于重排序，实际执行顺序变成：

```text
1. allocate memory
2. instance = memory
3. 初始化 Singleton
```

执行到第 2 步时：

```java
instance != null
```

但对象实际上还没初始化完成，若 `Thread B` 此时进入：

```java
if (instance == null)
```

发现 `instance != null` 于是直接返回 `instance`，但构造函数还没执行完或者某些字段还保持默认值。

`Thread B` 恰好在步骤 2 和 3 之间读取某些字段的话会得到错误的结果

#### 为什么 JVM 允许这种重排序

对于单线程来说：

```java
Singleton s = new Singleton();
```

只要当前线程后续访问对象时初始化已经完成，程序结果看起来一样。

JVM 和 CPU 的优化原则叫 as-if-serial，即只要不改变单线程程序的执行结果，就允许进行重排序，但多线程环境下就会暴露问题。

`volatile` 的作用之一就是禁止这种关键重排序。

当定义下列变量时

```java
private static volatile Singleton instance;
```

Java 内存模型（JMM）规定对 `volatile` 变量的写入之前，前面的所有操作必须先完成。也就是：

```text
1 分配内存
2 初始化对象
3 写入instance
```

其他线程看到 `instance != null` 时，就一定能看到一个已经完全初始化的对象。

### 死锁

死锁通常发生在多个线程互相等待对方持有的锁。

比如线程 A 拿到锁 1，等待锁 2；线程 B 拿到锁 2，等待锁 1，就会互相卡住。

解决方式包括：固定加锁顺序、减少锁粒度、避免嵌套锁、使用 `tryLock` 设置超时时间、及时释放锁。

比如：

```java
if (lock1.tryLock(1, TimeUnit.SECONDS)) {
    try {
        if (lock2.tryLock(1, TimeUnit.SECONDS)) {
            try {
                // do something
            } finally {
                lock2.unlock();
            }
        }
    } finally {
        lock1.unlock();
    }
}
```

### 锁竞争和性能问题

并发不是线程越多越快。线程太多会导致上下文切换增加，锁竞争严重，CPU 消耗升高，吞吐反而下降。

解决方式包括：合理设置线程池大小、减少共享资源、缩小锁范围、使用读写锁、分段锁、无锁结构、批量处理。

例如读多写少的场景，可以用 `ReadWriteLock`：

```java
ReadWriteLock lock = new ReentrantReadWriteLock();
```

高并发计数可以用 `LongAdder`，比大量线程竞争同一个 `AtomicLong` 更适合高并发累加场景。

### 线程池使用不当

比如线程池参数设置不合理、任务堆积、队列无限增长、拒绝策略不合适，都可能导致 OOM 或请求雪崩。

线程池要重点关注：

```text
corePoolSize
maximumPoolSize
workQueue
keepAliveTime
RejectedExecutionHandler
```

要结合业务设置队列大小和拒绝策略，并做好监控。

### 并发容器使用错误

普通的 `HashMap`、`ArrayList` 在多线程写入下不是线程安全的。可能出现数据丢失、结构异常、甚至死循环等问题。

解决方式是使用并发集合，比如：

```java
ConcurrentHashMap
CopyOnWriteArrayList
BlockingQueue
ConcurrentLinkedQueue
```

比如多线程写 Map，一般用：

```java
ConcurrentHashMap<String, Object> map = new ConcurrentHashMap<>();
```

### ThreadLocal 内存泄漏

线程池中的线程会被复用，如果 `ThreadLocal` 用完不清理，可能导致数据串用或内存泄漏。

解决方式是用完后在 `finally` 中 remove：

```java
try {
    threadLocal.set(value);
    // business logic
} finally {
    threadLocal.remove();
}
```

## JDK、JVM、JRE

* **JVM** 是 Java 虚拟机，负责运行 Java 字节码。
  Java 源码编译成 `.class` 文件后，不是直接由操作系统执行，而是交给 JVM 加载、验证、解释执行或 JIT 编译成本地机器码。JVM 是 Java 跨平台的核心。

* **JRE** 是 Java Runtime Environment，Java 运行环境。
  它包含 **JVM + Java 核心类库 + 运行时所需组件**。如果你只是想运行一个 Java 程序，理论上安装 JRE 就够了。

* **JDK** 是 Java Development Kit，Java 开发工具包。
  它包含 **JRE + 开发工具**，比如 `javac` 编译器、`java` 命令、`javadoc`、`jdb` 等。如果你要开发、编译、调试 Java 程序，就需要 JDK。

> JVM 是运行 Java 字节码的虚拟机；JRE 是 Java 程序运行环境，包含 JVM 和核心类库；JDK 是 Java 开发工具包，包含 JRE 和编译、调试等开发工具。开发 Java 程序需要 JDK，运行 Java 程序需要 JRE，而真正执行字节码的是 JVM

## Full CG

详见[微众银行后台开发一面](/blog/5atyqgfe/#讲一下-full-gc)

## BIO、NIO、AIO区别是什么

* **BIO（blocking IO）**：就是传统的 `java.io` 包，它是基于流模型实现的，交互的方式是同步、阻塞方式，也就是说在读入输入流或者输出流时，在读写动作完成之前，线程会一直阻塞在那里，它们之间的调用是可靠的线性顺序。优点是代码比较简单、直观；缺点是 IO 的效率和扩展性很低，容易成为应用性能瓶颈。

* **NIO（non-blocking IO）**：Java 1.4 引入的 `java.nio` 包，提供了 Channel、Selector、Buffer 等新的抽象，可以构建多路复用的、同步非阻塞 IO 程序，同时提供了更接近操作系统底层高性能的数据操作方式。

* **AIO（Asynchronous IO）**：也称 NIO 2，是 Java 1.7 引入的，对 NIO 的扩展，提供了异步非阻塞的 IO 操作方式，所以人们叫它 AIO（Asynchronous IO）。异步 IO 是基于事件和回调机制实现的，也就是应用操作之后会直接返回，不会阻塞在那里，当后台处理完成，操作系统会通知相应的线程进行后续的操作。

## 面向对象、封装、继承、多态

面向对象是一种编程范式，它**将现实世界中的事物抽象为对象**，对象具有属性（称为字段或属性）和行为（称为方法）。面向对象编程的设计思想是以对象为中心，通过对象之间的交互来完成程序的功能，具有灵活性和可扩展性，通过封装和继承可以更好地应对需求变化。

Java 面向对象的三大特性包括：**封装、继承、多态**：

* **封装**：封装是指将对象的属性（数据）和行为（方法）结合在一起，对外隐藏对象的内部细节，仅通过对象提供的接口与外界交互。封装的目的是增强安全性和简化编程，使得对象更加独立。
* **继承**：继承是一种可以使得子类自动共享父类数据结构和方法的机制。它是代码复用的重要手段，通过继承可以建立类与类之间的层次关系，使得结构更加清晰。
* **多态**：多态是指允许不同类的对象对同一消息作出响应。**即同一个接口，使用不同的实例而执行不同操作**。多态性可以分为编译时多态（重载）和运行时多态（重写）。它使得程序具有良好的灵活性和扩展性。

## Java 创建线程

## MySQL索引是越多越好吗

索引的好处是可以加快查询，尤其是 `where`、`order by`、`group by`、`join` 中经常使用的字段。如果没有索引，MySQL 可能要全表扫描；有合适索引后，可以快速定位数据。

但索引也有明显成本。

首先，索引会占用磁盘空间。每建一个索引，MySQL 都要维护一棵额外的 B+ 树。表数据越大，索引占用空间越明显。

其次，索引会降低写入性能。执行 `insert`、`update`、`delete` 时，不仅要修改表数据，还要维护相关索引。索引越多，维护成本越高。

比如：

```sql
insert into user(name, age, city) values ('Tom', 20, 'Beijing');
```

如果 `name`、`age`、`city`、`name_age`、`city_age` 都建了索引，那么插入一条数据时，这些索引都要更新。

第三，索引太多可能干扰优化器选择。MySQL 优化器会在多个索引中选择执行计划，如果索引设计混乱、重复索引过多，可能选不到最优索引，反而导致查询变慢。

第四，低区分度字段不适合单独建索引。比如 `gender`、`status` 这种字段，如果取值很少，单独建索引效果通常不好。因为命中数据太多，走索引后还要大量回表，可能不如全表扫描。不过这类字段可以作为联合索引的一部分，比如：

```sql
(status, created_time)
```

其中 `status` 是等值过滤，`created_time` 是范围过滤，这种组合在订单表里就比较常见。

索引设计一般遵循几个原则：

高频查询字段可以建索引；区分度高的字段更适合建索引；联合索引要考虑最左前缀原则；尽量避免重复索引；尽量使用覆盖索引减少回表；不要给频繁更新且查询很少的字段盲目建索引。

比如订单表常见查询：

```sql
select id, order_no, amount
from orders
where user_id = 1001
and status = 'PAID'
order by created_time desc
limit 20;
```

可以考虑联合索引：

```sql
create index idx_user_status_time
on orders(user_id, status, created_time);
```

这样比单独给 `user_id`、`status`、`created_time` 都建索引更合理。

> 索引不是越多越好。索引能提升查询性能，但会占用存储空间，并降低写入、更新、删除性能。索引设计要结合 SQL 查询场景、字段区分度、排序分组需求和回表成本来考虑。常见原则是给高频查询、高区分度字段建索引，优先设计合适的联合索引，避免重复索引和低效索引。

## 如何知道是否用了索引

使用 `EXPLAIN` 查看执行计划，可以判断是否有效利用了索引。

```sql
EXPLAIN
SELECT *
FROM orders
WHERE user_id = 1001
AND status = 'PAID';
```

执行计划的结果中包含多个关键字段，下面逐一说明。

### `possible_keys` 与 `key`

* **`possible_keys`**：MySQL 认为**可能**用到的索引（理论上的可选方案）。
* **`key`**：MySQL **实际选择**使用的索引。
  * 若 `key` 为 `NULL`，通常表示没有使用索引，大概率在执行**全表扫描**。

### `type` 访问类型

| 类型 | 说明 | 性能评价 |
|------|------|----------|
| `system` / `const` | 最多匹配一行，通常用于主键或唯一索引等值查询 | 极优 |
| `eq_ref` | 使用唯一索引进行关联查询 | 优秀 |
| `ref` | 使用普通索引进行等值匹配 | 良好 |
| `range` | 对索引进行范围扫描（如 `BETWEEN`、`>`、`<`、`IN`） | 尚可 |
| `index` | 扫描整棵索引树，比全表扫描好一些，但仍需遍历所有索引项 | 一般 |
| `ALL` | 全表扫描，非常危险 | 最差 |

> **关注重点**：若看到 `ALL` 或 `index`，通常需要进一步优化。

### `rows` 预估扫描行数

即使使用了索引，如果 `rows` 数值很大，查询效率也可能不高。这个值是 MySQL 根据统计信息估算的扫描行数，越小越好。

### `Extra` 额外信息

| Extra 信息 | 含义 | 建议 |
|------------|------|------|
| `Using index` | 使用了**覆盖索引**，只需扫描索引树即可获得所需数据，不需要回表 | 理想状态 |
| `Using where` | 从存储引擎取出数据后，还需在 Server 层进行条件过滤 | 通常正常，但若过滤比例很低，可考虑优化索引 |
| `Using filesort` | 无法利用索引完成排序，MySQL 需在外部进行额外排序 | 需优化（通常为排序字段建立合适索引） |
| `Using temporary` | 使用了临时表，常见于 `GROUP BY`、`DISTINCT`、`ORDER BY` 等场景 | 需优化（尽量用索引消除临时表） |

举个例子：

```sql
EXPLAIN
SELECT id, order_no, amount
FROM orders
WHERE user_id = 1001
AND status = 'PAID'
ORDER BY created_time DESC
LIMIT 20;
```

如果有联合索引：

```sql
CREATE INDEX idx_user_status_time
ON orders(user_id, status, created_time);
```

比较理想的执行计划可能是：

```text
key: idx_user_status_time
type: ref
rows: 较小
Extra: Using index condition 或 Using where
```

如果查询字段都在索引里，还可能看到：

```text
Extra: Using index
```

说明走了覆盖索引。

更准确一点可以用：

```sql
EXPLAIN ANALYZE
SELECT ...
```

`EXPLAIN` 是优化器预估的执行计划，而 `EXPLAIN ANALYZE` 会真正执行 SQL，并返回实际耗时、实际扫描行数等信息，更接近真实情况。

> 判断 SQL 是否使用索引，主要看 EXPLAIN。重点看 key 是否为目标索引，type 是否避免 ALL，rows 是否足够小，Extra 是否出现 Using index、Using filesort、Using temporary 等信息。key 不为 NULL 只能说明使用了某个索引，但不代表一定高效，还要结合 type、rows、回表次数和实际执行耗时判断。

## Spring IoC

Spring 的 IoC 可以理解为：**对象的创建、依赖关系的管理，不再由程序员在代码里手动控制，而是交给 Spring 容器来控制。**

IoC 全称是 **Inversion of Control，控制反转**。

以前我们创建对象通常是这样：

```java
UserService userService = new UserService();
```

如果 `UserService` 依赖 `UserDao`，可能还要自己写：

```java
UserDao userDao = new UserDao();
UserService userService = new UserService(userDao);
```

也就是说，**对象什么时候创建、依赖谁、怎么组装，都是程序自己控制的**。

使用 Spring 之后，写法变成：

```java
@Service
public class UserService {

    @Autowired
    private UserDao userDao;
}
```

`UserService` 和 `UserDao` 都交给 Spring 管理，Spring 容器会负责创建它们，并把 `UserDao` 注入到 `UserService` 中。

所以 IoC 的核心思想不是某一个具体技术，而是一种设计思想：**把对象控制权从业务代码中反转给容器**。

Spring 实现 IoC 的主要方式是 **DI，Dependency Injection，依赖注入**。

依赖注入常见有三种方式：

第一种是构造器注入：

```java
@Service
public class UserService {

    private final UserDao userDao;

    public UserService(UserDao userDao) {
        this.userDao = userDao;
    }
}
```

第二种是 Setter 注入：

```java
public void setUserDao(UserDao userDao) {
    this.userDao = userDao;
}
```

第三种是字段注入：

```java
@Autowired
private UserDao userDao;
```

现在更推荐构造器注入，因为依赖关系更明确，也方便做单元测试。

IoC 的好处主要有几个：

第一，降低对象之间的耦合。业务类不需要关心依赖对象怎么创建，只需要声明自己需要什么。

第二，统一管理 Bean 的生命周期。Spring 可以负责 Bean 的创建、初始化、依赖注入、销毁等流程。

第三，方便扩展和替换实现。比如 `UserService` 依赖的是接口：

```java
private final UserRepository userRepository;
```

以后底层实现从 MySQL 换成 Redis 或远程服务，只需要换具体 Bean，业务代码可以少改甚至不改。

第四，方便结合 AOP、事务、缓存等能力。因为对象由 Spring 容器创建和管理，Spring 可以在 Bean 创建过程中生成代理对象，从而实现声明式事务、日志、权限控制等功能。

> Spring IoC 是控制反转思想的实现，它把对象创建和依赖关系维护的控制权从业务代码交给 Spring 容器。开发者只需要声明 Bean 和依赖，Spring 容器负责创建 Bean、注入依赖、管理生命周期。IoC 的主要实现方式是依赖注入，它可以降低代码耦合，提高扩展性，也为 AOP、事务等 Spring 能力提供基础。

## AI Coding

```markdown
可配置工作流审批引擎设计与实现

# 任务描述
请设计并实现一个命令行高性能压力测试工具，用于对指定 HTTP 接口进行可控并发压测。工具需自主管理资源，确保在高负载下稳定运行并能优雅退出。

# 答题要求
阶段一：和考官澄清需求（该阶段不允许使用 AI）
- 这个阶段你可以和考官讨论并确定需求、详细的功能点及边界条件。建议新建一个 markdown 来记录

阶段二：编码实现
- 你可以和 AI 协同来完成该任务，并想办法来验证功能的正确性
```
