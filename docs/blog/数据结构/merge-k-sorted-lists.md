---
title: 合并 K 个升序链表
createTime: 2026/04/18 01:24:38
permalink: /blog/eomjspnx/
---

## 23. 合并 K 个升序链表

<p>给你一个链表数组，每个链表都已经按升序排列。</p>

<p>请你将所有链表合并到一个升序链表中，返回合并后的链表。</p>

<p>&nbsp;</p>

<p><strong>示例 1：</strong></p>

<pre><strong>输入：</strong>lists = [[1,4,5],[1,3,4],[2,6]]
<strong>输出：</strong>[1,1,2,3,4,4,5,6]
<strong>解释：</strong>链表数组如下：
[
  1-&gt;4-&gt;5,
  1-&gt;3-&gt;4,
  2-&gt;6
]
将它们合并到一个有序链表中得到。
1-&gt;1-&gt;2-&gt;3-&gt;4-&gt;4-&gt;5-&gt;6
</pre>

<p><strong>示例 2：</strong></p>

<pre><strong>输入：</strong>lists = []
<strong>输出：</strong>[]
</pre>

<p><strong>示例 3：</strong></p>

<pre><strong>输入：</strong>lists = [[]]
<strong>输出：</strong>[]
</pre>

<p>&nbsp;</p>

<p><strong>提示：</strong></p>

<ul>
 <li><code>k == lists.length</code></li>
 <li><code>0 &lt;= k &lt;= 10^4</code></li>
 <li><code>0 &lt;= lists[i].length &lt;= 500</code></li>
 <li><code>-10^4 &lt;= lists[i][j] &lt;= 10^4</code></li>
 <li><code>lists[i]</code> 按 <strong>升序</strong> 排列</li>
 <li><code>lists[i].length</code> 的总和不超过 <code>10^4</code></li>
</ul>

## 解法一：小顶堆

扩展合并两个有序链表的情况，存在 n 个链表时，每次求当前最小值的比较时间为 `O(n)`，可以使用小顶堆优化至 `O(logn)`

```java
class Solution {
    public ListNode mergeKLists(ListNode[] lists) {
        PriorityQueue<ListNode> heap = new PriorityQueue<>((a, b) -> a.val - b.val);
        for (ListNode node : lists) {
            if (node != null) {
                heap.offer(node);
            }
        }
        ListNode dummy = new ListNode();
        ListNode ans = dummy;
        while (!heap.isEmpty()) {
            ListNode node = heap.poll();
            if (node.next != null) {
                heap.offer(node.next);
            }
            dummy.next = node;
            dummy = node;
        }
        return ans.next;
    }
}
```

## 解法二：并归

每次对链表进行两两合并，共合并log(n)次

```java
class Solution {
    public ListNode mergeKLists(ListNode[] lists) {
        int n = lists.length;
        if (n == 0) {
            return null;
        }
        for (int step = 1; step < n; step *= 2) {
            for (int i = 0; i + step < n; i += step * 2) {
                lists[i] = mergeTwoLists(lists[i], lists[i + step]);
            }
        }
        return lists[0];
    }

    private ListNode mergeTwoLists(ListNode list1, ListNode list2) {
        ListNode dummy = new ListNode();
        ListNode cur = dummy; 
        while (list1 != null && list2 != null) {
            if (list1.val < list2.val) {
                cur.next = list1; 
                list1 = list1.next;
            } else { 
                cur.next = list2;
                list2 = list2.next;ß
            }
            cur = cur.next;
        }
        cur.next = list1 != null ? list1 : list2; // 拼接剩余链表
        return dummy.next;
    }
}
```
