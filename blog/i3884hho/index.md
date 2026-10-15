---
url: /blog/i3884hho/index.md
---
## 前言

Java提供了种类丰富的锁，每种锁因其特性的不同，在适当的场景下能够展现出非常高的效率。

本文旨在对锁相关源码、使用场景进行举例，为读者介绍主流锁的知识点，以及不同的锁的适用场景。

![img](https://awps-assets.meituan.net/mit-x/blog-images-bundle-2018b/7f749fc8.png)

## 乐观锁与悲观锁

乐观锁与悲观锁是一种广义上的概念，体现了看待线程同步的不同角度，在 Java 和数据库中都有此概念对应的实际应用。

对于同一个数据的并发操作，悲观锁认为自己在使用数据的时候一定有别的线程来修改数据，因此在获取数据的时候会先加锁，确保数据不会被别的线程修改。Java 中，`synchronized` 关键字和 `Lock` 的实现类都是悲观锁。

而乐观锁认为自己在使用数据时不会有别的线程修改数据，所以不会添加锁，只是在更新数据的时候去判断之前有没有别的线程更新了这个数据。如果这个数据没有被更新，当前线程将自己修改的数据成功写入。如果数据已经被其他线程更新，则根据不同的实现方式执行不同的操作（例如报错或者自动重试）。

乐观锁在 Java 中是通过使用无锁编程来实现，最常采用的是 CAS 算法，Java 原子类中的递增操作就通过 CAS 自旋实现的。

![img](https://awps-assets.meituan.net/mit-x/blog-images-bundle-2018b/c8703cd9.png)

根据从上面的概念描述我们可以发现：

* 悲观锁适合写操作多的场景，先加锁可以保证写操作时数据正确。
* 乐观锁适合读操作多的场景，不加锁的特点能够使其读操作的性能大幅提升。

光说概念有些抽象，我们来看下乐观锁和悲观锁的调用方式示例：

```java
// ------------------------- 悲观锁的调用方式 -------------------------
// synchronized
public synchronized void testMethod() {
 // 操作同步资源
}

// ReentrantLock
private ReentrantLock lock = new ReentrantLock(); // 需要保证多个线程使用的是同一个锁
public void modifyPublicResources() {
 lock.lock();
 // 操作同步资源
 lock.unlock();
}

// ------------------------- 乐观锁的调用方式 -------------------------
// 需要保证多个线程使用的是同一个AtomicInteger
private AtomicInteger atomicInteger = new AtomicInteger();
atomicInteger.incrementAndGet(); //执行自增1
```

通过调用方式示例，我们可以发现悲观锁基本都是在显式的锁定之后再操作同步资源，而乐观锁则直接去操作同步资源。

### 乐观锁的实现方式

那么，为何乐观锁能够做到不锁定同步资源也可以正确的实现线程同步呢？我们通过介绍乐观锁的主要实现方式 CAS 的技术原理来为大家解惑。

CAS 全称 Compare And Swap（比较与交换），是一种无锁算法。在不使用锁（没有线程被阻塞）的情况下实现多线程之间的变量同步。`java.util.concurrent` 包中的原子类就是通过 CAS 来实现了乐观锁。

在CAS中，有这样三个值：

* V：要更新的变量(var)
* E：预期值(expected)
* N：新值(new)

比较并交换的过程如下：

判断 V 是否等于 E，如果等于，将 V 的值设置为 N；如果不等，说明已经有其它线程更新了 V，则当前线程放弃更新，什么都不做。所以这里的**预期值 E 本质上指的是“旧值”**。

我们以一个简单的例子来解释这个过程：

1. 如果有一个多个线程共享的变量 `i` 原本等于5，我现在在线程 A 中，想把它设置为新的值6;
2. 我们使用 CAS 来做这个事情；
3. 首先我们用 `i` 去与 5 对比，发现它等于5，说明没有被其它线程改过，那我就把它设置为新的值 6，此次 CAS 成功，`i`的值被设置成了6；
4. 如果不等于 5，说明 `i` 被其它线程改过了（比如值为2），那么我就什么也不做，此次 CAS 失败，`i` 的值仍然为2。

在这个例子中，`i` 就是 V，5就是 E，6就是 N。

**当多个线程同时使用CAS操作一个变量时，只有一个会胜出，并成功更新，其余均会失败，但失败的线程并不会被挂起，仅是被告知失败，并且允许再次尝试，当然也允许失败的线程放弃操作。**

### Java 实现 CAS 的原理

之前提到 `java.util.concurrent` 包中的原子类，就是通过 CAS 来实现了乐观锁，那么我们进入原子类 `AtomicInteger` 的源码，看一下 `AtomicInteger` 的定义：

```java title="AtomicInteger.java"
public class AtomicInteger extends Number implements java.io.Serializable {
    private static final long serialVersionUID = 6214790243416807050L;

    /*
     * This class intended to be implemented using VarHandles, but there
     * are unresolved cyclic startup dependencies.
     */
    private static final Unsafe U = Unsafe.getUnsafe();
    private static final long VALUE
        = U.objectFieldOffset(AtomicInteger.class, "value");

    private volatile int value;
    // more code...
}
```

根据定义我们可以看出各属性的作用：

* `U`： 获取并操作内存的数据。
* `VALUE`： 存储 `value` 在 `AtomicInteger`中的偏移量。
* `value`： 存储 `AtomicInteger` 的 `int` 值，该属性需要借助 `volatile` 关键字保证其在线程间是可见的。

接下来，我们查看 `AtomicInteger` 的自增函数 `incrementAndGet()` 的源码时，发现自增函数底层调用的是 `U.getAndAddInt()`。我们通过 OpenJDK 来查看 `Unsafe` 的源码：

::: code-tabs
@tab AtomicInteger.java

```java
/**
 * Atomically increments the current value,
 * with memory effects as specified by {@link VarHandle#getAndAdd}.
 *
 * <p>Equivalent to {@code addAndGet(1)}.
 *
 * @return the updated value
 */
public final int incrementAndGet() {
    return U.getAndAddInt(this, VALUE, 1) + 1;
}
```

@tab:active Unsafe.java

```java
/**
 * Atomically adds the given value to the current value of a field
 * or array element within the given object {@code o}
 * at the given {@code offset}.
 *
 * @param o object/array to update the field/element in
 * @param offset field/element offset
 * @param delta the value to add
 * @return the previous value
 * @since 1.8
 */
@IntrinsicCandidate
public final int getAndAddInt(Object o, long offset, int delta) {
    int v;
    do {
        v = getIntVolatile(o, offset);
    } while (!weakCompareAndSetInt(o, offset, v, v + delta));
    return v;
}
```

:::

我们来一步步解析这段源码。首先，对象 `o` 是 `this`，也就是一个 `AtomicInteger` 对象。然后 `offset` 是一个常量 `VALUE`。这个常量是在 `AtomicInteger` 类中声明的，同样是调用的 `Unsafe` 的方法。从方法名字上来看，是得到了一个对象字段偏移量。

> 用于获取某个字段相对 Java 对象的“起始地址”的偏移量。
>
> 一个 Java 对象可以看成是一段内存，各个字段都得按照一定的顺序放在这段内存里，同时考虑到对齐要求，可能这些字段不是连续放置的
>
> 用这个方法能准确地告诉你某个字段相对于对象的起始内存地址的字节偏移量，因为是相对偏移量，所以它其实跟某个具体对象又没什么太大关系，跟class的定义和虚拟机的内存模型的实现细节更相关。

`getAndAddInt` 方法循环获取给定对象 `o` 中的偏移量处的值 `v`，然后判断内存值是否等于 `v`。如果相等则将内存值设置为 `v + delta`，否则返回 `false`，继续循环进行重试，直到设置成功才能退出循环，并且将旧值返回。

整个“比较+更新”操作封装在 `weakCompareAndSetInt` 方法中，在 JNI 里是借助于一个 CPU 指令完成的，属于原子操作，可以保证多个线程都能够看到同一个变量的修改值。

\*\[JNI]: Java Native Interface

```java title="Unsafe.java"
@IntrinsicCandidate
public final boolean weakCompareAndSetInt(Object o, long offset,
                                          int expected,
                                          int x) {
    return compareAndSetInt(o, offset, expected, x);
}

@IntrinsicCandidate
public final native boolean compareAndSetInt(Object o, long offset,
                                             int expected,
                                             int x);
```

> 在JDK 9开始，这两个方法上面增加了 `@HotSpotIntrinsicCandidate` 注解。
>
> 这个注解允许 HotSpot VM \[+HotSpotVM]自己来写汇编或 IR 编译器来实现该方法以提供性能。
>
> 也就是说虽然外面看到的在 JDK9 中 `weakCompareAndSet` 和 `compareAndSet` 底层依旧是调用了一样的代码，但是不排除 HotSpot VM 会手动来实现 `weakCompareAndSet` 真正含义的功能的可能性。

\[+HotSpotVM]:
HotSpot VM 是 Oracle JDK 和 OpenJDK 自带的、一款追求极致性能的高性能 Java 虚拟机

### CAS 实现原子操作的三大问题

这里介绍一下CAS实现原子操作的三大问题及其解决方案。

#### ABA 问题

所谓 ABA 问题，就是一个值原来是A，变成了B，又变回了A。这个时候使用 CAS 是检查不出变化的，但实际上却被更新了两次。

ABA 问题的解决思路是在变量前面追加上**版本号或者时间戳**。从 JDK 1.5 开始，JDK 的 `atomic` 包里提供了一个类`AtomicStampedReference` 类来解决 ABA 问题。

这个类的 `compareAndSet` 方法的作用是首先检查当前引用是否等于预期引用，并且检查当前标志是否等于预期标志，如果二者都相等，才使用 CAS 设置为新的值和标志。

```java title="AtomicStampedReference.java"
public boolean compareAndSet(V   expectedReference,
                             V   newReference,
                             int expectedStamp,
                             int newStamp) {
    Pair<V> current = pair;
    return
        expectedReference == current.reference &&
        expectedStamp == current.stamp &&
        ((newReference == current.reference &&
          newStamp == current.stamp) ||
         casPair(current, Pair.of(newReference, newStamp)));
}
```

#### 循环时间长开销大

CAS 多与自旋结合。如果自旋 CAS 长时间不成功，会占用大量的 CPU 资源。解决思路是让 JVM 支持处理器提供的 **pause 指令**：

pause 指令能让自旋失败时 CPU 睡眠一小段时间再继续自旋，从而使得读操作的频率低很多，为解决内存顺序冲突而导致的 CPU 流水线重排的代价也会小很多。

#### 只能保证一个共享变量的原子操作

对一个共享变量执行操作时，CAS 能够保证原子操作，但是对多个共享变量操作时，CAS 是无法保证操作的原子性的。通常有两种解决方案：

1. 使用 JDK 1.5 开始就提供的 `AtomicReference` 类保证对象之间的原子性，把多个变量放到一个对象里面进行 CAS 操作；
2. 使用锁。锁内的临界区代码可以保证只有当前线程能操作。

## 自旋锁与适应性自旋锁

在介绍自旋锁前，我们需要介绍一些前提知识来帮助大家明白自旋锁的概念。

阻塞或唤醒一个 Java 线程需要操作系统切换 CPU 状态来完成，这种状态转换需要耗费处理器时间。如果同步代码块中的内容过于简单，状态转换消耗的时间有可能比用户代码执行的时间还要长。

在许多场景中，同步资源的锁定时间很短，为了这一小段时间去切换线程，线程挂起和恢复现场的花费可能会让系统得不偿失。如果物理机器有多个处理器，能够让两个或以上的线程同时并行执行，我们就可以让后面那个请求锁的线程不放弃 CPU 的执行时间，看看持有锁的线程是否很快就会释放锁。

而为了让当前线程“稍等一下”，我们需让当前线程进行自旋，如果在自旋完成后前面锁定同步资源的线程已经释放了锁，那么当前线程就可以不必阻塞而是直接获取同步资源，从而避免切换线程的开销，这就是自旋锁。

![img](https://awps-assets.meituan.net/mit-x/blog-images-bundle-2018b/452a3363.png)

自旋锁本身是有缺点的，它不能代替阻塞。自旋等待虽然避免了线程切换的开销，但它要占用处理器时间。如果锁被占用的时间很短，自旋等待的效果就会非常好。反之，如果锁被占用的时间很长，那么自旋的线程只会白浪费处理器资源。所以，自旋等待的时间必须要有一定的限度，如果自旋超过了限定次数（默认是10次，可以使用 `-XX:PreBlockSpin` 来更改）没有成功获得锁，就应当挂起线程。

自旋锁的实现原理同样也是 CAS，`AtomicInteger` 中调用 `Unsafe` 进行自增操作的源码中的 `do-while` 循环就是一个自旋操作，如果修改数值失败则通过循环来执行自旋，直至修改成功。

以下是基于 `AtomicReference` 实现一个自旋锁的例子：

```java
import java.util.concurrent.atomic.AtomicReference;

public class SpinLock {
    private final AtomicReference<Thread> owner = new AtomicReference<>();

    public void lock() {
        Thread current = Thread.currentThread();
        // 自旋，一直尝试获取锁，直到成功
        while (!owner.compareAndSet(null, current)) {
            // 自旋等待，不释放CPU
        }
    }

    public void unlock() {
        Thread current = Thread.currentThread();
        owner.compareAndSet(current, null);
    }
}
```

自旋锁在 JDK1.4.2 中引入，使用 `-XX:+UseSpinning` 来开启。JDK 6 中变为默认开启，并且引入了自适应的自旋锁（适应性自旋锁）。

自适应意味着自旋的时间（次数）不再固定，而是由前一次在同一个锁上的自旋时间及锁的拥有者的状态来决定。如果在同一个锁对象上，自旋等待刚刚成功获得过锁，并且持有锁的线程正在运行中，那么虚拟机就会认为这次自旋也是很有可能再次成功，进而它将允许自旋等待持续相对更长的时间。如果对于某个锁，自旋很少成功获得过，那在以后尝试获取这个锁时将可能省略掉自旋过程，直接阻塞线程，避免浪费处理器资源。

在自旋锁中 另有三种常见的锁形式:TicketLock、CLHlock和MCSlock，本文中仅做名词介绍，不做深入讲解，感兴趣的同学可以自行查阅相关资料。

## 无锁、偏向锁、轻量级锁、重量级锁

这四种锁是指锁的状态，专门针对 `synchronized` 的。在介绍这四种锁状态之前还需要介绍一些额外的知识。

首先为什么 `Synchronized` 能实现线程同步？在回答这个问题之前我们需要了解两个重要的概念：“Java对象头”、“Monitor”。

### Java对象头

`synchronized` 是悲观锁，在操作同步资源之前需要给同步资源先加锁，这把锁就是存在 Java 对象头里的，而 Java 对象头又是什么呢？

我们以 Hotspot 虚拟机为例，Hotspot 的对象头主要包括两部分数据：Mark Word（标记字段）、Klass Pointer（类型指针）。

* **Mark Word**：默认存储对象的 HashCode，分代年龄和锁标志位信息。这些信息都是与对象自身定义无关的数据，所以 Mark Word被设计成一个非固定的数据结构以便在极小的空间内存存储尽量多的数据。它会根据对象的状态复用自己的存储空间，也就是说在运行期间 Mark Word 里存储的数据会随着锁标志位的变化而变化。
* **Klass Point**：对象指向它的类元数据的指针，虚拟机通过这个指针来确定这个对象是哪个类的实例。

具体来说，`synchronized` 用的锁**存在锁对象的对象头的 Mark Word 中**，那么 MarkWord 在对象头中到底长什么样，它到底存储了什么呢？

:::table title="64位下 Mark Word 的存储结构" full-width

| 锁状态   | 25 bits | 31 bits                        | 1 bit  | 4 bits   | 1 bit | 2 bits |
| -------- | :------ | :----------------------------- | :----- | :------- | :---- | :----- |
| 无锁状态 | unused  | identity hashCode | unused | 分代年龄 | 0     | 01     |
| 偏向锁   | Thread ID (54 bits)                 | epoch (2 bits) | unused | 分代年龄 | 1     | 01     |
| 轻量级锁 | 指向线程栈中Lock Record的指针{colspan=5} |                 |        |          |       | 00     |
| 重量级锁 | 指向监视器（monitor）的指针{colspan=5}   |                 |        |          |       | 10     |
| GC标记   | 空{colspan=5}                            |                 |        |          |       | 11     |

:::

:::table title="32位下 Mark Word 的存储结构" full-width

| 锁状态   | 23 bits                                   | 2 bits | 4 bits   | 1 bit | 2 bits |
| :------- | :---------------------------------------- | :----- | :------- | :---- | :----- |
| 无锁状态 | identity hash code（首次调用）{colspan=2} |        | 分代年龄 | 0     | 01     |
| 偏向锁   | Thread ID（偏向锁的线程ID）               | epoch  | 分代年龄 | 1     | 01     |
| 轻量级锁 | 指向线程栈中Lock Record的指针{colspan=4}  |        |          |       | 00     |
| 重量级锁 | 指向监视器（monitor）的指针{colspan=4}    |        |          |       | 10     |
| GC标记   | 空{colspan=4}                             |        |          |       | 11     |

:::

下面我们以 32位虚拟机为例，来看一下其 Mark Word 的字节具体是如何分配的

* **无锁**：对象头开辟 25bit 的空间用来存储对象的 hashcode ，4bit 用于存放对象分代年龄，1bit 用来存放是否偏向锁的标识位，2bit 用来存放锁标识位为01
* **偏向锁：** 在偏向锁中划分更细，还是开辟 25bit 的空间，其中23bit 用来存放线程ID，2bit 用来存放 Epoch，4bit 存放对象分代年龄，1bit 存放是否偏向锁标识， 0表示无锁，1表示偏向锁，锁的标识位还是01
* **轻量级锁**：在轻量级锁中直接开辟 30bit 的空间存放指向栈中锁记录的指针，2bit 存放锁的标志位，其标志位为00
* **重量级锁：** 在重量级锁中和轻量级锁一样，30bit 的空间用来存放指向重量级锁的指针，2bit 存放锁的标识位，为11
* **GC标记：** 开辟30bit 的内存空间却没有占用，2bit 空间存放锁标志位为11。

其中无锁和偏向锁的锁标志位都是01，只是在前面的1bit区分了这是无锁状态还是偏向锁状态

> * 当 Mark Word 被锁信息占用时，哈希码便不会继续存储在 Mark Word，对于不同情况有不同处理：
>
>   1. \*\*重量级锁的情况：\*\*当对象膨胀为重量级锁时，Mark Word 指向堆内存中的 `ObjectMonitor` 对象。`ObjectMonitor` 内部有一个专门的字段（通常叫 `_hash` 或 `header`），用来保存该对象在无锁状态下的 Mark Word 副本（包含哈希码）。
>
>   2. **轻量级锁的情况：**轻量级锁使用线程栈中的 `Lock Record` 来存储锁信息：\`\` 中保存了**锁对象的 Mark Word 的完整拷贝**（称为 Displaced Mark Word）。锁释放时，这个备份会被写回对象头，哈希码又回到了 Mark Word 中。
>
>   3. \*\*偏向锁的情况：\*\*在线程获取偏向锁时，哈希码会被覆盖。==**如果一个对象的 `hashCode` 方法已经被调用过一次之后，这个对象便不能被设置偏向锁**==。因为哈希码被偏向线程Id给覆盖后，会造成同一个对象前后两次调用 `hashCode` 方法得到的结果不一致的问题。
>
>      \==当一个对象当前**正处于偏向锁状态**，并且需要计算其哈希码的话，则它的偏向锁会被撤销，并且**锁会膨胀为轻量级锁或者重量锁**；==

关于内存的分配，我们可以在 openJDK 中的 [markOop.hpp](https://github.com/openjdk-mirror/jdk7u-hotspot/blob/50bdefc3afe944ca74c3093e7448d6b889cd20d1/src/share/vm/oops/markOop.hpp) 可以看出：

```cpp title="markOop.hpp"
public:
  // Constants
  enum { age_bits         = 4,
         lock_bits        = 2,
         biased_lock_bits = 1,
         max_hash_bits    = BitsPerWord - age_bits - lock_bits - biased_lock_bits,
         hash_bits        = max_hash_bits > 31 ? 31 : max_hash_bits,
         cms_bits         = LP64_ONLY(1) NOT_LP64(0),
         epoch_bits       = 2
  };
```

* **age\_bits：** 就是我们说的分代回收的标识，占用4字节
* **lock\_bits：** 是锁的标志位，占用2个字节
* **biased\_lock\_bits：** 是是否偏向锁的标识，占用1个字节
* **max\_hash\_bits：** 是针对无锁计算的hashcode 占用字节数量，如果是32位虚拟机，就是 32 - 4 - 2 -1 = 25 byte，如果是64 位虚拟机，64 - 4 - 2 - 1 = 57 byte，但是会有 25 字节未使用，所以64位的 hashcode 占用 31 byte
* **hash\_bits：** 是针对 64 位虚拟机来说，如果最大字节数大于 31，则取31，否则取真实的字节数
* **cms\_bits：** 不是64位虚拟机就占用 0 byte，是64位就占用 1byte
* **epoch\_bits：** 就是 epoch 所占用的字节大小，2字节。

### Monitor

Monitor 可以理解为一个同步工具或一种同步机制，通常被描述为一个对象。每一个 Java 对象就有一把看不见的锁，称为内部锁或者Monitor 锁。

Monitor 是线程私有的数据结构，每一个线程都有一个可用 monitor record 列表，同时还有一个全局的可用列表。每一个被锁住的对象都会和一个 monitor 关联，同时 monitor 中有一个 Owner 字段存放拥有该锁的线程的唯一标识，表示该锁被这个线程占用。

现在话题回到 `synchronized`，`synchronized` 通过 Monitor 来实现线程同步，Monitor 是依赖于底层的操作系统的 Mutex Lock（互斥锁）来实现的线程同步。

如同我们在自旋锁中提到的：

> 阻塞或唤醒一个 Java 线程需要操作系统切换 CPU 状态来完成，这种状态转换需要耗费处理器时间。如果同步代码块中的内容过于简单，状态转换消耗的时间有可能比用户代码执行的时间还要长。

这种方式就是 `synchronized` 最初实现同步的方式，这就是 JDK 6 之前 `synchronized` 效率低的原因。这种依赖于操作系统 Mutex Lock所实现的锁我们称之为“重量级锁”，JDK 6 中为了减少获得锁和释放锁带来的性能消耗，引入了“偏向锁”和“轻量级锁”。

所以目前锁一共有4种状态，级别从低到高依次是：无锁、偏向锁、轻量级锁和重量级锁。锁状态只能升级不能降级。

### 无锁

无锁没有对资源进行锁定，所有的线程都能访问并修改同一个资源，但同时只有一个线程能修改成功。

无锁的特点就是修改操作在循环内进行，线程会不断的尝试修改共享资源。如果没有冲突就修改成功并退出，否则就会继续循环尝试。如果有多个线程修改同一个值，必定会有一个线程能修改成功，而其他修改失败的线程会不断重试直到修改成功。上面我们介绍的 CAS 原理及应用即是无锁的实现。无锁无法全面代替有锁，但无锁在某些场合下的性能是非常高的。

### 偏向锁

偏向锁是指一段同步代码一直被一个线程所访问，那么该线程会自动获取锁，降低获取锁的代价。

在大多数情况下，锁总是由同一线程多次获得，不存在多线程竞争，所以出现了偏向锁。其目标就是在只有一个线程执行同步代码块时能够提高性能。

当一个线程访问同步代码块并获取锁时，会在 Mark Word 里存储锁偏向的线程 ID。在线程进入和退出同步块时不再通过 CAS 操作来加锁和解锁，而是检测 Mark Word 里是否存储着指向当前线程的偏向锁。引入偏向锁是为了在无多线程竞争的情况下尽量减少不必要的轻量级锁执行路径，因为轻量级锁的获取及释放依赖多次 CAS 原子指令，而偏向锁只需要在置换 ThreadID 的时候依赖一次 CAS 原子指令即可。

偏向锁只有遇到其他线程尝试竞争偏向锁时，持有偏向锁的线程才会释放锁，线程不会主动释放偏向锁。==这是偏向锁最关键的步骤，**并非由锁的获得者释放，而是被动地在发生竞争时撤销**。==偏向锁的撤销，需要等待全局安全点（在这个时间点上没有字节码正在执行），它会首先暂停拥有偏向锁的线程，判断锁对象是否处于被锁定状态。撤销偏向锁后恢复到无锁（标志位为“01”）或轻量级锁（标志位为“00”）的状态。

偏向锁在 JDK 6 及以后的 JVM 里是默认启用的。可以通过 JVM 参数关闭偏向锁：`-XX:-UseBiasedLocking=false`，关闭之后程序默认会进入轻量级锁状态。

### 轻量级锁(自旋锁)

轻量级锁是指当锁是偏向锁的时候，被另外的线程所访问，偏向锁就会升级为轻量级锁，其他线程会通过自旋的形式尝试获取锁，不会阻塞，从而提高性能。

轻量级锁的获取主要由两种情况：

1. 当关闭偏向锁功能时；
2. 由于多个线程竞争偏向锁导致偏向锁升级为轻量级锁。

一旦有第二个线程加入锁竞争\[+锁竞争]，偏向锁就升级为轻量级锁（自旋锁）。

\[+锁竞争]:
如果多个线程轮流获取一个锁，但是每次获取锁的时候都很顺利，没有发生阻塞，那么就不存在锁竞争；  只有当某线程尝试获取锁的时候，发现该锁已经被占用，只能等待其释放，这才发生了锁竞争。

在轻量级锁状态下继续锁竞争，没有抢到锁的线程将自旋，即不停地循环判断锁是否能够被成功获取。获取锁的操作，其实就是通过 CAS 修改对象头里的锁标志位。先比较当前锁标志位是否为“释放”，如果是则将其设置为“锁定”，比较并设置是原子性发生的。这就算抢到锁了，然后线程将当前锁的持有者信息修改为自己。

长时间的自旋操作是非常消耗资源的，一个线程持有锁，其他线程就只能在原地空耗 CPU，执行不了任何有效的任务，这种现象叫做忙等（busy-waiting）。如果多个线程用一个锁，但是没有发生锁竞争，或者发生了很轻微的锁竞争，那么 `synchronized` 就用轻量级锁，允许短时间的忙等现象。这是一种折衷的想法，短时间的忙等，换取线程在用户态和内核态之间切换的开销。

![轻量锁及膨胀流程图](https://geekdaxue.co/uploads/projects/ganymede-ydruy@notes/e33288830ab4974489a9dd47e7b2087f.webp)

在代码进入同步块时，如果目标锁对象处于无锁状态（锁标志位为“01”且偏向锁标志为“0”），虚拟机会首先在当前线程的栈帧中分配一块名为\*\*锁记录（Lock Record）\*\*的空间，用于存储锁对象当前的 Mark Word 副本，并将对象头中的 Mark Word 复制到该锁记录中。

拷贝完成后，虚拟机通过 CAS 操作尝试将对象的 Mark Word 更新为指向该 Lock Record 的指针，同时将 Lock Record 中的 `owner` 指针指向对象的 Mark Word。

如果此 CAS 更新成功，则当前线程获取锁成功，对象 Mark Word 的锁标志位更新为“00”，表示该对象已处于**轻量级锁定**状态。

若 CAS 更新失败，虚拟机首先检查对象的 Mark Word 是否已指向当前线程的栈帧。如果是，说明当前线程已持有该锁，可直接进入同步块继续执行；否则，意味着存在多个线程竞争同一把锁。

* 若此时只有一个等待线程，该线程会通过**自旋**进行等待。
* 但如果自旋超过一定次数仍未获取锁，或者出现第三个线程也加入竞争（即一个线程持有锁，一个在自旋，又有新线程来访），轻量级锁就会膨胀升级为**重量级锁**。

### 重量级锁

重量级锁是指当有一个线程获取锁之后，其余所有等待获取该锁的线程都会处于阻塞状态。

重量级锁显然，此忙等是有限度的（有个计数器记录自旋次数，默认允许循环10次，可以通过虚拟机参数更改）。如果锁竞争情况严重，某个达到最大自旋次数的线程，会将轻量级锁升级为重量级锁，升级为重量级锁时，锁标志的状态值变为“10”，此时 Mark Word 中存储的是指向重量级锁的指针，此时等待锁的线程都会进入阻塞状态。

当后续线程尝试获取锁时，发现被占用的锁是重量级锁，则直接将自己挂起（而不是忙等），等待将来被唤醒。

简言之，就是所有的控制权都交给了操作系统，由操作系统来负责线程间的调度和线程的状态变更。而这样会出现频繁地对线程运行状态的切换，线程的挂起和唤醒，从而消耗大量的系统资。

整体的锁状态升级流程如下：

![img](https://awps-assets.meituan.net/mit-x/blog-images-bundle-2018b/8afdf6f2.png)

## 公平锁与非公平锁

公平锁是指多个线程按照申请锁的顺序来获取锁，线程直接进入队列中排队，队列中的第一个线程才能获得锁。公平锁的优点是等待锁的线程不会饿死。缺点是整体吞吐效率相对非公平锁要低，等待队列中除第一个线程以外的所有线程都会阻塞，CPU唤醒阻塞线程的开销比非公平锁大。

![img](https://awps-assets.meituan.net/mit-x/blog-images-bundle-2018b/a23d746a.png)

非公平锁是多个线程加锁时直接尝试获取锁，获取不到才会到等待队列的队尾等待。但如果此时锁刚好可用，那么这个线程可以无需阻塞直接获取到锁，所以非公平锁有可能出现后申请锁的线程先获取锁的场景。非公平锁的优点是可以减少唤起线程的开销，整体的吞吐效率高，因为线程有几率不阻塞直接获得锁，CPU不必唤醒所有线程。缺点是处于等待队列中的线程可能会饿死，或者等很久才会获得锁。

![img](https://awps-assets.meituan.net/mit-x/blog-images-bundle-2018b/4499559e.png)

接下来我们通过 `ReentrantLock` 的源码来讲解公平锁和非公平锁。

::: code-tabs
@tab ReentrantLock.java

```java
public class ReentrantLock implements Lock, java.io.Serializable {
    private static final long serialVersionUID = 7373984872572414699L;
    /** Synchronizer providing all implementation mechanics */
    private final Sync sync;

    abstract static class Sync extends AbstractQueuedSynchronizer {...}

    static final class NonfairSync extends Sync {...}

    static final class FairSync extends Sync {...}

    public ReentrantLock() { sync = new NonfairSync(); }

    public ReentrantLock(boolean fair) {
      sync = fair ? new FairSync() : new NonfairSync();
    }
    // more code... 
}
```

@tab Sync.java

```java
abstract static class Sync extends AbstractQueuedSynchronizer {
        private static final long serialVersionUID = -5179523762034025860L;

        /**
         * Performs non-fair tryLock.
         */
        @ReservedStackAccess
        final boolean tryLock() {
            Thread current = Thread.currentThread();
            int c = getState();
            if (c == 0) {
                if (compareAndSetState(0, 1)) {
                    setExclusiveOwnerThread(current);
                    return true;
                }
            } else if (getExclusiveOwnerThread() == current) {
                if (++c < 0) // overflow
                    throw new Error("Maximum lock count exceeded");
                setState(c);
                return true;
            }
            return false;
        }

        /**
         * Checks for reentrancy and acquires if lock immediately
         * available under fair vs nonfair rules. Locking methods
         * perform initialTryLock check before relaying to
         * corresponding AQS acquire methods.
         */
        abstract boolean initialTryLock();

        @ReservedStackAccess
        final void lock() {
            if (!initialTryLock())
                acquire(1);
        }

        @ReservedStackAccess
        final void lockInterruptibly() throws InterruptedException {
            if (Thread.interrupted())
                throw new InterruptedException();
            if (!initialTryLock())
                acquireInterruptibly(1);
        }

        @ReservedStackAccess
        final boolean tryLockNanos(long nanos) throws InterruptedException {
            if (Thread.interrupted())
                throw new InterruptedException();
            return initialTryLock() || tryAcquireNanos(1, nanos);
        }

        @ReservedStackAccess
        protected final boolean tryRelease(int releases) {
            int c = getState() - releases;
            if (getExclusiveOwnerThread() != Thread.currentThread())
                throw new IllegalMonitorStateException();
            boolean free = (c == 0);
            if (free)
                setExclusiveOwnerThread(null);
            setState(c);
            return free;
        }

        protected final boolean isHeldExclusively() {
            // While we must in general read state before owner,
            // we don't need to do so to check if current thread is owner
            return getExclusiveOwnerThread() == Thread.currentThread();
        }

        final ConditionObject newCondition() {
            return new ConditionObject();
        }

        // Methods relayed from outer class

        final Thread getOwner() {
            return getState() == 0 ? null : getExclusiveOwnerThread();
        }

        final int getHoldCount() {
            return isHeldExclusively() ? getState() : 0;
        }

        final boolean isLocked() {
            return getState() != 0;
        }

        /**
         * Reconstitutes the instance from a stream (that is, deserializes it).
         */
        private void readObject(java.io.ObjectInputStream s)
            throws java.io.IOException, ClassNotFoundException {
            s.defaultReadObject();
            setState(0); // reset to unlocked state
        }
    }
```

@tab NonfairSync.java

```java
/**
 * Sync object for non-fair locks
 */
static final class NonfairSync extends Sync {
    private static final long serialVersionUID = 7316153563782823691L;

    final boolean initialTryLock() {
        Thread current = Thread.currentThread();
        if (compareAndSetState(0, 1)) { // first attempt is unguarded
            setExclusiveOwnerThread(current);
            return true;
        } else if (getExclusiveOwnerThread() == current) {
            int c = getState() + 1;
            if (c < 0) // overflow
                throw new Error("Maximum lock count exceeded");
            setState(c);
            return true;
        } else
            return false;
    }

    /**
     * Acquire for non-reentrant cases after initialTryLock prescreen
     */
    protected final boolean tryAcquire(int acquires) {
        if (getState() == 0 && compareAndSetState(0, acquires)) {
            setExclusiveOwnerThread(Thread.currentThread());
            return true;
        }
        return false;
    }
}
```

@tab FairSync.java

```java
/**
 * Sync object for fair locks
 */
static final class FairSync extends Sync {
    private static final long serialVersionUID = -3000897897090466540L;

    /**
     * Acquires only if reentrant or queue is empty.
     */
    final boolean initialTryLock() {
        Thread current = Thread.currentThread();
        int c = getState();
        if (c == 0) {
            if (!hasQueuedThreads() && compareAndSetState(0, 1)) {
                setExclusiveOwnerThread(current);
                return true;
            }
        } else if (getExclusiveOwnerThread() == current) {
            if (++c < 0) // overflow
                throw new Error("Maximum lock count exceeded");
            setState(c);
            return true;
        }
        return false;
    }

    /**
     * Acquires only if thread is first waiter or empty
     */
    protected final boolean tryAcquire(int acquires) {
        if (getState() == 0 && !hasQueuedPredecessors() &&
            compareAndSetState(0, acquires)) {
            setExclusiveOwnerThread(Thread.currentThread());
            return true;
        }
        return false;
    }
}
```

:::
根据代码可知，`ReentrantLock` 里面有一个内部类 `Sync`，`Sync` 继承 AQS，添加锁和释放锁的大部分操作实际上都是在 `Sync` 中实现的。它有公平锁 `FairSync` 和非公平锁 `NonfairSync` 两个子类。`ReentrantLock`默认使用非公平锁，也可以通过构造器来显示的指定使用公平锁。

\*\[AQS]: `AbstractQueuedSynchronizer`

对比公平锁与非公平锁的加锁方法的源码，公平锁与非公平锁的 `lock` 方法唯一的区别就在于公平锁在获取同步状态时多了一个限制条件：`hasQueuedPredecessors`。

```java title="AbstractQueuedSynchronizer.java"
/**
 * Queries whether any threads are waiting to acquire. Note that
 * because cancellations due to interrupts and timeouts may occur
 * at any time, a {@code true} return does not guarantee that any
 * other thread will ever acquire.
 *
 * @return {@code true} if there may be other threads waiting to acquire
 */
public final boolean hasQueuedThreads() {
    for (Node p = tail, h = head; p != h && p != null; p = p.prev)
        if (p.status >= 0)
            return true;
    return false;
}
```

可以看到该方法主要做一件事情：主要是判断当前线程是否位于同步队列中的第一个。如果是则返回 `true`，否则返回 `false`。

综上，公平锁就是通过同步队列来实现多个线程按照申请锁的顺序来获取锁，从而实现公平的特性。非公平锁加锁时不考虑排队等待问题，直接尝试获取锁，所以存在后申请却先获得锁的情况。

## 可重入锁与非可重入锁

可重入锁又名递归锁，是指在同一个线程在外层方法获取锁的时候，再进入该线程的内层方法会自动获取锁（前提锁对象得是同一个对象或者 class），不会因为之前已经获取过还没释放而阻塞。Java 中 `ReentrantLock` 和 `synchronized` 都是可重入锁，可重入锁的一个优点是可一定程度避免死锁。下面用示例代码来进行分析：

```java
public class Widget {
    public synchronized void doSomething() {
        System.out.println("方法1执行...");
        doOthers();
    }

    public synchronized void doOthers() {
        System.out.println("方法2执行...");
    }
}
```

在上面的代码中，类中的两个方法都是被内置锁 `synchronized` 修饰的，`doSomething`方法中调用 `doOthers` 方法。因为内置锁是可重入的，所以同一个线程在调用 `doOthers` 时可以直接获得当前对象的锁，进入 `doOthers` 进行操作。

如果是一个不可重入锁，那么当前线程在调用 `doOthers` 之前需要将执行 `doSomething` 时获取当前对象的锁释放掉，实际上该对象锁已被当前线程所持有，且无法释放。所以此时会出现死锁。

而为什么可重入锁就可以在嵌套调用时可以自动获得锁呢？我们通过图示和源码来分别解析一下。

还是打水的例子，有多个人在排队打水，此时管理员允许锁和同一个人的多个水桶绑定。这个人用多个水桶打水时，第一个水桶和锁绑定并打完水之后，第二个水桶也可以直接和锁绑定并开始打水，所有的水桶都打完水之后打水人才会将锁还给管理员。这个人的所有打水流程都能够成功执行，后续等待的人也能够打到水。这就是可重入锁。

![img](https://awps-assets.meituan.net/mit-x/blog-images-bundle-2018b/58fc5bc9.png)

但如果是非可重入锁的话，此时管理员只允许锁和同一个人的一个水桶绑定。第一个水桶和锁绑定打完水之后并不会释放锁，导致第二个水桶不能和锁绑定也无法打水。当前线程出现死锁，整个等待队列中的所有线程都无法被唤醒。

![img](https://awps-assets.meituan.net/mit-x/blog-images-bundle-2018b/ea597a0c.png)

我们通过重入锁 `ReentrantLock` 以及非可重入锁 `NonReentrantLock` 的源码来对比分析一下为什么非可重入锁在重复调用同步资源时会出现死锁。

首先 `ReentrantLock` 和 `NonReentrantLock` 都继承父类 AQS，其父类 AQS 中维护了一个同步状态 `status` 来计数重入次数，`status` 初始值为 `0`。

当线程尝试获取锁时：

* **可重入锁**先尝试获取并更新 `status` 值，如果 `status == 0` 表示没有其他线程在执行同步代码，则把 `status` 置为 `1`，当前线程开始执行。如果 `status != 0`，则判断当前线程是否是获取到这个锁的线程，如果是的话执行 `status+1`，且当前线程可以再次获取锁。
* **非可重入锁**是直接去获取并尝试更新当前 `status` 的值，如果 `status != 0` 的话会导致其获取锁失败，当前线程阻塞。

释放锁时：

* **可重入锁**同样先获取当前 `status` 的值，在当前线程是持有锁的线程的前提下。如果 `status-1 == 0`，则表示当前线程所有重复获取锁的操作都已经执行完毕，然后该线程才会真正释放锁。
* **非可重入锁**则是在确定当前线程是持有锁的线程之后，直接将 `status` 置为 `0`，将锁释放。

::: code-tabs
@tab ReentrantLock.java

```java {13-16,36-42}
/**
 * Sync object for non-fair locks
 */
static final class NonfairSync extends Sync {
    private static final long serialVersionUID = 7316153563782823691L;

    final boolean initialTryLock() {
        Thread current = Thread.currentThread();
        if (compareAndSetState(0, 1)) { // first attempt is unguarded
            setExclusiveOwnerThread(current);
            return true;
        } else if (getExclusiveOwnerThread() == current) {
            int c = getState() + 1;
            if (c < 0) // overflow
                throw new Error("Maximum lock count exceeded");
            setState(c);
            return true;
        } else
            return false;
    }

    /**
     * Acquire for non-reentrant cases after initialTryLock prescreen
     */
    protected final boolean tryAcquire(int acquires) {
        if (getState() == 0 && compareAndSetState(0, acquires)) {
            setExclusiveOwnerThread(Thread.currentThread());
            return true;
        }
        return false;
    }
}

@ReservedStackAccess
protected final boolean tryRelease(int releases) {
    int c = getState() - releases;
    if (getExclusiveOwnerThread() != Thread.currentThread())
        throw new IllegalMonitorStateException();
    boolean free = (c == 0);
    if (free)
        setExclusiveOwnerThread(null);
    setState(c);
    return free;
}
```

@tab NonReentrantLock.java

```java
private static class Sync extends AbstractQueuedSynchronizer {
    // 是否锁已经被占用
    protected boolean isHeldExclusively() {
        return getState() == 1;
    }

    // 尝试获取锁
    public boolean tryAcquire(int acquires) {
        // 这里体现非重入性：不判断当前线程，直接CAS 0 -> 1
        if (compareAndSetState(0, 1)) { // [!code highlight]
            setExclusiveOwnerThread(Thread.currentThread());
            return true;
        }
        return false;
    }

    // 尝试释放锁
    protected boolean tryRelease(int releases) {
        if (getState() == 0) throw new IllegalMonitorStateException();
        setExclusiveOwnerThread(null);
        setState(0); // 直接设为0 // [!code highlight]
        return true;
    }
}
```

:::

> Java 标准库本身并不提供非可重入锁，以上为模拟实现

## 独享锁与共享锁

独享锁也叫排他锁，是指该锁一次只能被一个线程所持有。如果线程 T 对数据 A 加上排它锁后，则其他线程不能再对 A 加任何类型的锁。获得排它锁的线程即能读数据又能修改数据。JDK 中的 `synchronized` 和 JUC 中 `Lock` 的实现类就是互斥锁。

共享锁是指该锁可被多个线程所持有。如果线程 T 对数据 A 加上共享锁后，则其他线程只能对 A 再加共享锁，不能加排它锁。获得共享锁的线程只能读数据，不能修改数据。

独享锁与共享锁也是通过 AQS 来实现的，通过实现不同的方法，来实现独享或者共享。

::: code-tabs
@tab ReentrantReadWriteLock.java

```java
public class ReentrantReadWriteLock
        implements ReadWriteLock, java.io.Serializable {
    private static final long serialVersionUID = -6992448646407690164L;
    /** Inner class providing readlock */
    private final ReentrantReadWriteLock.ReadLock readerLock;
    /** Inner class providing writelock */
    private final ReentrantReadWriteLock.WriteLock writerLock;
    /** Performs all synchronization mechanics */
    final Sync sync;

    /**
     * Creates a new {@code ReentrantReadWriteLock} with
     * default (nonfair) ordering properties.
     */
    public ReentrantReadWriteLock() {
        this(false);
    }

    /**
     * Creates a new {@code ReentrantReadWriteLock} with
     * the given fairness policy.
     *
     * @param fair {@code true} if this lock should use a fair ordering policy
     */
    public ReentrantReadWriteLock(boolean fair) {
        sync = fair ? new FairSync() : new NonfairSync();
        readerLock = new ReadLock(this);
        writerLock = new WriteLock(this);
    }

    public ReentrantReadWriteLock.WriteLock writeLock() { return writerLock; }
    public ReentrantReadWriteLock.ReadLock  readLock()  { return readerLock; }
}
```

@tab ReadLock.java

```java
public static class ReadLock implements Lock, java.io.Serializable {
    private static final long serialVersionUID = -5992448646407690164L;
    private final Sync sync;

    protected ReadLock(ReentrantReadWriteLock lock) { sync = lock.sync; }

    public void lock() { sync.acquireShared(1); }

    public void lockInterruptibly() throws InterruptedException {
        sync.acquireSharedInterruptibly(1);
    }

    public boolean tryLock() { return sync.tryReadLock(); }

    public boolean tryLock(long timeout, TimeUnit unit)
            throws InterruptedException {
        return sync.tryAcquireSharedNanos(1, unit.toNanos(timeout));
    }

    public void unlock() { sync.releaseShared(1); }

    public Condition newCondition() { throw new UnsupportedOperationException(); }

    public String toString() {
        int r = sync.getReadLockCount();
        return super.toString() + "[Read locks = " + r + "]";
    }
}
```

@tab WriteLock.java

```java
public static class WriteLock implements Lock, java.io.Serializable {
    private static final long serialVersionUID = -4992448646407690164L;
    private final Sync sync;

    protected WriteLock(ReentrantReadWriteLock lock) { sync = lock.sync; }

    public void lock() { sync.acquire(1); }

    public void lockInterruptibly() throws InterruptedException {
        sync.acquireInterruptibly(1);
    }

    public boolean tryLock() { return sync.tryWriteLock(); }

    public boolean tryLock(long timeout, TimeUnit unit)
            throws InterruptedException {
        return sync.tryAcquireNanos(1, unit.toNanos(timeout));
    }

    public void unlock() { sync.release(1); }

    public Condition newCondition() { return sync.newCondition(); }

    public String toString() {
        Thread o = sync.getOwner();
        return super.toString() + ((o == null) ?
                                   "[Unlocked]" :
                                   "[Locked by thread " + o.getName() + "]");
    }

    public boolean isHeldByCurrentThread() { return sync.isHeldExclusively(); }

    public int getHoldCount() { return sync.getWriteHoldCount(); }
}
```

:::

我们看到 `ReentrantReadWriteLock` 有两把锁：`ReadLock` 和 `WriteLock`，一个读锁一个写锁，合称“读写锁”。再进一步观察可以发现 `ReadLock` 和 `WriteLock` 是靠内部类 `Sync` 实现的锁。`Sync` 是 AQS 的一个子类，这种结构在 `CountDownLatch`、`ReentrantLock`、`Semaphore` 里面也都存在。

在 `ReentrantReadWriteLock` 里面，读锁和写锁的锁主体都是 `Sync`，但读锁和写锁的加锁方式不一样。读锁是共享锁，写锁是独享锁。读锁的共享锁可保证并发读非常高效，而读写、写读、写写的过程互斥，因为读锁和写锁是分离的。所以 `ReentrantReadWriteLock` 的并发性相比一般的互斥锁有了很大提升。

那读锁和写锁的具体加锁方式有什么区别呢？在了解源码之前我们需要回顾一下其他知识。 在最开始提及 AQS 的时候我们也提到了 `state` 字段（`int` 类型，32 位），该字段用来描述有多少线程获持有锁。

在独享锁中这个值通常是 0 或者 1（如果是重入锁的话 `state` 值就是重入的次数），在共享锁中 `state` 就是持有锁的数量。但是在 `ReentrantReadWriteLock` 中有读、写两把锁，所以需要在一个整型变量 `state` 上分别描述读锁和写锁的数量（或者也可以叫状态）。于是将 `state` 变量“按位切割”切分成了两个部分，高 16 位表示读锁状态（读锁个数），低 16 位表示写锁状态（写锁个数）。

| 32位 int 类型变量 | 高 16 位        | 低 16 位        |
| ----------------- | --------------- | --------------- |
| 含义              | 读锁状态 / 个数 | 写锁状态 / 个数 |

了解了概念之后我们再来看代码，先看写锁的加锁源码：

```java title="ReentrantReadWriteLock.java"
@ReservedStackAccess
protected final boolean tryAcquire(int acquires) {
    /*
     * Walkthrough:
     * 1. If read count nonzero or write count nonzero
     *    and owner is a different thread, fail.
     * 2. If count would saturate, fail. (This can only
     *    happen if count is already nonzero.)
     * 3. Otherwise, this thread is eligible for lock if
     *    it is either a reentrant acquire or
     *    queue policy allows it. If so, update state
     *    and set owner.
     */
    Thread current = Thread.currentThread();
    int c = getState();
    int w = exclusiveCount(c);
    if (c != 0) {
        // (Note: if c != 0 and w == 0 then shared count != 0)
        if (w == 0 || current != getExclusiveOwnerThread())
            return false;
        if (w + exclusiveCount(acquires) > MAX_COUNT)
            throw new Error("Maximum lock count exceeded");
        // Reentrant acquire
        setState(c + acquires);
        return true;
    }
    if (writerShouldBlock() ||
        !compareAndSetState(c, c + acquires))
        return false;
    setExclusiveOwnerThread(current);
    return true;
}
```

* 这段代码首先取到当前锁的个数 `c`，然后再通过 `c` 来获取写锁的个数 `w`。因为写锁是低16位，取低16位的最大值与当前的 `c` 做与运算（ `int w = exclusiveCount(c)`）就是持有写锁的线程数目。
* 在取到写锁线程的数目后，首先判断是否已经有线程持有了锁。如果已经有线程持有了锁 （`c!=0`）则查看当前写锁线程的数目，如果写线程数为0（即此时存在读锁）或者持有锁的线程不是当前线程就返回失败（涉及到公平锁和非公平锁的实现）。
* 如果写入锁的数量大于最大数，就抛出 Error。
* 如果当且写线程数为0（那么读线程也应该为0，因为上面已经处理 `c!=0` 的情况），并且当前线程需要阻塞那么就返回失败；如果通过 CAS 增加写线程数失败也返回失败。
* 如果 `c = 0` 或者 `c > 0 && w > 0`（重入），则设置当前线程或锁的拥有者，返回成功！

`tryAcquire` 除了重入条件（当前线程为获取了写锁的线程）之外，增加了一个读锁是否存在的判断。**如果存在读锁，则写锁不能被获取**，原因在于：必须确保写锁的操作对读锁可见，如果允许读锁在已被获取的情况下对写锁的获取，那么正在运行的其他读线程就无法感知到当前写线程的操作。

因此，只有等待其他读线程都释放了读锁，写锁才能被当前线程获取，而写锁一旦被获取，则其他读写线程的后续访问均被阻塞。写锁的释放与 `ReentrantLock` 的释放过程基本类似，每次释放均减少写状态，当写状态为0时表示写锁已被释放，然后等待的读写线程才能够继续访问读写锁，同时前次写线程的修改对后续的读写线程可见。

接着是读锁的代码：

```java title="ReentrantReadWriteLock.java"
@ReservedStackAccess
protected final int tryAcquireShared(int unused) {
    /*
     * Walkthrough:
     * 1. If write lock held by another thread, fail.
     * 2. Otherwise, this thread is eligible for
     *    lock wrt state, so ask if it should block
     *    because of queue policy. If not, try
     *    to grant by CASing state and updating count.
     *    Note that step does not check for reentrant
     *    acquires, which is postponed to full version
     *    to avoid having to check hold count in
     *    the more typical non-reentrant case.
     * 3. If step 2 fails either because thread
     *    apparently not eligible or CAS fails or count
     *    saturated, chain to version with full retry loop.
     */
    Thread current = Thread.currentThread();
    int c = getState();
    if (exclusiveCount(c) != 0 &&
        getExclusiveOwnerThread() != current)
        return -1;
    int r = sharedCount(c);
    if (!readerShouldBlock() &&
        r < MAX_COUNT &&
        compareAndSetState(c, c + SHARED_UNIT)) {
        if (r == 0) {
            firstReader = current;
            firstReaderHoldCount = 1;
        } else if (firstReader == current) {
            firstReaderHoldCount++;
        } else {
            HoldCounter rh = cachedHoldCounter;
            if (rh == null ||
                rh.tid != LockSupport.getThreadId(current))
                cachedHoldCounter = rh = readHolds.get();
            else if (rh.count == 0)
                readHolds.set(rh);
            rh.count++;
        }
        return 1;
    }
    return fullTryAcquireShared(current);
}
```

可以看到在 `tryAcquireShared` 方法中，如果其他线程已经获取了写锁，则当前线程获取读锁失败，进入等待状态。

如果当前线程获取了写锁或者写锁未被获取，则当前线程（线程安全，依靠 CAS 保证）增加读状态，成功获取读锁。读锁的每次释放（线程安全的，可能有多个读线程同时释放读锁）均减少读状态，减少的值是 `1 << 16`。所以读写锁才能实现读读的过程共享，而读写、写读、写写的过程互斥。

> 对于当前线程持有写锁，是能够获取读锁的，主要场景在于手动编写锁降级：
>
> 例如，一个线程先用写锁修改了一些数据，然后想在后续的流程中长时间、多次地读取这些数据，同时又不希望阻塞其他只想读取的线程。它就可以先获取读锁，再释放写锁，从而把独占权交出去，让其他读线程能并发工作。
>
> 如果不支持这种“降级”机制，线程需要先释放写锁再获取读锁，这中间会产生一个极短的“空窗期”。在这个空窗期里，其他线程可能抢到写锁并修改了数据，导致**后续读取的不是自己刚修改过的那个版本**。

此时，我们再回头看一下互斥锁 `ReentrantLock` 中公平锁和非公平锁的加锁源码，当某一个线程调用 `lock` 方法获取锁时，如果同步资源没有被其他线程锁住，那么当前线程在使用 CAS 更新 `state` 成功后就会成功抢占该资源。而如果公共资源被占用且不是被当前线程占用，那么就会加锁失败。所以可以确定 `ReentrantLock` 无论读操作还是写操作，添加的锁都是都是独享锁。
