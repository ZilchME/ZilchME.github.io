---
title: 子区间前缀和总和的第 k 小值
tags:
  - 数据结构
  - 前缀和
  - 二分查找
  - 滑动窗口
createTime: 2026/04/25 16:03:14
permalink: /blog/kekn0l70/
---

## 子区间前缀和总和的第 k 小值

### 问题描述

给定一个长度为 $n$ 的整数序列 $a_1, a_2, \dots, a_n$。定义函数 $f(l, r)$ 如下：

$$
f(l, r) = \sum_{i=l}^{r} \left( \sum_{t=l}^{i} a_t \right)
$$

该函数表示对于区间 $[l, r]$，计算所有以 $l$ 为起点、终点分别为 $l, l+1, \dots, r$ 的子区间和的总和。

现要求在所有可能的 $\frac{n(n+1)}{2}$ 个区间 $[l, r]$（其中 $1 \le l \le r \le n$）中，按 $f(l, r)$ 的数值从小到大排序（数值相同时按出现次数计入多次），输出第 $k$ 小的 $f(l, r)$ 的值。

### 输入描述

每个测试文件均包含多组测试数据。

- 第一行输入一个整数 $T$（$1 \le T \le 10^5$），代表数据组数。
- 每组测试数据描述如下：
  - 第一行输入两个整数 $n, k$（$1 \le n \le 2 \times 10^5$，$1 \le k \le \frac{n(n+1)}{2}$）。
  - 第二行输入 $n$ 个整数 $a_1, \dots, a_n$（$0 \le a_i \le 10^6$）。

**保证**：所有测试用例中 $n$ 的总和不超过 $5 \times 10^5$。

### 输出描述

对于每组测试数据，输出一个整数，表示所有区间中第 $k$ 小的 $f(l, r)$ 的值。

## 解题思路

### 公式简化

$f(l, r) = \sum_{i=l}^r \left( \sum_{t=l}^i a_t \right)$。

为了避免重复计算，可以使用前缀和优化

令 $S_i = \sum_{t=1}^i a_t$ 为前缀和，则 $\sum_{t=l}^i a_t = S_i - S_{l-1}$，可得：

$$
f(l, r) = \sum_{i=l}^r (S_i - S_{l-1}) = \left( \sum_{i=l}^r S_i \right) - (r - l + 1) S_{l-1}
$$

令 $SS_i = \sum_{j=1}^i S_j$ 为前缀和的前缀和，带入 $f(l, r)$：

$$
f(l, r) = (SS_r - SS_{l-1}) - (r - l + 1) S_{l-1}
$$
利用这个公式，我们可以在 $O(1)$ 时间内计算任意区间的 $f(l, r)$。

### 二分答案

$n=2 \times 10^5$，直接排序所有 $O(n^2)$ 个值是不可能的

由于 $a_i \ge 0$，随着区间长度增加或包含的元素变大，$f(l, r)$ 的值具有单调性。因此，我们**二分枚举第 $k$ 小的值 $X$**。
我们需要一个函数 `count(X)`，计算有多少个区间的 $f(l, r) \le X$。如果 `count(X) >= k`，说明第 $k$ 小的值可能更小；否则说明更大。

### 滑动窗口计数

对于固定的 $l$，当 $r$ 增大时，$f(l, r)$ 是非递减的。
对于固定的 $r$，当 $l$ 减小时，$f(l, r)$ 也是非递减的。
因此，对于 `count(X)`，我们可以使用双指针：

- 遍历左端点 $l$ 从 $1$ 到 $n$。
- 右端点 $r$ 随着 $l$ 的右移也只会向右移动或保持不动（因为 $l$ 增加，$f(l, r)$ 减小，原来的 $r$ 可能可以往后挪）。
- 这样可以在 $O(n)$ 时间内统计出所有满足 $f(l, r) \le X$ 的区间个数。

### 解题代码（ACM模式）

::: code-tabs
@tab Java

```java
import java.io.*;
import java.util.*;

public class Main {
    static long[] s;
    static long[] ss;

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder sb = new StringBuilder();

        int T = Integer.parseInt(br.readLine());
        while (T-- > 0) {
            StringTokenizer st = new StringTokenizer(br.readLine());
            int n = Integer.parseInt(st.nextToken());
            long k = Long.parseLong(st.nextToken());

            s = new long[n + 1];
            ss = new long[n + 1];
            st = new StringTokenizer(br.readLine());
            for (int i = 0; i < n; i++) {
                long a_i = Long.parseLong(st.nextToken());
                s[i + 1] = s[i] + a_i;
                ss[i + 1] = ss[i] + s[i + 1];
            }

            long low = 0;
            long high = fun(1, n);

            while (low < high) {
                long mid = low + (high - low) / 2;
                if (countLessEqual(mid, n) >= k) {
                    high = mid;
                } else {
                    low = mid + 1;
                }
            }
            sb.append(low).append("\n");
        }
        System.out.print(sb);
    }

    /**
     * 使用双指针统计 f(l, r) <= limit 的区间数量
     */
    static long countLessEqual(long limit, int n) {
        long count = 0;
        int r = 1;
        for (int l = 1; l <= n; l++) {
            // 确保 r 不小于左边界
            if (r < l) r = l;
            while (r <= n && fun(l, r) <= limit) {
                r++;
            }
            count += r - l;
        }
        return count;
    }

    static long fun(int l, int r) {
        return ss[r] - ss[l - 1] - (long) (r - l + 1) * s[l - 1];
    }
}
```

:::

- 时间复杂度：$O(n \log(\text{max\_val}))$，其中 $\text{max\_val}$ 为 $f(1, n)$ 的最大值），此题中约为 $2 \times 10^{16}$。

> 思考：`while (r <= n && fun(l, r) <= limit) { r++; }` 处只能保证 `r` 为第一个不合法位置，为什么 `r` 不用回退？
>
> 回答：即使 `fun(l + 1, r)` 依然不能小于 `limit`，`fun(l + 1, r - 1)` 也是一定小于 `limit` 的，最终退出循环的状态并不会有区别。
