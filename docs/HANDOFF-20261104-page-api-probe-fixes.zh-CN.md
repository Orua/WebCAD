# 交接：页面 API 探针修复（2026-11-04）

给下一次接手的人。不要合并，不要动 Teacher-O。

## 目标

让 PR 分支上的便携测试 `npm test`（`node scripts/test.mjs portable`）变绿，或在不能削弱测试的前提下尽量接近全绿，然后停下来交给曾智鹏决定是否合并。

- 仓库：`Orua/WebCAD`
- 分支：`cursor/page-api-probe-fixes-a435`
- PR：https://github.com/Orua/WebCAD/pull/4 （对 `main`，保持打开，不要合并）
- 页面 API：`1.60.11`
- 升级说明：`docs/UPGRADE-20261104-page-api-probe-fixes.zh-CN.md`
- 用量重置：约 `2026-11-05 09:18`（Asia/Shanghai）。重置前把本文件和源码推到上述分支。

## 不要做

- 不要改 `services/**`，也不要改原生服务宿主。
- 不要合并 PR #4，不要关 PR。
- 不要碰 Teacher-O，不要改 `F:\Project\WebCAD`，不要部署到 `10.121.11.8`、`localhost/webcad` 或 `goldenfu.cn`。
- 不要删测试、不要把失败改成跳过、不要放宽几何数值断言来换绿灯。
- 不要提交 `public/automation/agent-bundle.zip`。它是发布产物。需要时在工作区执行 `node scripts/generate-page-docs.mjs`，让它和已提交的 `public/automation/agent-knowledge.json` 里 `archive.sha256` / `sizeBytes` 一致。知识包测试会读磁盘上的这个 zip。
- 不要 `git reset` / `checkout` / `pull` 覆盖未提交修改。

## 已经修好（相对 main `7ee215ae`）

探针页（D 形针扣）仍在上一笔 `2471b843`：

- connect 的 queries 最多 4 项，和每项 limit 1..10 分成两条中文错误。
- queryGeometry 歧义面要 `requireUnique:false`；面结果有 `surfaceClass`、`pointOnFace` / `closestPoint`。`cylinder` 与 `cylindre` / `CYLINDRE` 视为同一面类型。
- `logo` / `relief` 的严格契约要求 `machiningIntent`；旧特征两边都没有意图时仍可编辑。
- `userMessage` 分句有句号。步骤 id 拒绝中文时写明原因。未知工具 id 有提示。
- 平面闭合圆截面扫掠以路径为中心。闭合非平面扫掠仍拒绝，内核问题记在升级说明里，没有半成品几何。

这一轮便携测试（尚未单独成提交的工作区修改，交接提交会带上）：

- 有 `sessionId` 且 `browserReady===true` 时，`searchTools` 的 `runtimeAvailability` 为 `available`；没有会话仍是 `unknown`。页面内搜索会带上当前 `sessionId`。`src/ai-docs.js` 与 `src/page-api-docs.js` 一致。
- `createPageJobs` 直接接受 `JOB_METHODS`（补上 `reliefWizard` 等）。
- `watchRevision` 的非法间隔错误带上 `debounceMs` 或 `intervalMs`。
- 文件预算断言改成已发布的 200 / 256 / 768 / 1024 MiB，超限注册仍要 `SIZE_LIMIT`。
- 快捷模型可见条目按当前目录是 48（含后来加上的种类），不是旧的 47。`rodJunction` 算直接建模工具。
- `getState` 工具卡含 `featureIds` / `featureFields` / `bodyIds` / `bodyFields`。LOGO 默认 `reviewPolicy:'automatic'` 会确认草稿，`reviewRequired` 为 false。
- JPG 位图转换不再先走 `logo/inspect`，测试改为找 `logo/convert`。
- 用 `eval` 截取 `main.js` 的测试补上 `debugJournal`、`validateReliefDesigns`、材料校验。宿主发送脚本补上 `connectionGeneration`。临时目录用 `os.tmpdir()`，不再写 `G:/CAD-Workspace/...`。
- 浮雕尺寸测试用合成 JPEG SOF（129×129），20 字节前缀仍无效。配方文档补回 `EXAMPLE-A60C9272`、`EXAMPLE-6D43D757`、`EXAMPLE-073EEC4E`。日字扣中文说明含「2.5」。
- 椭圆日字扣 / 开口圈的显示体积在自适应显示下是 `null`（`metricsDeferred`）。精确体积和包围盒改走 `kernel.measure()`，数值门槛没放宽。实测约 2870 mm³ 与 635.52 mm³，仍落在原断言范围内。
- 铣削回退：单边半径大于相邻面时仍可给出有效铣削候选（`edge-blend` 的 10×4×1、R2 长边）。整包圆角（`allEdges`）和圆润工具要求的精确半径放不进相邻面时，不再把铣削结果当成成功；失败信息仍含「失败边」和「原模型保留」。

## 测试现状（最终）

2026-11-04 09:31 UTC，对着已推送的 `605f5fee`（产品代码与测试；本段数字是之后补记的）跑完 `npm test`（`node scripts/test.mjs portable`）：

- 333 个测试文件，串行
- **1355 项，1350 通过，0 失败，0 取消，5 跳过**
- 耗时约 894 秒，退出码 0
- `[PASS] portable`

没有剩余失败。5 个跳过是原来就有的环境条件，这次没有新增 `skip`：

- `PowerShell installs and updates in isolation...`（非 Windows）
- `controlled PDF renderer: text/image fallback...`（没有受控 PDF 渲染器）
- `live native worker re-run @33 (skipped without WEBCAD_SERVICES_OCCT_WORKER)`
- `EXAMPLE-39C04640 repaired LL planar scope...`（没有 `WEBCAD_PRIVATE_ROUNDING_FIXTURE`）
- `authorized local STEP: outer junctions smooth...`（没有授权的本机 STEP）

## 接着做

便携套件已经全绿。不要为了再刷一遍而改代码。下一步只剩所有者决定：

1. 是否把 PR #4 合并进 `main`。本交接不合并。
2. 确认之后，再按升级说明把同一提交升到 `F:\Project\WebCAD`。不要提前动 Teacher-O。

若重置后续跑，先 `node scripts/generate-page-docs.mjs`（生成不入库的 `agent-bundle.zip`），再 `npm test`。数字应仍是 1350 / 0 / 5。契约或配方文档若再改，重新生成 `public/automation`（除 zip）并提交。

## 本机升级（等所有者点头之后）

维护目录是 `F:\Project\WebCAD`。步骤在升级说明里。本交接不授权那一步。
