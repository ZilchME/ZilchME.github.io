---
url: /blog/emr8nmsj/index.md
---
## 按位与闭包的最大基数

### 问题描述

给定一个初始长度为 $n$ 的数组 $a$。你可以进行任意次（包括零次）如下操作：

* 选择两个下标 $i, j$（满足 $1 \le i, j \le m$，其中 $m$ 为当前数组长度）；
* 计算 $v = a\_i \ &\ a\_j$（其中 `&` 表示按位与运算）；
* 将结果 $v$ 追加到数组末尾，使数组长度增加 1。

求在进行了任意次操作后，数组中最多能出现多少个**不同**的元素。

### 输入描述

* 第一行输入一个整数 $T$（$1 \le T \le 10^4$），表示数据组数。
* 对于每组数据：
  * 第一行输入一个整数 $n$（$1 \le n \le 2 \times 10^5$）。
  * 第二行输入 $n$ 个整数 $a\_1, a\_2, \dots, a\_n$（$0 \le a\_i \le 1023$）。
* 保证所有测试数据的 $n$ 之和不超过 $2 \times 10^5$。

## 思路

### 问题定义

设 $S\_0 = {a\_1, a\_2, \dots, a\_n}$ 为初始整数集合。定义操作 $\mathcal{O}(x, y) = x \ &\ y$，其中 $&$ 为按位与运算。
我们需要构建一个序列集合 $S\_0 \subseteq S\_1 \subseteq S\_2 \subseteq \dots$，其中 $S\_{k+1} = S\_k \cup {x \ &\ y \mid x, y \in S\_k}$。
求该序列的极限集合 $S\_{\infty}$ 的基数（即不同元素的个数），记为 $|S\_{\infty}|$。

### 实现思路

值域限制在 10 位二进制数范围内（$0 \le a\_i \le 2^{10} - 1$），故可以通过数组维护一个固定大小为 `1024` 的集合

1. 遍历 $S\_0 = {a\_1, a\_2, \dots, a\_n}$ 中每一个数 $a\_i$
2. 将 $a\_i$ 与集合中的每一个数按位相与，将 $a\_i$ 本身以及新生成的数加入集合。
3. 最终的集合大小为所求结果

上述循环可以保证穷举过所有不重复元素的任意组合，不会出现遗漏

**优化点：** $a\_i$ 可能由之前的数组合得到过，此时可以跳过

## 解题代码（AMC模式）

::: code-tabs
@tab Java

```java
import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));

        int t = Integer.parseInt(br.readLine());
        StringBuilder sb = new StringBuilder();
        
        boolean[] reachable = new boolean[1024];
        int[] reachableValues = new int[1024];

        while (t-- > 0) {
            int n = Integer.parseInt(br.readLine());
            StringTokenizer st = new StringTokenizer(br.readLine());

            Arrays.fill(reachable, false);
            int numReachable = 0;
            
            for (int i = 0; i < n; i++) {
                int val = Integer.parseInt(st.nextToken());

                if (reachable[val]) continue;
                
                // 将当前值与已经发现的所有可达值进行按位与
                int currentLimit = numReachable;
                for (int j = 0; j < currentLimit; j++) {
                    int next = reachableValues[j] & val;
                    if (!reachable[next]) {
                        reachable[next] = true;
                        reachableValues[numReachable++] = next;
                    }
                }
                reachable[val] = true;
                reachableValues[numReachable++] = val;
            }
            sb.append(numReachable).append("\n");
        }
        System.out.print(sb);
    }
}
```

:::

* **时间复杂度**：$O(\sum \min(n, V) \times V)$，其中 $V = 1024$。对于每个测试用例，我们处理 $n$ 个数。只有尚未被当前闭包覆盖的数才会执行内层循环（最多执行 $V$ 次）。内层循环最多运行 $V$ 次。
* **空间复杂度**：$O(V)$，用于存储数据以及记录数值是否出现。
