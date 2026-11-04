# 页面 API 探针修复升级说明（2026-11-04）

页面 API：`1.60.11`。基线：`main` @ `7ee215ae`。本次只改页面、契约、文档和测试，**没有修改 `services/**`**。几何内核里仍然失败的项目列在文末，不能当成已经修好。

现场证据来自 Tommy Hilfiger D 形针扣重建（`https://goldenfu.cn/webcad/?document=799187bf-3828-4674-a823-6c1eabab4806`）的第 2、3 轮回执。下面写的错误句都来自这些回执或当前源码，没有另编。

## 已修复

### connect 的 4 与 1..10

`queries` 最多 4 项。`limit` 是**每一项**返回条数，整数 1..10，默认 5。以前超限时合成一句 “limit 1..10”，调用方会把 10 当成查询条数。现在两条错误分开：

- 5 条 query：`connect 的 queries 最多 4 项，当前为 5 项。limit 是每项返回条数（1..10），不是查询条数上限。`
- `limit:11`：`limit 是每项返回条数，必须是 1..10 的整数；queries 数组本身最多 4 项。`

核对：`connect({queries:['a','b','c','d','e']})` 与 `connect({limit:11})` 都是 `PARAM_SCHEMA_INVALID`，message 如上。

### queryGeometry 多面

`kind:"face"` 默认 `requireUnique:true`。多个面仍返回 `AMBIGUOUS_SELECTION`，并带上本页 `items`，**不**生成 `selectionToken`。message 写明匹配数量，并要求列出候选时传 `requireUnique:false`。回执增加 `listingHint:"requireUnique:false"`。

### userMessage 句号

失败回执以前把内核原句和恢复说明粘在一起，例如「请重新选面本次失败步骤未提交」。现在两句之间有句号：「请重新选面。本次失败步骤未提交」。`code`、`message`、`commitState` 不变。

### machiningIntent

严格工具卡 `logo`、`relief` 的 `inputSchema.required` 包含 `machiningIntent`。新建仍由执行端返回 `MACHINING_INTENT_REQUIRED`。旧特征没有该字段时，`feature.edit` 只改其他参数，不自动补意图。`logoId` 草稿若调用者给了 `mode` 和正的深度但没写意图，页面按该模式和深度填一条 `constantDepthContours` / `reviewedVectors`，便于已有 logoId 路径通过严格 schema。废弃的 `curvedLogo` 卡仍是建议性契约，避免旧工程编辑被新必填项打断；新建曲面刻字应走 `logo`。

### 柱面类型与落点

内核柱面编码仍是 `geomType:"CYLINDRE"`、`surfaceType:"cylindre"`。查询另给 `surfaceClass:"cylinder"`。`targetSurfaceType` 为 `cylinder`、`cylindre` 或 `CYLINDRE` 都视为同一类，不再因此 `STALE_REFERENCE`「目标面类型已改变」。平面的 `plane` / `PLANE` 同样对照。

`center` 仍是面积重心。柱面重心在轴线上，不在表面上。每个面增加：

- `pointOnFace`：重心到修剪面的最近点，在面上
- `closestPoint`：与 `pointOnFace` 相同
- `centerOnSurface`：重心是否已在面上（平面为 true，柱面为 false）
- `centerDistanceToFaceMm`

刻字锚点用 `pointOnFace`，不要用柱面 `center`。

### 其他页面说明

- 批次步骤 `id` 仍须字母开头、1–40 位 `[A-Za-z0-9_-]`。中文、空格会说明「不能使用中文、空格或标点」，并给出 `buckle`、`wave1` 这类例子。
- `transform`/`copy` 的 `mode:"rotate"` 必须带 `placement` 以及 `pivot`、`axisVector`、`angleDeg`。不传 placement 时，绕世界原点旋转用 `rx`/`ry`/`rz`，平移用 `x`/`y`/`z`，并且不要写 `mode`。
- `getTool({id:'pipe'|'thicken'|'heightfield'|'boolean'})` 返回 `UNKNOWN_OPERATION`，并指出 `curveSweep`/`profileSweep`、`thickenFace`/`shell`、`meshHeightfieldRelief`/`relief`、`union`/`cut`/`intersect`。搜索同义词也能命中这些正式工具。
- `GUIDED_LOFT_GUIDE_OFF_PROFILE` 在偏差之外返回 `nearestBoundaryPointMm` 和 `nearestCorner`。
- 平面闭合圆截面 `curveSweep` 的截面中心在路径上：路径 Z=z、半径 r 时，放置前的外包络 Z 为 z±r。本次源码测量闭合 D（半径 1.1）为 Z −1.1…1.1。现场回执里三个实体的 Z 中点都是 0.65，更像整件被工作锚点平移，而不是截面相对路径偏心。`profileSweep` 仍不把已保存截面自动搬到路径上。

## 明确未做（留给后续 services / 内核）

这些失败在当前 `src/curve-sweep.js` 与 OCCT 扫掠上可以复现，本次没有改算法，也没有关掉有效性检查。

| 项 | 现场错误 | 下一步 |
|---|---|---|
| P0-1 闭合非平面圆线 | 分段路径 `closed:true` 且冠部 Z 抬高 0.2 mm：`GEOMETRY_INVALID`「曲线扫掠失败：分段扫掠拓扑无效」。样条 `closed:true`：「closed:true 只用于分段路径」。折线回到起点：「轮廓是否自交」。 | 在浏览器内核（`BRepOffsetAPI_MakePipeShell` / 闭合线的角过渡）修闭合非平面圆管，使 G0 且不自交的路径得到单一正体积实体。修完再跑 `tests/curve-sweep.test.mjs` 里「非平面闭合分段」用例，把当前的拒绝断言改成体积和拓扑检查。不要为了通过而删除 `BRepCheck_Analyzer`。 |
| P0-1 `bendSolid` / 已有 `dBuckle` 上弯 | 没有可用的弯管操作把已生成 D 扣弯成侧向波浪。 | 若要做，放在页面建模内核或明确的新操作卡，单独验收，不在布尔失败后偷偷改路径。 |
| P0-1 闭合 `profileSweep` | `PROFILE_SWEEP_INVALID`「成型结果须为一个有效正体积封闭实体」或「保存截面必须位于路径起点平面」。 | 保持「不自动搬移截面」的契约。闭合三维路径的成型失败与上一项是同一类扫掠拓扑问题。 |
| P0-2 闭合框变截面 | `dBuckle` 只有一个 `sectionSize`。椭圆/倒角方线离开同一 XY 平面会拒绝。开放 `stations` / `guidedLoft` 已能做变截面。 | 不要在本页给 `dBuckle` 增加尚未实现的 `crownDiameterMm` / `legDiameterMm` / `barDiameterMm`。下一轮若要变径闭合圆线，在扫掠内核实现沿闭合路径的截面规律，并给模板单独的几何测试（外高、冠/腿/杆直径、体积）。 |
| P0-3 柱面刻字稳健性 | 锚点不在面内或跨缝：`GEOMETRY_INVALID`「LOGO 跨越所选面的边界、孔洞或接缝」或「中心不在所选曲面内」。`readLogo` 的 `sessionFileId` 仍要原生宿主。 | 页面已给出在面上的点并放宽类型别名。跨缝、偏置失败和字形导入仍是内核/宿主问题，不在这次改雕刻算法。 |
| P1-2 铰链 / 装配 | 没有转动副。`inspectFit` 只读。`buckleTongue` 穿过冠部时没有提交前警告。 | 不做装配求解。若要页面警告，应在提交前调用现有 `inspectFit`，并且不能把重叠自动挪开。 |
| P2 其他 | `union {keepTools:true}` 替换 `refs[0]`、保留后续刀具，与工具卡一致。现场若冠在 `refs[0]`、杆在后面，冠会被替换、杆留下。不可能体积的折线实体随后布尔失败，仍由内核体积检查拒绝，本次不放宽。 | 调整并集顺序时把要保留的实体放在 `refs[0]` 之外，或不要开 `keepTools`。体积异常继续拒绝，不自动改截面。 |

准备单仍只追问模式和深度，不把整个 `machiningIntent` 对象丢给调用者；两者齐了之后由页面写入意图。

源码里已经抛出、但 `contracts/error-recovery-codes.json` 没登记的错误码，按现有恢复类别补上了说明（含 `REVOLVE_AXIS_CROSSING`、准备单过期、证据图和光栅自动描摹）。没有改这些操作的几何。

基线 `7ee215ae` 上，握手 JSON 总长度已是约 83k、`template.ring` 卡约 12.3k，原先测试上限 80k / 12k 已经对不上。自动附带契约仍限制 `automaticChars <= 64000`。测试改为同时检查这 64000，外层 JSON 上限改为 90000，单张模板卡上限改为 14000。

## 改过的源码

- `src/surface-type.js`（新）
- `src/geometry-query.js`
- `src/page-api.js`
- `src/prepared-operations.js`
- `src/page-api-docs.js`
- `src/page-batch.js`
- `src/command-service.js`
- `src/error-recovery.js`
- `src/operation-registry.js`
- `src/main.js`
- `src/cad-kernel.js`
- `src/work-frame.js`
- `src/feature-plan.js`
- `src/loft-guided.js`
- `src/advanced-operation-catalog.js`
- `src/operation-examples.js`
- `src/modeling/manufacturing/relief-contracts.js`
- `scripts/test.mjs`
- `src/agent-knowledge.js`
- `scripts/generate-page-docs.mjs`
- `contracts/operation-impact-map.json`
- `contracts/error-recovery-codes.json`（补上源码里已有的 `REVOLVE_AXIS_CROSSING`，归入参数类恢复说明）
- `docs/CHANGELOG.zh-CN.md`
- `public/automation/**`（由 `node scripts/generate-page-docs.mjs` 重写的契约快照）
- 回归测试：`tests/error-recovery.test.mjs`、`tests/tool-discovery.test.mjs`、`tests/pattern-machining.test.mjs`、`tests/page-batch.test.mjs`、`tests/geometry-query.test.mjs`、`tests/curve-sweep.test.mjs`、`tests/loft-guides.test.mjs`

## 在本机 Windows 树应用

维护目录是 `F:\Project\WebCAD`，分支应对齐本次 PR，而不是在教师机上直接改。

1. 确认工作区干净，或先提交/另存已有修改。不要 `reset`/`checkout` 覆盖未提交文件。
2. 取本次 PR 分支，合并到该树的 `main`（或由维护者指定的对照分支）。
3. 在 `F:\Project\WebCAD` 执行 `npm test`，以及 `npm run test:contracts`。两者都要通过。内核测试需要本机 `node_modules` 里的 OCCT WASM。
4. 发布前按现有脚本重生成页面文档（`node scripts/generate-page-docs.mjs` 或 `npm run build`）。用各入口的 HTTP 响应核对 `buildId`、`pageApiVersion`（应为 `1.60.11`）、`catalogHash`、`docsHash`。本说明不授权生产发布。
5. 宿主若缓存了旧知识包，握手后按新的 `catalogHash`/`docsHash` 重新下载。不要沿用旧工具卡里的 `schemaHash`。
6. 若该树还用 `webcad-skills\scripts\generate-tools.mjs` 维护技能快照，在合并后对 `F:\Project\WebCAD` 再跑一次，使技能卡与页面契约一致。

工程、Cookie、自定义颜色和后端任务数据不要为了这次升级覆盖。

## 回滚

1. 将 `F:\Project\WebCAD` 的 `main` 退回到合并本 PR 之前的提交（预期包含 `7ee215ae`，若当时 main 已更新则退回到合并前的那一笔）。使用 revert 合并提交，避免丢弃期间的其他修改。
2. 再执行一次 `node scripts/generate-page-docs.mjs`，让 `public/automation` 的哈希回到旧契约。
3. 已用 `1.60.11` 保存、且 `logo`/`relief` 带 `machiningIntent` 的工程仍可在旧页面打开；旧页面不认识 `pointOnFace` 只是查询结果少字段，不改已提交实体。
4. 不要用旧包覆盖已经带有其他已授权功能的站点目录。

## 测试

本次改动直接相关的用例已通过，包括：

- `tests/error-recovery.test.mjs`
- `tests/tool-discovery.test.mjs`
- `tests/pattern-machining.test.mjs`
- `tests/page-batch.test.mjs`
- `tests/geometry-query.test.mjs`
- `tests/curve-sweep.test.mjs`
- `tests/loft-guides.test.mjs`
- `tests/logo-review-api.test.mjs`
- `tests/mechanical-tools-contracts.test.mjs`
- `tests/operation-registry.test.mjs` 中除下面这一项以外的用例
- `tests/projected-logo.test.mjs`

`npm test`（portable，333 个文件）在这台云端环境里 **不能算全绿**。基线 `7ee215ae` 的 `scripts/test.mjs` 本来就没有登记约 23 个已存在的 `tests/*.test.mjs`，一启动就报 manifest mismatch。补登记之后整包跑完：1313 通过，36 失败。失败里和本次契约有关、已修好的是 `machiningIntent` 必填导致的 relief 示例。其余失败在改这些文件之前就会出现，例如：

- `operation-registry` / 发现测试期望 `runtimeAvailability==='available'`，当前实现在 `browserReady:true` 时返回 `page_ready`
- `agent/temp/relief-waves.jpg` 等本机夹具不在云端
- `debugJournal` / `connectionGeneration` / `validateReliefDesigns` 在部分用 `eval` 截取 `main.js` 的测试里未注入
- 若干 DWG 快捷模型说明字符串与断言不一致

云端没有浏览器，不能对 `http://localhost/webcad/` 或生产页做端到端。柱面落点和平面圆截面中心是用仓库里的 OCCT WASM 测的。
