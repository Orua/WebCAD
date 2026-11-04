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

## 测试现状

| 跑法 | 结果 |
|---|---|
| 补清单后的第一轮 `npm test` | 1355 项里 1313 通过、36 失败、1 取消、5 跳过 |
| 修完大部分断言后、收窄铣削之前的整包 | 1355 项，**1349 通过，1 失败，0 取消，5 跳过**，约 860 秒，退出码 1 |
| 那 1 个失败 | `tests/edge-blend.test.mjs` → `large requested radius may produce a valid mill candidate without a box-size veto` |
| 收窄铣削之后的针对性重跑 | `edge-blend`、`mill-fillet-fallback`、`relief-fillet-261024-v2`、`round-tool-kernel`、`rounding-modes`：21 通过，0 失败，1 跳过（私有圆角夹具） |
| 确认用的第二次整包 | **2026-11-04 09:16 UTC 已启动，写本文件时尚未结束**。日志：`/tmp/npm-test-portable-2.log`（进程若还在，就是 `node scripts/test.mjs portable`）。结束前不要把「全绿」写进升级说明。 |

5 个跳过是原有的环境跳过（例如没有私有圆角夹具），不是这次加的。

## 接着做

1. 看第二次整包是否还在跑。在则等它结束，读日志末尾的 `# pass` / `# fail`。不在或日志不完整，就在仓库根重新执行：

   ```bash
   node scripts/generate-page-docs.mjs
   npm test
   ```

   `generate-page-docs` 会写出未入库的 `public/automation/agent-bundle.zip`。不要把这个 zip 加进 git。

2. 若全绿：把通过/失败/跳过数字写进本文件和 `docs/UPGRADE-20261104-page-api-probe-fixes.zh-CN.md` 的「测试」一节，提交并推到 `cursor/page-api-probe-fixes-a435`。用 `ManagePullRequest` 更新 PR #4 的说明。不要合并。告诉协调人：可以请曾智鹏决定是否合并，以及何时升到 Teacher-O。

3. 若仍有失败：只修产品代码、和已发布契约不一致的断言、或确实无法在云端合成的夹具。每条失败记下文件名、测试名和原因。需要真实浏览器、原生宿主或不能合成的源图时，留在失败列表里，写明原因，不要 `skip`。

4. 契约或配方文档有改动时，再跑一次 `node scripts/generate-page-docs.mjs`，把 `public/automation` 里除 zip 以外的生成文件一起提交。

## 本机升级（等所有者点头之后）

维护目录是 `F:\Project\WebCAD`。步骤在升级说明里。本交接不授权那一步。
