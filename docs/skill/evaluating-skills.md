---
title: 评估技能输出质量
createTime: 2026/04/09 21:46:10
permalink: /skill/u9iq3075/
copyright:
  creation: translate
  author:
    name: Anthropic
    url: https://anthropic.com/
  license: CC-BY-4.0
  source: https://agentskills.io/skill-creation/evaluating-skills
---

> 如何通过评测驱动迭代，验证你的技能是否能稳定产出高质量结果。

你写好了一个技能，手动测一条 prompt 也许看起来没问题。但它是否在不同表达、边界场景下都可靠？相比不使用技能是否真正更好？结构化评测（evals）可以回答这些问题，并提供可持续改进的反馈闭环。

## 设计测试用例

一个测试用例包含三部分：

- **Prompt**：真实用户可能输入的请求。
- **Expected output**：对“成功输出”的人类可读描述。
- **Input files**（可选）：技能执行所需输入文件。

建议把测试用例放在技能目录下的 `evals/evals.json`：

```json
{
  "skill_name": "csv-analyzer",
  "evals": [
    {
      "id": 1,
      "prompt": "I have a CSV of monthly sales data in data/sales_2025.csv. Can you find the top 3 months by revenue and make a bar chart?",
      "expected_output": "A bar chart image showing the top 3 months by revenue, with labeled axes and values.",
      "files": ["evals/files/sales_2025.csv"]
    },
    {
      "id": 2,
      "prompt": "there's a csv in my downloads called customers.csv, some rows have missing emails — can you clean it up and tell me how many were missing?",
      "expected_output": "A cleaned CSV with missing emails handled, plus a count of how many were missing.",
      "files": ["evals/files/customers.csv"]
    }
  ]
}
```

编写测试 prompt 的建议：

- **先从 2-3 个用例开始**：先跑通流程，再扩充。
- **提示多样化**：覆盖口语、正式、简略、详细等风格。
- **覆盖边界场景**：至少包含一个异常输入、模糊需求或边界条件。
- **保持真实上下文**：加入路径、列名、业务背景等信息，避免“process this data”这类过于泛化的句子。

一开始无需定义过细的 pass/fail 检查。先看第一轮产出，再补充断言（assertions）更高效。

## 运行评测

核心模式是每个用例跑两次：一次**使用技能**，一次**不使用技能**（或使用旧版本技能）作为基线，便于比较差异。

### 工作区结构

建议把评测产物放在技能目录旁的工作区目录中。每轮评测使用独立 `iteration-N/` 目录；每个测试用例下再分 `with_skill/` 与 `without_skill/`：

::: file-tree

- csv-analyzer
  - SKILL.md
  - evals
    - evals.json
- csv-analyzer-workspace
  - iteration-1
    - eval-top-months-chart
      - with_skill
        - outputs/       # 运行产物
        - timing.json    # token 与时长
        - grading.json   # 断言评分结果
      - without_skill
        - outputs/
        - timing.json
        - grading.json
    - eval-clean-missing-emails
      - with_skill
        - outputs/
        - timing.json
        - grading.json
      - without_skill
        - outputs/
        - timing.json
        - grading.json
    - benchmark.json         # 汇总统计

:::

你主要手工维护的是 `evals/evals.json`。其余如 `grading.json`、`timing.json`、`benchmark.json` 一般由执行流程产出。

### 派生运行任务

每次评测应从“干净上下文”启动，避免前一轮残留状态污染结果。这能确保 Agent 主要遵循 `SKILL.md` 本身，而不是上下文记忆。

如果环境支持 subagent（例如 Claude Code），隔离会天然更好；否则建议每次运行单独开新会话。

每次运行应提供：

- 技能路径（基线时可不提供）
- 测试 prompt
- 输入文件
- 输出目录

单次“with_skill”运行示例指令：

```text
Execute this task:
- Skill path: /path/to/csv-analyzer
- Task: I have a CSV of monthly sales data in data/sales_2025.csv.
  Can you find the top 3 months by revenue and make a bar chart?
- Input files: evals/files/sales_2025.csv
- Save outputs to: csv-analyzer-workspace/iteration-1/eval-top-months-chart/with_skill/outputs/
```

基线运行用相同 prompt，但不传技能路径，并输出到 `without_skill/outputs/`。

如果是在优化已有技能，建议将旧版做快照（如 `cp -r <skill-path> <workspace>/skill-snapshot/`），再让基线指向该快照，输出到 `old_skill/outputs/`。

### 记录耗时与 token

记录时间与 token 可以量化“收益/成本”：技能可能提升质量，但也可能增加时延与 token 消耗。

每次运行后记录如下数据：

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332
}
```

::: tip
在 Claude Code 中，subagent 任务完成通知通常会包含 `total_tokens` 与 `duration_ms`。建议完成后立即保存，这些值通常不会自动持久化。
:::

## 编写断言（assertions）

断言是“可验证的输出要求”。推荐在看到第一轮结果后再补断言，因为很多时候你在运行前并不清楚理想输出应细化到什么程度。

好的断言示例：

- `"输出文件是合法 JSON"`（可脚本验证）
- `"柱状图包含坐标轴标签"`（可观察）
- `"报告至少包含 3 条建议"`（可计数）

较弱断言示例：

- `"输出很好"`（过于主观）
- `"输出必须包含精确短语 XXX"`（过于脆弱，易误伤）

并非所有质量项都适合做断言。例如文风、视觉审美、“是否顺手”等更适合人工评审。

可在 `evals/evals.json` 中为每个用例补充断言：

```json
{
  "skill_name": "csv-analyzer",
  "evals": [
    {
      "id": 1,
      "prompt": "I have a CSV of monthly sales data in data/sales_2025.csv. Can you find the top 3 months by revenue and make a bar chart?",
      "expected_output": "A bar chart image showing the top 3 months by revenue, with labeled axes and values.",
      "files": ["evals/files/sales_2025.csv"],
      "assertions": [
        "The output includes a bar chart image file",
        "The chart shows exactly 3 months",
        "Both axes are labeled",
        "The chart title or caption mentions revenue"
      ]
    }
  ]
}
```

## 输出打分

打分就是逐条断言评判 **PASS/FAIL**，并给出证据。证据应来自输出内容本身，而不是主观判断。

最简单方式是让 LLM 读取输出与断言后逐条判断。对于可编程验证项（例如 JSON 合法性、行数、文件存在与尺寸），优先使用脚本，稳定性更高且便于复用。

```json
{
  "assertion_results": [
    {
      "text": "The output includes a bar chart image file",
      "passed": true,
      "evidence": "Found chart.png (45KB) in outputs directory"
    },
    {
      "text": "The chart shows exactly 3 months",
      "passed": true,
      "evidence": "Chart displays bars for March, July, and November"
    },
    {
      "text": "Both axes are labeled",
      "passed": false,
      "evidence": "Y-axis is labeled 'Revenue ($)' but X-axis has no label"
    },
    {
      "text": "The chart title or caption mentions revenue",
      "passed": true,
      "evidence": "Chart title reads 'Top 3 Months by Revenue'"
    }
  ],
  "summary": {
    "passed": 3,
    "failed": 1,
    "total": 4,
    "pass_rate": 0.75
  }
}
```

### 打分原则

- **PASS 必须有证据**：不要“推测通过”。
- **顺便评估断言质量**：若断言总是通过、总是失败或无法验证，说明断言本身需要调整。

::: tip
比较两个技能版本时，可尝试**盲评**：把两份输出都给评委模型，但不告知来源版本。让其按组织性、可用性、格式与整体完成度打分，可补充断言评分无法覆盖的差异。
:::

## 汇总结果

当该轮所有运行都完成评分后，按配置汇总统计并写入 `benchmark.json`（例如 `iteration-1/benchmark.json`）：

```json
{
  "run_summary": {
    "with_skill": {
      "pass_rate": { "mean": 0.83, "stddev": 0.06 },
      "time_seconds": { "mean": 45.0, "stddev": 12.0 },
      "tokens": { "mean": 3800, "stddev": 400 }
    },
    "without_skill": {
      "pass_rate": { "mean": 0.33, "stddev": 0.10 },
      "time_seconds": { "mean": 32.0, "stddev": 8.0 },
      "tokens": { "mean": 2100, "stddev": 300 }
    },
    "delta": {
      "pass_rate": 0.50,
      "time_seconds": 13.0,
      "tokens": 1700
    }
  }
}
```

`delta` 告诉你“付出了什么，换来了什么”。例如多 13 秒但通过率提升 50 个百分点，通常值得；若 token 翻倍但只提升 2 个百分点，可能不划算。

::: note
标准差（`stddev`）需要多次运行才有意义。早期样本少时，先关注原始通过数与 delta 即可。
:::

## 分析模式与问题

聚合统计可能掩盖细节。建议额外做以下分析：

- **清理总是通过的断言**：它们无法体现技能增益。
- **排查总是失败的断言**：可能是断言本身有问题、用例过难、或评价维度错位。
- **关注“有技能通过、无技能失败”的断言**：这部分最能说明技能价值。
- **处理高波动用例**：若同一用例有时过有时不过，说明评测存在随机敏感，或技能指令存在歧义，需要补示例或约束。
- **检查耗时/token 异常值**：某条用例显著偏慢时，查看执行日志定位瓶颈。

## 人工复审

断言和统计很重要，但只能覆盖“你提前想到的检查项”。人工复审能捕捉未覆盖问题：例如技术上正确但不实用、结构混乱、表达不友好等。

建议逐用例查看实际输出并记录可执行反馈，保存到工作区（例如 `feedback.json`）：

```json
{
  "eval-top-months-chart": "The chart is missing axis labels and the months are in alphabetical order instead of chronological.",
  "eval-clean-missing-emails": ""
}
```

像“缺少坐标轴标签”这种反馈可直接转化为改进项；“看起来不太好”则不可执行。

## 迭代技能

完成打分与复审后，你会有三类信号：

- **失败断言**：定位到具体缺口（步骤缺失、指令模糊、场景未覆盖）。
- **人工反馈**：揭示更广泛质量问题（组织方式、可读性、可用性）。
- **执行日志**：解释“为什么失败”，例如模型忽略指令、在低价值步骤上耗时。

通常最有效的改进方式是：把这三类信号连同当前 `SKILL.md` 一并交给 LLM，让它提出改写建议。为防止改偏，建议在提示中加入以下约束：

- **从反馈中抽象通用问题**，不要只打补丁修个别样例。
- **保持技能精简**：更少但更高质量的指令往往更有效。
- **说明“为什么”**：解释型指令通常比僵硬规则更容易被模型稳定执行。
- **将重复工作沉淀为脚本**：如果每次都在临时写类似辅助脚本，考虑放入技能 `scripts/`。

### 迭代循环

1. 提供评测信号与当前 `SKILL.md`，让 LLM 给出改进建议。
2. 审核并应用改动。
3. 在新目录 `iteration-<N+1>/` 重跑全部用例。
4. 重新评分并生成汇总。
5. 进行人工复审，继续下一轮。

当结果达到预期、人工反馈长期为空、或多轮无明显增益时即可收敛。

::: tip
[`skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator) 可以自动化该流程的大量步骤：运行评测、断言评分、聚合统计、展示可复审结果。
:::
