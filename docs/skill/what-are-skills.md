---
title: 什么是 Skills？
createTime: 2026/04/09 21:28:38
permalink: /skill/9vg5lgc2/
sourceTitle: Agent Skills Documentation
sourceUrl: https://agentskills.org/
sourceRepo: https://github.com/agentskills/agentskills
sourceAuthor: Agent Skills contributors
sourceLicense: 见原始项目说明
translation: zh-CN
translationBy: zilch
translationDate: 2026-04-11
translationNote: 本文为转载汉化，术语与格式可能有调整，具体以原文为准。
---

> [!info]
> 转载与汉化声明：本文基于 Agent Skills 官方文档内容整理翻译。原始来源：https://agentskills.org/ ，项目仓库：https://github.com/agentskills/agentskills 。版权与许可归原作者或项目方所有，本文仅作学习与技术交流；如与原文有差异，请以原文为准。

> Agent Skills 是一种轻量级、开放的格式，用于通过专业知识和工作流程扩展 AI Agent 的能力。

核心上，一个 skill 就是一个包含 `SKILL.md` 文件的文件夹。该文件包含元数据（至少包括 `name` 和 `description`）以及指导 Agent 如何执行特定任务的说明。Skills 还可以包含脚本、模板和参考资料。

```directory
my-skill/
├── SKILL.md          # 必需：说明 + 元数据
├── scripts/          # 可选：可执行代码
├── references/       # 可选：文档
└── assets/           # 可选：模板、资源
```

## Skills 的工作原理

Skills 使用**渐进式披露**来高效管理上下文：

1. **发现阶段**：启动时，Agent 只加载每个可用 skill 的名称和描述，刚好足以知道何时该 skill 可能相关。

2. **激活阶段**：当任务匹配某个 skill 的描述时，Agent 将完整的 `SKILL.md` 说明读入上下文。

3. **执行阶段**：Agent 按照说明操作，根据需要选择性加载引用的文件或执行打包的代码。

这种方式既保持了 Agent 的轻量高效，又能在需要时提供更多上下文。

## SKILL.md 文件

每个 skill 都以一个包含 YAML 前置数据和 Markdown 说明的 `SKILL.md` 文件开始：

```md
---
name: pdf-processing
description: 提取 PDF 文本、填写表单、合并文件。处理 PDF 时使用。
---

# PDF 处理

## 何时使用本技能
当用户需要处理 PDF 文件时使用本技能……

## 如何提取文本
1. 使用 pdfplumber 进行文本提取……

## 如何填写表单
……
```

`SKILL.md` 顶部需要包含以下必填前置数据：

* `name`：简短的标识符
* `description`：何时使用本技能

Markdown 正文包含实际的说明，对结构或内容没有特定限制。

这种简单格式有几个关键优势：

* **自文档化**：skill 的作者或用户可以阅读 `SKILL.md` 并理解其功能，使 skills 易于审查和改进。

* **可扩展**：skills 的复杂度可以从纯文本说明到可执行代码、资产和模板，范围广泛。

* **可移植**：skills 只是文件，因此易于编辑、版本管理和共享。
