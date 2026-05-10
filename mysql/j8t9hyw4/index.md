---
url: /mysql/j8t9hyw4/index.md
---
## 实验

建一张表

```sql
CREATE TABLE person(
    id int NOT NULL AUTO_INCREMENT PRIMARY KEY comment '主键',
    person_id tinyint not null comment '用户id',
    person_name VARCHAR(200) comment '用户名称',
    gmt_create datetime comment '创建时间',
    gmt_modified datetime comment '修改时间'
) comment '人员信息表'; 
```

插入一条数据示例

```sql
insert into person values(1,1,'user_1', NOW(), now());
```

使用 MySQL 伪列 rownum 设置起始点

```sql
select (@i:=@i+1) as rownum, person_name from person, (select @i:=100) as init;
set @i=1;
```

运行下面的SQL，连续执行20次，数据量将从1行变成约100万行（2^20），执行23次约800万行，以此类推。如需少量增加，可在SQL后增加`where`条件，如`id > 某值`来控制。

```sql
insert into person(id, person_id, person_name, gmt_create, gmt_modified)
select @i:=@i+1,
left(rand()*10,10) as person_id,
concat('user_',@i%2048),
date_add(gmt_create,interval + @i*cast(rand()*100 as signed) SECOND),
date_add(date_add(gmt_modified,interval +@i*cast(rand()*100 as signed) SECOND), interval + cast(rand()*1000000 as signed) SECOND)
from person;
```

执行到近800万或1000万数据时，可能报错：`The total number of locks exceeds the lock table size`

这是因为临时表内存设置不够。可通过扩大参数解决：

```sql
SET GLOBAL tmp_table_size = 512*1024*1024;   -- 512M
SET GLOBAL innodb_buffer_pool_size = 1*1024*1024*1024; -- 1G
```

测试数据基于MySQL 8.0，在个人笔记本上运行（同时运行IDEA、浏览器等），仅供参考。

![img](https://img1.jcloudcs.com/developer.jdcloud.com/a6e874ce-88f2-4007-b57d-eef217bb655c20220712145055.png)

看到这组数据似乎好像真的和标题对应，当数据达到2000w 以后，查询时长急剧上升；难道这就是铁律吗？

那下面我们就来看看这个建议值2kw 是怎么来的？

## 单表数量限制

首先我们先想想数据库单表行数最大多大？

```sql
CREATE TABLE person(
    id int(10) NOT NULL AUTO_INCREMENT PRIMARY KEY comment '主键',
    person_id tinyint not null comment '用户id',
    person_name VARCHAR(200) comment '用户名称',
    gmt_create datetime comment '创建时间',
    gmt_modified datetime comment '修改时间'
) comment '人员信息表';
```

看看上面的建表 sql，id 是主键，本身就是唯一的，也就是说主键的大小可以限制表的上限

* 如果主键声明 `int` 大小，也就是 32 位，那么支持 21 亿；
* 如果是 `bigint`，那就是 $2^{63}-1 ≈ 9.22×10^{18}$，一般还没有到这个限制之前，可能数据库已经爆满了

实际数据库通常还未达到此上限时，就已因磁盘、性能等因素而无法支撑。

## 表空间

表数据在硬盘上存储实际是放在一个叫 `person.ibd` （innodb data）的文件中，也叫做表空间;

虽然数据表中，他们看起来是一条连着一条，但是实际上在文件中它被分成很多小份的数据页，而且每一份都是16K。

## 页的数据结构

InnoDB 中每个数据页的大小默认为 16 KB。当数据量变大时，一条记录无法存储在一个页面内，因此需要将记录分散到多个页中。为了管理这些分散的页，InnoDB 使用了以下机制：

* **页号**：每个页拥有唯一的标识，用于定位。
* **前后页指针**：记录相邻页的地址，以便顺序扫描。
* **校验码**：用于检测读写过程中因中断或异常导致的数据损坏。
* **页目录（Page Directory）**：通过二分查找加快页内查询，避免逐条遍历。

基于上述设计，一个 InnoDB 数据页的内部存储空间大致划分为 7 个部分。其中，部分区域的字节数是固定的，部分则是可变的。

![图片](https://cdn.xiaolincoding.com//mysql/other/c34b589e12e5bc0855c9bdeab0c63a88.png)

用户记录实际存储在 **User Records** 部分，其格式由表的行格式决定。但页刚初始化时，并不存在 User Records 区域，而是有一块 **Free Space**（空闲空间）。每当插入一条新记录，系统会从 Free Space 中申请一块与记录大小相等的空间，划分到 User Records 区域。随着记录不断插入，Free Space 逐渐减少，直至完全被 User Records 占用。此时该页已满，再有新记录插入时，InnoDB 会申请新的数据页。

这个过程的图示如下：

![图片](https://cdn.xiaolincoding.com//mysql/other/ea5cc8c67b7656d3f2a11e42293a0244.png)

## 索引的数据结构

在 MySQL 中索引的数据结构和刚刚描述的页几乎是一模一样的，而且大小也是16K，但是在索引页中记录的是页(数据页，索引页)的最小主键id和页号，以及在索引页中增加了层级的信息，从0 开始往上算，所以页与页之间就有了上下层级的概念。

![img](https://img1.jcloudcs.com/developer.jdcloud.com/cd6c470b-cbd9-49f1-bf50-baf6a91611f620220712145620.png)

## 单表建议值

下面以一个高度为 3、分叉数为 2（实际 InnoDB 中为多分叉）的 B+ 树为例，说明查找一条行数据的过程。

假设我们要查找 `id = 6` 的行数据。B+ 树的非叶子节点中存放的是 **页号** 和该页中 **最小的 id**（目录项）。

查找步骤如下：

1. **从根节点开始**：
   根节点为页号 10，其中的目录为：
   `[id=1, 页号=20]`、`[id=5, 页号=30]`。
   这表示：

   * 左侧子节点（页号20）中的最小 id 为 1
   * 右侧子节点（页号30）中的最小 id 为 5

   因为 `6 > 5`，按照二分查找规则，走向右侧子节点，即页号 30。

2. **到达非叶子节点（页号30）**：
   页号30中继续存放下一层的目录：
   `[id=5, 页号=60]`、`[id=7, 页号=70]`。
   目标值 `6` 满足 `5 < 6 < 7`，因此走向页号 60。

3. **到达叶子节点（页号60）**：
   页号60为叶子节点，其中存储实际的数据行（按 id 顺序排列）。
   将该页加载到内存中，通过遍历或二分查找找到 `id = 6` 的行记录。

在整个查找过程中，共访问了 **3 个数据页**（根节点、中间节点、叶子节点）。如果这些页都未提前加载到内存中，则需要最多 **3 次磁盘 I/O**。

![img](https://img1.jcloudcs.com/developer.jdcloud.com/b013a380-408a-4502-8020-52150844af8120220712145700.png)

至此，我们大概已经了解了表的数据是怎么个结构了，也大概知道查询数据是个怎么的过程了，这样我们也就能大概估算这样的结构能存放多少数据了。

### 前提回顾

* B+ 树的**叶子节点**存放实际数据。
* **非叶子节点**存放索引数据（主键 + 页号）。
* 每个数据页大小默认为 16 KB。

### 变量定义

* `x`：非叶子节点内能指向的页数量（即每个索引页能存储的索引条目数）
* `y`：叶子节点内能容纳的数据行数
* `z`：B+ 树的层数

总数据量公式为：

```
Total = x^(z-1) * y
```

### 计算 x（非叶子节点的索引条目数）

页头部信息占用约 1 KB（包括 File Header、Page Header、Infimum + Supremum、File Trailer 以及页目录等）。\
剩余可用空间：16 KB - 1 KB = 15 KB = 15 × 1024 Byte。

每个索引条目假设为：

* 主键（Bigint）：8 Byte
* 页号：4 Byte\
  合计：12 Byte

因此：

```
x = (15 × 1024) / 12 ≈ 1280 行
```

### 计算 y（叶子节点的数据行数）

叶子节点同样可用空间约 15 KB。\
假设每行数据占用 1 KB（受字段类型、数量等影响），则：

```
y = 15 KB / 1 KB = 15 行
```

> 注意：若行数据较大（例如 5 KB），则 y = 15 / 5 = 3 行。

### 不同层数下的总数据量（按 y=15 估算）

* **两层 B+ 树**（z = 2）：\
  `Total = 1280^(2-1) × 15 = 1280 × 15 = 19200` 行

* **三层 B+ 树**（z = 3）：\
  `Total = 1280^(3-1) × 15 = 1280^2 × 15 = 1638400 × 15 ≈ 24,576,000` 行 ≈ **2450 万行**

这就是通常建议单表不超过 **2000 万行** 的重要依据之一。

### 不同行大小时的影响示例

* 如果行数据大小为 **5 KB**，则 y = 3\
  三层 B+ 树：`Total = 1280^2 × 3 ≈ 4,915,200` 行 ≈ **500 万行**

可见，在相同查询性能（相同层数）下，建议的最大行数随行数据大小变化而变化。

### 性能影响因素

影响查询性能的因素还有很多，例如：

* 数据库版本
* 服务器配置（CPU、内存、磁盘）
* SQL 编写质量
* InnoDB buffer pool 大小

**关键点**：

* MySQL 会将表的索引加载到内存中。
* 当 InnoDB buffer pool 足够大时，索引可全内存加载，查询性能良好。
* 一旦单表数据量超过内存容纳索引的上限，查询就会产生磁盘 I/O，性能明显下降。
* 提升硬件配置（如增大内存、使用更快的存储）可直接改善性能。

> 因此，单表建议值并非绝对固定，需要结合数据行大小、硬件资源和业务场景综合评估。
