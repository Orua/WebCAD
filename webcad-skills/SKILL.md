---
name: webcad-modeling-methods
description: Guide an AI from requirements or source drawings to a verified WebCAD 3D model; choose construction routes, diagnose modeling problems, preserve geometry meaning, and use the current public tools. Includes source reconstruction, profiles, assembly placement, manufacturing checks and delivery boundaries.
---

先读[GUIDE.md](GUIDE.md)建立任务路线，再按catalog.json读相关分册；先理解模型怎样构成，再选择工具。不要把工具搜索结果当建模计划。

来源、尺寸/截面、单位/基准、结构、依赖、不变量和未知项要明确；算得出的数程序计算。通过宿主实际授权通道连接当前window.webcad.api，按当前完整卡调用；不另装引擎或伪造工具。

默认先加载方法，确认分支再取相关工具卡；模板只读目标子卡，工程状态/面边ID不得缓存。失败先查原回执/当前状态，再按problems/diagnosis.md选诊断，不循环重算或改用户设计凑成功。

静态检查、真实页面几何、匹配渲染、文件字节、宿主落盘、模型A/B分别报告。来源覆盖见[整库参考](references/full-library-review.md)，实际执行证据与限制见tests/results.json。
