---
url: /blog/f1hpj8rz/index.md
---
## 跳表概述

Redis 只有 Zset 对象的底层实现用到了跳表，跳表的优势是能支持平均 O(logN) 复杂度的节点查找。

zset 结构体里有两个数据结构：一个是跳表，一个是哈希表。这样的好处是既能进行高效的范围查询，也能进行高效单点查询。

```c
typedef struct zset {
    dict *dict;
    zskiplist *zsl;
} zset;
```

Zset 对象在执行数据插入或是数据更新的过程中，会依次在跳表和哈希表中插入或更新相应的数据，从而保证了跳表和哈希表中记录的信息一致。

Zset 对象能支持范围查询（如 `ZRANGEBYSCORE` 操作），这是因为它的数据结构设计采用了跳表，而又能以常数复杂度获取元素权重（如 `ZSCORE` 操作），这是因为它同时采用了哈希表进行索引。

> Zset 对象在使用跳表作为数据结构的时候，是使用由「哈希表 + 跳表」组成的 `struct zset`，但是我们讨论的时候，都会说跳表是 Zset 对象的底层数据结构，而不会提及哈希表，是因为 `struct zset` 中的哈希表只是用于以常数复杂度获取元素权重，大部分操作都是跳表实现的。

## 跳表结构设计

链表在查找元素的时候，因为需要逐一查找，所以查询效率非常低，时间复杂度是 O(N)，于是就出现了跳表。跳表是在链表基础上改进过来的，实现了一种==**多层的有序链表**==，这样的好处是能快速定位数据。

### 跳表示例

下图展示了一个层级为 3 的跳表：

![img](https://cdn.xiaolincoding.com//mysql/other/2ae0ed790c7e7403f215acb2bd82e884.png)

图中头节点有 L0~L2 三个头指针，分别指向了不同层级的节点，然后每个层级的节点都通过指针连接起来：

* **L0 层级**共有 5 个节点，分别是节点 1、2、3、4、5；
* **L1 层级**共有 3 个节点，分别是节点 2、3、5；
* **L2 层级**只有 1 个节点，也就是节点 3。

使用了跳表后，只需要查找 2 次就能定位到节点 4，因为可以在头节点直接从 L2 层级跳到节点 3，然后再往前遍历找到节点 4。

可以看到，这个查找过程就是在多个层级上跳来跳去，最后定位到元素。当数据量很大时，跳表的查找复杂度就是 **O(logN)**。

### 跳表节点结构

```c
typedef struct zskiplistNode {
    // Zset 对象的元素值
    sds ele;
    // 元素权重值
    double score;
    // 后向指针
    struct zskiplistNode *backward;
    // 节点的 level 数组，保存每层上的前向指针和跨度
    struct zskiplistLevel {
        struct zskiplistNode *forward;
        unsigned long span;
    } level[];
} zskiplistNode;
```

各字段说明：

| 字段       | 说明                                           |
| :--------- | :--------------------------------------------- |
| `ele`      | Zset 对象的元素值（SDS 字符串类型）            |
| `score`    | 元素权重值（double 类型）                      |
| `backward` | 后向指针，指向前一个节点，方便从尾节点倒序查找 |
| `level[]`  | 节点的多层前向指针和跨度数组                   |

**`zskiplistLevel` 结构体说明：**

* `forward`：指向下一个跳表节点的指针
* `span`：**跨度**，用来记录两个节点之间的距离

> 跨度实际上是为了计算某个节点在跳表中的排位。因为跳表中的节点都是按序排列的，计算某个节点排位时，从头节点到该节点的查询路径上，将沿途访问过的所有层的跨度累加起来，得到的结果就是目标节点在跳表中的排位。

![img](https://cdn.xiaolincoding.com/gh/xiaolincoder/redis/%E6%95%B0%E6%8D%AE%E7%B1%BB%E5%9E%8B/3%E5%B1%82%E8%B7%B3%E8%A1%A8-%E8%B7%A8%E5%BA%A6.png)

### 跳表结构

```c
typedef struct zskiplist {
    struct zskiplistNode *header, *tail;  // 跳表的头尾节点
    unsigned long length;                  // 跳表的长度（节点数量）
    int level;                             // 跳表的最大层数
} zskiplist;
```

| 字段              | 说明                                                         |
| :---------------- | :----------------------------------------------------------- |
| `header` / `tail` | 跳表的头尾节点，便于在 O(1) 时间复杂度内访问头节点和尾节点   |
| `length`          | 跳表的长度，便于在 O(1) 时间复杂度获取跳表节点的数量         |
| `level`           | 跳表的最大层数，便于在 O(1) 时间复杂度获取跳表中层高最大的那个节点的层数量 |

## 跳表节点查询过程

查找一个跳表节点时，跳表会从头节点的最高层开始，逐一遍历每一层。遍历某一层的跳表节点时，用节点的 SDS 类型元素和权重来判断，共有两个判断条件：

1. 如果当前节点的权重 **小于** 要查找的权重时，跳表就会访问该层上的下一个节点。
2. 如果当前节点的权重 **等于** 要查找的权重时，并且当前节点的 SDS 类型数据 **小于** 要查找的数据时，跳表就会访问该层上的下一个节点。

如果上面两个条件都不满足，或者下一个节点为空时，跳表就会使用目前遍历到的节点的 `level` 数组里的下一层指针，然后沿着下一层指针继续查找，这就相当于跳到了下一层接着查找。

### 查询示例

下图有个 3 层级的跳表：

![img](https://cdn.xiaolincoding.com/gh/xiaolincoder/redis/%E6%95%B0%E6%8D%AE%E7%B1%BB%E5%9E%8B/3%E5%B1%82%E8%B7%B3%E8%A1%A8-%E8%B7%A8%E5%BA%A6.drawio.png)

如果要查找 **「元素：abcd，权重：4」** 的节点，查找过程如下：

1. 先从头节点的最高层开始，L2 指向了 **「元素：abc，权重：3」** 节点，这个节点的权重比要查找节点的小，所以要访问该层上的下一个节点；
2. 但是该层的下一个节点是空节点（`level[2]` 指向的是空节点），于是就会跳到 **「元素：abc，权重：3」** 节点的下一层去找，也就是 `level[1]`；
3. **「元素：abc，权重：3」** 节点的 `level[1]` 的下一个指针指向了 **「元素：abcde，权重：4」** 的节点，然后将其和要查找的节点比较。虽然权重相同，但 SDS 类型数据 **大于** 要查找的数据，所以会继续跳到 **「元素：abc，权重：3」** 节点的下一层去找，也就是 `level[0]`；
4. **「元素：abc，权重：3」** 节点的 `level[0]` 的下一个指针指向了 **「元素：abcd，权重：4」** 的节点，该节点正是要查找的节点，查询结束。

## 跳表节点层数设置

### 层数比例

跳表的相邻两层的节点数量的比例会影响跳表的查询性能。

如果相邻两层节点数量比例失衡（例如第二层只有 1 个节点，第一层有 6 个），查询时基本就跟链表的查询复杂度一样，复杂度退化为 **O(N)**。

为了降低查询复杂度，需要维持相邻层节点数间的关系。跳表的相邻两层的节点数量最理想的比例是 **2:1**，查找复杂度可以降低到 **O(logN)**。

### 随机层数生成

如果采用新增/删除节点时调整跳表节点以维持比例的方法，会带来额外开销。Redis 采用一种巧妙的方法：**在创建节点时随机生成每个节点的层数**，并没有严格维持相邻两层的节点数量比例为 2:1。

具体做法：

1. 创建节点时，生成范围为 `[0-1]` 的一个随机数；
2. 如果随机数 **小于 0.25**（概率 25%），层数就增加 1 层，然后继续生成下一个随机数；
3. 直到随机数的结果 **大于 0.25** 结束，最终确定该节点的层数；
4. 层高最大限制是 **64**。

> 这种做法相当于每增加一层的概率不超过 25%，层数越高，概率越低。

### 头节点创建

头节点的 `level` 数组有 `ZSKIPLIST_MAXLEVEL` 个元素（层），节点不存储任何 `member` 和 `score` 值，`level` 数组元素的 `forward` 都指向 `NULL`，`span` 值都为 0。

```c
/* Create a new skiplist. */
zskiplist *zslCreate(void) {
    int j;
    zskiplist *zsl;
  
    zsl = zmalloc(sizeof(*zsl));
    zsl->level = 1;
    zsl->length = 0;
    zsl->header = zslCreateNode(ZSKIPLIST_MAXLEVEL, 0, NULL);
    for (j = 0; j < ZSKIPLIST_MAXLEVEL; j++) {
        zsl->header->level[j].forward = NULL;
        zsl->header->level[j].span = 0;
    }
    zsl->header->backward = NULL;
    zsl->tail = NULL;
    return zsl;
}
```

其中，`ZSKIPLIST_MAXLEVEL` 定义的是最高的层数：

| Redis 版本 | 最大层数 |
| :--------- | :------- |
| Redis 7.0  | 32       |
| Redis 5.0  | 64       |
| Redis 3.0  | 32       |

## 为什么用跳表而不用平衡树？

这是一个常见的面试题。Redis 的作者 @antirez 的回答主要有以下原因：

> There are a few reasons:
>
> 1. They are not very memory intensive. It's up to you basically. Changing parameters about the probability of a node to have a given number of levels will make then less memory intensive than btrees.
> 2. A sorted set is often target of many ZRANGE or ZREVRANGE operations, that is, traversing the skip list as a linked list. With this operation the cache locality of skip lists is at least as good as with other kind of balanced trees.
> 3. They are simpler to implement, debug, and so forth. For instance thanks to the skip list simplicity I received a patch (already in Redis master) with augmented skip lists implementing ZRANK in O(log(N)). It required little changes to the code.

1. **内存占用不密集**：改变节点具有给定级别数的概率参数，可以使跳表比 btree 占用更少的内存。
2. **范围查询友好**：Zset 经常执行 `ZRANGE` 或 `ZREVRANGE` 操作（作为链表遍历跳表），跳表的缓存局部性至少与其他类型的平衡树一样好。
3. **实现简单**：更易于实现、调试。例如，由于跳表的简单性，扩展跳表实现 `ZRANK` 在 O(logN) 中完成只需少量代码修改。

### 详细补充

| 对比维度     | 跳表                                                         | 平衡树                                                       |
| :----------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **内存占用** | 每个节点包含的指针数目平均为 1/(1-p)。Redis 取 p=1/4，平均每个节点包含 **1.33 个指针**，比平衡树更有优势 | 每个节点包含 **2 个指针**（分别指向左右子树）                |
| **范围查找** | 找到小值之后，对第 1 层链表进行若干步遍历即可实现，**非常简单** | 找到指定范围小值后，需要以中序遍历顺序继续寻找其他不超过大值的节点，**不容易实现** |
| **实现难度** | 插入和删除只需修改相邻节点的指针，**操作简单又快速**         | 插入和删除可能引发子树的调整，**逻辑复杂**                   |
