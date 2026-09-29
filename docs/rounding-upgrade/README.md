# 圆角／圆润升级接续资料

当前代码是分阶段实现，**尚未完成 T0–T8 总验收**。从 [交接文件](HANDOFF.md) 开始；其中列出已验证能力、当前阻塞和下一步修复顺序。

| 文件 | 用途 |
| --- | --- |
| [HANDOFF.md](HANDOFF.md) | 当前交接与“先 R 一边、再 R 相邻边”缺口的真实 WASM 复现 |
| [PROGRESS.md](PROGRESS.md) | T0–T8 阶段进度、测试和浏览器证据快照 |
| [NATIVE-LAW.md](NATIVE-LAW.md) | T2 原生 `SetLaw` 的源码线索、调用时序和 Build 重置证据 |
| [相邻边复现脚本](../../tests/repro/rounding-adjacent-sequential.mjs) | 对当前正式 `rounding` 与直接原生构造做同源对照 |

使用项目安装的 `replicad-opencascadejs@1.1.0` 运行最小复现：

```powershell
node tests/repro/rounding-adjacent-sequential.mjs
```

测试报告必须区分正式操作的拒绝、直接原生构造得到的有效候选，以及尚未验收的半径、传播范围和交汇接顺。原始验收矩阵文件未提供，不能据现有定向通过数量宣布总升级完成。`agent/` 内的备份、浏览器 JSON 输出和临时探针留在原机器，未收入公开仓库。
