---
title: 快速入门
createTime: 2026/04/09 21:43:49
permalink: /skill/snuzydmv/
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

> 创建你的第一个 Agent Skill，并在 VS Code 中看到它的运行效果。

在本教程中，你将创建一个技能，让 agent 能够使用随机数生成器来掷骰子。

## 准备工作

* [VS Code](https://code.visualstudio.com/) 并安装 [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)

> [!info]
> 本教程使用 VS Code，但 Agent Skills 是一种开放格式。同样的技能可以在任何兼容的 agent 中使用，包括 Claude Code 和 OpenAI Codex。

## 创建技能

一个 skill 就是一个包含 `SKILL.md` 文件的文件夹。VS Code 默认在 `.agents/skills/` 目录下查找 skills。在你的项目中创建 `.agents/skills/roll-dice/SKILL.md` 文件：

````markdown .agents/skills/roll-dice/SKILL.md theme={null}
---
name: roll-dice
description: 使用随机数生成器掷骰子。当被要求掷一个骰子（d6、d20 等）、掷骰子或生成随机骰子结果时使用。
---

要掷一个骰子，请使用以下命令，该命令会生成一个从 1 到给定面数的随机数：

```bash
echo $((RANDOM % <sides> + 1))
```

```powershell
Get-Random -Minimum 1 -Maximum (<sides> + 1)
```

将 `<sides>` 替换为骰子的面数（例如，标准骰子为 6，d20 为 20）。
````

这样就完成了 —— 一个文件，不到 20 行。每个部分的作用如下：

* **`name`** —— skill 的简短标识符。必须与文件夹名称匹配。
* **`description`** —— 告诉 agent 何时使用这个 skill。agent 通过它来决定是否激活该 skill。
* **正文** —— 当 skill 激活时，agent 需要遵循的指令。这里，agent 被指示使用终端命令生成一个随机数，并根据用户的请求替换骰子面数。

## 尝试运行

1. 在 VS Code 中打开你的项目。
2. 打开 Copilot Chat 面板。
3. 在聊天面板底部的模式下拉菜单中，选择 **Agent** 模式。
4. 输入 `/skills` 确认 `roll-dice` 出现在列表中。如果没有出现，请检查文件是否位于项目根目录下的 `.agents/skills/roll-dice/SKILL.md`。
5. 问它：**"Roll a d20"**

agent 应该会激活 `roll-dice` 这个 skill。它可能会请求允许运行一个终端命令 —— 允许它。它会运行命令并返回一个 1 到 20 之间的随机数。

> [!info]
> 工具使用的可靠性因模型而异 —— 有些模型会严格遵循 skill 指令并一致地运行命令，而另一些模型可能会尝试自行回答。如果 agent 响应时没有运行终端命令，请尝试从模型下拉菜单中选择一个不同的模型。

## 工作原理

这是背后发生的事情：

1. **发现** —— 聊天会话开始时，agent 会扫描默认的 skill 目录并找到你的 skill。它只读取 `name` 和 `description`，刚好足够知道该 skill 何时可能有用。

2. **激活** —— 当你询问掷骰子时，agent 将你的问题与 skill 的描述进行匹配，然后将完整的 `SKILL.md` 正文加载到上下文中。

3. **执行** —— agent 遵循正文中的指令，根据你请求中的骰子面数调整终端命令。

这个过程使用了**渐进式披露**，让 agent 可以访问许多 skills，而无需预先加载所有指令。更多详情，请参见 [Skills 的工作原理](/what-are-skills#how-skills-work)。