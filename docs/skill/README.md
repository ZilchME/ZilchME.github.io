---
title: 概述
createTime: 2026/03/02 22:48:12
permalink: /skill/
copyright:
  creation: translate
  author:
    name: Anthropic
    url: https://anthropic.com/
  license: CC-BY-4.0
  source: https://agentskills.io/home
---

> 一种简单、开放的格式，用于为 AI Agent 赋予新的能力和专业知识。

Agent Skills 是包含说明、脚本和资源的文件夹，Agent 可以发现并使用它们，从而更准确、更高效地完成任务。

## 为什么需要 Agent Skills？

Agent 的能力日益强大，但通常缺乏可靠执行实际工作所需的上下文。Skills 通过为 Agent 提供程序性知识以及可按需加载的公司、团队和用户特定上下文来解决这个问题。拥有 skills 访问权限的 Agent 可以根据当前任务扩展自身能力。

**对于技能作者**：一次构建能力，跨多个 Agent 产品部署。

**对于兼容的 Agent**：支持 skills 让最终用户能够开箱即用地赋予 Agent 新能力。

**对于团队和企业**：将组织知识封装到可移植、可版本控制的包中。

## Agent Skills 能实现什么？

* **领域专业知识**：将专业知识打包成可复用的说明，从法律审查流程到数据分析管道。
* **新能力**：赋予 Agent 新能力（例如创建演示文稿、构建 MCP 服务器、分析数据集）。
* **可重复的工作流**：将多步骤任务转化为一致且可审计的工作流。
* **互操作性**：在不同兼容 skills 的 Agent 产品之间复用同一个 skill。

## 采用情况

Agent Skills 已获得领先 AI 开发工具的支持。（包括 Claude Code、Cursor、GitHub Copilot、VS Code 等数十款产品）

## 开放发展

Agent Skills 格式最初由 [Anthropic](https://www.anthropic.com/) 开发，作为开放标准发布，已被越来越多的 Agent 产品采用。该标准欢迎更广泛生态系统的贡献。

欢迎加入 [GitHub](https://github.com/agentskills/agentskills) 或 [Discord](https://discord.gg/MKPE9g8aUy) 上的讨论！

## 快速入门

* **什么是 skills？** — 了解 skills、工作原理及其重要性
* **规范** — `SKILL.md` 文件的完整格式规范
* **添加 skills 支持** — 为您的 Agent 或工具添加 skills 支持
* **示例 skills** — 在 GitHub 上浏览示例 skills
* **参考库** — 验证 skills 并生成提示 XML
