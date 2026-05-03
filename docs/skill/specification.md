---
title: 规范说明
createTime: 2026/04/09 21:41:02
permalink: /skill/7hxn2o1o/
copyright:
  creation: translate
  author:
    name: Anthropic
    url: https://anthropic.com/
  license: CC-BY-4.0
  source: https://agentskills.io/specification
---

> Agent Skills 的完整格式规范。

## 目录结构

一个 skill 是一个目录，至少包含一个 `SKILL.md` 文件：

::: file-tree

- skill-name
  - SKILL.md          # 必需：元数据 + 说明
  - scripts/          # 可选：可执行代码
  - references/       # 可选：文档
  - assets/           # 可选：模板、资源
  - ...               # 任何其他文件或目录

:::

## `SKILL.md` 格式

`SKILL.md` 文件必须包含 YAML 前置数据，后跟 Markdown 内容。

### 前置数据字段

| 字段               | 必需   | 约束 |
| ----------------- | ------ | --- |
| `name`            | 是     | 最多 64 字符。仅限小写字母、数字和连字符。不能以连字符开头或结尾。 |
| `description`     | 是     | 最多 1024 字符。非空。描述 skill 的功能及使用时机。 |
| `license`         | 否     | 许可证名称或对捆绑许可证文件的引用。 |
| `compatibility`   | 否     | 最多 500 字符。指明环境要求（目标产品、系统包、网络访问等）。 |
| `metadata`        | 否     | 任意键值对，用于附加元数据。 |
| `allowed-tools`   | 否     | 空格分隔的列表，列出 skill 可使用的预批准工具。（实验性） |

**最小示例：**

```markdown
---
name: skill-name
description: 描述该 skill 的功能及使用时机。
---
```

**包含可选字段的示例：**

```markdown
---
name: pdf-processing
description: 提取 PDF 文本、填写表单、合并文件。处理 PDF 时使用。
license: Apache-2.0
metadata:
  author: example-org
  version: "1.0"
---
```

#### `name` 字段

必需的 `name` 字段：

- 长度必须为 1-64 字符
- 只能包含 Unicode 小写字母数字字符（`a-z`）和连字符（`-`）
- 不能以连字符开头或结尾
- 不能包含连续的连字符（`--`）
- 必须与父目录名称匹配

**有效示例：**

```yaml
name: pdf-processing
```

```yaml
name: data-analysis
```

```yaml
name: code-review
```

**无效示例：**

```yaml
name: PDF-Processing  # 不允许大写字母
```

```yaml
name: -pdf  # 不能以连字符开头
```

```yaml
name: pdf--processing  # 不允许连续连字符
```

#### `description` 字段

必需的 `description` 字段：

- 长度必须为 1-1024 字符
- 应同时描述 skill 的功能和使用时机
- 应包含帮助 Agent 识别相关任务的关键词

**好的示例：**

```yaml
description: 从 PDF 文件中提取文本和表格，填写 PDF 表单，合并多个 PDF。处理 PDF 文档或用户提及 PDF、表单、文档提取时使用。
```

**不好的示例：**

```yaml
description: 处理 PDF。
```

#### `license` 字段

可选的 `license` 字段：

- 指定 skill 所适用的许可证
- 建议保持简短（许可证名称或捆绑的许可证文件名）

**示例：**

```yaml
license: 专有。详见 LICENSE.txt
```

#### `compatibility` 字段

可选的 `compatibility` 字段：

- 如果提供，长度必须为 1-500 字符
- 仅当 skill 有特定环境要求时才应包含
- 可以指明目标产品、所需的系统包、网络访问需求等

**示例：**

```yaml
compatibility: 为 Claude Code（或类似产品）设计
```

```yaml
compatibility: 需要 git、docker、jq 和互联网访问
```

```yaml
compatibility: 需要 Python 3.14+ 和 uv
```

> 大多数 skill 不需要 `compatibility` 字段。

#### `metadata` 字段

可选的 `metadata` 字段：

- 从字符串键到字符串值的映射
- 客户端可用此存储 Agent Skills 规范未定义的其他属性
- 建议使用合理唯一的键名以避免意外冲突

**示例：**

```yaml
metadata:
  author: example-org
  version: "1.0"
```

#### `allowed-tools` 字段

可选的 `allowed-tools` 字段：

- 空格分隔的列表，列出预批准可运行的工具
- 实验性。不同 Agent 实现对此字段的支持可能不同

**示例：**

```yaml
allowed-tools: Bash(git:*) Bash(jq:*) Read
```

### 正文内容

前置数据之后的 Markdown 正文包含 skill 说明。没有格式限制。编写任何有助于 Agent 有效执行任务的内容即可。

建议包含的部分：

- 逐步说明
- 输入和输出示例
- 常见边界情况

注意，一旦 Agent 决定激活 skill，它将加载整个文件。考虑将较长的 `SKILL.md` 内容拆分到引用的文件中。

## 可选目录

### `scripts/`

包含 Agent 可以运行的可执行代码。脚本应当：

- 自包含或清晰记录依赖
- 包含有用的错误信息
- 优雅地处理边界情况

支持的语言取决于 Agent 实现。常见选项包括 Python、Bash 和 JavaScript。

### `references/`

包含 Agent 在需要时可以阅读的附加文档：

- `REFERENCE.md` - 详细的技术参考
- `FORMS.md` - 表单模板或结构化数据格式
- 领域特定文件（`finance.md`、`legal.md` 等）

保持单个参考文件聚焦。Agent 按需加载这些文件，因此较小的文件意味着更少的上下文使用。

### `assets/`

包含静态资源：

- 模板（文档模板、配置模板）
- 图片（图表、示例）
- 数据文件（查找表、模式）

## 渐进式披露

Skills 应结构化以高效使用上下文：

1. **元数据**（约 100 tokens）：所有 skill 的 `name` 和 `description` 字段在启动时加载
2. **说明**（建议 < 5000 tokens）：skill 激活时加载完整的 `SKILL.md` 正文
3. **资源**（按需）：仅在需要时加载文件（如 `scripts/`、`references/` 或 `assets/` 中的文件）

保持主 `SKILL.md` 在 500 行以内。将详细的参考资料移到单独的文件中。

## 文件引用

当引用 skill 中的其他文件时，使用相对于 skill 根目录的路径：

```markdown
详见[参考指南](references/REFERENCE.md)。

运行提取脚本：
scripts/extract.py
```

保持文件引用相对于 `SKILL.md` 深度不超过一层。避免深度嵌套的引用链。

## 验证

使用 [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) 参考库来验证你的 skill：

```bash
skills-ref validate ./my-skill
```

这会检查你的 `SKILL.md` 前置数据是否有效，并遵循所有命名约定。
