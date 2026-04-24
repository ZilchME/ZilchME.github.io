---
title: 大模型推理加速：KV Cache
createTime: 2025/04/24 11:39:14
permalink: /blog/ky8eyf1y/
---

KV Cache是Transformer标配的推理加速功能，其只能用于Decoder架构的模型，这是因为 Decoder 有 Causal Mask，在推理的时候前面已经生成的字符不需要与后面的字符产生 attention，从而使得前面已经计算的 K 和 V 可以缓存起来。

**KV Cache 的核心思想**：在自回归解码时，每一步只需计算新 token 的 Query、Key、Value，而之前所有 token 的 Key 和 Value 可以直接复用，从而避免重复计算。

可以说，KV Cache 的本质是增量式的注意力计算。

## 符号定义

- 序列已生成的前缀：$x_1, x_2, \dots, x_{t-1}$，当前步输入 token $x_t$（嵌入向量）。设总序列长度为 $t$。

- 模型维度和单头注意力（为简洁，省略多头拼接，实际就是每个头独立做相同操作）：

  - 输入嵌入矩阵 $X_t \in \mathbb{R}^{t \times d_{\text{model}}}$

  - 权重矩阵 $W_Q, W_K, W_V \in \mathbb{R}^{d_{\text{model}} \times d_k}$ （假设 $d_k = d_v$）。

  - 投影后的 Query、Key、Value：
    $$
    Q_t = X_t W_Q,\quad K_t = X_t W_K,\quad V_t = X_t W_V \quad \in \mathbb{R}^{t \times d_k}
    $$

## 没有缓存的标准自注意力

在生成 $t$ 个 token 的表示时（即用前 $t$ 个 token 预测第 $t+1$ 个 token），标准缩点积注意力为：
$$
 Attention(Q_t, K_t, V_t) = \text{softmax}\!\left(\frac{Q_t K_t^T}{\sqrt{d_k}} + M_t\right) V_t
$$
其中因果掩码 $M_t$ 保证位置 $i$ 只能看到 $j \le i$（下三角为 0，上三角为 $-\infty$）。

例如，给定“天气”，模型会逐个预测剩下的字，假设接下来预测的两个字为“真好“。

- 第一步会预测”真“

![不使用 KV Cache 1](https://pic1.zhimg.com/v2-85c2415e824044db10d72f828684a190_r.jpg)

- 第二步会将”真“拼接到”天气“的后面，即新的输入为”天气真“，再预测”好“

  而在这个自回归的过程中，第二部只有红色的部分是真正需要计算的，其他部分的计算大多数是上一步已经实现过的。

![不使用 KV Cache 2](https://pic2.zhimg.com/v2-4d4fa3b3dc5a049017a0a91f9e7d1e2d_r.jpg)

## KV Cache 的增量公式推导

注意到当序列由 $X_{t-1}$ 追加一个新 token $x_t$ 时：
$$
X_t = \begin{bmatrix} X_{t-1} \\ x_t \end{bmatrix}
$$
根据 $K_t = X_t W_K$ 和 $V_t = X_t W_V$ 的线性性质：
$$
K_t = \begin{bmatrix} X_{t-1} W_K \\ x_t W_K \end{bmatrix} = \begin{bmatrix} K_{t-1} \\ k_t \end{bmatrix}, \quad
V_t = \begin{bmatrix} V_{t-1} \\ v_t \end{bmatrix}
$$
其中：

- 历史缓存 $K_{t-1}, V_{t-1} \in \mathbb{R}^{(t-1) \times d_k}$ 是第 $t-1$ 步结束后存储的 Key 和 Value。
- 当前新增的 Key 和 Value：$k_t = x_t W_K,\; v_t = x_t W_V \in \mathbb{R}^{1 \times d_k}$。

$K_{t-1}$ 和 $V_{t-1}$ 在后续步中不会改变，可以被永久缓存。

![使用 KV Cache计算](https://pic2.zhimg.com/v2-eb61b172f71c9366d5bfa4ae0a67b193_r.jpg)

计算第 $t$ 步的注意力得分（Attention Scores），我们需要将当前的查询向量 $q_t$ 与所有的键 $K_{t}$ 进行点积运算：
$$\text{Score}_t = \frac{q_t K_{t}^T}{\sqrt{d_k}} = \frac{q_t \begin{bmatrix} K_{t-1}^T & k_t^T \end{bmatrix}}{\sqrt{d_k}}$$

展开后得到一个长度为 $t$ 的行向量，代表当前 token 对历史所有 token 的注意力权重：
$$\text{Score}_t = \begin{bmatrix} \frac{q_t K_{t-1}^T}{\sqrt{d_k}} & \frac{q_t k_t^T}{\sqrt{d_k}} \end{bmatrix}$$

接着，应用 Softmax 函数进行归一化：
$$A_t = \text{softmax}(\text{Score}_t) = \begin{bmatrix} a_{t,1}, a_{t,2}, \dots, a_{t,t-1}, a_{t,t} \end{bmatrix}$$

最后，将注意力权重与完整的值矩阵 $V_{1:t}$ 相乘，得到输出 $o_t$：
$$o_t = A_t V_{t} = \begin{bmatrix} A_{t,1:t-1} & a_{t,t} \end{bmatrix} \begin{bmatrix} V_{t-1} \\ v_t \end{bmatrix}$$
$$o_t = A_{t,1:t-1} \cdot V_{t-1} + a_{t,t} \cdot v_t$$

计算完毕后，我们将当前的 $k_t$ 和 $v_t$ **追加写入（Append）**到缓存中，更新缓存状态，供第 $t+1$ 步使用：
$$\text{Cache}_K \leftarrow [ \text{Cache}_K, k_t ]$$
$$\text{Cache}_V \leftarrow [ \text{Cache}_V, v_t ]$$

## KV Cache 的显存代价

KV Cache 是以显存换计算速度的典型权衡。它的显存占用量与以下因素成正比：

- 序列长度：序列越长，缓存越大
- 模型层数：每一层 Transformer 都有独立的 KV Cache
- 隐藏层维度（hidden dim）：维度越大，每个 token 的 KV 向量越大
- 并发请求数量（batch size）：每个请求有独立的 KV Cache

以 LLaMA-2 70B 模型为例，在 4096 token 的序列长度下，单个请求的 KV Cache 就可能超过 4GB。这是大模型推理中显存瓶颈的主要来源之一，直接限制了可并发处理的请求数量。

## 思考：Attention 是否需要缓存

虽然 $Attention(Q_t, K_t, V_t)$ 本身也能增量计算，但不同于训练过程中需要并行，在推理过程中，只需要使用其最后一维 $o_t$ 计算预测结果，其他部分并不会实际参与计算，故也就不需要缓存。

这也是使用标准公式直接计算注意力效率低下的另一个原因（因为Attention的其他维度没被使用，相当于不必要的计算量）

> 文中图片转载来源：[知乎专栏](https://zhuanlan.zhihu.com/p/673923443)
