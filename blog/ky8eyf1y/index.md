---
url: /blog/ky8eyf1y/index.md
---
KV Cache是Transformer标配的推理加速功能，其只能用于Decoder架构的模型，这是因为 Decoder 有 Causal Mask，在推理的时候前面已经生成的字符不需要与后面的字符产生 attention，从而使得前面已经计算的 K 和 V 可以缓存起来。

**KV Cache 的核心思想**：在自回归解码时，每一步只需计算新 token 的 Query、Key、Value，而之前所有 token 的 Key 和 Value 可以直接复用，从而避免重复计算。

可以说，KV Cache 的本质是增量式的注意力计算。

## 符号定义

* 序列已生成的前缀：$x\_1, x\_2, \dots, x\_{t-1}$，当前步输入 token $x\_t$（嵌入向量）。设总序列长度为 $t$。

* 模型维度和单头注意力（为简洁，省略多头拼接，实际就是每个头独立做相同操作）：

  * 输入嵌入矩阵 $X\_t \in \mathbb{R}^{t \times d\_{\text{model}}}$

  * 权重矩阵 $W\_Q, W\_K, W\_V \in \mathbb{R}^{d\_{\text{model}} \times d\_k}$ （假设 $d\_k = d\_v$）。

  * 投影后的 Query、Key、Value：
    $$
    Q\_t = X\_t W\_Q,\quad K\_t = X\_t W\_K,\quad V\_t = X\_t W\_V \quad \in \mathbb{R}^{t \times d\_k}
    $$

## 没有缓存的标准自注意力

在生成 $t$ 个 token 的表示时（即用前 $t$ 个 token 预测第 $t+1$ 个 token），标准缩点积注意力为：
$$
Attention(Q\_t, K\_t, V\_t) = \text{softmax}!\left(\frac{Q\_t K\_t^T}{\sqrt{d\_k}} + M\_t\right) V\_t
$$
其中因果掩码 $M\_t$ 保证位置 $i$ 只能看到 $j \le i$（下三角为 0，上三角为 $-\infty$）。

例如，给定“天气”，模型会逐个预测剩下的字，假设接下来预测的两个字为“真好“。

* 第一步会预测”真“

![不使用 KV Cache 1](https://pic1.zhimg.com/v2-85c2415e824044db10d72f828684a190_r.jpg)

* 第二步会将”真“拼接到”天气“的后面，即新的输入为”天气真“，再预测”好“

  而在这个自回归的过程中，第二部只有红色的部分是真正需要计算的，其他部分的计算大多数是上一步已经实现过的。

![不使用 KV Cache 2](https://pic2.zhimg.com/v2-4d4fa3b3dc5a049017a0a91f9e7d1e2d_r.jpg)

## KV Cache 的增量公式推导

注意到当序列由 $X\_{t-1}$ 追加一个新 token $x\_t$ 时：
$$
X\_t = \begin{bmatrix} X\_{t-1} \ x\_t \end{bmatrix}
$$
根据 $K\_t = X\_t W\_K$ 和 $V\_t = X\_t W\_V$ 的线性性质：
$$
K\_t = \begin{bmatrix} X\_{t-1} W\_K \ x\_t W\_K \end{bmatrix} = \begin{bmatrix} K\_{t-1} \ k\_t \end{bmatrix}, \quad
V\_t = \begin{bmatrix} V\_{t-1} \ v\_t \end{bmatrix}
$$
其中：

* 历史缓存 $K\_{t-1}, V\_{t-1} \in \mathbb{R}^{(t-1) \times d\_k}$ 是第 $t-1$ 步结束后存储的 Key 和 Value。
* 当前新增的 Key 和 Value：$k\_t = x\_t W\_K,; v\_t = x\_t W\_V \in \mathbb{R}^{1 \times d\_k}$。

$K\_{t-1}$ 和 $V\_{t-1}$ 在后续步中不会改变，可以被永久缓存。

![使用 KV Cache计算](https://pic2.zhimg.com/v2-eb61b172f71c9366d5bfa4ae0a67b193_r.jpg)

计算第 $t$ 步的注意力得分（Attention Scores），我们需要将当前的查询向量 $q\_t$ 与所有的键 $K\_{t}$ 进行点积运算：
$$\text{Score}*t = \frac{q\_t K*{t}^T}{\sqrt{d\_k}} = \frac{q\_t \begin{bmatrix} K\_{t-1}^T & k\_t^T \end{bmatrix}}{\sqrt{d\_k}}$$

展开后得到一个长度为 $t$ 的行向量，代表当前 token 对历史所有 token 的注意力权重：
$$\text{Score}*t = \begin{bmatrix} \frac{q\_t K*{t-1}^T}{\sqrt{d\_k}} & \frac{q\_t k\_t^T}{\sqrt{d\_k}} \end{bmatrix}$$

接着，应用 Softmax 函数进行归一化：
$$A\_t = \text{softmax}(\text{Score}*t) = \begin{bmatrix} a*{t,1}, a\_{t,2}, \dots, a\_{t,t-1}, a\_{t,t} \end{bmatrix}$$

最后，将注意力权重与完整的值矩阵 $V\_{1:t}$ 相乘，得到输出 $o\_t$：
$$o\_t = A\_t V\_{t} = \begin{bmatrix} A\_{t,1:t-1} & a\_{t,t} \end{bmatrix} \begin{bmatrix} V\_{t-1} \ v\_t \end{bmatrix}$$
$$o\_t = A\_{t,1:t-1} \cdot V\_{t-1} + a\_{t,t} \cdot v\_t$$

计算完毕后，我们将当前的 $k\_t$ 和 $v\_t$ \*\*追加写入（Append）\*\*到缓存中，更新缓存状态，供第 $t+1$ 步使用：
$$\text{Cache}\_K \leftarrow \[ \text{Cache}\_K, k\_t ]$$
$$\text{Cache}\_V \leftarrow \[ \text{Cache}\_V, v\_t ]$$

## KV Cache 的显存代价

KV Cache 是以显存换计算速度的典型权衡。它的显存占用量与以下因素成正比：

* 序列长度：序列越长，缓存越大
* 模型层数：每一层 Transformer 都有独立的 KV Cache
* 隐藏层维度（hidden dim）：维度越大，每个 token 的 KV 向量越大
* 并发请求数量（batch size）：每个请求有独立的 KV Cache

以 LLaMA-2 70B 模型为例，在 4096 token 的序列长度下，单个请求的 KV Cache 就可能超过 4GB。这是大模型推理中显存瓶颈的主要来源之一，直接限制了可并发处理的请求数量。

## 思考：Attention 是否需要缓存

虽然 $Attention(Q\_t, K\_t, V\_t)$ 本身也能增量计算，但不同于训练过程中需要并行，在推理过程中，只需要使用其最后一维 $o\_t$ 计算预测结果，其他部分并不会实际参与计算，故也就不需要缓存。

这也是使用标准公式直接计算注意力效率低下的另一个原因（因为Attention的其他维度没被使用，相当于不必要的计算量）

> 文中图片转载来源：[知乎专栏](https://zhuanlan.zhihu.com/p/673923443)
