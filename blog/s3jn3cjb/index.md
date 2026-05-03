---
url: /blog/s3jn3cjb/index.md
---
## 142. 环形链表 II

## 基本思路

![Floyd 判圈算法](https://pic.leetcode.cn/1741414978-wPTZwJ-lc142-3-c.png "Floyd 判圈算法")

快慢指针相遇，证明快指针比慢指针正好多走 $k$ 圈，说明 $2b - b = b$ 为 $c$ 的整数倍。

又有慢指针在环内的走的距离为 $b - a$, $b$ 为 $c$ 的整数倍，已知再走距离 $a$，慢指针能达到 $c$ 的整数倍，即到达入环点。

虽然 $a$ 的值未知，但是注意到**头结点距离入环的距离也为 $a$**，故只需要让头结点和慢指针同时走，相遇点即为入环点。

## 解题代码

::: code-tabs
@tab Java

```java
public class Solution {
    public ListNode detectCycle(ListNode head) {
        ListNode slow = head;
        ListNode fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            // 此处要先移动指针再判断，否则一开始 slow 和 fast 均为 head 会出现逻辑错误
            if (fast == slow) {
                while (head != slow) {
                    head = head.next;
                    slow = slow.next;
                }
                return head;
            }
        }
        return null;
    }
}
```

:::
