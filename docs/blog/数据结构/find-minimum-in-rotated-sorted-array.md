---
title: 寻找旋转排序数组中的最小值
tags:
  - 数据结构
  - 二分查找
createTime: 2026/04/22 11:00:33
permalink: /blog/ovvcr4gy/
---

## 153. 寻找旋转排序数组中的最小值

已知一个长度为 <code>n</code> 的数组，预先按照升序排列，经由 <code>1</code> 到 <code>n</code> 次 <strong>旋转</strong> 后，得到输入数组。例如，原数组 <code>nums = [0,1,2,4,5,6,7]</code> 在变化后可能得到：
<ul>
	<li>若旋转 <code>4</code> 次，则可以得到 <code>[4,5,6,7,0,1,2]</code></li>
	<li>若旋转 <code>7</code> 次，则可以得到 <code>[0,1,2,4,5,6,7]</code></li>
</ul>

<p>注意，数组 <code>[a[0], a[1], a[2], ..., a[n-1]]</code> <strong>旋转一次</strong> 的结果为数组 <code>[a[n-1], a[0], a[1], a[2], ..., a[n-2]]</code> 。</p>

<p>给你一个元素值 <strong>互不相同</strong> 的数组 <code>nums</code> ，它原来是一个升序排列的数组，并按上述情形进行了多次旋转。请你找出并返回数组中的 <strong>最小元素</strong> 。</p>

<p>你必须设计一个时间复杂度为&nbsp;<code>O(log n)</code> 的算法解决此问题。</p>

<p>&nbsp;</p>

<p><strong>示例 1：</strong></p>

<pre>
<strong>输入：</strong>nums = [3,4,5,1,2]
<strong>输出：</strong>1
<strong>解释：</strong>原数组为 [1,2,3,4,5] ，旋转 3 次得到输入数组。
</pre>

<p><strong>示例 2：</strong></p>

<pre>
<strong>输入：</strong>nums = [4,5,6,7,0,1,2]
<strong>输出：</strong>0
<strong>解释：</strong>原数组为 [0,1,2,4,5,6,7] ，旋转 4 次得到输入数组。
</pre>

<p><strong>示例 3：</strong></p>

<pre>
<strong>输入：</strong>nums = [11,13,15,17]
<strong>输出：</strong>11
<strong>解释：</strong>原数组为 [11,13,15,17] ，旋转 4 次得到输入数组。
</pre>

<p>&nbsp;</p>

<p><strong>提示：</strong></p>

<ul>
	<li><code>n == nums.length</code></li>
	<li><code>1 &lt;= n &lt;= 5000</code></li>
	<li><code>-5000 &lt;= nums[i] &lt;= 5000</code></li>
	<li><code>nums</code> 中的所有整数 <strong>互不相同</strong></li>
	<li><code>nums</code> 原来是一个升序排序的数组，并进行了 <code>1</code> 至 <code>n</code> 次旋转</li>
</ul>

## 思路

判断 `nums[mid]` 和数组最小值的位置关系:

把 `nums[mid]` 与最后一个数 `nums[n−1]` 比大小：

如果 `nums[mid] > nums[n−1]`，那么可以推出以下结论：

- nums 一定被分成左右两个递增段；
- 第一段的所有元素均大于第二段的所有元素；
- `mid` 在第一段，而最小值在第二段。

此时缩短左边界

如果 `nums[mid] <= nums[n−1]`，那么 `mid` 和最小值均一定在第二段，或者 nums 就是递增数组，此时只有一段。

此时缩短右边界

### 特殊情况

常规二分初始区间为 `[0, n)`，在当前场景下，由于每次比较的对象为 `nums[n - 1]`，当最小值位于 `n - 1` 时，无论移动左边界还是右边界都会导致正确答案被排出二分区间，导致循环不变量`[left,right) 中有最小值`失效。

由于无论数组如何旋转，`n - 1` 均处于蓝色区间，可将区间设为 `[0, n - 1)`，此时仅当最小值位于 `n - 1` 时循环过程存在区别，该情况下区间中所有的数均大于 `num[n - 1]`，始终移动 `left` 最终 `left = rigth = n - 1`。

## 解题代码

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

注：由于 `mid` 始终不会等于 `n - 1` 故不需要关注此时应该移动 `left` 还是 `right` 
