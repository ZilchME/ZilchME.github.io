---
title: 数组中的第K个最大元素和快速排序
createTime: 2026/05/21 08:38:20
permalink: /blog/lf6ua3hc/
---

## 215. 数组中的第K个最大元素

<p>给定整数数组 <code>nums</code> 和整数 <code>k</code>，请返回数组中第 <code><strong>k</strong></code> 个最大的元素。</p>

<p>请注意，你需要找的是数组排序后的第 <code>k</code> 个最大的元素，而不是第 <code>k</code> 个不同的元素。</p>

<p>你必须设计并实现时间复杂度为 <code>O(n)</code> 的算法解决此问题。</p>

<p>&nbsp;</p>

<p><strong>示例 1:</strong></p>

<pre>
<strong>输入:</strong> <code>[3,2,1,5,6,4],</code> k = 2
<strong>输出:</strong> 5
</pre>

<p><strong>示例&nbsp;2:</strong></p>

<pre>
<strong>输入:</strong> <code>[3,2,3,1,2,4,5,5,6], </code>k = 4
<strong>输出:</strong> 4</pre>

<p>&nbsp;</p>

<p><strong>提示： </strong></p>

<ul>
 <li><code>1 &lt;= k &lt;= nums.length &lt;= 10<sup>5</sup></code></li>
 <li><code>-10<sup>4</sup>&nbsp;&lt;= nums[i] &lt;= 10<sup>4</sup></code></li>
</ul>

## 解法一：最小堆

维护 k 个元素的小顶堆，超过 k 个元素时每次弹出最小的，就能保证剩下的是最大的 k 个

```java
class Solution {
    public int findKthLargest(int[] nums, int k) {
        Queue<Integer> pq = new PriorityQueue<>();   // 将数组加入小顶堆，堆中维护当前值最大的k个数
        for(int num: nums){
            pq.offer(num);
            if(pq.size() > k){
                pq.poll();   // 堆中元素超过k个，弹出最小的那个
            }
        }
        return pq.peek();    // 最后堆顶的即为第k大的数
    }
}
```

## 解法二：快速选择

我们要找到第 `k` 个最大元素 `number`，实际上我们并不关心比它大和比它小的那些元素的具体排序。我们只希望那些比 `number` 大的元素都集中到其左侧，比它小的元素都集中到其右侧，那么 `nums[k-1]` 就是第 k 个最大元素。

这个过程其实就和 快速排序 的思想是类似的。快速排序核心思想就是每次在当前区间 `[left, right]` 中选择出一个元素 `nums[p]`，然后将区间内所有大于它的元素和所有小于它的元素都放到其两侧，然后再递归去处理两侧区间。

![image-20240220070536514.png](https://pic.leetcode.cn/1708448410-mJuphx-image-20240220070536514.png)

### 三路快速排序

快速排序的整体流程为：

1. 首先，对原数组执行一次“哨兵划分”，得到未排序的左子数组和右子数组。
2. 然后，对左子数组和右子数组分别递归执行“哨兵划分”。
3. 持续递归，直至子数组长度为 1 时终止，从而完成整个数组的排序。

#### 如何选择哨兵元素 nums[p]

这个元素最好是一个当前排序区间 **[left, right]** 范围内一个随机值。这是为了避免当我们选择边界时 **nums[left]** 或 **nums[right]**，对于已经有序的区间而出现的时间复杂度退化的情况。

#### 左右区间划分

我们的目标是将大于哨兵的元素都放到左侧，小于哨兵的元素都放到右侧，并且对于三路快排，还需要保证等于哨兵的元素在中间。我们可以对数组进行一次遍历，索引为 `idx`，维护左边界指针 `lt` 和右边界指针 `gt`

1. 如果当前元素等于哨兵元素，只移动 `idx`，此时等于哨兵的元素被维护到了 `[lt, idx)`
2. 如果当前元素大于哨兵元素，将当前元素交换分配到右侧，即和右边界指针的元素交换
   - 此时**不应该**更新 `idx`，因为交换过来的元素和哨兵的大小关系是不确定的
3. 如果当前元素小于哨兵元素，我们将等于哨兵的区间的左边界 `lt` 与 `idx`交换，等价于将区间整体移动一次

```java
int randIdx = left + rand.nextInt(right - left + 1);
int pivot = nums[randIdx];

int lt = left;
int gt = right;
int idx = left;

while (idx <= gt) {
    if (nums[idx] > pivot) {
        swap(nums, idx, gt);
        gt--;
    } else if (nums[idx] < pivot) {
        swap(nums, idx, lt);
        idx++;
        lt++;
    } else {
        idx++;
    }
}
```

循环结束时，数据被划分为三个区间：`[left, lt)`、`[lt, gt]`、`(gt, right]`

之后进一步分治：

```java
quickSort(nums, left, lt - 1);
quickSort(nums, gt + 1, right);
```

### 快排修改为快速选择

理解快排的思路后问题就很简单了，我们只关心第 `k` 大的元素所在的区间，由于只对一侧进行分治，时间复杂度可以降低到 `O(n)`

```java
class Solution {
    private static final Random rand = new Random();

    public int findKthLargest(int[] nums, int k) {
        // 第 k 大等价为排序后索引为 nums.length - k
        return quickSort(nums, 0, nums.length - 1, nums.length - k);
    }

    private int quickSort(int[] nums, int left, int right, int k) {
        if (left >= right) {
            return nums[right];
        }
        int randIdx = left + rand.nextInt(right - left + 1);
        int pivot = nums[randIdx];

        int lt = left;
        int gt = right;
        int idx = left;

        while (idx <= gt) {
            if (nums[idx] > pivot) {
                swap(nums, idx, gt);
                gt--;
            } else if (nums[idx] < pivot) {
                swap(nums, idx, lt);
                idx++;
                lt++;
            } else {
                idx++;
            }
        }
        if (k < lt) {
            return quickSort(nums, left, lt - 1, k);
        } else if (k > gt) {
            return quickSort(nums, gt + 1, right, k);
        }
        return pivot;
    }

    private void swap(int[] nums, int i, int j) {
        int tmp = nums[i];
        nums[i] = nums[j];
        nums[j] = tmp;
    }
}
```
