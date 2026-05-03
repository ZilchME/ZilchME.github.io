---
title: 如何为你的 Agent 添加 Skills 支持
createTime: 2026/04/11 14:49:39
permalink: /skill/sm73y091/
copyright:
  creation: translate
  author:
    name: Anthropic
    url: https://anthropic.com/
  license: CC-BY-4.0
  source: https://agentskills.io/client-implementation/adding-skills-support
---

> 一份面向 AI Agent 或开发工具的 Agent Skills 接入指南。

本文将带你完成 Agent Skills 支持的完整接入流程：发现技能、把技能信息告知模型、在需要时加载技能内容到上下文，并在会话期间持续保持这些内容有效。

无论你的 Agent 架构如何，核心集成思路都相同。实现细节通常取决于两个因素：

- **技能存放在哪里？** 本地运行的 Agent 可以直接扫描用户文件系统中的技能目录；云端托管或沙箱环境中的 Agent 则需要替代发现机制，例如 API、远程注册中心或内置资产。
- **模型如何访问技能内容？** 如果模型具备读文件能力，它可以直接读取 `SKILL.md`；否则你需要提供专用工具，或在提示词中以程序方式注入技能内容。

本文会标注这些差异出现的位置。你不必覆盖所有场景，只需选择与你的 Agent 最匹配的一条路径。

**前置条件**：熟悉 [Agent Skills 规范](/specification)，该规范定义了 `SKILL.md` 的文件格式、frontmatter 字段与目录约定。

## 核心原则：渐进式披露

所有兼容 Skills 的 Agent 都遵循相同的三层加载策略：

| 层级 | 加载内容 | 时机 | Token 成本 |
| --- | --- | --- | --- |
| 1. 目录（Catalog） | 名称 + 描述 | 会话开始 | 每个技能约 50-100 token |
| 2. 指令（Instructions） | 完整 `SKILL.md` 正文 | 技能被激活时 | 建议小于 5000 token |
| 3. 资源（Resources） | 脚本、参考文档、资产 | 指令引用到它们时 | 视情况而定 |

模型从一开始就能看到技能目录，因此知道可用技能有哪些。当它判断某个技能相关时，再加载完整指令。如果指令又引用了支持文件，模型再按需逐个读取。

这样可以在保持基础上下文精简的同时，按需引入专业知识。即使安装了 20 个技能，也不必在起始上下文中一次性付出 20 份完整指令的 token 成本。

## 步骤 1：发现技能

在会话启动时，扫描所有可用技能并加载元数据。

### 扫描哪些目录

需要扫描哪些目录，取决于你的 Agent 运行环境。大多数本地 Agent 至少会扫描两个作用域：

- **项目级**（相对工作目录）：项目或仓库专用技能。
- **用户级**（相对用户主目录）：该用户跨项目可复用的技能。

也可以有其它作用域，例如由管理员下发的组织级技能，或 Agent 自带技能。具体范围由你的部署模型决定。

在每个作用域内，建议同时扫描 **客户端专用目录** 与 **`.agents/skills/` 约定目录**：

| 作用域 | 路径 | 目的 |
| --- | --- | --- |
| Project | `<project>/.<your-client>/skills/` | 你的客户端原生位置 |
| Project | `<project>/.agents/skills/` | 跨客户端互操作 |
| User | `~/.<your-client>/skills/` | 你的客户端原生位置 |
| User | `~/.agents/skills/` | 跨客户端互操作 |

`.agents/skills/` 已逐渐成为跨客户端共享技能的通用约定。虽然 Agent Skills 规范没有强制规定技能目录必须放在哪里（它只规定目录内结构），但支持扫描 `.agents/skills/` 可以让不同客户端安装的兼容技能彼此可见。

::: note
有些实现也会为了兼容性扫描 `.claude/skills/`（项目级与用户级）。其他常见附加位置包括：向上追溯到 git 根目录的祖先路径（适合 monorepo）、[XDG](https://specifications.freedesktop.org/basedir-spec/latest/) 配置目录、以及用户自定义路径。
:::

### 扫描目标是什么

在每个技能目录中，查找 **包含文件名严格为 `SKILL.md` 的子目录**：

::: file-tree

- ~/.agents/skills
  - pdf-processing
    - SKILL.md          ← 已发现
    - scripts
      - extract.py
  - data-analysis
    - SKILL.md          ← 已发现
  - README.md             ← 忽略（不是技能目录）

:::

实用扫描规则：

- 跳过不会包含技能的目录，如 `.git/`、`node_modules/`。
- 可选遵循 `.gitignore`，避免扫描构建产物。
- 设置合理边界（如最大深度 4-6 层、最多 2000 个目录）防止大目录树失控扫描。

### 处理同名冲突

当两个技能拥有相同 `name` 时，应用确定性的优先级规则。

跨现有实现的通用约定是：**项目级技能覆盖用户级技能**。

同一作用域内如果重名（例如 `<project>/.agents/skills/` 与 `<project>/.<your-client>/skills/` 下都存在 `code-review`），先发现或后发现都可以，但请固定一种策略并保持一致。发生冲突时建议记录 warning，告知用户哪个技能被遮蔽。

### 信任与安全

项目级技能来自当前仓库，而仓库可能不可信（例如刚 clone 的开源项目）。建议对项目级技能加载增加信任门控：仅当用户将项目标记为可信时才加载，避免不可信仓库悄悄向 Agent 上下文注入指令。

### 云端托管与沙箱 Agent

如果 Agent 运行在容器或远程服务器，通常无法访问用户本地文件系统。此时不同作用域需要不同发现方式：

- **项目级技能**：通常最简单。如果 Agent 在沙箱中操作克隆仓库，项目技能会随代码一起进入环境，可直接扫描仓库目录。
- **用户级/组织级技能**：通常不在沙箱里。你需要从外部来源注入，例如克隆配置仓库、在设置里接收技能 URL 或技能包、或通过 Web UI 让用户上传技能目录。
- **内置技能**：可打包为部署产物中的静态资源，在每个会话中都可用。

一旦技能可被 Agent 获取，后续生命周期（解析、披露、激活）与本地场景一致。

## 步骤 2：解析 `SKILL.md`

对每个发现到的 `SKILL.md`，提取元数据与正文。

### 提取 Frontmatter

`SKILL.md` 包含两部分：`---` 包裹的 YAML frontmatter，以及其后的 Markdown 正文。解析步骤：

1. 在文件开头找到起始 `---`，并找到其后的结束 `---`。
2. 解析其中 YAML，提取必需字段 `name`、`description`，以及可选字段。
3. 结束 `---` 之后的内容（去除首尾空白）即技能正文。

完整字段约束见 [规范](/specification)。

### 处理格式不规范的 YAML

来自其他客户端生态的技能文件，可能包含“严格意义上不合法但某些解析器可接受”的 YAML。最常见问题是冒号值未加引号：

```yaml
# 严格 YAML 下不合法：冒号会破坏解析
description: Use this skill when: the user asks about PDFs
```

可考虑加入回退机制：为这类值自动补引号，或改写为 YAML 块标量后重试，以较小代价提升跨客户端兼容性。

### 宽松校验策略

建议“尽量加载，必要时报错”：

- `name` 与父目录名不一致：告警，但继续加载。
- `name` 超过 64 字符：告警，但继续加载。
- `description` 缺失或为空：跳过该技能并记录错误（描述对披露至关重要）。
- YAML 完全不可解析：跳过该技能并记录错误。

请记录诊断信息，便于在调试命令、日志或 UI 中展示；不要因为外观类问题阻塞整体加载。

::: note
[规范](/specification) 对 `name` 有严格限制（需匹配父目录、字符集、长度等）。上面的“宽松校验”是为了更好兼容其它客户端来源技能而有意放宽。
:::

### 需要存储哪些字段

每个技能记录至少包含以下三项：

| 字段 | 说明 |
| --- | --- |
| `name` | 来自 frontmatter |
| `description` | 来自 frontmatter |
| `location` | `SKILL.md` 绝对路径 |

建议以 `name` 为键存入内存映射，便于激活时快速查找。

正文（frontmatter 后的 markdown）可选择在发现阶段缓存，也可在激活阶段按 `location` 实时读取。前者激活更快，后者更省内存且可读取到文件的最新变更。

技能基础目录（即 `location` 的父目录）将在后续用于解析相对路径和枚举资源，可按需从 `location` 推导。

## 步骤 3：向模型披露可用技能

在不加载完整内容的情况下告诉模型有哪些技能。这是渐进式披露的第 1 层。

### 构建技能目录

对每个发现到的技能，向模型提供 `name`、`description`，可选 `location`（`SKILL.md` 路径）。结构格式可按你的技术栈选择：XML、JSON、项目符号列表都可以。

```xml
<available_skills>
  <skill>
    <name>pdf-processing</name>
    <description>Extract PDF text, fill forms, merge files. Use when handling PDFs.</description>
    <location>/home/user/.agents/skills/pdf-processing/SKILL.md</location>
  </skill>
  <skill>
    <name>data-analysis</name>
    <description>Analyze datasets, generate charts, and create summary reports.</description>
    <location>/home/user/project/.agents/skills/data-analysis/SKILL.md</location>
  </skill>
</available_skills>
```

`location` 主要有两种作用：

- 支持基于文件读取的激活（见步骤 4）。
- 给模型提供解析相对路径的基准目录（如 `scripts/evaluate.py`）。

如果你的专用激活工具在返回结果里已包含技能目录路径（见步骤 4 的“结构化包裹”），目录中可省略 `location`。

每个技能大约只增加 50-100 token，因此即使有几十个技能，目录成本仍较低。

### 把目录放在哪里

常见两种方式：

**系统提示词中的专门段落**：在系统提示中加入目录与简短使用说明。最直接、适配广，适用于具备读文件工具的模型。

**工具描述中内嵌目录**：把目录写进专用技能激活工具的描述中（见步骤 4）。这样系统提示更干净，且发现与激活天然绑定。

两者都可行。前者更简单，后者在有专用工具时更清晰。

### 行为指令

在目录旁加入简短说明，告诉模型何时、如何使用技能。文案取决于你的激活机制：

**若模型通过读文件激活技能：**

```text
The following skills provide specialized instructions for specific tasks.
When a task matches a skill's description, use your file-read tool to load
the SKILL.md at the listed location before proceeding.
When a skill references relative paths, resolve them against the skill's
directory (the parent of SKILL.md) and use absolute paths in tool calls.
```

**若模型通过专用工具激活技能：**

```text
The following skills provide specialized instructions for specific tasks.
When a task matches a skill's description, call the activate_skill tool
with the skill's name to load its full instructions.
```

保持简洁即可。目标是让模型知道“有技能可用”以及“如何加载”，具体细节由技能正文承载。

### 过滤

有些技能应从目录中排除，常见原因：

- 用户在设置中禁用了该技能。
- 权限系统拒绝访问该技能。
- 技能声明不允许模型自动调用（如 `disable-model-invocation` 标记）。

建议**彻底隐藏**被过滤技能，而不是展示后再在激活时拦截。否则模型会浪费回合尝试加载不可用技能。

### 当没有可用技能时

如果未发现任何技能，应完全省略目录与行为指令。不要输出空目录块，也不要注册一个没有可选项的技能工具，以免干扰模型判断。

## 步骤 4：激活技能

当模型或用户选定某个技能时，将完整技能指令注入当前对话上下文。这是渐进式披露的第 2 层。

### 模型驱动激活

大多数实现依赖模型自身判断来激活技能，而不是在框架层做关键词匹配。模型先读取步骤 3 的目录，再判断当前任务是否相关，并加载技能。

常见两种实现：

**文件读取激活**：模型用通用读文件工具读取目录中的 `SKILL.md` 路径。无需额外基础设施，适合模型可访问文件系统的场景。

**专用工具激活**：注册一个工具（如 `activate_skill`），传入技能名返回内容。该方式在模型无法直接读文件时是必需的，在可读文件场景也有价值：

- 可控制返回内容格式（保留或去掉 frontmatter）。
- 可用结构化标签包裹，便于上下文管理识别。
- 可附带列出技能资源（如 `references/*`）。
- 可统一做权限控制或用户确认。
- 可统计激活数据用于分析。

::: tip
若使用专用激活工具，建议将 `name` 参数限制为有效技能名集合（例如 schema enum），减少模型幻觉出不存在技能名的风险。若无可用技能，则不要注册该工具。
:::

### 用户显式激活

除了模型自动判断，也应支持用户直接激活技能。常见做法是 slash 指令或 mention 语法（如 `/skill-name`、`$skill-name`），由外层框架拦截后完成技能注入。核心点是：无需模型先发起激活动作，用户可直接触发。

输入联想（用户输入时列出可用技能）也能提升可发现性。

### 模型实际接收到的内容

激活后模型会收到技能指令，通常有两种形式：

**完整文件**：包含 YAML frontmatter 与正文。文件读取激活天然如此；专用工具也可以这么返回。frontmatter 中某些字段（例如 [`compatibility`](/specification#compatibility-field)）在执行时可能有参考价值。

**仅正文（剥离 frontmatter）**：由框架先解析并去掉 frontmatter，仅返回 markdown 指令。许多使用专用激活工具的实现采用这种方式。

两种方式都能工作。

### 结构化包裹

如果使用专用激活工具，建议给技能内容加可识别标签，例如：

```xml
<skill_content name="pdf-processing">
# PDF Processing

## When to use this skill
Use this skill when the user needs to work with PDF files...

[rest of SKILL.md body]

Skill directory: /home/user/.agents/skills/pdf-processing
Relative paths in this skill are relative to the skill directory.

<skill_resources>
  <file>scripts/extract.py</file>
  <file>scripts/merge.py</file>
  <file>references/pdf-spec-summary.md</file>
</skill_resources>
</skill_content>
```

这样做的好处：

- 模型能清晰区分“技能指令”与普通对话内容。
- 框架在上下文压缩时可识别并保留技能块。
- 能把可用资源列表展示给模型，但不必预读全部资源。

### 列出绑定资源

专用激活工具可在返回技能内容时枚举技能目录中的脚本、参考文档和资产，但**不应主动读取这些文件**。模型应在技能指令引用时再按需读取。

如果技能目录很大，建议限制返回数量，并标注“列表可能不完整”。

### 权限白名单

若 Agent 的文件访问有权限门控，建议将技能目录加入白名单，允许模型直接读取技能资源，避免每读一个脚本都弹确认框，影响技能工作流。

## 步骤 5：在会话中持续管理技能上下文

技能内容进入上下文后，需要保证在整个会话期间仍然有效。

### 防止上下文压缩丢失技能内容

若 Agent 会在上下文窗口接近上限时裁剪或摘要旧消息，请**将技能内容排除在裁剪之外**。技能指令属于长期行为指导，一旦中途丢失，性能会悄悄下降且难以察觉。

常见做法：

- 给技能工具输出打“受保护”标记，裁剪算法跳过。
- 借助步骤 4 的结构化标签识别并保留技能内容。

### 去重激活

可记录当前会话已激活的技能。如果模型或用户重复请求同一技能，可以跳过二次注入，避免上下文出现重复指令。

### 子 Agent 委派（可选）

这是部分客户端支持的高级模式。不是把技能注入主会话，而是把技能放到独立子 Agent 会话中执行：子 Agent 接收技能指令并完成任务，再把结果摘要返回主会话。

当技能流程较复杂、需要专注执行环境时，这种模式会更有优势。
