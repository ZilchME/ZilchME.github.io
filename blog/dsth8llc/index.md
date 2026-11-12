---
url: /blog/dsth8llc/index.md
---
在日志、监控、设备上报、采集数据等场景中，数据通常会持续不断写入。如果一张表长期保存所有历史数据，随着数据量增长，会逐渐出现查询变慢、清理困难、索引膨胀、备份恢复变慢等问题。

MySQL 分区可以把一张逻辑表按照指定规则拆分成多个物理分区。对于应用程序来说，它仍然是一张表；但 MySQL 内部会根据分区规则把数据写入不同分区。对于按时间查询、按时间清理的数据表，时间分区是一种非常常见的设计。

## 一、为什么要按时间分区

假设一张表每 5 分钟写入 200 条数据，那么数据量大致如下：

| **周期** | **数据量**    |
| -------- | ------------- |
| 1 小时   | 2,400 条      |
| 1 天     | 57,600 条     |
| 1 年     | 21,024,000 条 |

一年大约 2100 万行数据。这个量对于 MySQL 来说并不一定夸张，但如果业务只关心最近几天的数据，却长期保存所有历史数据，就会带来不必要的存储和查询压力。

按时间分区后，可以让数据天然按日期组织。例如：

```text
data_record
├── p20260525
├── p20260526
├── p20260527
├── p20260528
└── pmax
```

如果查询某一天的数据，MySQL 可以只扫描对应日期的分区。这种能力叫做分区裁剪。更重要的是，清理历史数据时可以直接删除整个分区，而不是逐行执行 `DELETE`。

例如删除一天的数据：

```sql
ALTER TABLE data_record DROP PARTITION p20260524;
```

相比下面这种写法：

```sql
DELETE FROM data_record
WHERE create_time < '2026-05-25';
```

`DROP PARTITION` 通常更适合大批量历史数据清理，因为它避免了大量逐行删除带来的 undo、redo、锁等待和主从延迟问题。

## **二、分区设计：每天一个分区**

假设表名为 `data_record`，时间字段为 `create_time`，可以按天进行 RANGE 分区。

```sql
CREATE TABLE data_record (
    id BIGINT NOT NULL AUTO_INCREMENT,
    create_time DATETIME NOT NULL,
    device_id BIGINT NOT NULL,
    value DECIMAL(10,2),

    PRIMARY KEY (id, create_time),
    KEY idx_create_time (create_time),
    KEY idx_device_time (device_id, create_time)
)
PARTITION BY RANGE COLUMNS(create_time) (
    PARTITION p20260525 VALUES LESS THAN ('2026-05-26'),
    PARTITION p20260526 VALUES LESS THAN ('2026-05-27'),
    PARTITION p20260527 VALUES LESS THAN ('2026-05-28'),
    PARTITION p20260528 VALUES LESS THAN ('2026-05-29'),
    PARTITION pmax VALUES LESS THAN (MAXVALUE)
);
```

这里需要注意一个规则：**分区名通常写当天日期，但** **`VALUES LESS THAN`** **要写第二天零点。**

例如：

```sql
PARTITION p20260527 VALUES LESS THAN ('2026-05-28')
```

表示 `p20260527` 存储的是：

```sql
create_time >= '2026-05-27 00:00:00'
AND create_time < '2026-05-28 00:00:00'
```

最后的 `pmax` 是兜底分区。如果未来分区没有及时创建，新数据不会因为找不到分区而写入失败。不过，`pmax` 只能作为兜底使用，不应该长期存放正常数据。正常情况下，应保证未来分区提前创建，并监控 `pmax` 是否为空。

## **三、自动维护思路**

MySQL 原生**不支持**类似下面这样的自动分区语法：

```sql
PARTITION BY RANGE COLUMNS(create_time)
EVERY 1 DAY;
```

因此，按天分区需要额外维护。比较常见的做法是使用 **MySQL Event + 存储过程**。

对于“每天一个分区，只保留最近三天”的场景，可以设计成每天凌晨执行一次维护任务：

1. 创建明天的分区；
2. 删除三天前的分区；
3. 保留 `pmax` 作为兜底分区。

假设今天是 `2026-05-27`，希望保留最近三天，也就是：

| **日期**   | **分区**  |
| ---------- | --------- |
| 2026-05-25 | p20260525 |
| 2026-05-26 | p20260526 |
| 2026-05-27 | p20260527 |

同时提前创建明天的分区：

| **日期**   | **分区**  |
| ---------- | --------- |
| 2026-05-28 | p20260528 |

这样表中通常只会保留最近几天分区、一个未来分区和一个 `pmax` 分区，分区数量很少，维护成本可控。

## 四、自动维护存储过程

下面的存储过程会完成两个动作：

* 如果明天的分区不存在，则创建明天分区；
* 如果三天前的分区存在，则删除该分区。

```sql
DELIMITER $$

CREATE PROCEDURE maintain_data_record_partitions()
BEGIN
    DECLARE new_part_name VARCHAR(20);
    DECLARE tomorrow DATE;
    DECLARE day_after_tomorrow DATE;
    DECLARE new_part_exists INT DEFAULT 0;

    DECLARE old_part_name VARCHAR(20);
    DECLARE old_day DATE;
    DECLARE old_part_exists INT DEFAULT 0;

    DECLARE sql_text TEXT;

    -- 1. 创建明天分区
    SET tomorrow = DATE_ADD(CURDATE(), INTERVAL 1 DAY);
    SET day_after_tomorrow = DATE_ADD(tomorrow, INTERVAL 1 DAY);
    SET new_part_name = DATE_FORMAT(tomorrow, 'p%Y%m%d');

    SELECT COUNT(*)
    INTO new_part_exists
    FROM information_schema.PARTITIONS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'data_record'
      AND PARTITION_NAME = new_part_name;

    IF new_part_exists = 0 THEN
        SET sql_text = CONCAT(
            'ALTER TABLE data_record REORGANIZE PARTITION pmax INTO (',
            'PARTITION ', new_part_name,
            ' VALUES LESS THAN (''', day_after_tomorrow, '''), ',
            'PARTITION pmax VALUES LESS THAN (MAXVALUE))'
        );

        PREPARE stmt FROM sql_text;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;

    -- 2. 删除三天前分区：保留今天 + 前两天
    SET old_day = DATE_SUB(CURDATE(), INTERVAL 3 DAY);
    SET old_part_name = DATE_FORMAT(old_day, 'p%Y%m%d');

    SELECT COUNT(*)
    INTO old_part_exists
    FROM information_schema.PARTITIONS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'data_record'
      AND PARTITION_NAME = old_part_name;

    IF old_part_exists > 0 THEN
        SET sql_text = CONCAT(
            'ALTER TABLE data_record DROP PARTITION ', old_part_name
        );

        PREPARE stmt FROM sql_text;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;
```

这里的保留策略是“保留今天 + 前两天”。例如今天是 `2026-05-27`，则保留 `2026-05-25`、`2026-05-26`、`2026-05-27`，删除 `2026-05-24` 对应的分区。

如果你的业务含义是“保留完整历史三天，不包含今天”，则需要调整 `old_day` 的计算逻辑。

## 五、创建定时任务

MySQL Event Scheduler 默认不一定开启，可以先检查：

```sql
SHOW VARIABLES LIKE 'event_scheduler';
```

临时开启：

```sql
SET GLOBAL event_scheduler = ON;
```

为了避免 MySQL 重启后失效，建议写入 MySQL 配置文件：

```ini
event_scheduler=ON
```

然后创建每天执行的定时任务：

```sql
CREATE EVENT ev_maintain_data_record_partitions
ON SCHEDULE EVERY 1 DAY
STARTS '2026-05-27 00:10:00'
DO
    CALL maintain_data_record_partitions();
```

不建议把任务安排在刚好零点，可以放在 `00:05`、`00:10` 或 `00:30`，避免和业务高峰、备份任务、统计任务、批处理任务撞在一起。

## 六、查询如何命中分区裁剪

分区表并不是建了就一定快。查询条件必须能够让 MySQL 判断需要访问哪些分区。

推荐写法：

```sql
SELECT *
FROM data_record
WHERE create_time >= '2026-05-27 00:00:00'
  AND create_time <  '2026-05-28 00:00:00';
```

不推荐写法：

```sql
SELECT *
FROM data_record
WHERE DATE(create_time) = '2026-05-27';
```

原因是对分区字段套函数，可能影响分区裁剪和索引使用。时间查询建议统一使用半开区间，也就是 `>= 开始时间` 且 `< 结束时间`。

## 七、生产环境注意事项

首先，分区字段要出现在主键或唯一索引中。MySQL 分区表有一个重要限制：所有唯一键，包括主键，通常都必须包含分区字段。如果按 `create_time` 分区，下面这种主键设计可能会报错：

```sql
PRIMARY KEY (id)
```

更常见的写法是：

```sql
PRIMARY KEY (id, create_time)
```

或者根据业务查询方式设计成：

```sql
PRIMARY KEY (device_id, create_time, id)
```

其次，要监控 `pmax` 是否有数据。正常情况下，`pmax` 应该为空。如果里面出现数据，说明未来分区没有及时创建，或者 `create_time` 出现了异常值。

可以用下面的 SQL 检查：

```sql
SELECT COUNT(*)
FROM data_record PARTITION (pmax);
```

另外，分区维护本质上是 DDL 操作，例如：

```sql
ALTER TABLE data_record REORGANIZE PARTITION pmax INTO (...);
ALTER TABLE data_record DROP PARTITION p20260524;
```

因此建议放在低峰期执行。如果写入特别频繁，也可以提前创建未来多天分区，比如一次性保证未来 3～7 天分区存在，这样即使某一天定时任务失败，也有一定缓冲空间。

最后，建议定期检查分区状态：

```sql
SELECT
    PARTITION_NAME,
    PARTITION_DESCRIPTION,
    TABLE_ROWS
FROM information_schema.PARTITIONS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'data_record'
ORDER BY PARTITION_ORDINAL_POSITION;
```

## **总结**

MySQL 分区的核心价值不是让单机数据库无限扩容，而是让数据更容易按时间管理。对于时间序列类数据，比较实用的方案是：

**按时间 RANGE 分区，提前创建未来分区，定期删除过期分区，并使用** **`pmax`** **作为兜底。**

对于“高频写入，只保留最近三天”的场景，推荐落地方案如下：

* 使用 `RANGE COLUMNS(create_time)` 按天分区；
* 主键或唯一索引包含 `create_time`；
* 保留 `pmax` 兜底；
* 使用 MySQL Event 每天调用存储过程；
* 每天创建明天分区，删除三天前分区；
* 查询时使用 `create_time >= ... AND create_time < ...` 的时间范围条件；
* 监控 `pmax` 是否为空，避免未来数据长期落入兜底分区。

这套方案可以让分区维护基本自动化，同时把表的数据规模控制在较小范围内，适合日志、采集、监控、设备上报等短周期高频数据场景。
