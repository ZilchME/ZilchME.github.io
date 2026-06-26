---
url: /blog/p469vbx4/index.md
---
## 51. N 皇后

## 思路

由于不同的皇后各自不能在同一行、同一列，即每一行、每一列均只能有一个皇后，记录每行的皇后放在哪一列，可以得到一个 \[0,n−1] 的全排列问题。

对于皇后斜方位攻击的判别，在同一斜线的皇后，x、y坐标只和或者之差相等。可以分别用两个长度为 `2 * n - 1` 的数组记录斜线是否被占用。

## 解题代码

::: code-tabs
@tab Java

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

:::
