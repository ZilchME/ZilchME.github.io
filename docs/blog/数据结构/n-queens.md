---
title: N 皇后
tags:
  - 数据结构
  - 回溯
createTime: 2026/04/20 15:19:17
permalink: /blog/p469vbx4/
---
## 51. N 皇后

<p>按照国际象棋的规则，皇后可以攻击与之处在同一行或同一列或同一斜线上的棋子。</p>

<p><strong>n&nbsp;皇后问题</strong> 研究的是如何将 <code>n</code>&nbsp;个皇后放置在 <code>n×n</code> 的棋盘上，并且使皇后彼此之间不能相互攻击。</p>

<p>给你一个整数 <code>n</code> ，返回所有不同的&nbsp;<strong>n<em>&nbsp;</em>皇后问题</strong> 的解决方案。</p>

<div class="original__bRMd">
<div>
<p>每一种解法包含一个不同的&nbsp;<strong>n 皇后问题</strong> 的棋子放置方案，该方案中 <code>'Q'</code> 和 <code>'.'</code> 分别代表了皇后和空位。</p>

<p>&nbsp;</p>

<p><strong>示例 1：</strong></p>
<img alt="" src="https://assets.leetcode.com/uploads/2020/11/13/queens.jpg" style="width: 600px; height: 268px;" />
<pre>
<strong>输入：</strong>n = 4
<strong>输出：</strong>[[".Q..","...Q","Q...","..Q."],["..Q.","Q...","...Q",".Q.."]]
<strong>解释：</strong>如上图所示，4 皇后问题存在两个不同的解法。
</pre>

<p><strong>示例 2：</strong></p>

<pre>
<strong>输入：</strong>n = 1
<strong>输出：</strong>[["Q"]]
</pre>

<p>&nbsp;</p>

<p><strong>提示：</strong></p>

<ul>
 <li><code>1 &lt;= n &lt;= 9</code></li>
</ul>
</div>
</div>

## 思路

由于不同的皇后各自不能在同一行、同一列，即每一行、每一列均只能有一个皇后，记录每行的皇后放在哪一列，可以得到一个 [0,n−1] 的全排列问题。

对于皇后斜方位攻击的判别，在同一斜线的皇后，x、y坐标只和或者之差相等。可以分别用两个长度为 `2 * n - 1` 的数组记录斜线是否被占用。

## 解题代码

```java
class Solution {
    public List<List<String>> solveNQueens(int n) {
        boolean[] visited = new boolean[n];
        boolean[] diag1 = new boolean[n * 2 - 1];
        boolean[] diag2 = new boolean[n * 2 - 1];
        int[] queens = new int[n];
        List<List<String>> result = new ArrayList<>();
        dfs(0, queens, visited, diag1, diag2, result);
        return result;
    }

    public void dfs(int idx, int[] queens, boolean[] visited, boolean[] diag1, boolean[] diag2,
            List<List<String>> result) {
        int n = queens.length;
        if (idx == n) {
            List<String> board = new ArrayList<>(n);
            for (int queen : queens) {
                char[] rowChars = new char[n];
                Arrays.fill(rowChars, '.');
                rowChars[queen] = 'Q';
                board.add(new String(rowChars));
            }
            result.add(board);
            return;
        }
        for (int i = 0; i < n; i++) {
            int diag1Idx = i + idx;
            int diag2Idx = i - idx + n - 1;
            if (!visited[i] && !diag1[diag1Idx] && !diag2[diag2Idx]) {
                visited[i] = diag1[diag1Idx] = diag2[diag2Idx] = true;
                queens[idx] = i;
                dfs(idx + 1, queens, visited, diag1, diag2, result);
                visited[i] = diag1[diag1Idx] = diag2[diag2Idx] = false;
            }
        }
    }
}
```
