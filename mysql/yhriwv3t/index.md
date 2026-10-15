---
url: /mysql/yhriwv3t/index.md
---
执行一条 update 语句，期间发生了什么？比如这一条 update 语句：

```sql
UPDATE t_user SET name = 'xiaolin' WHERE id = 1;
```

查询语句的那一套流程，更新语句也是同样会走一遍：

* 客户端先通过连接器建立连接，连接器自会判断用户身份；
* 因为这是一条 update 语句，所以不需要经过查询缓存，但是表上有更新语句，是会把整个表的查询缓存清空的，所以说查询缓存很鸡肋，在 MySQL 8.0 就被移除这个功能了；
* 解析器会通过词法分析识别出关键字 `update`，表名等等，构建出语法树，接着还会做语法分析，判断输入的语句是否符合 MySQL 语法；
* 预处理器会判断表和字段是否存在；
* 优化器确定执行计划，因为 where 条件中的 `id` 是主键索引，所以决定要使用 `id` 这个索引；
* 执行器负责具体执行，找到这一行，然后更新。

不过，更新语句的流程会涉及到 **undo log**（回滚日志）、**redo log**（重做日志）、**binlog**（归档日志）这三种日志：

| 日志                     | 生成层级          | 作用                                        |
| :----------------------- | :---------------- | :------------------------------------------ |
| **undo log**（回滚日志） | InnoDB 存储引擎层 | 实现事务中的原子性，主要用于事务回滚和 MVCC |
| **redo log**（重做日志） | InnoDB 存储引擎层 | 实现事务中的持久性，主要用于掉电等故障恢复  |
| **binlog**（归档日志）   | Server 层         | 主要用于数据备份和主从复制                  |

所以这次就带着这个问题，看看这三种日志是怎么工作的。

## 为什么需要 undo log？

我们在执行一条"增删改"语句的时候，虽然没有输入 `begin` 开启事务和 `commit` 提交事务，但是 MySQL 会隐式开启事务来执行"增删改"语句，执行完就自动提交事务，这样就保证了执行完"增删改"语句后，我们可以及时在数据库表看到"增删改"的结果了。

执行一条语句是否自动提交事务，是由 `autocommit` 参数决定的，默认是开启的。所以，执行一条 update 语句也是会使用事务的。

那么，考虑一个问题：一个事务在执行过程中，在还没有提交事务之前，如果 MySQL 发生了崩溃，要怎么回滚到事务之前的数据呢？

如果我们每次在事务执行过程中，都记录下回滚时需要的信息到一个日志里，那么在事务执行中途发生了 MySQL 崩溃后，就不用担心无法回滚到事务之前的数据，我们可以通过这个日志回滚到事务之前的数据。

实现这一机制就是 **undo log**（回滚日志），它保证了事务的 ACID 特性中的 **原子性（Atomicity）**。

undo log 是一种用于撤销回退的日志。在事务没提交之前，MySQL 会先记录更新前的数据到 undo log 日志文件里面，当事务回滚时，可以利用 undo log 来进行回滚。

![回滚事务](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/%E5%9B%9E%E6%BB%9A%E4%BA%8B%E5%8A%A1.png?image_process=watermark,text_5YWs5LyX5Y-377ya5bCP5p6XY29kaW5n,type_ZnpsdHpoaw,x_10,y_10,g_se,size_20,color_0000CD,t_70,fill_0)

每当 InnoDB 引擎对一条记录进行操作（修改、删除、新增）时，要把回滚时需要的信息都记录到 undo log 里，比如：

* **插入一条记录时**：要把这条记录的主键值记下来，这样之后回滚时只需要把这个主键值对应的记录**删掉**就好了；
* **删除一条记录时**：要把这条记录中的内容都记下来，这样之后回滚时再把由这些内容组成的记录**插入**到表中就好了；
* **更新一条记录时**：要把被更新的列的旧值记下来，这样之后回滚时再把这些列**更新为旧值**就好了。

在发生回滚时，就读取 undo log 里的数据，然后做原先相反操作。比如当 `delete` 一条记录时，undo log 中会把记录中的内容都记下来，然后执行回滚操作的时候，就读取 undo log 里的数据，然后进行 `insert` 操作。

### 特殊处理

针对 `delete` 操作和 `update` 操作会有一些特殊的处理：

* **delete 操作**：实际上不会立即直接删除，而是将 delete 对象打上 `delete flag`，标记为删除，最终的删除操作是 purge 线程完成的。
* **update 操作**：分为两种情况，要看更新的列是否是主键列。
  * 如果不是主键列，在 undo log 中直接反向记录是如何 update 的，即 update 是直接进行的。
  * 如果是主键列，update 分两部执行：先删除该行，再插入一行目标行。

不同类型的操作（修改、删除、新增）产生的 undo log 的格式也是不同的。

### undo log 的版本链

一条记录的每一次更新操作产生的 undo log 格式都有一个 `roll_pointer` 指针和一个 `trx_id` 事务 ID：

* 通过 `trx_id` 可以知道该记录是被哪个事务修改的；
* 通过 `roll_pointer` 指针可以将这些 undo log 串成一个链表，这个链表就被称为 **版本链**。

![版本链](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/%E7%89%88%E6%9C%AC%E9%93%BE.png?image_process=watermark,text_5YWs5LyX5Y-377ya5bCP5p6XY29kaW5n,type_ZnpsdHpoaw,x_10,y_10,g_se,size_20,color_0000CD,t_70,fill_0)

### undo log 的第二个作用：MVCC

另外，undo log 还有一个作用，通过 **ReadView + undo log** 实现 MVCC（多版本并发控制）。

对于「读提交」和「可重复读」隔离级别的事务来说，它们的**快照读**（普通 select 语句）是通过 Read View + undo log 来实现的，它们的区别在于创建 Read View 的时机不同：

| 隔离级别           | Read View 创建时机                     | 特点                                                         |
| :----------------- | :------------------------------------- | :----------------------------------------------------------- |
| **读提交（RC）**   | 每个 select 都会生成一个新的 Read View | 事务期间的多次读取同一条数据，前后两次读的数据可能会出现不一致 |
| **可重复读（RR）** | 启动事务时生成一个 Read View           | 整个事务期间都在用这个 Read View，保证了在事务期间读到的数据都是事务启动前的记录 |

这两个隔离级别实现是通过「事务的 Read View 里的字段」和「记录中的两个隐藏列（`trx_id` 和 `roll_pointer`）」的比对，如果不满足可见行，就会顺着 undo log 版本链里找到满足其可见性的记录，从而控制并发事务访问同一个记录时的行为，这就叫 **MVCC（多版本并发控制）**。

### undo log 两大作用小结

1. **实现事务回滚，保障事务的原子性**：事务处理过程中，如果出现了错误或者用户执行了 ROLLBACK 语句，MySQL 可以利用 undo log 中的历史数据将数据恢复到事务开始之前的状态。
2. **实现 MVCC（多版本并发控制）关键因素之一**：MVCC 是通过 ReadView + undo log 实现的。undo log 为每条记录保存多份历史数据，MySQL 在执行快照读（普通 select 语句）的时候，会根据事务的 Read View 里的信息，顺着 undo log 的版本链找到满足其可见性的记录。

> **TIP**：很多人疑问 undo log 是如何刷盘（持久化到磁盘）的？
>
> undo log 和数据页的刷盘策略是一样的，都需要通过 redo log 保证持久化。buffer pool 中有 undo 页，对 undo 页的修改也都会记录到 redo log。redo log 会每秒刷盘，提交事务时也会刷盘，数据页和 undo 页都是靠这个机制保证持久化的。

## 为什么需要 Buffer Pool？

MySQL 的数据都是存在磁盘中的，那么我们要更新一条记录的时候，得先要从磁盘读取该记录，然后在内存中修改这条记录。那修改完这条记录是选择直接写回到磁盘，还是选择缓存起来呢？

当然是缓存起来好，这样下次有查询语句命中了这条记录，直接读取缓存中的记录，就不需要从磁盘获取数据了。

为此，InnoDB 存储引擎设计了一个**缓冲池（Buffer Pool）**，来提高数据库的读写性能。

有了 Buffer Pool 后：

* **读取数据时**：如果数据存在于 Buffer Pool 中，客户端就会直接读取 Buffer Pool 中的数据，否则再去磁盘中读取。
* **修改数据时**：如果数据存在于 Buffer Pool 中，那直接修改 Buffer Pool 中数据所在的页，然后将其页设置为**脏页**（该页的内存数据和磁盘上的数据已经不一致），为了减少磁盘 I/O，不会立即将脏页写入磁盘，后续由后台线程选择一个合适的时机将脏页写入到磁盘。

### Buffer Pool 缓存什么？

InnoDB 会把存储的数据划分为若干个\*\*「页」\*\*，以页作为磁盘和内存交互的基本单位，一个页的默认大小为 **16KB**。因此，Buffer Pool 同样需要按「页」来划分。

在 MySQL 启动的时候，\*\*InnoDB 会为 Buffer Pool 申请一片连续的内存空间，然后按照默认的 16KB 的大小划分出一个个的页，==Buffer Pool 中的页就叫做缓存页==。\*\*此时这些缓存页都是空闲的，之后随着程序的运行，才会有磁盘上的页被缓存到 Buffer Pool 中。

所以，MySQL 刚启动的时候，你会观察到使用的虚拟内存空间很大，而使用到的物理内存空间却很小，这是因为只有这些虚拟内存被访问后，操作系统才会触发缺页中断，申请物理内存，接着将虚拟地址和物理地址建立映射关系。

Buffer Pool 除了缓存**索引页**和**数据页**，还包括了 Undo 页、插入缓存、自适应哈希索引、锁信息等等。

![img](https://cdn.xiaolincoding.com/gh/xiaolincoder/ImageHost4@main/mysql/innodb/bufferpool%E5%86%85%E5%AE%B9.drawio.png?image_process=watermark,text_5YWs5LyX5Y-377ya5bCP5p6XY29kaW5n,type_ZnpsdHpoaw,x_10,y_10,g_se,size_20,color_0000CD,t_70,fill_0)

#### Undo 页是记录什么？

开启事务后，InnoDB 层更新记录前，首先要记录相应的 undo log，如果是更新操作，需要把被更新的列的旧值记下来，也就是要生成一条 undo log，undo log 会写入 Buffer Pool 中的 Undo 页面。

#### 查询一条记录，就只需要缓冲一条记录吗？

不是的。当我们查询一条记录时，InnoDB 是会把**整个页**的数据加载到 Buffer Pool 中，将页加载到 Buffer Pool 后，再通过页里的「页目录」去定位到某条具体的记录。

## 为什么需要 redo log？

Buffer Pool 是提高了读写效率没错，但是问题来了：Buffer Pool 是基于内存的，而内存总是不可靠，万一断电重启，还没来得及落盘的脏页数据就会丢失。

为了防止断电导致数据丢失的问题，当有一条记录需要更新的时候，InnoDB 引擎就会先更新内存（同时标记为脏页），然后将本次对这个页的修改以 **redo log** 的形式记录下来，这个时候更新就算完成了。

后续，InnoDB 引擎会在适当的时候，由后台线程将缓存在 Buffer Pool 的脏页刷新到磁盘里，这就是 \*\*WAL（Write-Ahead Logging）\*\*技术。

> **WAL 技术**：MySQL 的写操作并不是立刻写到磁盘上，而是先写日志，然后在合适的时间再写到磁盘上。

![img](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/wal.png?image_process=watermark,text_5YWs5LyX5Y-377ya5bCP5p6XY29kaW5n,type_ZnpsdHpoaw,x_10,y_10,g_se,size_20,color_0000CD,t_70,fill_0)

### 什么是 redo log？

redo log 是**物理日志**，记录了某个数据页做了什么修改，比如对 XXX 表空间中的 YYY 数据页 ZZZ 偏移量的地方做了 AAA 更新，每当执行一个事务就会产生这样的一条或者多条物理日志。

在事务提交时，只要先将 redo log 持久化到磁盘即可，可以不需要等到将缓存在 Buffer Pool 里的脏页数据持久化到磁盘。

当系统崩溃时，虽然脏页数据没有持久化，但是 redo log 已经持久化，接着 MySQL 重启后，可以根据 redo log 的内容，将所有数据恢复到最新的状态。

### Undo 页面的 redo log

被修改 Undo 页面，需要记录对应 redo log 吗？**需要的。**

开启事务后，InnoDB 层更新记录前，首先要记录相应的 undo log，undo log 会写入 Buffer Pool 中的 Undo 页面。不过在内存修改该 Undo 页面后，也是需要记录对应的 redo log，因为 undo log 也要实现持久性的保护。

### redo log 和 undo log 的区别

| 对比项   | redo log                                 | undo log                                 |
| :------- | :--------------------------------------- | :--------------------------------------- |
| 记录内容 | 事务**修改后**的数据状态（更新之后的值） | 事务**修改前**的数据状态（更新之前的值） |
| 主要用途 | 事务崩溃恢复                             | 事务回滚                                 |
| 保证特性 | 持久性（Durability）                     | 原子性（Atomicity）                      |

* 事务**提交之前**发生了崩溃（事务执行错误，MySQL 还是正常运行的），重启后会通过 **undo log** 回滚事务。
* 事务**提交之后**发生了崩溃（宕机崩溃），重启后会通过 **redo log** 恢复事务。

![事务恢复](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/%E4%BA%8B%E5%8A%A1%E6%81%A2%E5%A4%8D.png?image_process=watermark,text_5YWs5LyX5Y-377ya5bCP5p6XY29kaW5n,type_ZnpsdHpoaw,x_10,y_10,g_se,size_20,color_0000CD,t_70,fill_0)

所以有了 redo log，再通过 WAL 技术，InnoDB 就可以保证即使数据库发生异常重启，之前已提交的记录都不会丢失，这个能力称为 **crash-safe（崩溃恢复）**。

### 为什么要 redo log？两个答案

redo log 要写到磁盘，数据也要写磁盘，为什么要多此一举？

因为写入 redo log 的方式使用了**追加操作**，所以磁盘操作是**顺序写**，而写入数据需要先找到写入位置，然后才写到磁盘，所以磁盘操作是**随机写**。磁盘的「顺序写」比「随机写」高效得多。

> 比喻：有一个本子，按照顺序一页一页写肯定比写一个字都要找到对应页写快得多。

可以说这是 WAL 技术的另外一个优点：**MySQL 的写操作从磁盘的「随机写」变成了「顺序写」**，提升语句的执行性能。

至此，针对为什么需要 redo log 这个问题我们有两个答案：

1. **实现事务的持久性**：让 MySQL 有 crash-safe 的能力，能够保证 MySQL 在任何时间段突然崩溃，重启后之前已提交的记录都不会丢失；
2. **提升写入性能**：将写操作从「随机写」变成了「顺序写」，提升 MySQL 写入磁盘的性能。

### redo log buffer

产生的 redo log 是直接写入磁盘的吗？**不是的。**

执行一个事务的过程中，产生的 redo log 也不是直接写入磁盘的，因为这样会产生大量的 I/O 操作，而且磁盘的运行速度远慢于内存。

所以，redo log 也有自己的缓存——**redo log buffer**，每当产生一条 redo log 时，会先写入到 redo log buffer，后续再持久化到磁盘。

![事务恢复](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/redologbuf.webp)

redo log buffer 默认大小为 **16 MB**，可以通过 `innodb_log_buffer_size` 参数动态调整大小，增大它的大小可以让 MySQL 处理「大事务」时不必写入磁盘，进而提升写 IO 性能。

### redo log 什么时候刷盘？

缓存在 redo log buffer 里的 redo log 还是在内存中，它什么时候刷新到磁盘？主要有下面几个时机：

* MySQL 正常关闭时；
* 当 redo log buffer 中记录的写入量大于 redo log buffer 内存空间的一半时，会触发落盘；
* InnoDB 的后台线程每隔 **1 秒**，将 redo log buffer 持久化到磁盘；
* 每次事务提交时都将缓存在 redo log buffer 里的 redo log 直接持久化到磁盘（这个策略可由 `innodb_flush_log_at_trx_commit` 参数控制）。

#### innodb\_flush\_log\_at\_trx\_commit 参数

该参数控制事务提交时 redo log 的刷盘行为，可取的值有 **0、1、2**，默认值为 **1**。

| 参数值        | 策略                                                         | 数据安全性                                                   | 写入性能 |
| :------------ | :----------------------------------------------------------- | :----------------------------------------------------------- | :------- |
| **0**         | 每次事务提交时，将 redo log 留在 redo log buffer 中，不触发写入磁盘 | 最低（MySQL 进程崩溃会丢失上一秒所有数据）                   | 最高     |
| **1**（默认） | 每次事务提交时，将 redo log 直接持久化到磁盘                 | 最高（异常重启数据不会丢失）                                 | 最低     |
| **2**         | 每次事务提交时，将 redo log 写入 redo log 文件（但仅写入 Page Cache，未持久化到磁盘） | 中等（系统宕机或断电才会丢失上一秒数据，MySQL 进程崩溃不会丢） | 中等     |

> 写到 redo log 文件，注意写入到「 redo log 文件」并不意味着写入到了磁盘，，因为操作系统的文件系统中有个 Page Cache（了解  Page Cache 可以看[这篇文章](https://xiaolincoding.com/os/6_file_system/pagecache.html)），Page Cache 是专门用来缓存文件数据的，所以写入「 redo log文件」意味着写入到了操作系统的文件缓存。

![img](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/innodb_flush_log_at_trx_commit.drawio.png?image_process=watermark,text_5YWs5LyX5Y-377ya5bCP5p6XY29kaW5n,type_ZnpsdHpoaw,x_10,y_10,g_se,size_20,color_0000CD,t_70,fill_0)

#### 后台线程的补充刷盘

* **参数为 0**：后台线程每秒调用 `write()` 写到 Page Cache，然后调用 `fsync()` 持久化到磁盘。
* **参数为 2**：后台线程每秒调用 `fsync()` 将 Page Cache 里的 redo log 持久化到磁盘。

#### 应用场景

* **对数据安全性要求比较高**：设置为 **1**；
* **可以容忍丢失 1s 数据**：设置为 **0**，明显减少日志同步到磁盘的 I/O 操作；
* **安全性和性能折中**：设置为 **2**，即使数据库崩溃也不会丢数据（只要操作系统不宕机），性能比参数 1 高。

## redo log 文件写满了怎么办？

默认情况下，InnoDB 存储引擎有 1 个**重做日志文件组（redo log Group）**，由 **2 个** redo log 文件组成：`ib_logfile0` 和 `ib_logfile1`。

![重做日志文件组](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/%E9%87%8D%E5%81%9A%E6%97%A5%E5%BF%97%E6%96%87%E4%BB%B6%E7%BB%84.drawio.png)

重做日志文件组是以**循环写**的方式工作的，从头开始写，写到末尾就又回到开头，相当于一个**环形**。

![重做日志文件组写入过程](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/%E9%87%8D%E5%81%9A%E6%97%A5%E5%BF%97%E6%96%87%E4%BB%B6%E7%BB%84%E5%86%99%E5%85%A5%E8%BF%87%E7%A8%8B.drawio.png)

* InnoDB 用 **write pos** 表示 redo log 当前记录写到的位置；
* 用 **checkpoint** 表示当前要擦除的位置；
* write pos 和 checkpoint 的移动都是**顺时针方向**；
* **write pos ~ checkpoint**（红色部分）：用来记录新的更新操作；
* **checkpoint ~ write pos**（蓝色部分）：待落盘的脏数据页记录。

![img](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/checkpoint.png)

如果 write pos 追上了 checkpoint，就意味着 redo log 文件满了，**此时 MySQL 会被阻塞，停下来将 Buffer Pool 中的脏页刷新到磁盘中，然后标记 redo log 哪些记录可以被擦除**，等擦除完旧记录腾出了空间，checkpoint 就会往后移动，然后 MySQL 恢复正常运行。

> 针对并发量大的系统，适当设置 redo log 的文件大小非常重要。

## 为什么需要 binlog？

前面介绍的 undo log 和 redo log 这两个日志都是 InnoDB 存储引擎生成的。MySQL 在完成一条更新操作后，**Server 层**还会生成一条 **binlog**，等之后事务提交的时候，会将该事务执行过程中产生的所有 binlog 统一写入 binlog 文件。

binlog 文件记录了所有数据库表结构变更和表数据修改的日志，不会记录查询类的操作（如 SELECT 和 SHOW）。

### 为什么有了 binlog，还要有 redo log？

这个问题跟 MySQL 的时间线有关系：

* 最开始 MySQL 里并没有 InnoDB 引擎，MySQL 自带的引擎是 **MyISAM**，但 MyISAM 没有 crash-safe 的能力，binlog 只能用于归档。
* **InnoDB** 是另一个公司以插件形式引入 MySQL 的，只依靠 binlog 是没有 crash-safe 能力的，所以 InnoDB 使用 redo log 来实现 crash-safe 能力。

### redo log 和 binlog 的区别

| 对比项       | binlog                                         | redo log                                     |
| :----------- | :--------------------------------------------- | :------------------------------------------- |
| **适用对象** | Server 层实现，所有存储引擎可用                | InnoDB 存储引擎实现                          |
| **文件格式** | 逻辑日志（STATEMENT / ROW / MIXED 三种格式）   | 物理日志                                     |
| **写入方式** | 追加写，写满一个文件就创建新文件，保存全量日志 | 循环写，空间固定，保存未被刷入磁盘的脏页日志 |
| **用途**     | 备份恢复、主从复制                             | 掉电等故障恢复                               |

> **注意**：如果不小心整个数据库的数据被删除了，**不能**使用 redo log 恢复，只能使用 binlog 恢复。因为 redo log 是循环写、边写边擦除的，而 binlog 保存的是全量日志。

### binlog 的三种格式

| 格式                  | 说明                                | 优点                 | 缺点                                             |
| :-------------------- | :---------------------------------- | :------------------- | :----------------------------------------------- |
| **STATEMENT**（默认） | 记录修改数据的 SQL 语句（逻辑日志） | 日志量小             | 动态函数（uuid、now 等）会导致主从数据不一致     |
| **ROW**               | 记录行数据最终被修改成什么样        | 不会出现动态函数问题 | 每行变化都记录，批量 update 会使 binlog 文件过大 |
| **MIXED**             | 包含 STATEMENT 和 ROW 模式          | 根据不同情况自动选择 | 综合以上两种                                     |

## 主从复制是怎么实现？

MySQL 的主从复制依赖于 **binlog**，将 binlog 中的数据从主库传输到从库上。一般是**异步**的。

### 三个阶段

1. **写入 Binlog**：主库写 binlog 日志，提交事务，并更新本地存储数据。
2. **同步 Binlog**：把 binlog 复制到所有从库上，每个从库把 binlog 写到暂存日志中。
3. **回放 Binlog**：回放 binlog，并更新存储引擎中的数据。

### 详细过程

* **主库**：收到客户端提交事务请求 → 写入 binlog → 提交事务 → 更新存储引擎数据 → 返回"操作成功"响应。
* **从库 I/O 线程**：连接主库的 log dump 线程，接收 binlog 日志 → 写入 relay log 中继日志 → 返回"复制成功"响应给主库。
* **从库 SQL 线程**：读取 relay log → 回放 binlog → 更新存储引擎数据 → 实现主从数据一致性。

![MySQL 主从架构](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/%E4%B8%BB%E4%BB%8E%E6%9E%B6%E6%9E%84.drawio.png?image_process=watermark,text_5YWs5LyX5Y-377ya5bCP5p6XY29kaW5n,type_ZnpsdHpoaw,x_10,y_10,g_se,size_20,color_0000CD,t_70,fill_0)

### 从库数量

不是越多越好。从库增加会导致 I/O 线程增多，**主库也需要创建同样多的 log dump 线程，资源消耗高，且受限于主库网络带宽**。

实际使用中，**一主多从**结构：一个主库跟 2～3 个从库（1 套数据库，1 主 2 从 1 备主）。

### 主从复制模型

| 模型                 | 说明                           | 优点             | 缺点             |
| :------------------- | :----------------------------- | :--------------- | :--------------- |
| **同步复制**         | 等待所有从库复制成功响应才返回 | 数据最安全       | 性能差、可用性差 |
| **异步复制**（默认） | 不等待从库响应就返回           | 性能好           | 主库宕机会丢数据 |
| **半同步复制**       | 等待至少一个从库复制成功就返回 | 兼顾性能和安全性 | -                |

> MySQL 5.7 版本之后增加了半同步复制。一主二从的集群中，只要数据成功复制到任意一个从库上，主库就可以返回给客户端。

## binlog 什么时候刷盘？

事务执行过程中，先把日志写到 **binlog cache**（Server 层的 cache），事务提交的时候，再把 binlog cache 写到 binlog 文件中。

> **重要**：一个事务的 binlog 是不能被拆开的，无论事务有多大，都要保证一次性写入。这是因为一个线程只能同时有一个事务在执行的设定，如果 binlog 被拆开，在备库执行时会被当做多个事务分段执行，破坏原子性。

* MySQL 给每个线程分配一片内存用于缓冲 binlog，称为 **binlog cache**，由参数 `binlog_cache_size` 控制大小。超出后暂存到磁盘。**在事务提交的时候，执行器把 binlog cache 里的完整事务写入到 binlog 文件中，并清空 binlog cache**。
* 虽然每个线程有自己的 binlog cache，但最终都写到同一个 binlog 文件。

![binlog cach](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/binlogcache.drawio.png)

图中的 write，指的就是指把日志写入到 binlog 文件，但是并没有把数据持久化到磁盘，因为数据还缓存在文件系统的 page cache 里，write 的写入速度还是比较快的，因为不涉及磁盘 I/O。

图中的 fsync，才是将数据持久化到磁盘的操作，这里就会涉及磁盘 I/O，所以频繁的 fsync 会导致磁盘的 I/O 升高。

### sync\_binlog 参数

MySQL提供一个 sync\_binlog 参数来控制数据库的 binlog 刷到磁盘上的频率：

| 参数值        | 策略                     | 说明                                                 |
| :------------ | :----------------------- | :--------------------------------------------------- |
| **0**（默认） | 只 write，不 fsync       | 交由操作系统决定何时持久化到磁盘，性能最好但风险最大 |
| **1**         | 每次提交都 write + fsync | 最安全但性能损耗最大，异常重启最多丢失一个事务       |
| **N (N>1)**   | 累积 N 个事务后才 fsync  | 性能和安全之间的折中，常见设置为 100～1000           |

## 更新一条记录的完整流程

当优化器分析出成本最小的执行计划后，执行器按照执行计划进行更新操作。具体更新 `UPDATE t_user SET name = 'xiaolin' WHERE id = 1;` 的流程：

1. **执行器**调用存储引擎接口，通过主键索引树搜索获取 `id = 1` 这一行记录：
   * 如果所在数据页在 Buffer Pool 中，直接返回更新；
   * 如果不在，将数据页从磁盘读入 Buffer Pool，再返回。
2. 执行器拿到聚簇索引记录后，对比更新前后的记录是否一样：
   * 一样 → 不进行后续更新；
   * 不一样 → 将更新前后的记录都作为参数传给 InnoDB 层执行真正的更新。
3. **开启事务**：InnoDB 层先记录 undo log，将旧值写入 Buffer Pool 的 Undo 页面，同时记录对应的 redo log。
4. InnoDB 层更新记录：
   * 先更新内存（标记为脏页）；
   * 将记录写到 redo log，更新完成；
   * 为了减少 I/O，不立即将脏页写入磁盘，后续由后台线程选择合适时机写入 → **WAL 技术**。
5. 更新完成后，开始记录对应的 binlog，保存到 binlog cache，事务提交时才统一刷新到硬盘。
6. **事务提交**（两阶段提交，见下文）。

## 为什么需要两阶段提交？

事务提交后，redo log 和 binlog 都要持久化到磁盘，但这两个是独立的逻辑，可能出现**半成功**的状态，导致两份日志逻辑不一致。

### 两种不一致的情况

假设 `name` 原值为 `'jay'`，执行 `UPDATE t_user SET name = 'xiaolin' WHERE id = 1;`

| 情况                               | 过程                                        | 后果                                     |
| :--------------------------------- | :------------------------------------------ | :--------------------------------------- |
| **redo log 先写入，binlog 未写入** | 重启后 redo log 恢复新值，但 binlog 无记录  | 从库 binlog 丢失更新，主从数据**不一致** |
| **binlog 先写入，redo log 未写入** | 重启后 redo log 认为事务无效，binlog 有记录 | 从库执行了更新，主从数据**不一致**       |

> 在持久化 redo log 和 binlog 这两份日志的时候，如果出现半成功的状态，就会造成主从环境的数据不一致性。这是因为 **==redo log 影响主库的数据，binlog 影响从库的数据==，所以 redo log 和 binlog 必须保持一致**才能保证主从数据一致。

MySQL 使用\*\*「两阶段提交」\*\*来解决这个问题，两阶段提交其实是分布式事务一致性协议，它可以保证多个逻辑操作要不全部成功，要不全部失败，不会出现半成功的状态。

**两阶段提交把单个事务的提交拆分成了 2 个阶段，分别是「准备（Prepare）阶段」和「提交（Commit）阶段」**，每个阶段都由协调者（Coordinator）和参与者（Participant）共同完成。注意，不要把提交（Commit）阶段和 commit 语句混淆了，commit 语句执行的时候，会包含提交（Commit）阶段。

以拳击比赛类比：

* **准备阶段**：裁判（协调者）依次询问拳击手（参与者）是否准备好；
* **提交阶段**：都准备好 → 比赛开始；有人没准备好 → 比赛暂停（回滚）。

## 两阶段提交的过程

在开启 binlog 的情况下，MySQL 使用**内部 XA 事务**：binlog 作为协调者，存储引擎是参与者。

![两阶段提交](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/%E4%B8%A4%E9%98%B6%E6%AE%B5%E6%8F%90%E4%BA%A4.drawio.png?image_process=watermark,text_5YWs5LyX5Y-377ya5bCP5p6XY29kaW5n,type_ZnpsdHpoaw,x_10,y_10,g_se,size_20,color_0000CD,t_70,fill_0)

* Prepare 阶段
  1. 将 XID（内部 XA 事务 ID）写入 redo log；
  2. 将 redo log 事务状态设置为 **prepare**；
  3. 将 redo log 持久化到磁盘（`innodb_flush_log_at_trx_commit = 1`）。
* Commit 阶段
  1. 将 XID 写入 binlog；
  2. 将 binlog 持久化到磁盘（`sync_binlog = 1`）；
  3. 调用引擎的提交事务接口，将 redo log 状态设置为 **commit**（无需持久化到磁盘，write 到 Page Cache 即可）。

## 异常重启会出现什么现象？

不管是时刻 A（redo log 已写入，binlog 未写入）还是时刻 B（redo log 和 binlog 都已写入，但 commit 标识未写入）崩溃，redo log 都处于 **prepare** 状态。

![时刻 A 与时刻 B](https://cdn.xiaolincoding.com/gh/xiaolincoder/mysql/how_update/%E4%B8%A4%E9%98%B6%E6%AE%B5%E6%8F%90%E4%BA%A4%E5%B4%A9%E6%BA%83%E7%82%B9.drawio.png?image_process=watermark,text_5YWs5LyX5Y-377ya5bCP5p6XY29kaW5n,type_ZnpsdHpoaw,x_10,y_10,g_se,size_20,color_0000CD,t_70,fill_0)

MySQL 重启后按顺序扫描 redo log，碰到 prepare 状态的 redo log 时，拿着 redo log 中的 XID 去 binlog 查看：

| binlog 中是否有 XID | 操作         | 对应情况                                |
| :------------------ | :----------- | :-------------------------------------- |
| **没有**            | **回滚**事务 | 时刻 A：redo log 已刷盘但 binlog 未刷盘 |
| **有**              | **提交**事务 | 时刻 B：redo log 和 binlog 都已刷盘     |

> **两阶段提交以 binlog 写成功为事务提交成功的标识**。binlog 写成功了，意味着能在 binlog 中找到与 redo log 相同的 XID。

### 关键结论

* **redo log** 可以在事务没提交之前持久化到磁盘（后台线程每秒刷盘）；
* **binlog** 必须在事务提交之后，才可以持久化到磁盘；
* 如果 MySQL 崩溃时未提交事务的 redo log 已经持久化，重启时仍会回滚，因为 binlog 未持久化。

## 两阶段提交有什么问题？

### 问题 1：磁盘 I/O 次数高

对于"双 1"配置（`sync_binlog = 1` 且 `innodb_flush_log_at_trx_commit = 1`），每个事务提交都会进行**两次 fsync**：一次 redo log 刷盘 + 一次 binlog 刷盘。

### 问题 2：锁竞争激烈

两阶段提交只能保证「单事务」两个日志内容一致，在「多事务」情况下不能保证**提交顺序一致**，因此需要加锁来保证提交的原子性。早期的 `prepare_commit_mutex` 锁会锁住整个提交流程，高并发时争用严重。

## 组提交（Group Commit）

MySQL 引入了 **binlog 组提交**机制，将多个事务的 binlog 刷盘操作合并成一个，大幅减少磁盘 I/O 次数。

### commit 阶段拆分为三个阶段

| 阶段            | 操作                                                | 作用                       |
| :-------------- | :-------------------------------------------------- | :------------------------- |
| **flush 阶段**  | 多个事务按顺序将 binlog 从 cache 写入文件（不刷盘） | 支撑 redo log 组提交       |
| **sync 阶段**   | 对 binlog 文件做 fsync（多个事务合并一次刷盘）      | 支撑 binlog 组提交         |
| **commit 阶段** | 各个事务按顺序做 InnoDB commit 操作                 | 承接 sync 阶段，最大化效率 |

每个阶段都有独立的队列和锁，锁粒度减小，多个阶段可以并发执行。第一个进入队列的事务成为 **Leader**，领导整组操作。

### MySQL 5.7 的 redo log 组提交

* **MySQL 5.6**：每个事务各自执行 prepare 阶段，无法对 redo log 组提交。
* **MySQL 5.7**：prepare 阶段推迟到 flush 阶段，redo log 也做了一次组写入。

### 优化 binlog 组提交的参数

| 参数                                          | 说明                                  |
| :-------------------------------------------- | :------------------------------------ |
| `binlog_group_commit_sync_delay = N`          | 等待 N 微秒后调用 fsync，组合更多事务 |
| `binlog_group_commit_sync_no_delay_count = N` | 队列中事务数达到 N 个时，立即刷盘     |

## MySQL 磁盘 I/O 很高的优化方法

| 优化方法                                | 说明                                                         | 风险                                                         |
| :-------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **设置组提交参数**                      | `binlog_group_commit_sync_delay` 和 `binlog_group_commit_sync_no_delay_count`，延迟 binlog 刷盘 | 可能增加响应时间；MySQL 进程挂失无风险（binlog 已在 Page Cache） |
| **增大 sync\_binlog**                    | 设置为 100～1000，累积 N 个事务后才 fsync                    | 主机掉电会丢失 N 个事务的 binlog                             |
| **减小 innodb\_flush\_log\_at\_trx\_commit** | 设置为 2，写入 Page Cache 后交由操作系统控制持久化时机       | 主机掉电会丢数据                                             |

## 总结

更新一条记录 `UPDATE t_user SET name = 'xiaolin' WHERE id = 1;` 的完整流程：

1. **执行器**调用存储引擎接口，从 Buffer Pool 或磁盘中获取 `id = 1` 这一行；
2. 对比更新前后是否一样，不一样则传给 InnoDB 层执行；
3. **InnoDB 层**：
   * 开启事务，先记录 **undo log**（旧值到 Undo 页面），同时记录对应的 **redo log**；
   * 更新内存（标记为脏页），将记录写到 **redo log** → WAL 技术；
4. 记录对应的 **binlog** 到 binlog cache；
5. **事务提交（两阶段提交）**：
   * **Prepare 阶段**：redo log 状态设为 prepare → 刷盘到硬盘；
   * **Commit 阶段**：binlog 刷盘到磁盘 → redo log 状态设为 commit；

至此，一条更新语句执行完成。

## 参考资料

* 《MySQL 45 讲》
* 《MySQL 是怎样运行的？》
* https://developer.aliyun.com/article/617776
* http://mysql.taobao.org/monthly/2021/10/01/
* https://www.cnblogs.com/Neeo/articles/13883976.html
* https://www.cnblogs.com/mengxinJ/p/14211427.html
