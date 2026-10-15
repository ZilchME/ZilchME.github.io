---
url: /mysql/se6piv1y/index.md
---
我们刷网站的时候，我们经常会遇到需要分页查询的场景。比如下图红框里的翻页功能。

![图片](https://cdn.xiaolincoding.com//picgo/361faa6c1f37457a96f6a47131152c02.png)

我们很容易能联想到可以用 mysql 实现。假设我们的建表 sql 是这样的：

```sql
CREATE TABLE `page` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `user_name` varchar(255) NOT NULL COMMENT '用户名',
  ....
  `content` varchar(255) NOT NULL COMMENT '文章内容',
  PRIMARY KEY (`id`),
  KEY `idx_user_name` (`user_name`)
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb3;
```

建表 sql 大家也不用扣细节，只需要知道 id 是主键，并且在 user\_name 建了个非主键索引就够了，其他都不重要。

为了实现分页，很容易联想到下面这样的 SQL 语句：

```sql
select * from page order by id limit offset, size;
```

比如一页有 10 条数据。

第一页就是下面这样的 SQL 语句：

```sql
select * from page order by id limit 0, 10;
```

第一百页就是：

```sql
select * from page order by id limit 990, 10;
```

那么问题来了，用这种方式，同样都是拿 10 条数据，查第一页和第一百页的查询速度是一样的吗？为什么？

## 两种 Limit 的执行过程

上面的两种查询方式，对应 `LIMIT offset, size` 和 `LIMIT size` 两种方式。

而其实 `LIMIT size` 相当于 `LIMIT 0, size`，也就是从 0 开始取 size 条数据。也就是说，两种方式的区别在于 offset 是否为 0。

我们可以对下面的 SQL 先执行下 `EXPLAIN`：

```sql
mysql> explain select * from page order by id limit 0, 10 \G;
*************************** 1. row ***************************
           id: 1
  select_type: SIMPLE
        table: page
   partitions: NULL
         type: index
possible_keys: NULL
          key: PRIMARY
      key_len: 4
          ref: NULL
         rows: 10
     filtered: 100.00
        Extra: NULL
1 row in set, 1 warning (0.00 sec)
```

可以看到，EXPLAIN 中提示 `key` 那里，执行的是 `PRIMARY`，也就是走的主键索引。

### 基于主键索引的 Limit 执行过程

当我们去掉 EXPLAIN，执行这条 SQL：

```sql
select * from page order by id limit 0, 10;
```

Server 层会调用 InnoDB 的接口，在 InnoDB 里的主键索引中获取到第 0 到 10 条完整行数据，依次返回给 Server 层，并放到 Server 层的结果集中，返回给客户端。

而当我们把 offset 搞离谱点，比如执行的是：

```sql
select * from page order by id limit 6000000, 10;
```

Server 层会调用 InnoDB 的接口，由于这次的 `offset = 6000000`，会在 InnoDB 里的主键索引中获取到**第 0 到（6000000 + 10）条完整行数据**，返回给 Server 层之后**根据 offset 的值挨个抛弃**，最后只留下最后面的 size 条，也就是 10 条数据，放到 Server 层的结果集中，返回给客户端。

可以看出，当 offset 非 0 时，Server 层会从引擎层获取到很多**无用的数据**，而获取的这些无用数据都是耗时的。

因此，我们就知道了文章开头的问题的答案：

> MySQL 查询中 `LIMIT 1000, 10` 会比 `LIMIT 10` 更慢。原因是 `LIMIT 1000, 10` 会取出 1000 + 10 条数据，并抛弃前 1000 条，这部分耗时更大。

#### 优化方案

可以看出，当 offset 非 0 时，Server 层会从引擎层获取到很多无用的数据。而当 `SELECT` 后面是 `*` 号时，就需要拷贝完整的行信息。**拷贝完整数据跟只拷贝行数据里的其中一两个列字段耗时是不同的**，这就让原本就耗时的操作变得更加离谱。

因为前面的 offset 条数据最后都是不要的，就算将完整字段都拷贝来了又有什么用呢？所以我们可以将 SQL 语句修改成下面这样：

```sql
select * from page 
where id >= (select id from page order by id limit 6000000, 1) 
order by id limit 10;
```

上面这条 SQL 语句里，先执行子查询 `select id from page order by id limit 6000000, 1`，这个操作其实也是在 InnoDB 中的主键索引中获取到 6000000 + 1 条数据，然后 Server 层会抛弃前 6000000 条，只保留最后一条数据的 ID。

但不同的地方在于，在返回 Server 层的过程中，**只会拷贝数据行内的 ID 这一列**，而不会拷贝数据行的所有列，当数据量较大时，这部分的耗时还是比较明显的。

在拿到了上面的 ID 之后，假设这个 ID 正好等于 6000000，那 SQL 就变成了：

```sql
select * from page where id >= 6000000 order by id limit 10;
```

这样 InnoDB **再走一次主键索引**，通过 B+ 树快速定位到 ID = 6000000 的行数据，时间复杂度是 O(log n)，然后向后取 10 条数据。

这样性能确实是提升了，亲测能快一倍左右，属于那种耗时从 3s 变成 1.5s 的操作。

但这属实有些杯水车薪，属于没办法中的办法。

### 基于非主键索引的 Limit 执行过程

上面提到的是主键索引的执行过程，我们再来看下基于非主键索引的 limit 执行过程。

比如下面的 SQL 语句：

```sql
select * from page order by user_name limit 0, 10;
```

Server 层会调用 InnoDB 的接口，在 InnoDB 里的非主键索引中获取到第 0 条数据对应的主键 ID 后，回表到主键索引中找到对应的完整行数据，然后返回给 Server 层，Server 层将其放到结果集中，返回给客户端。

而当 offset > 0 时，且 offset 的值较小时，逻辑也类似，区别在于 offset > 0 时会丢弃前面的 offset 条数据。

也就是说**非主键索引的 limit 过程，比主键索引的 limit 过程多了个回表的消耗**。

但当 offset 变得非常大时，比如 600 万，此时执行 EXPLAIN：

```sql
mysql> explain select * from page order by user_name limit 6000000, 100 \G;
*************************** 1. row ***************************
           id: 1
  select_type: SIMPLE
        table: page
   partitions: NULL
         type: ALL
possible_keys: NULL
          key: NULL
      key_len: NULL
          ref: NULL
         rows: 10198746
     filtered: 100.00
        Extra: Using filesort
1 row in set, 1 warning (0.00 sec)
```

可以看到 `type` 那一栏显示的是 `ALL`，也就是**全表扫描**。

这是因为 Server 层的优化器会在执行器执行 SQL 语句前，判断下哪种执行计划的代价更小。很明显，优化器在看到非主键索引的 600 万次回表之后，摇了摇头，还不如全表一条条记录去判断算了，于是选择了全表扫描。

因此，当 limit offset 过大时，非主键索引查询非常容易变成全表扫描。

#### 优化方案

这种情况也能通过一些方式去优化。比如：

```sql
select * from page t1, 
       (select id from page order by user_name limit 6000000, 100) t2 
WHERE t1.id = t2.id;
```

通过 `select id from page order by user_name limit 6000000, 100` 先走 InnoDB 层的 user\_name 非主键索引取出 ID，**因为只拿主键 ID，不需要回表**，所以这块性能会稍微快点。在返回 Server 层之后，同样抛弃前 600 万条数据，保留最后的 100 个 ID。然后再用这 100 个 ID 去跟 t1 表做 ID 匹配，此时走的是主键索引，将匹配到的 100 条行数据返回。这样就绕开了之前的 600 万条数据的回表。

当然，跟上面的 case 一样，还是没有解决要白拿 600 万条数据然后抛弃的问题，这也是非常挫的优化。

像这种，当 offset 变得超大时，比如到了百万千万的量级，问题就突然变得严肃了。

这里就产生了个专门的术语，叫**深度分页**。

## 深度分页问题

深度分页问题，是个很恶心的问题。恶心就恶心在，这个问题，它其实**无解**。

不管你是用 MySQL 还是 ES，你都只能通过一些手段去"减缓"问题的严重性。

遇到这个问题，我们就该回过头来想想：

> **为什么我们的代码会产生深度分页问题？它背后的原始需求是什么？我们可以根据这个做一些规避。**

### 场景一：如果你想取出全表的数据

有些需求是这样的：我们有一张数据库表，但我们希望将这个数据库表里的所有数据取出，异构到 ES 或者 Hive 里。这时候如果直接执行：

```sql
select * from page;
```

因为数据量较大，MySQL 根本没办法一次性获取到全部数据，妥妥超时报错。

于是不少 MySQL 小白会通过 `LIMIT offset, size` 分页的形式去分批获取。刚开始都是好的，等慢慢地，哪天数据表变得奇大无比，就有可能出现前面提到的深度分页问题。

**这种场景是最好解决的。**

我们可以将所有的数据根据 ID 主键进行排序，然后分批次取，将当前批次的最大 ID 作为下次筛选的条件进行查询。可以看下伪代码：

```go
start_id := 0

for {
    // 取数据
    datas := [select * from page where id > start_id order by id limit 100];
    // 没数据，说明遍历结束，可以break跳出
    if len(datas) == 0 {
        break
    }
    // 处理每次获取到的数据
    handler(datas)
    // 获取datas里最大的id到start_id，进入下一个循环
    start_id = get_max_id_from(datas)
}
```

这个操作，可以通过主键索引，每次定位到 ID 在哪，然后往后遍历 100 个数据，这样不管是多少万的数据，查询性能都很稳定。

### 场景二：如果是给用户做分页展示

如果深度分页背后的原始需求只是产品经理希望做一个展示页的功能，比如商品展示页，那么我们就应该好好跟产品经理 **battle** 一下了。

什么样的翻页，需要翻到 10 万以后？这明显是不合理的需求。

是不是可以改一下需求，让它更接近用户的使用行为？

比如，我们在使用 Google 搜索时看到的翻页功能。一般来说，Google 搜索基本上都在 20 页以内，作为一个用户，我也很少会翻到第 10 页之后。

**作为参考：**

* 如果要做搜索或筛选类的页面，就别用 MySQL 了，用 **ES**，并且也需要控制展示的结果数，比如一万以内，这样不至于让分页过深。
* 如果因为各种原因，必须使用 MySQL。那同样，也需要控制下返回结果数量，比如 1000 以内。这样就能勉强支持各种翻页、跳页（比如突然跳到第 6 页然后再跳到第 106 页）。
* 但如果能从产品的形式上就做成不支持跳页会更好，比如只支持**上一页**或**下一页**。这样我们就可以使用上面提到的 `start_id` 方式，采用分批获取，每批数据以 start\_id 为起始位置。**这个解法最大的好处是不管翻到多少页，查询速度永远稳定。**

\*\[ES]: Elasticsearch

听起来很挫？怎么会呢，把这个功能包装一下，变成像抖音那样只能上划或下划——**专业点，叫瀑布流**。是不是就不挫了？

## 总结

1. `LIMIT offset, size` 比 `LIMIT size` 要慢，且 offset 的值越大，SQL 的执行速度越慢。
2. 当 offset 过大，会引发**深度分页问题**。目前不管是 MySQL 还是 ES 都没有很好的方法去解决这个问题，只能通过**限制查询数量**或**分批获取**的方式进行规避。
3. 遇到深度分页的问题，多思考其**原始需求**。大部分时候是不应该出现深度分页的场景的，必要时多去影响产品经理。
4. 如果数据量很少，比如 1K 的量级，且长期不太可能有巨大的增长，还是用 `LIMIT offset, size` 的方案吧，整挺好，能用就行。
