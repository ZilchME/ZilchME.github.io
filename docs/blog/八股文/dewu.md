---
title: 得物 搜索/推荐/广告系统工程师
tags:
  - Java
  - Collections
  - Spring
  - 多线程
  - 锁
createTime: 2026/06/05 17:04:34
permalink: /blog/7qpq1k3p/
---

## Java ReentrantLock 的原理

`ReentrantLock` 内部的 `sync` 继承了 `AQS`。AQS 里有一个非常重要的字段：

```java
private volatile int state;
```

`state` 的含义是同一个线程重入的次数，这就是“可重入”的含义：**同一个线程已经持有锁时，可以再次获取这把锁，不会被自己阻塞。**

以非公平锁的加锁流程为例：

```java
final void lock() {
    if (compareAndSetState(0, 1))
        setExclusiveOwnerThread(Thread.currentThread());
    else
        acquire(1);
}
```

当前线程先直接用 CAS 把 `state` 从 `0` 改成 `1`。如果成功，说明抢锁成功，然后把当前线程设置为锁的持有者。

如果 CAS 失败，说明锁已经被别人持有，就进入 AQS 的 `acquire(1)` 流程。

`acquire(1)` 的源码逻辑大致是：

```java
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg)) {
        selfInterrupt();
    }
}
```

当线程抢不到锁时，它不会一直空转消耗 CPU，而是进入等待队列，然后被挂起，等锁释放时，再由前一个线程唤醒队列里的后继节点。

> ReentrantLock 底层基于 AQS 实现。AQS 用 volatile int state 表示锁状态，用 CAS 修改 state 来抢锁，用 exclusiveOwnerThread 记录当前持锁线程。当 state 为 0 时线程可以抢锁，抢锁成功后设置 owner；如果同一个线程再次获取锁，就把 state 加 1，实现可重入；其他线程抢锁失败后会被封装成 Node 加入 AQS 的 CLH 等待队列，并通过 LockSupport.park 阻塞。释放锁时 state 减 1，只有减到 0 才真正释放锁，并唤醒队列中的后继节点。公平锁和非公平锁的区别在于是否允许新线程插队抢锁，默认非公平锁性能更高。

## Java Collection、线程安全的集合类

`Collection` 下面主要有三大分支：

```text
Collection
├── List
├── Set
└── Queue
```

注意：==**Map 不继承 Collection**==。

> `Map` 表示的是**键值对映射关系**，而 `Collection` 表示的是**单个元素的集合**。它们抽象的对象不一样，所以 Java 设计时没有让 `Map` 继承 `Collection`。

### List

`List` 特点是**有序、可重复**，常见实现类有：

```text
ArrayList
LinkedList
Vector
Stack
```

其中 `ArrayList` 底层主要是动态数组，查询快，随机访问效率高；`LinkedList` 底层是双向链表，插入删除在已定位节点时较方便，同时它也实现了 `Deque`；`Vector` 是比较早期的线程安全动态数组；`Stack` 继承自 `Vector`，也是早期栈结构，现在一般更推荐用 `Deque` 实现栈。

### Set

`Set` 特点是**不允许重复元素**，常见实现类有：

```text
HashSet
LinkedHashSet
TreeSet
```

`HashSet` 底层基于 `HashMap`，无序，查询效率高；`LinkedHashSet` 在 `HashSet` 基础上维护插入顺序；`TreeSet` 底层基于红黑树，可以按照自然顺序或自定义比较器排序。

### Queue

`Queue` 特点是**队列结构，通常用于先进先出或优先级处理**，常见实现类有：

```text
LinkedList
PriorityQueue
ArrayDeque
```

`PriorityQueue` 是优先队列，底层通常是堆；`ArrayDeque` 是双端队列，可以从两端插入和删除，常用来替代 `Stack`；`LinkedList` 也实现了 `Queue` 和 `Deque`。

另外还有一个重要接口：

```text
Deque
```

`Deque` 继承自 `Queue`，表示双端队列。常见实现类有：

```text
ArrayDeque
LinkedList
```

### 并发集合

并发集合里，也有一些实现了 `Collection` 体系的类，比如：

```text
CopyOnWriteArrayList
CopyOnWriteArraySet
ConcurrentLinkedQueue
LinkedBlockingQueue
ArrayBlockingQueue
PriorityBlockingQueue
```

这些主要在多线程场景使用。

> Java 集合体系中，Collection 是单列集合的根接口，它下面主要有 List、Set、Queue 三大接口。List 有序可重复，常见实现是 ArrayList、LinkedList；Set 不允许重复，常见实现是 HashSet、LinkedHashSet、TreeSet；Queue 表示队列，常见实现是 LinkedList、PriorityQueue、ArrayDeque。Map 是双列键值对结构，不继承 Collection。

## Spring 设置多例注解的具体注解

在 Spring 里，Bean 默认就是**单例**，也就是 `singleton`。想改成**多例**，用 `@Scope("prototype")`。

最常见写法：

```java
@Component
@Scope("prototype")
public class MyService {
}
```

等价于：

```java
@Component
@Scope(ConfigurableBeanFactory.SCOPE_PROTOTYPE)
public class MyService {
}
```

如果是 `@Bean` 方法，也一样可以加 `@Scope`：

```java
@Configuration
public class AppConfig {

    @Bean
    @Scope("prototype")
    public MyService myService() {
        return new MyService();
    }
}
```

设置为`prototype` 后，每次从 Spring 容器获取时都会创建一个新实例。

一个容易踩坑的点是：如果把 `prototype` Bean 注入到 `singleton` Bean 里，默认只会在单例 Bean 创建时注入一次，之后不会每次都变新。例如：

```java
@Component
public class OrderService {

    @Autowired
    private MyPrototypeBean myPrototypeBean;
}
```

这里 `OrderService` 是单例，所以 `myPrototypeBean` 也只会被注入一次。若想每次使用都拿到新的 prototype Bean，可以用 `ObjectProvider`：

```java
@Component
public class OrderService {

    @Autowired
    private ObjectProvider<MyPrototypeBean> provider;

    public void doSomething() {
        MyPrototypeBean bean = provider.getObject();
    }
}
```

实际开发中，绝大多数 Spring Bean 都用默认单例；只有有状态对象、临时对象、每次使用都需要独立实例时，才考虑 `prototype`。

## 手撕实现 Java 单例模式

在 Java 中手动实现单例模式，常用两种方式：**饿汉式**和**懒汉式**。区别主要在于对象的创建时机和线程安全处理。

### 1. 饿汉式（Eager Initialization）

特点：类加载时就创建实例，天然线程安全，但如果实例占用资源较大或不一定使用，会浪费内存。

```java
public class SingletonEager {
    // 类加载时就初始化
    private static final SingletonEager INSTANCE = new SingletonEager();

    // 私有构造函数，防止外部实例化
    private SingletonEager() {}

    // 提供全局访问点
    public static SingletonEager getInstance() {
        return INSTANCE;
    }
}
```

**优点**：

- 简单，线程安全；
- 不需要加锁。

**缺点**：

- 类加载就创建实例，如果实例占用资源大且未使用，会浪费内存。

### 2. 懒汉式（Lazy Initialization）

特点：延迟实例化，只有第一次调用 `getInstance()` 时才创建对象。需要处理线程安全问题。

#### 2.1 普通懒汉式（非线程安全）

```java
public class SingletonLazy {
    private static SingletonLazy instance;

    private SingletonLazy() {}

    public static SingletonLazy getInstance() {
        if (instance == null) {
            instance = new SingletonLazy();
        }
        return instance;
    }
}
```

**缺点**：多线程环境下可能创建多个实例，不安全。

#### 2.2 线程安全懒汉式（加同步）

```java
public class SingletonLazySafe {
    private static SingletonLazySafe instance;

    private SingletonLazySafe() {}

    // synchronized保证线程安全，但每次调用都会加锁，性能略低
    public static synchronized SingletonLazySafe getInstance() {
        if (instance == null) {
            instance = new SingletonLazySafe();
        }
        return instance;
    }
}
```

#### 2.3 双重检查锁定（Double-Checked Locking）

结合懒加载和性能优化，只在第一次创建实例时加锁，同时防止指令重排（需要 `volatile`）。

```java
public class SingletonDCL {
    private static volatile SingletonDCL instance;

    private SingletonDCL() {}

    public static SingletonDCL getInstance() {
        if (instance == null) {  // 第一重检查
            synchronized (SingletonDCL.class) {
                if (instance == null) {  // 第二重检查
                    instance = new SingletonDCL();
                }
            }
        }
        return instance;
    }
}
```

**优点**：

- 延迟加载；
- 线程安全；
- 性能比 `synchronized` 方法好。
