---
url: /blog/eomjspnx/index.md
---
## 23. 合并 K 个升序链表

## 解法一：小顶堆

扩展合并两个有序链表的情况，存在 n 个链表时，每次求当前最小值的比较时间为 `O(n)`，可以使用小顶堆优化至 `O(logn)`

::: code-tabs
@tab Java

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

:::

## 解法二：归并

每次对链表进行两两合并，共合并log(n)次

::: code-tabs
@tab Java

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

:::
