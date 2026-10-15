---
url: /blog/0wo0nrg6/index.md
---
## 概述

### 线程池是什么

线程池（Thread Pool）是一种基于池化思想管理线程的工具，经常出现在多线程服务器中，如MySQL。

线程过多会带来额外的开销，其中包括创建销毁线程的开销、调度线程的开销等等，同时也降低了计算机的整体性能。线程池维护多个线程，等待监督管理者分配可并发执行的任务。这种做法，一方面避免了处理任务时创建销毁线程开销的代价，另一方面避免了线程数量膨胀导致的过分调度问题，保证了对内核的充分利用。

使用线程池可以带来一系列好处：

* **降低资源消耗**：通过池化技术重复利用已创建的线程，降低线程创建和销毁造成的损耗。
* **提高响应速度**：任务到达时，无需等待线程创建即可立即执行。
* **提高线程的可管理性**：线程是稀缺资源，如果无限制创建，不仅会消耗系统资源，还会因为线程的不合理分布导致资源调度失衡，降低系统的稳定性。使用线程池可以进行统一的分配、调优和监控。
* **提供更多更强大的功能**：线程池具备可拓展性，允许开发人员向其中增加更多的功能。比如延时定时线程池 `ScheduledThreadPoolExecutor`，就允许任务延期执行或定期执行。

而本文描述线程池是JDK中提供的 `ThreadPoolExecutor` 类。

### 线程池解决的问题是什么

线程池解决的核心问题就是资源管理问题。在并发环境下，系统不能够确定在任意时刻中，有多少任务需要执行，有多少资源需要投入。这种不确定性将带来以下若干问题：

1. 频繁申请/销毁资源和调度资源，将带来额外的消耗，可能会非常巨大。
2. 对资源无限申请缺少抑制手段，易引发系统资源耗尽的风险。
3. 系统无法合理管理内部的资源分布，会降低系统的稳定性。

为解决资源分配这个问题，线程池采用了“池化”（Pooling）思想。池化，顾名思义，是为了最大化收益并最小化风险，而将资源统一在一起管理的一种思想。

> Pooling is the grouping together of resources (assets, equipment, personnel, effort, etc.) for the purposes of maximizing advantage or minimizing risk to the users. The term is used in finance, computing and equipment management.——wikipedia

在计算机领域中的表现为：统一管理IT资源，包括服务器、存储、和网络资源等等。通过共享资源，使用户在低投入中获益。除去线程池，还有其他比较典型的几种使用策略包括：

1. 内存池(Memory Pooling)：预先申请内存，提升申请内存速度，减少内存碎片。
2. 连接池(Connection Pooling)：预先申请数据库连接，提升申请连接的速度，降低系统的开销。
3. 实例池(Object Pooling)：循环使用对象，减少资源在初始化和释放时的昂贵损耗。

## 线程池核心设计与实现

本章详细介绍在Java中的 `ThreadPoolExecutor` 类的设计。

### 总体设计

`ThreadPoolExecutor` 的继承关系如下UML类图所示：

![ThreadPoolExecutor的UML类图](https://p1.meituan.net/travelcube/912883e51327e0c7a9d753d11896326511272.png)

`ThreadPoolExecutor` 的顶层接口是 `Executor`，顶层接口 `Executor` 提供了一种思想：将任务提交和任务执行进行解耦。用户无需关注如何创建线程，如何调度线程来执行任务，用户只需提供 `Runnable` 对象，将任务的运行逻辑提交到 `Executor` 中，由 `Executor` 框架完成线程的调配和任务的执行部分。

```java title="Executor.java"
public interface Executor {

    /**
     * 在未来的某个时间执行给定的命令。该命令可能在新的线程中执行，
     * 也可能在线程池中的线程里执行，或者在调用线程中执行，
     * 具体由 {@code Executor} 的实现决定。
     *
     * @param command 可运行的任务
     * @throws RejectedExecutionException 如果该任务无法被接受并执行
     * @throws NullPointerException 如果 command 为空
     */
    void execute(Runnable command);
}
```

`ExecutorService` 接口增加了一些能力：

1. 扩充执行任务的能力，补充可以为一个或一批异步任务生成Future的方法；
2. 提供了管控线程池的方法，比如停止线程池的运行。

`AbstractExecutorService` 则是上层的抽象类，将执行任务的流程串联了起来，保证下层的实现只需关注一个执行任务的方法即可。

最下层的实现类 `ThreadPoolExecutor` 实现最复杂的运行部分，`ThreadPoolExecutor` 将会一方面维护自身的生命周期，另一方面同时管理线程和任务，使两者良好的结合从而执行并行任务。其运行机制如下图：

![ThreadPoolExecutor运行流程](https://p0.meituan.net/travelcube/77441586f6b312a54264e3fcf5eebe2663494.png)

线程池在内部实际上构建了一个**生产者消费者模型**，将线程和任务两者解耦，并不直接关联，从而良好的缓冲任务，复用线程。线程池的运行主要分成两部分：任务管理、线程管理。

任务管理部分充当生产者的角色，当任务提交后，线程池会判断该任务后续的流转：

1. 直接申请线程执行该任务；
2. 缓冲到队列中等待线程执行；
3. 拒绝该任务。

线程管理部分是消费者，它们被统一维护在线程池内，根据任务请求进行线程的分配，当线程执行完任务后则会继续获取新的任务去执行，最终当线程获取不到任务的时候，线程就会被回收。

### 生命周期管理

线程池运行的状态，并不是用户显式设置的，而是伴随着线程池的运行，由内部来维护。

线程池内部使用一个变量维护两个值：运行状态(runState)和线程数量 (workerCount)。在具体实现中，线程池将运行状态(runState)、线程数量 (workerCount)两个关键参数的维护放在了一起，如下代码所示：

```java title="ThreadPoolExecutor.java"
private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));
private static final int COUNT_BITS = Integer.SIZE - 3;
private static final int COUNT_MASK = (1 << COUNT_BITS) - 1;

// runState 存储在高位
private static final int RUNNING    = -1 << COUNT_BITS;
private static final int SHUTDOWN   =  0 << COUNT_BITS;
private static final int STOP       =  1 << COUNT_BITS;
private static final int TIDYING    =  2 << COUNT_BITS;
private static final int TERMINATED =  3 << COUNT_BITS;
```

`ctl` 这个 `AtomicInteger` 类型，是对线程池的运行状态和线程池中有效线程的数量进行控制的一个字段， 它同时包含两部分的信息：线程池的运行状态 (`runState`) 和线程池内有效线程的数量 (`workerCount`)，高3位保存 `runState`，低29位保存 `workerCount`，两个变量之间互不干扰。

用一个变量去存储两个值，可避免在做相关决策时，出现不一致的情况，不必为了维护两者的一致，而占用锁资源。

线程池也提供了若干方法去供用户获得线程池当前的运行状态、线程个数。由于经常出现要同时判断线程池运行状态和线程数量的情况，使用位运算的方式，相比于基本运算，速度也会快很多。

```java title="ThreadPoolExecutor.java"
// ctl 的打包与解包
private static int runStateOf(int c)     { return c & ~COUNT_MASK; }
private static int workerCountOf(int c)  { return c & COUNT_MASK; }
private static int ctlOf(int rs, int wc) { return rs | wc; }
```

`ThreadPoolExecutor` 的运行状态有5种，分别为：

| 运行状态       | 状态描述                                                     |
| -------------- | ------------------------------------------------------------ |
| **RUNNING**    | 能接受新提交的任务，并且也能处理阻塞队列中的任务。           |
| **SHUTDOWN**   | 关闭状态，不再接受新提交的任务，但却可以继续处理阻塞队列中已保存的任务。 |
| **STOP**       | 不能接受新任务，也不处理队列中的任务，会中断正在处理任务的线程。 |
| **TIDYING**    | 所有的任务都已终止了，workerCount (有效线程数) 为0。         |
| **TERMINATED** | 在 `terminated()` 方法执行完后进入该状态。                   |

其生命周期转换如下入所示：

![线程池生命周期](https://p0.meituan.net/travelcube/582d1606d57ff99aa0e5f8fc59c7819329028.png)

### 任务执行机制

#### 任务调度

任务调度是线程池的主要入口，当用户提交了一个任务，接下来这个任务将如何执行都是由这个阶段决定的。了解这部分就相当于了解了线程池的核心运行机制。

首先，所有任务的调度都是由 `execute` 方法完成的，这部分完成的工作是：检查现在线程池的运行状态、运行线程数、运行策略，决定接下来执行的流程，是直接申请线程执行，或是缓冲到队列中执行，亦或是直接拒绝该任务。其执行过程如下：

1. 首先检测线程池运行状态，如果不是 **RUNNING**，则直接拒绝，线程池要保证在 **RUNNING**的状态下执行任务。
2. 如果 `workerCount < corePoolSize`，则创建并启动一个线程来执行新提交的任务。
3. 如果 `workerCount >= corePoolSize`，且线程池内的阻塞队列未满，则将任务添加到该阻塞队列中。
4. 如果 `workerCount >= corePoolSize && workerCount < maximumPoolSize`，且线程池内的阻塞队列已满，则创建并启动一个线程来执行新提交的任务。
5. 如果 `workerCount >= maximumPoolSize`，并且线程池内的阻塞队列已满, 则根据拒绝策略来处理该任务, 默认的处理方式是直接抛异常。

```java title="ThreadPoolExecutor.java"
public void execute(Runnable command) {
    Objects.requireNonNull(command, "command");
    /*
    * 分 3 步进行：
    *
    * 1. 如果正在运行的线程少于 corePoolSize，则尝试用给定的命令作为
    * 第一个任务启动一个新线程。对 addWorker 的调用会原子地检查 runState
    * 和 workerCount，因此通过返回 false，避免在不该添加线程时误判并添加线程。
    *
    * 2. 如果任务成功入队，仍然需要再次检查是否应该新增线程（因为自上次检查后，
    * 现有线程可能已经退出），或者在进入该方法后线程池是否已经关闭。
    * 因此需要重新检查状态，并在必要时于停止时回滚入队操作；
    * 如果当前没有线程，则启动一个新线程。
    *
    * 3. 如果无法将任务入队，则尝试添加一个新线程。
    * 如果失败，就说明线程池已关闭或已饱和，因此拒绝该任务。
     */
    int c = ctl.get();
    if (workerCountOf(c) < corePoolSize) {
        if (addWorker(command, true))
            return;
        c = ctl.get();
    }
    if (isRunning(c) && workQueue.offer(command)) {
        int recheck = ctl.get();
        if (! isRunning(recheck) && remove(command))
            reject(command);
        else if (workerCountOf(recheck) == 0)
            addWorker(null, false);
    }
    else if (!addWorker(command, false))
        reject(command);
}
```

#### 任务缓冲

任务缓冲模块是线程池能够管理任务的核心部分。线程池的本质是对任务和线程的管理，而做到这一点最关键的思想就是将任务和线程两者解耦，不让两者直接关联，才可以做后续的分配工作。

线程池通过一个阻塞队列来实现生产者消费者模式，生产者是往队列里添加元素的线程，消费者是从队列里拿元素的线程。阻塞队列缓存任务，工作线程从阻塞队列中获取任务，阻塞队列是生产者存放元素的容器，而消费者也只从容器里拿元素。

阻塞队列 (`BlockingQueue`) 是一个支持两个附加操作的队列。

* 在队列为空时，获取元素的线程会等待队列变为非空。
* 当队列满时，存储元素的线程会等待队列可用。

![阻塞队列](https://p1.meituan.net/travelcube/f4d89c87acf102b45be8ccf3ed83352a9497.png)

使用不同的队列可以实现不一样的任务存取策略。在这里，我们可以再介绍下阻塞队列的成员：

| **名称**                  | 描述                                                         |
| ------------------------- | ------------------------------------------------------------ |
| **ArrayBlockingQueue**    | 一个用数组实现的有界阻塞队列，此队列按照先进先出(FIFO)的原则对元素进行排序。支持公平锁和非公平锁。 |
| **LinkedBlockingQueue**   | 一个由链表结构组成的有界队列，此队列按照先进先出(FIFO)的原则对元素进行排序。此队列的默认长度为 `Integer.MAX_VALUE`，所以默认创建的该队列有容量危险。 |
| **PriorityBlockingQueue** | 一个支持线程优先级排序的无界队列，默认自然序进行排序，也可以自定义实现 `compareTo()` 方法来指定元素排序规则，不能保证同优先级元素的顺序。 |
| **DelayQueue**            | 一个实现 `PriorityBlockingQueue` 实现延迟获取的无界队列，在创建元素时，可以指定多久才能从队列中获取当前元素。只有延时期满后才能从队列中获取元素。 |
| **SynchronousQueue**      | 一个不存储元素的阻塞队列，每一个 `put` 操作必须等待 `take` 操作，否则不能添加元素。支持公平锁和非公平锁。`SynchronousQueue` 的一个使用场景是在线程池里。`Executors.newCachedThreadPool()` 就使用了 `SynchronousQueue`，这个线程池根据需要（新任务到来时）创建新的线程，如果有空闲线程则会重复使用，线程空闲了60秒后会被回收。 |
| **LinkedTransferQueue**   | 一个由链表结构组成的无界阻塞队列，相当于其它队列，`LinkedTransferQueue` 队列多了 `transfer` 和 `tryTransfer` 方法。 |
| **LinkedBlockingDeque**   | 一个由链表结构组成的双向阻塞队列。队列头部和尾部都可以添加和移除元素，多线程并发时，可以将锁的竞争最多降到一半。 |

#### 任务申请

由上文的任务分配部分可知，任务的执行有两种可能：

1. 任务直接由新创建的线程执行
2. 线程从任务队列中获取任务然后执行，执行完任务的空闲线程会再次去从队列中申请任务再去执行

第一种情况仅出现在线程初始创建的时候，第二种是线程获取任务绝大多数的情况。

线程需要从任务缓存模块中不断地取任务执行，帮助线程从阻塞队列中获取任务，实现线程管理模块和任务管理模块之间的通信。这部分策略由 `getTask` 方法实现，其执行流程如下图所示：

![获取任务流程图](https://p0.meituan.net/travelcube/49d8041f8480aba5ef59079fcc7143b996706.png)

`getTask` 这部分进行了多次判断，为的是控制线程的数量，使其符合线程池的状态。如果线程池现在不应该持有那么多线程，则会返回 `null` 值。工作线程 Worker 会不断接收新任务去执行，而当工作线程 Worker 接收不到任务的时候，就会开始被回收。

```java title="ThreadPoolExecutor.java"
/**
 * Performs blocking or timed wait for a task, depending on
 * 根据当前配置，对任务执行阻塞或定时等待；如果该 worker 必须退出，
 * 则返回 null，退出情况包括：
 * 1. 由于调用 setMaximumPoolSize，worker 数量超过 maximumPoolSize。
 * 2. 线程池被停止（stopped）。
 * 3. 线程池已关闭（shutdown）且队列为空。
 * 4. 该 worker 在等待任务时超时，且超时的 worker 会被终止（即
 *    {@code allowCoreThreadTimeOut || workerCount > corePoolSize}），
 *    在定时等待前后都会判断；
 *    如果队列非空且该 worker 不是池中最后一个线程，则该 worker 会退出。
 *
 * @return task；如果 worker 必须退出则返回 null，此时 workerCount 会被递减
 */
private Runnable getTask() {
    boolean timedOut = false; // Did the last poll() time out?

    for (;;) {
        int c = ctl.get();

        // Check if queue empty only if necessary.
        if (runStateAtLeast(c, SHUTDOWN)
            && (runStateAtLeast(c, STOP) || workQueue.isEmpty())) {
            decrementWorkerCount();
            return null;
        }

        int wc = workerCountOf(c);

        // Are workers subject to culling?
        boolean timed = allowCoreThreadTimeOut || wc > corePoolSize;

        if ((wc > maximumPoolSize || (timed && timedOut))
            && (wc > 1 || workQueue.isEmpty())) {
            if (compareAndDecrementWorkerCount(c))
                return null;
            continue;
        }

        try {
            Runnable r = timed ?
                workQueue.poll(keepAliveTime, TimeUnit.NANOSECONDS) :
                workQueue.take();
            if (r != null)
                return r;
            timedOut = true;
        } catch (InterruptedException retry) {
            timedOut = false;
        }
    }
}
```

#### 任务拒绝

任务拒绝模块是线程池的保护部分，线程池有一个最大的容量，当线程池的任务缓存队列已满，并且线程池中的线程数目达到 `maximumPoolSize` 时，就需要拒绝掉该任务，采取任务拒绝策略，保护线程池。

拒绝策略是一个接口，其设计如下：

```java title="RejectedExecutionHandler.java"
public interface RejectedExecutionHandler {

    /**
     * 当 {@link ThreadPoolExecutor} 无法通过
     * {@link ThreadPoolExecutor#execute execute} 接受任务时，
     * 可能由该执行器调用的方法。这种情况可能发生在
     * 由于超出线程或队列槽位的边界限制而导致
     * 无可用的线程或队列槽位时，或者在执行器关闭时。
     *
     * <p>在没有其他替代方案的情况下，该方法可能抛出
     * 一个非受检的 {@link RejectedExecutionException}，
     * 该异常将被传播给 {@code execute} 方法的调用者。
     *
     * @param r        要执行的可运行任务
     * @param executor 尝试执行此任务的线程池执行器
     * @throws RejectedExecutionException 如果无法补救
     */
    void rejectedExecution(Runnable r, ThreadPoolExecutor executor);
}
```

用户可以通过实现这个接口去定制拒绝策略，也可以选择JDK提供的四种已有拒绝策略，其特点如下：

| **名称**                                   | 描述                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| **ThreadPoolExecutor.AbortPolicy**         | **丢弃任务并抛出 `RejectedExecutionException` 异常**。这是线程池默认的拒绝策略，在任务不能再提交的时候，抛出异常，及时反馈程序运行状态。如果是比较关键的业务，推荐使用此拒绝策略，这样子在系统不能承载更大的并发量的时候，能够及时的通过异常发现。 |
| **ThreadPoolExecutor.DiscardPolicy**       | **丢弃任务，但是不抛出异常**。使用此策略，可能会使我们无法发现系统的异常状态。建议是一些无关紧要的业务采用此策略。 |
| **ThreadPoolExecutor.DiscardOldestPolicy** | **丢弃队列最前面的任务，然后重新提交被拒绝的任务**。是否要采用此种拒绝策略，还得根据实际业务是否允许丢弃老任务来认真衡量。 |
| **ThreadPoolExecutor.CallerRunsPolicy**    | **由调用线程（提交任务的线程）处理该任务**。这种情况是需要==让所有任务都执行完毕==，那么就适合大量计算的任务类型去执行，多线程仅仅是增大吞吐量的手段，最终必须要让每个任务都执行完毕。 |

### Worker 线程管理

#### Worker 线程

线程池为了掌握线程的状态并维护线程的生命周期，设计了线程池内的工作线程 `Worker`。我们来看一下它的部分代码：

```java title="ThreadPoolExecutor.java" :collapsed-lines
/**
 * Worker 类主要用于维护运行任务的线程的中断控制状态，
 * 以及一些其他的辅助记账功能。该类适时地扩展了
 * AbstractQueuedSynchronizer，以简化对每个任务执行
 * 前后获取和释放锁的操作。这样可以防止那些旨在唤醒
 * 正在等待任务的 worker 线程的中断，意外地中断了
 * 正在运行的任务。我们实现了一个简单的不可重入的
 * 互斥锁，而没有使用 ReentrantLock，因为我们不希望
 * worker 任务在调用诸如 setCorePoolSize 等池控制方法时
 * 能够重新获取该锁。此外，为了在线程真正开始运行任务
 * 之前抑制中断，我们将锁的初始状态设为负数，并在
 * 启动时（在 runWorker 中）将其清除。
 */
private final class Worker
    extends AbstractQueuedSynchronizer
    implements Runnable
{
    /**
     * This class will never be serialized, but we provide a
     * serialVersionUID to suppress a javac warning.
     */
    private static final long serialVersionUID = 6138294804551838833L;

    /** Thread this worker is running in.  Null if factory fails. */
    @SuppressWarnings("serial") // Unlikely to be serializable
    final Thread thread;
    /** Initial task to run.  Possibly null. */
    @SuppressWarnings("serial") // Not statically typed as Serializable
    Runnable firstTask;
    /** Per-thread task counter */
    volatile long completedTasks;

    /**
     * Creates with given first task and thread from ThreadFactory.
     * @param firstTask the first task (null if none)
     */
    Worker(Runnable firstTask) {
        setState(-1); // inhibit interrupts until runWorker
        this.firstTask = firstTask;
        this.thread = getThreadFactory().newThread(this); // [!code highlight]
    }

    /** Delegates main run loop to outer runWorker. */
    public void run() {
        runWorker(this); // [!code highlight]
    }

    // Lock methods
    //
    // The value 0 represents the unlocked state.
    // The value 1 represents the locked state.

    protected boolean isHeldExclusively() {
        return getState() != 0;
    }

    protected boolean tryAcquire(int unused) {
        if (compareAndSetState(0, 1)) {
            setExclusiveOwnerThread(Thread.currentThread());
            return true;
        }
        return false;
    }

    protected boolean tryRelease(int unused) {
        setExclusiveOwnerThread(null);
        setState(0);
        return true;
    }

    public void lock()        { acquire(1); }
    public boolean tryLock()  { return tryAcquire(1); }
    public void unlock()      { release(1); }
    public boolean isLocked() { return isHeldExclusively(); }

    void interruptIfStarted() {
        Thread t;
        if (getState() >= 0 && (t = thread) != null && !t.isInterrupted()) {
            try {
                t.interrupt();
            } catch (SecurityException ignore) {
            }
        }
    }
}
```

`Worker` 这个工作线程，实现了 `Runnable` 接口，并持有一个线程 `thread`，一个初始化的任务 `firstTask`。

* `thread` 是在调用构造方法时通过 `ThreadFactory` 来创建的线程，可以用来执行任务；

  由于 **`Worker` 自身实现了 `Runnable` 接口**，并且在创建 `thread` 时将它作为 `Runnable  target` 目标传给了 `Thread` 构造器，当`thread.start()` 启动新线程时，会调用 `target.run()`

* `firstTask` 用它来保存传入的第一个任务，这个任务可以有也可以为 `null`。
  * 如果这个值是非空的，那么线程就会在启动初期立即执行这个任务，也就对应核心线程创建时的情况；
  * 如果这个值是 `null`，那么就需要创建一个线程去执行任务列表（`workQueue`）中的任务，也就是非核心线程的创建。

`Worker` 执行任务的模型如下图所示：

![Worker执行任务](https://p0.meituan.net/travelcube/03268b9dc49bd30bb63064421bb036bf90315.png)

线程池需要管理线程的生命周期，需要在线程长时间不运行的时候进行回收。线程池使用一张Hash表去持有线程的引用，这样可以通过添加引用、移除引用这样的操作来控制线程的生命周期。这个时候重要的就是如何判断线程是否在运行。

`Worker` 是通过继承 AQS，使用 AQS 来实现**独占锁**这个功能。没有使用可重入锁 `ReentrantLock`，而是使用 AQS，为的就是实现不可重入的特性去反应线程现在的执行状态。

\*\[AQS]: `AbstractQueuedSynchronizer`

1. `lock` 方法一旦获取了独占锁，表示当前线程正在执行任务中。
2. 如果正在执行任务，则不应该中断线程。
3. 如果该线程现在不是独占锁的状态，也就是空闲的状态，说明它没有在处理任务，这时可以对该线程进行中断。
4. 线程池在执行 `shutdown` 方法或 `tryTerminate` 方法时会调用 `interruptIdleWorkers` 方法来中断空闲的线程，`interruptIdleWorkers` 方法会使用 `tryLock` 方法来判断线程池中的线程是否是空闲状态；如果线程是空闲状态则可以安全回收。

在线程回收过程中就使用到了这种特性，回收过程如下图所示：

![线程池回收过程](https://p1.meituan.net/travelcube/9d8dc9cebe59122127460f81a98894bb34085.png)

增加线程是通过线程池中的 `addWorker` 方法，该方法的功能就是增加一个线程，该方法不考虑线程池是在哪个阶段增加的该线程，这个分配线程的策略是在上个步骤完成的，该步骤仅仅完成增加线程，并使它运行，最后返回是否成功这个结果。

`addWorker`方法有两个参数：`firstTask`、`core`：

* `firstTask` 用于指定新增的线程执行的第一个任务，该参数可以为空；
* `core` 为 `true` 表示在新增线程时会判断当前活动线程数是否少于 `corePoolSize`，`false` 表示新增线程前需要判断当前活动线程数是否少于 `maximumPoolSize`

`addWorker` 执行流程如下图所示：

![申请线程执行流程图](https://p0.meituan.net/travelcube/49527b1bb385f0f43529e57b614f59ae145454.png)

```java title="ThreadPoolExecutor.java" :collapsed-lines
/**
 * 根据当前池的状态和给定的边界（核心线程数或最大线程数）
 * 检查是否可以添加新的 worker。如果可以，则相应调整 worker
 * 计数，并尽可能创建并启动一个新的 worker，以 firstTask 作为
 * 其第一个任务。如果池已停止或符合关闭条件，此方法返回 false。
 * 如果线程工厂在创建线程时失败，该方法同样返回 false。如果线程
 * 创建失败，无论是由于线程工厂返回 null，还是由于异常（通常是
 * Thread.start() 中的 OutOfMemoryError），我们都会干净地回滚。
 *
 * @param firstTask 新线程应首先运行的任务（如果没有则为 null）。
 * 当线程数少于 corePoolSize 时（此时我们总是启动一个 worker），
 * 或者当队列已满时（此时我们必须绕过队列），会使用一个初始的 firstTask
 * 来创建 worker（在 execute() 方法中）。初始空闲线程通常通过
 * prestartCoreThread 创建，或者用于替换其他 dying 的 worker。
 *
 * @param core 如果为 true，则使用 corePoolSize 作为边界，
 * 否则使用 maximumPoolSize。（此处使用布尔值指示器而不是具体数值，
 * 以确保在检查其他池状态后能读取到最新的值）。
 * @return 如果成功则返回 true
 */
private boolean addWorker(Runnable firstTask, boolean core) {
    retry:
    for (int c = ctl.get();;) {
        // Check if queue empty only if necessary.
        if (runStateAtLeast(c, SHUTDOWN)
            && (runStateAtLeast(c, STOP)
                || firstTask != null
                || workQueue.isEmpty()))
            return false;

        for (;;) {
            if (workerCountOf(c)
                >= ((core ? corePoolSize : maximumPoolSize) & COUNT_MASK))
                return false;
            if (compareAndIncrementWorkerCount(c))
                break retry;
            c = ctl.get();  // Re-read ctl
            if (runStateAtLeast(c, SHUTDOWN))
                continue retry;
            // else CAS failed due to workerCount change; retry inner loop
        }
    }

    boolean workerStarted = false;
    boolean workerAdded = false;
    Worker w = null;
    try {
        w = new Worker(firstTask);
        final Thread t = w.thread; // [!code highlight]
        if (t != null) {
            final ReentrantLock mainLock = this.mainLock;
            mainLock.lock();
            try {
                // Recheck while holding lock.
                // Back out on ThreadFactory failure or if
                // shut down before lock acquired.
                int c = ctl.get();

                if (isRunning(c) ||
                    (runStateLessThan(c, STOP) && firstTask == null)) {
                    if (t.getState() != Thread.State.NEW)
                        throw new IllegalThreadStateException();
                    workers.add(w);
                    workerAdded = true;
                    int s = workers.size();
                    if (s > largestPoolSize)
                        largestPoolSize = s;
                }
            } finally {
                mainLock.unlock();
            }
            if (workerAdded) {
                t.start(); // [!code --]
                // private final SharedThreadContainer container; // [!code ++]
                container.start(t); // JDK 21 起 // [!code ++]
                workerStarted = true;
            }
        }
    } finally {
        if (! workerStarted)
            addWorkerFailed(w);
    }
    return workerStarted;
}
```

#### Worker 线程回收

线程池中线程的销毁依赖 JVM 自动的回收，线程池做的工作是根据当前线程池的状态维护一定数量的线程引用，防止这部分线程被JVM回收，当线程池决定哪些线程需要回收时，只需要将其引用消除即可。

`Worker` 被创建出来后，就会不断地进行轮询，然后获取任务去执行，核心线程可以无限等待获取任务，非核心线程要限时获取任务。当`Worker` 无法获取到任务，也就是获取的任务为空时，循环会结束，`Worker` 会主动消除自身在线程池内的引用。

线程回收的工作是在 `processWorkerExit` 方法完成的。

![线程销毁流程](https://p0.meituan.net/travelcube/90ea093549782945f2c968403fdc39d415386.png)

事实上，在这个方法中，将线程引用移出线程池就已经结束了线程销毁的部分。但由于引起线程销毁的可能性有很多，线程池还要判断是什么引发了这次销毁，是否要改变线程池的现阶段状态，是否要根据新状态，重新分配线程。

```java title="ThreadPoolExecutor.java"
/**
 * 为即将终止的 worker 执行清理和记账工作。仅由 worker 线程调用。
 * 除非 completedAbruptly 被设置为 true，否则假定 workerCount
 * 已经针对退出进行了调整。该方法会从 worker 集合中移除线程，
 * 并在以下情况下可能终止线程池或替换该 worker：
 * worker 因用户任务异常而退出，或者运行中的 worker 数少于
 * corePoolSize，或者队列非空但没有正在运行的 worker。
 *
 * @param w 要清理的 worker
 * @param completedAbruptly 若 worker 因用户异常而死亡
 */
private void processWorkerExit(Worker w, boolean completedAbruptly) {
    if (completedAbruptly) // If abrupt, then workerCount wasn't adjusted
        decrementWorkerCount();

    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        completedTaskCount += w.completedTasks;
        workers.remove(w);
    } finally {
        mainLock.unlock();
    }

    tryTerminate();

    int c = ctl.get();
    if (runStateLessThan(c, STOP)) {
        if (!completedAbruptly) {
            int min = allowCoreThreadTimeOut ? 0 : corePoolSize;
            if (min == 0 && ! workQueue.isEmpty())
                min = 1;
            if (workerCountOf(c) >= min)
                return; // replacement not needed
        }
        addWorker(null, false);
    }
}
```

#### Worker线程执行任务

在 `Worker` 类中的 `run` 方法调用了 `runWorker` 方法来执行任务，`runWorker` 方法的执行过程如下：

1. `while` 循环不断地通过 `getTask()` 方法获取任务。
2. `getTask()` 方法从阻塞队列中取任务。
3. 如果线程池正在停止，那么要保证当前线程是中断状态，否则要保证当前线程不是中断状态。
4. 执行任务。
5. 如果 `getTask()` 结果为 `null` 则跳出循环，执行 `processWorkerExit()` 方法，销毁线程。

> 默认情况下核心线程在 `getTask()` 中会永远阻塞在 `workQueue.take()` 上，所以永远不会进入 `processWorkerExit` 方法，从而确保核心线程长期存活。

![执行任务流程](https://p0.meituan.net/travelcube/879edb4f06043d76cea27a3ff358cb1d45243.png)

```java title="ThreadPoolExecutor.java"
final void runWorker(Worker w) {
    Thread wt = Thread.currentThread();
    Runnable task = w.firstTask;
    w.firstTask = null;
    w.unlock(); // allow interrupts
    boolean completedAbruptly = true;
    try {
        while (task != null || (task = getTask()) != null) {
            w.lock();
            // If pool is stopping, ensure thread is interrupted;
            // if not, ensure thread is not interrupted.  This
            // requires a recheck in second case to deal with
            // shutdownNow race while clearing interrupt
            if ((runStateAtLeast(ctl.get(), STOP) ||
                 (Thread.interrupted() &&
                  runStateAtLeast(ctl.get(), STOP))) &&
                !wt.isInterrupted())
                wt.interrupt();
            try {
                beforeExecute(wt, task);
                try {
                    task.run();
                    afterExecute(task, null);
                } catch (Throwable ex) {
                    afterExecute(task, ex);
                    throw ex;
                }
            } finally {
                task = null;
                w.completedTasks++;
                w.unlock();
            }
        }
        completedAbruptly = false;
    } finally {
        processWorkerExit(w, completedAbruptly);
    }
}
```
