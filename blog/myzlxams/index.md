---
url: /blog/myzlxams/index.md
---
## 33. 搜索旋转排序数组

## 解法一：两次二分查找

先按照 [寻找旋转排序数组中的最小值](./find-minimum-in-rotated-sorted-array.md) 的思路找出分界点，确定要查找的值位于左半边还是右半边，再使用一次二分查找找出目标值。

::: code-tabs
@tab Java

```java
class Solution {
    public int search(int[] nums, int target) {
        int i = findMin(nums);
        if (nums[nums.length - 1] >= target) {
            return binarySearch(nums, i, nums.length, target);
        }
        return binarySearch(nums, 0, i, target);
    }

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
        return left;
    }

    private int binarySearch(int[] nums, int left, int right, int target) {
        while (left < right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] >= target) {
                right = mid;
            } else {
                left = mid + 1;
            }
        }
        return nums[right] == target ? right : -1;
    }
}
```

:::

## 解法二：一次二分查找

将解法一两次二分合并，大体思路为，在不同侧时，转向 `target` 所在侧查找，相同侧时，依据 `nums[mid]` 与 `target` 大小关系查找。

> 写法需要一定时间思考，面试时优先考虑方法一吧

::: code-tabs
@tab Java

```java
class Solution {
    public int search(int[] nums, int target) {
        int last = nums[nums.length - 1];
        int left = -1;
        int right = nums.length - 1; // 开区间 (-1, n-1)
        while (left + 1 < right) {
            int mid = (left + right) >>> 1;
            int x = nums[mid];
            // target 在第一段，x 在第二段
            if (target > last && x <= last) { 
                right = mid;
            } 
            // x 在第一段，target 在第二段
            else if (x > last && target <= last) {
                left = mid; // 下轮循环去右边找
            } 
            // 否则，x 和 target 在同一段，这就和方法一的 lowerBound 一样了
            else if (x >= target) {
                right = mid;
            } else {
                left = mid;
            }
        }
        return nums[right] == target ? right : -1;
    }
}

作者：灵茶山艾府
链接：https://leetcode.cn/problems/search-in-rotated-sorted-array/solutions/
来源：力扣（LeetCode）
著作权归作者所有。商业转载请联系作者获得授权，非商业转载请注明出处。
```

:::
