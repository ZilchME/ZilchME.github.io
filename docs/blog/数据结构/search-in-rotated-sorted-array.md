---
title: 搜索旋转排序数组
tags:
  - 数据结构
  - 二分查找
createTime: 2026/04/22 12:56:31
permalink: /blog/myzlxams/
---

## 33. 搜索旋转排序数组

<p>整数数组 <code>nums</code> 按升序排列，数组中的值 <strong>互不相同</strong> 。</p>

<p>在传递给函数之前，<code>nums</code> 在预先未知的某个下标 <code>k</code>（<code>0 &lt;= k &lt; nums.length</code>）上进行了 <strong>向左旋转</strong>，使数组变为 <code>[nums[k], nums[k+1], ..., nums[n-1], nums[0], nums[1], ..., nums[k-1]]</code>（下标 <strong>从 0 开始</strong> 计数）。例如， <code>[0,1,2,4,5,6,7]</code> 下标&nbsp;<code>3</code>&nbsp;上向左旋转后可能变为&nbsp;<code>[4,5,6,7,0,1,2]</code> 。</p>

<p>给你 <strong>旋转后</strong> 的数组 <code>nums</code> 和一个整数 <code>target</code> ，如果 <code>nums</code> 中存在这个目标值 <code>target</code> ，则返回它的下标，否则返回&nbsp;<code>-1</code>&nbsp;。</p>

<p>你必须设计一个时间复杂度为 <code>O(log n)</code> 的算法解决此问题。</p>

<p>&nbsp;</p>

<p><strong>示例 1：</strong></p>

<pre>
<strong>输入：</strong>nums = [4,5,6,7,0,1,2], target = 0
<strong>输出：</strong>4
</pre>

<p><strong>示例&nbsp;2：</strong></p>

<pre>
<strong>输入：</strong>nums = [4,5,6,7,0,1,2], target = 3
<strong>输出：</strong>-1</pre>

<p><strong>示例 3：</strong></p>

<pre>
<strong>输入：</strong>nums = [1], target = 0
<strong>输出：</strong>-1
</pre>

<p>&nbsp;</p>

<p><strong>提示：</strong></p>

<ul>
 <li><code>1 &lt;= nums.length &lt;= 5000</code></li>
 <li><code>-10<sup>4</sup> &lt;= nums[i] &lt;= 10<sup>4</sup></code></li>
 <li><code>nums</code> 中的每个值都 <strong>独一无二</strong></li>
 <li>题目数据保证 <code>nums</code> 在预先未知的某个下标上进行了旋转</li>
 <li><code>-10<sup>4</sup> &lt;= target &lt;= 10<sup>4</sup></code></li>
</ul>

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
