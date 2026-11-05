# 交接：页面 API 第 4 轮探针（2026-11-05）

给下一次接手的人。不要在所有者确认前合并，不要动 Teacher-O。

## 目标

Round4 线上探针（pageApi `1.60.11`，build `748552ef`）里还开着的产品路径和 Agent 契约。PR 给曾智鹏看。确认之后才合并到 `F:\Project\WebCAD`，再请他们部署。

- 仓库：`Orua/WebCAD`
- 分支：`cursor/page-api-round4-fixes-a94a`
- 基线：`main` @ `748552ef`（PR #4 已在 main 上）
- 页面 API：`1.60.11`（未加版本号；契约哈希变了）
- 升级说明：`docs/UPGRADE-20261105-page-api-round4.zh-CN.md`

## 不要做

- 不要改 `services/**`。这次没有服务端计算，也不要补一份模拟的 .NET 产物。
- 不要在所有者点头前合并，不要部署到 `10.121.11.8`、`localhost/webcad` 或 `goldenfu.cn`。
- 不要删测试、不要把失败改成跳过、不要放宽体积或有效性断言。
- 不要提交 `public/automation/agent-bundle.zip`。
- 不要 `git reset` / `checkout` 覆盖未提交修改。

## 已修好（相对 main `748552ef`）

- 柱面接缝上的 `singleFace` 等深凹刻可以提交。`pointOnFace` 避开接缝。
- 闭合非平面锐角折线仍拒绝，错误句写清可提交的路径。`sections`+`closed:true` 在 schema 层拒绝，并说明伪闭。
- 中文步骤 id 的 `userMessage` 含「不能使用中文」和 `wave_1`。字符串 `$c` 会说明改用 `{"$ref":...}`。
- API 创建不再把工作基准 +Z 抬 0.05 mm。`hole` 卡改为定位框 / 包围盒坐标。
- `alignProfileToPath:true` 或文档中的四元数可以摆正 `profileSweep`。
- `guidedLoft` 偏出截面时，回执和 `error.recovery` 带 `nearestBoundaryPointMm`。
- `capture` / `recoverKernel` 标明不能进 `api.run`。`inspectDesign` 可以进批次。
- `patternLinear` / `patternCircular` / `draft` 等假名指向正式工具。
- 无相交 `cut` 失败且不删刀具。
- `files.export` / `files.save` / `files.read` / `measure` / `inspectFit` 的 `getTool` 带 `inputSchema`。

## 测试现状

2026-11-05，云端工作区先执行 `node scripts/generate-page-docs.mjs`（磁盘上有不入库的 `public/automation/agent-bundle.zip`），再跑 `npm test`（`node scripts/test.mjs portable`）：

- **1360 项，1355 通过，0 失败，0 取消，5 跳过**
- 耗时约 902 秒，退出码 0
- `[PASS] portable`

相对上一轮交接的 1350 通过，多出来的是这次新增的断言，没有把失败改成跳过。5 个跳过仍是原来的环境条件（非 Windows 的 PowerShell、没有受控 PDF 渲染器、没有 `WEBCAD_SERVICES_OCCT_WORKER`、没有私有圆角夹具、没有授权本机 STEP）。

直接相关、已通过的文件：

- `tests/curved-logo.test.mjs`（接缝凹刻、`periodicSeamAvoided`）
- `tests/curve-sweep.test.mjs`（单角拒绝、对边抬起成功、sections 闭环拒绝）
- `tests/geometry-query.test.mjs`
- `tests/page-batch.test.mjs`（中文 id、字符串别名、capture 不能进批次）
- `tests/parameter-error-message.test.mjs`（`userMessage` 含「不能使用中文」和 `wave_1`）
- `tests/loft-guides.test.mjs`
- `tests/profile-solid-dialogs.test.mjs`
- `tests/mechanical-tools-integration.test.mjs`（`alignProfileToPath` 体积 `10π`；分离盒子 `cut` 为 `NO_MATERIAL_REMOVED`）

## 接着做

便携套件的最终计数见下方补记。下一步只剩所有者决定：

1. 是否把本 PR 合并进 `main`。本交接不合并。
2. 确认之后，再按升级说明升到 `F:\Project\WebCAD`。不要提前动 Teacher-O。
3. 合并进教师机之后，再请他们部署。本交接不部署。

## 本机升级（等所有者点头之后）

维护目录是 `F:\Project\WebCAD`。步骤在升级说明里。本交接不授权那一步。

## 测试补记

已填写在上面「测试现状」。1360 / 1355 / 0 / 5，退出码 0。没有剩余失败。
