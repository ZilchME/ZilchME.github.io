---
title: 优化技能描述（description）
createTime: 2026/04/09 21:45:50
permalink: /skill/tj6gd0kj/
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

> 如何改进技能的 description，让它在相关提示下更稳定地触发。

技能只有在被激活时才有价值。`SKILL.md` frontmatter 里的 `description` 字段，是 Agent 判断“是否应加载该技能”的核心依据。描述过于含糊会导致该触发时不触发；描述过宽则会误触发。

本文介绍如何系统化地测试并优化 description 的触发准确率。

## 技能触发是如何发生的

Agent 通常采用 [渐进式披露](/what-are-skills#how-skills-work) 管理上下文。启动时只加载每个技能的 `name` 与 `description`，用于判断相关性；当用户任务与描述匹配时，再将完整 `SKILL.md` 读入上下文并执行其指令。

这意味着：description 承担了几乎全部触发责任。如果它没有清晰表达“何时该用这个技能”，模型就不会主动调用。

还有一个关键细节：Agent 往往只会在任务超出自身通用能力时才考虑技能。比如“读一下这个 PDF”这种一步请求，即使描述匹配，也可能不触发 PDF 技能，因为 Agent 用基础工具就能完成。真正体现 description 价值的，通常是涉及专门知识的任务，例如陌生 API、领域工作流、非常见文件格式等。

## 写出有效 description 的原则

开始测试前，先明确好描述应具备哪些特征：

- **使用祈使语气**：写成给 Agent 的行动指令，例如“Use this skill when...”，而不是“这个技能可以...”。
- **聚焦用户意图而非实现细节**：描述用户想达成什么，而不是技能内部怎么做。Agent 匹配的是用户请求意图。
- **适度“主动”一点**：明确列出适用场景，也包含用户没直接说出领域关键词的情况，例如“即使用户未明确提到 CSV 或 analysis 也适用”。
- **保持简洁**：通常几句到一小段足够。既覆盖范围，又不让技能目录膨胀。注意 [规范](/specification#description-field) 的上限是 1024 字符。

## 设计触发评测查询（eval queries）

要测试触发效果，你需要一组评测查询：真实用户风格的 prompt，并标注该不该触发技能。

```json
[
  { "query": "I've got a spreadsheet in ~/data/q4_results.xlsx with revenue in col C and expenses in col D — can you add a profit margin column and highlight anything under 10%?", "should_trigger": true },
  { "query": "whats the quickest way to convert this json file to yaml", "should_trigger": false }
]
```

建议先做约 20 条：8-10 条应该触发，8-10 条不应触发。

### 应触发查询（should-trigger）

用来验证 description 是否覆盖了技能范围。建议从以下维度做变化：

- **表达方式**：正式、口语、带错别字或缩写。
- **显式程度**：有的直接点名领域（“analyze this CSV”），有的只描述需求（“我老板要一张图”）。
- **细节密度**：短提示与长上下文混合，比如同时包含路径、列名、背景。
- **任务复杂度**：既有单步任务，也有多步链路，检验技能需求埋在复杂任务时是否仍能识别。

最有价值的是那些“技能有帮助但并不明显”的查询，这正是 description 文案能拉开差距的地方。

### 不应触发查询（should-not-trigger）

最有价值的负样本是**近似误判（near-miss）**：它们与技能共享关键词或概念，但实际任务不同，可用于检验描述是否“精准而非宽泛”。

以 CSV 分析技能为例，较弱负样本：

- `"Write a fibonacci function"`：明显无关，几乎没有测试价值。
- `"What's the weather today?"`：关键词完全不重叠，太容易。

更强负样本：

- `"I need to update the formulas in my Excel budget spreadsheet"`：提到表格和数据，但需求是编辑 Excel 公式，不是 CSV 分析。
- `"can you write a python script that reads a csv and uploads each row to our postgres database"`：涉及 CSV，但本质是 ETL 入库，不是分析。

### 让查询更真实的小技巧

真实用户提示常包含上下文信息。可加入：

- 文件路径（如 `~/Downloads/report_final_v2.xlsx`）
- 个人背景（如“我经理让我...”）
- 具体细节（列名、公司名、数据值）
- 口语、缩写、偶发拼写错误

## 如何验证 description 是否触发

基本方法：将每条查询在安装技能的情况下运行，观察 Agent 是否调用该技能。前提是技能已正确注册并可被 Agent 发现（具体方式因客户端而异，如技能目录、配置文件、CLI 参数）。

多数客户端都提供可观测能力（执行日志、工具调用记录、verbose 输出等），可据此判断是否加载了 `SKILL.md`。

一条查询判定“通过”的条件：

- `should_trigger = true` 且技能被调用；或
- `should_trigger = false` 且技能未被调用。

### 多次运行

模型行为有随机性，同一查询一次触发、一次不触发都可能发生。建议每条查询运行多次（3 次是常见起点），计算**触发率（trigger rate）**：触发次数 / 运行次数。

判定建议：

- 应触发查询：触发率高于阈值（默认可设 0.5）为通过。
- 不应触发查询：触发率低于阈值（默认可设 0.5）为通过。

若 20 条查询每条跑 3 次，总计 60 次调用，建议用脚本自动化。下例仅展示通用结构，请将 `claude` 调用和 `check_triggered` 检测逻辑替换为你客户端的实现：

```bash
#!/bin/bash
QUERIES_FILE="${1:?Usage: $0 <queries.json>}"
SKILL_NAME="my-skill"
RUNS=3

# 该示例基于 Claude Code JSON 输出判断是否触发 Skill 工具。
# 请按你的客户端替换检测逻辑。
# 若技能被调用返回 0，否则返回 1。
check_triggered() {
  local query="$1"
  claude -p "$query" --output-format json 2>/dev/null \
    | jq -e --arg skill "$SKILL_NAME" \
      'any(.messages[].content[]; .type == "tool_use" and .name == "Skill" and .input.skill == $skill)' \
      > /dev/null 2>&1
}

count=$(jq length "$QUERIES_FILE")
for i in $(seq 0 $((count - 1))); do
  query=$(jq -r ".[$i].query" "$QUERIES_FILE")
  should_trigger=$(jq -r ".[$i].should_trigger" "$QUERIES_FILE")
  triggers=0

  for run in $(seq 1 $RUNS); do
    check_triggered "$query" && triggers=$((triggers + 1))
  done

  jq -n \
    --arg query "$query" \
    --argjson should_trigger "$should_trigger" \
    --argjson triggers "$triggers" \
    --argjson runs "$RUNS" \
    '{query: $query, should_trigger: $should_trigger, triggers: $triggers, runs: $runs, trigger_rate: ($triggers / $runs)}'
done | jq -s '.'
```

::: tip
如果客户端支持，一旦确认“已触发”或“明显未触发”即可提前停止该次运行，这能显著减少整套评测的时间与成本。
:::

## 用训练集/验证集避免过拟合

如果你在全部查询上反复调优 description，很容易过拟合：只对当前这批措辞有效，换一批就失效。

建议拆分数据集：

- **训练集（约 60%）**：用于发现失败模式并指导改写。
- **验证集（约 40%）**：仅用于检查改写是否泛化。

两组都要包含成比例的 should-trigger 与 should-not-trigger，随机打乱后固定切分，保证各轮结果可比。

如果用前面的脚本，可拆成 `train_queries.json` 与 `validation_queries.json` 分别运行。

## 优化循环

1. 在**训练集和验证集**上评估当前 description。训练集用于指导修改，验证集用于检验泛化。
2. 分析**训练集失败样本**：哪些该触发没触发？哪些不该触发却触发了？
   - 只用训练集失败指导改写；不要把验证集结果喂回优化过程。
3. 改写 description，重点是泛化：
   - 该触发却没触发：通常说明描述过窄，需要扩范围或补充适用上下文。
   - 不该触发却触发：通常说明描述过宽，需要加边界、写清不做什么。
   - 不要直接堆失败样本关键词（会过拟合）；应提炼其背后通用类别再写进描述。
   - 多轮效果停滞时，尝试结构性重写，不要只做小修小补。
   - 持续检查是否超过 1024 字符上限。
4. 重复 1-3，直到训练集全部通过或改进趋于停滞。
5. 以验证集通过率选择最佳版本。最佳版本不一定是最后一版，后期可能已过拟合。

通常 5 轮左右就能看到稳定结论。如果长期无提升，问题可能在查询集本身（太简单、太难、标注不准）。

::: tip
[`skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator) 可自动化这套流程：切分数据集、并行评估触发率、调用模型改写 description，并生成可实时查看的 HTML 报告。
:::

## 应用优化结果

当你选出最佳 description 后：

1. 更新 `SKILL.md` frontmatter 的 `description` 字段。
2. 确认未超过 [1024 字符限制](/specification#description-field)。
3. 进行触发验证：先人工试几条 prompt 做快速 sanity check；更严谨时，额外新写 5-10 条未参与优化的查询（正负样本混合）并跑脚本，验证泛化能力。

优化前后示例：

```yaml
# Before
description: Process CSV files.

# After
description: >
  Analyze CSV and tabular data files — compute summary statistics,
  add derived columns, generate charts, and clean messy data. Use this
  skill when the user has a CSV, TSV, or Excel file and wants to
  explore, transform, or visualize the data, even if they don't
  explicitly mention "CSV" or "analysis."
```

改进版描述更清晰地覆盖了“做什么”（统计、派生列、图表、清洗）与“何时适用”（CSV/TSV/Excel，且不要求用户显式提关键词）。

## 下一步

当触发已经稳定后，下一步是评估输出质量。可参考 [Evaluating skill output quality](/skill-creation/evaluating-skills) 了解如何设计测试、打分并迭代技能效果。
