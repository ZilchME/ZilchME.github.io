---
url: /blog/ovvcr4gy/index.md
---
## 153. 寻找旋转排序数组中的最小值

已知一个长度为 n 的数组，预先按照升序排列，经由 1 到 n 次 旋转 后，得到输入数组。例如，原数组 nums = \[0,1,2,4,5,6,7] 在变化后可能得到：

## 思路

判断 `nums[mid]` 和数组最小值的位置关系:

把 `nums[mid]` 与最后一个数 `nums[n−1]` 比大小：

如果 `nums[mid] > nums[n−1]`，那么可以推出以下结论：

* nums 一定被分成左右两个递增段；
* 第一段的所有元素均大于第二段的所有元素；
* `mid` 在第一段，而最小值在第二段。

此时缩短左边界

如果 `nums[mid] <= nums[n−1]`，那么 `mid` 和最小值均一定在第二段，或者 nums 就是递增数组，此时只有一段。

此时缩短右边界

### 特殊情况

常规二分初始区间为 `[0, n)`，在当前场景下，由于每次比较的对象为 `nums[n - 1]`，当最小值位于 `n - 1` 时，无论移动左边界还是右边界都会导致正确答案被排出二分区间，导致循环不变量`[left,right) 中有最小值`失效。

由于无论数组如何旋转，`n - 1` 均处于蓝色区间，可将区间设为 `[0, n - 1)`，此时仅当最小值位于 `n - 1` 时循环过程存在区别，该情况下区间中所有的数均大于 `num[n - 1]`，始终移动 `left` 最终 `left = rigth = n - 1`。

## 解题代码

::: code-tabs
@tab Java

```java
class Solution {
    public int findMin(int[] nums) {
        int n = nums.length;
        int left = 0, right = n - 1;
        while (left < right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] > nums[n - 1]) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        return nums[left];
    }
}
```

:::

注：由于 `mid` 始终不会等于 `n - 1` 故不需要关注此时应该移动 `left` 还是 `right`
