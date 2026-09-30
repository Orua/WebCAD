> 2026-09-30 已复核：最新执行入口是 [SOL-HIGH-NEXT.md](SOL-HIGH-NEXT.md)，总进度以 [PROGRESS.md](PROGRESS.md) 为准。下面保留 2026-09-29 的几何交接证据；`agent/` 内备份、JSON 输出及临时探针保留在原机器，不在公开仓库中。

# WebCAD 圆角／圆润升级交接（2026-09-29）

## 接手入口与边界

- 工作区：`F:/Project/WebCAD`，当前分支 `codex/modeling-reliability-upgrade`。2026-09-29 升级开始时 HEAD 为 `99dd3ca`；目前代码提交为 `7239eaaff6c05a40954a8a4e83e0c5b9e9ca94b3`，远端 `main` 和开发分支均包含此提交。本地 main 仍停在 `79d5dc1`，不要误以为远端没推送。不得用 `reset`、`checkout`、`pull` 覆盖本地改动。修改任何现有文件前，按 `AGENTS.md` 备份到 `agent/backups/<时间戳>/<原相对路径>`。原升级差异记录在 `agent/backups/20260929-144536/`，本轮文档核查备份在 `agent/backups/20260930-090424/`。
- 实际内核：`replicad-opencascadejs@1.1.0`，`node_modules/replicad-opencascadejs/dist/replicad_single.wasm` 的 SHA-256 是 `4c9f22e9f3828dca6f3c95405934cdbe624e593c35266f47f392ab337478dbde`。任何候选内核结果都须另列，不得拼入此基线。
- 用户要求按依赖推进 T0–T8，正向几何必须跑项目实际 WASM；不缩小请求 R、不放宽阈值、不用模拟接口冒充内核通过。保留旧 `fillet`、`smoothTransition`、`autoRound` 语义。浏览器后续只用**一个窗口／一个标签页**，避免反复新开页占用显卡；用户额度紧张，先做最小必要验证。
- 本文是接续入口；完整阶段表见 `docs/rounding-upgrade/PROGRESS.md`，原生 law 机制见 `docs/rounding-upgrade/NATIVE-LAW.md`，页面逐项数据见 `agent/output/rounding-browser-acceptance-20260929.json`。原方案的 `rounding-acceptance-matrix.json` 尚未提供，不能编造 24/13/9 案例 ID 或宣布 T8 通过。

## 已实现并验证的范围

| 阶段 | 目前可复用的正式成果 | 仍未完成 |
| --- | --- | --- |
| T0 | 锁定 WASM；旧恒 R 的合成凸／凹边真实几何基线通过。 | 保持同 SHA 回归。 |
| T1 | 新 `rounding` 恒 R 经 `src/modeling/rounding/`、Worker、UI/API、预览、提交、取消／回滚；单条合成凸／凹边通过。 | **相邻边连续两次 R 的当前缺口见下节**；不能把 T1 宣称整阶段完成。 |
| T2 | 独立解析路线支持单一直边及不等长共线链的 2–16 个线性站点；累计弧长、方向、真实法截面、抽样 G1、历史改参已验证。7＋13 mm 双段链在内置浏览器 API 预览／提交，工程和 STEP 跨会话读回通过。 | 原生 `SetLaw` 在 `Build` 被重置；非共线／曲边链、共享 elementary law 去重、复杂端点仍未通过。 |
| T3 | 解析恒 R 的两平面直边、闭合圆边和带径向平面端面的开放圆弧已接正式工具并经真实 WASM 验证；受控同域整理候选不改源形状。 | 混合直线／圆弧轮廓、带孔支撑面及原矩阵。 |
| T4 | 两平面宽圆润及规则圆边／开放圆弧的 A/B 宽度、材料侧、抽样 G1 经真实 WASM；页面 API 及文件闭环验证。 | 四边界约束补面、局部替面、复杂曲线及严格端点。 |
| T5–T8 | 自然端点、恒 R 整件排除边、历史上游重建、计算中 Esc 取消恢复、旧预览代次拒绝、工具卡/UI/API 与工程／STEP 部分闭环已有证据。 | 严格端点／交汇、多链原子性、真实 180 秒超时、UI/API 同源形状等价、原验收矩阵；完整 `npm test` 未通过。 |

正式源码与测试主要在 `src/modeling/rounding/`、`src/operation-catalog.js`、`src/operation-registry.js`、`src/ui-selection-adapter.js`、`src/ui.js`、`src/cad-kernel.js`、`src/cad-worker.js`、`src/main.js`、`tests/rounding-kernel.test.mjs`、`tests/rounding-history.test.mjs`。2026-09-30 重新定向运行 46/46 通过；旧模式专项另有 8 通过、1 跳过。上一轮 `npm run build` 与 release gate 通过，本轮未重跑。此前全仓 `npm test` 为 442 项中 434 通过、7 失败、1 跳过，含旧 `halfLengthPoint`、PowerShell 权限、旧布局断言等；本轮未重新定位全部失败，不能称全仓通过。旧“错误文案缺少减小数值”断言已修正为正式错误语义、原 R 不变与模型保留检查，本轮对应测试通过；这不是变 R 几何通过证据。

## 用户新发现：第一条边 R 后，相邻边不能再 R

这**不是预期的最终工具行为**。当前严格 `selected-only` 范围防护碰到了原生圆角轮廓的相切传播，导致第二步提前拒绝；目前是正式实现缺口，并非已经证明几何无解。

真实 WASM 最小复现：`node tests/repro/rounding-adjacent-sequential.mjs`；2026-09-30 已重跑，结果仍如下。探针从**原始** 20×10×8 mm 通用箱体开始，按几何寻找边，不在正式代码硬编码产品或边号。本次拓扑编号仅是该运行的读回值：

1. 第一次在 X 向底边（当次 edge 8）做 R0.5，正式 `rounding` 的 native 策略成功，体积从约 1600 变为 `1598.9269908169872 mm³`。
2. 在所得新实体上，当前拓扑的相邻竖边为 edge 5，起点约 `[20,0,0.5]`、终点 `[20,0,8]`。再次请求 R0.5，正式工具返回 `SCOPE_EXPANSION_REQUIRED`，报告 `requestedEdgeIds:[5]`、`expandedEdgeIds:[13,9]`；未生成第二个正式结果。
3. 探针直接对**同一第二步输入**调用原生 `BRepFilletAPI_MakeFillet`，轮廓实际包含 `[13,9,5]`；`Build/IsDone=true`、故障轮廓 0、`BRepCheck` 有效、单实体、体积 `1597.9822080879514 mm³`。这只证明内核可构造一个有效候选，**尚未证明最终半径、旧 R 保持、每条传播边的授权范围和交汇接顺全部满足验收**。

具体代码位置：`src/modeling/rounding/native-fillet.js` 先 `Add(R,edge)`，读取 `NbEdges/Edge` 的真实轮廓；只要轮廓包含 `plan.requestedEdgeIds` 以外的边就抛该错误。`src/modeling/rounding/planner.js` 把相切边从 `targets` 中滤掉；当前公开 `propagation` 仅有 `selected-only`。因此简单让用户额外勾选这两条相切边也不一定能绕开范围检查。**不要直接删掉检查**，否则可能越过用户选区加工其他边。

## 下一次优先修复顺序

1. 先复用上述探针及同一 WASM，核对第二次原生候选的真实截面 R、第一次 R 的保留、两侧支撑面、端部和交汇区域；记录实际影响边／面及无关区域的材料差。现有证据只到有效单实体。
2. 决定并实现明确的相切传播规则：对由已生成圆角引出的必要轮廓边，预览中给出真实扩展范围和处理边；提交前验证请求作用范围、排除区域和材料变化。若需新增 `propagation` 模式，同时更新 schema、UI、页面 API、回执和工具卡。保持旧操作的历史语义。
3. 在 `src/modeling/rounding/native-fillet.js` 的严格检查周围做最小改动；不要无条件允许所有内核传播。对新拓扑编号必须每次从当前结果重新查询，历史编辑从上游源件重建。失败保持原实体和 revision。
4. 先在合成箱体跑真实 WASM 的“第一边 R0.5 → 相邻边 R0.5”正向测试，再覆盖反向相邻边、不同但合法的 R、会越界传播的拒绝案例、历史改参／撤销。阶段通过后才在用户现有 WebCAD 的**单一浏览器窗口**做一轮直接相关的 UI/API 检查。
5. 修复后复跑 T0/T1、旧 `fillet`／`smoothTransition`／`autoRound` 的定向回归，更新本文与阶段记录。相邻边缺口不应停止 T2/T3/T4 其他独立能力，但总任务仍不得标 DONE。

## 收尾状态

- 发现相邻边问题时**未修改正式算法或公开契约**；已将关键最小复现纳入仓库 `tests/repro/rounding-adjacent-sequential.mjs`。本地 `agent/temp/` 原脚本继续保留，仓库副本供新克隆直接运行。
- `docs/rounding-upgrade/PROGRESS.md` 和 `agent/output/rounding-browser-acceptance-20260929.json` 是已完成范围的详细记录；其中测试／文件状态按各自最后执行时点解释。浏览器测试曾生成资源字节并跨会话重开，未验证真实磁盘写入。代码和此前交接已经推送到 main；2026-09-30 的执行安排与文档修正在本地未提交，未新增部署或替换 WASM。
- 下次先读取本交接、阶段记录、当前 `git status --short`、WASM 哈希和最小复现；**不要重做 T0/T1，也不要重复已失败的 T2 原生参数域枚举**。
