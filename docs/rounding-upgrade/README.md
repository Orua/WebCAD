# 圆角／圆润升级接续资料

当前代码是分阶段实现，**尚未完成 T0–T8 总验收**。2026-09-30 新上下文从 [SOL + HIGH 执行安排](SOL-HIGH-NEXT.md) 开始；第一优先是修复“先 R 一边、再 R 相邻边”的正式工具缺口。

| 文件 | 用途 |
| --- | --- |
| [SOL-HIGH-NEXT.md](SOL-HIGH-NEXT.md) | 最新状态、依赖顺序、第一任务的实施／验收步骤、源码风险、编码约束及新上下文提示词 |
| [HANDOFF.md](HANDOFF.md) | 当前交接与“先 R 一边、再 R 相邻边”缺口的真实 WASM 复现 |
| [PROGRESS.md](PROGRESS.md) | 唯一总进度表；后续更新此表，历史证据注明执行时点 |
| [NATIVE-LAW.md](NATIVE-LAW.md) | T2 原生 `SetLaw` 的源码线索、调用时序和 Build 重置证据 |
| [相邻边复现脚本](../../tests/repro/rounding-adjacent-sequential.mjs) | 对当前正式 `rounding` 与直接原生构造做同源对照 |
| [原升级方案](requirements/UPGRADE-PLAN.md) | 用户原始方案完整副本；其中版本与进度是当时状态 |
| [总执行与验收指令](requirements/EXECUTION-OVERRIDE.md) | 后续用户要求完整副本；调整依赖顺序，不降低原几何验收要求 |

使用项目安装的 `replicad-opencascadejs@1.1.0` 运行最小复现：

```powershell
node tests/repro/rounding-adjacent-sequential.mjs
```

测试报告必须区分正式操作的拒绝、直接原生构造得到的有效候选，以及尚未验收的半径、传播范围和交汇接顺。原始验收矩阵文件未提供，不能据现有定向通过数量宣布总升级完成。`agent/` 内的备份、浏览器 JSON 输出和临时探针留在原机器，未收入公开仓库。

2026-09-30 已重新核对远端 `main` 与开发分支都在 `7239eaa`，原代码和此前交接已推送。本轮新增执行安排、原要求副本与文档修正仅在本地，尚未提交／推送；继续工作时保留这些未提交文件。原文件副本 SHA-256 见本地 `agent/output/rounding-next-session-20260930/review.json`。
