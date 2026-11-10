# Round 6 F-22 根因升级说明（2026-11-10）

页面 API：`1.64.0`。基线：`main` @ `9490a56`（当时 pageApiVersion `1.63.7`）。

这次按 Round 6 现场症状改页面与浏览器内核，不重建 F-22，不部署，不合并，不改 Teacher-O。

**`services/**` 没有修改。** 圆角、重建、面签名和视图都在浏览器 OCCT / 页面里完成。不需要替换 WebCADServices，也不需要跑 .NET 构建。

## 根因

- 铣削回退在 `material:'combined'` 时不检查体积，放样圆角可以花很久后仍提交一份和输入相同的实体。
- 下游只要参数里有面号，上游任何修改都会被 `UNSAFE_LEGACY_REFERENCE` 挡住，即使该面带有可重映射的签名。
- 调试环把每个特征的 `kernel:progress` 都记成新事件，错误被挤掉。
- 重布尔写入 `compiledCheckpoint` 后，几何签名和内存里的历史签名不一致，下一步把已经算过的前缀又算一遍。预览提交会再重建一次同一文档。`api.run` 每步都克隆完整 `getState`。
- `preview.start` 回执字段是 `generation`，提交却只认 `expectedGeneration`，未知字段的句子里没有字段名。
- `feature.edit` 不补 `opVersion` / `schemaHash`，而 `add` 会补。
- `addMany` 已在 `BATCH_METHODS` 里，工具卡 `feature.addMany` 的 `batchCapable` 仍是 false。
- 一次写入回执里，context 在批次、facts 和步骤上各复制一份。
- `setProjection` 末尾总是 `fit()`，把刚设置的 camera 覆盖掉。
- `faceGroove` 接受弯曲圆柱面的说法和实现不一致，槽又不能离开面心。
- 批次把显示上传推迟到下一次 `capture`，耗时全部算进截图。

## 已修复

### 1. 圆角必须真的改变几何

原生圆角和铣削回退都要通过有效单实体检查，并且体积必须变化。铣削回退不再因为 `combined` 跳过这项。没有变化时抛出 `MATERIAL_CHECK_FAILED`（「铣削回退未改变几何」或「圆角未产生可测量的材料变化」），不提交。合法小半径圆角和倒角仍提交。直纹放样上的全边圆角要么体积变化，要么明确失败，源实体保持原样。

### 2. 带签名的面引用不再锁死无关上游

`logo`（placementVersion 2）和 `faceGroove` / `innerTurn` / `outerTurn` 在创建时写入 `targetFaceSignature`。历史检查只拦截没有签名的边/面编号。重建时按签名把 `faceId` 重映射到唯一匹配的面；签名对不上则 `STALE_REFERENCE`，不把刀开在错误的面上。没有签名的旧圆角边号仍会阻止上游修改。

### 3. 调试进度只占一个槽

同一次内核请求的 `kernel:progress` 在环形缓冲里就地更新。错误、警告和操作结果仍逐条保留。重建完成事件带 `featureCount` / `reused` / `recomputed`。已复用的特征不再逐个发送 feature/validation 进度。

### 4. 可测量的增量重建

- 文档签名与上次完全一致时，直接返回显示缓存（`cacheHit:'incremental-prefix'`），不再重跑 BRepCheck 和网格。
- `bakeProject` 写回检查点后调用 `adoptHistorySignature`，下一次追加只算新特征。
- `preview.commit` 在特征签名未变时复用预览那次重建结果。
- `api.run` 在宿主提供 `revisionStamp` 时，逐步检查不再调用完整 `getState`。
- `getPerformanceState` 附带最近一次成功重建的 `kernelRebuild`（总时间、每特征耗时、是否命中缓存）。没有合格前台交互样本时，帧统计仍可以是空的，这不是重建计时。

### 5. 契约

- `preview.commit` / `preview.update` / `preview.cancel` 接受 `generation` 作为 `expectedGeneration` 的别名。两者不一致，或出现其他未知字段时，`error.details.unknownField` 与 `expected` / `expectedFields` 会写出字段名。
- `feature.edit` 缺省 `opVersion` / `schemaHash` 时，用被编辑特征自己的工具卡补齐。显式传入且不符仍是 `OPERATION_VERSION_UNSUPPORTED` 或 `SCHEMA_MISMATCH`。
- `feature.addMany.batchCapable` 为 true，`batchMethod` 为 `addMany`。`api.run` 的步骤方法名仍是 `addMany`。

### 6. 回执、视图、锣槽、截图

- 写入回执保留顶层 `context`、`requestContext` 和 `facts.nextContext`。与它们相同的嵌套 context 改为 `contextRef`。`error.recovery.reason` 已包含在 `userMessage` 开头时不再重复；`error.userMessage` 与 `recovery.userMessage` 仍保留。
- 同时传 `camera` 和 `projection` 时，投影切换不调用 `fit`。显式 `fit:true` 或 `direction` 仍会重新取景。
- `faceGroove` 只接受真实平面（控制点共面的 BSpline 仍视为平面）。弯曲圆柱面返回 `CAPABILITY_UNAVAILABLE`。`offsetXMm` / `offsetYMm` 相对面心偏移。槽没有完全落在面内时提交仍发生，但体积小于长×宽×深，并带 `PARTIAL_RECESS`。深度沿平面法向，不在曲面上做变深度投影。
- `capture` 先完成推迟的显示上传，回执分开给出 `displayWaitMs` 与 `frameMs`。截图超时只覆盖出帧，不覆盖网格上传。尺寸是三维视口画布（`width` / `height` / `viewportCss`），不是整个浏览器窗口。侧栏占掉的像素不会被算进视口。这一项不依赖 Services。

## 回归

这些测试在 `npm test`（`node scripts/test.mjs portable`）里：

| 测试 | 作用 |
| --- | --- |
| `tests/kernel-postconditions.test.mjs` | 直纹放样圆角成功必须改变体积，否则失败且源实体不变 |
| `tests/mill-fillet-fallback.test.mjs` | 铣削回退拒绝零变化；`preferMillFallback` 成功必须减料 |
| `tests/history-edit-safety.test.mjs` | 带签名的 logo / faceGroove 不锁死另一来源的上游编辑；无签名面号仍拒绝 |
| `tests/face-machining.test.mjs` | 曲面锣槽拒绝、偏移改变去除量、签名重映射到原平面 |
| `tests/debug-journal.test.mjs` | 40 条进度合并为 1 条，错误仍在 |
| `tests/quick-hardware-integration.test.mjs` | 相同文档命中前缀缓存；烘焙签名后追加特征复用旧实体 |
| `tests/command-service.test.mjs` | `feature.edit` 自动补版本；`generation` 别名；未知字段带 `unknownField` |
| `tests/page-batch.test.mjs` | `revisionStamp` 时不再逐步调用完整 `getState` |
| `tests/receipt-compact.test.mjs` | 单次回执里 session 身份不超过 3 份，`nextContext` 仍在 |

`scripts/test.mjs` 同时补上了基线里已经存在、但没登记的测试文件（`curve-sweep-contract`、`edge-batching`、`job-call-contracts`、`procedural-antique-atlas`、`public-knowledge-cache`、`section-polyline-vertices`、`uniform-surface-grid`）。不登记时 `npm test` 会在跑任何用例之前直接退出。这些文件不是本轮新写的用例。
| `tests/batch-capable-parity.test.mjs` | `feature.addMany` 与 `BATCH_METHODS` 一致 |
| `tests/viewport-transform.test.mjs` | `setProjection({fit:false})` 不移动已设置的相机 |

## 验证

在仓库根目录：

```text
npm test
npm run test:kernel
npm run build
```

`npm test` 是 `node scripts/test.mjs portable`。`npm run build` 会重写 `public/automation/**`、做 Vite 构建，并运行 `scripts/verify-release.mjs`。干净工作区上的 `buildId` 不再带 `-working`。

`vendor/replicad-opencascadejs/dist` 被 gitignore，需要带 `BRepFill_ThruSectionErrorStatus` 的匹配内核。没有这份 dist 时，`tests/section-curve-loft.test.mjs` 的 “matched kernel returns serializable native ThruSections statuses” 会因 `unbound types: BRepFill_ThruSectionErrorStatus` 失败。这不是本轮页面改动引入的；用上游 `replicad-opencascadejs@1.1.0` 代替匹配内核时会出现。有匹配 dist 的环境应通过这一项。

当前契约（由源码计算，与 `public/automation/manifest.json` 一致）：

- `pageApiVersion`: `1.64.0`
- `catalogHash`: `sha256:e54bfaa3c867242c64749c5c1f023427d6e4a1a329c6c58d074c117dbd71e86b`
- `docsHash`: `sha256:b0f2bf67c70ed9b28578f0f3cb78aac750af9f778a4573b6775c581c72ce09e9`

## 升级页面

1. 拉取包含本说明的提交。不要覆盖或重编 `services/**`。
2. 在仓库根目录执行 `npm ci`，然后 `npm test` 和 `npm run build`。
3. 用构建产物替换页面静态文件。核对 `automation/manifest.json` 的 `version` 为 `1.64.0`，并且 `catalogHash` / `docsHash` 与该次构建打印的一致。
4. 已打开的页面要重新加载。旧的 `1.63.7` 工具卡不能继续用来判断 `batchCapable` 或圆角是否已经成功。
5. 调用方可以改、但不是必须改的点：
   - `feature.edit` 可以不再手填 `opVersion` / `schemaHash`。
   - `preview.commit` 可以直接传 `preview.start` 返回的 `generation`。
   - 互不依赖面号的一批新特征优先 `run` 的 `method:'addMany'`。
   - 下一笔写入仍用回执里的 `requestContext` 或 `facts.nextContext`。
6. 已有工程不用迁移。没有 `targetFaceSignature` 的旧面号特征，行为与以前一样：上游修改仍会要求重新选面。新的 logo 和锣槽会带上签名。

## 部署后现场复测

不要用本说明代替几何验收。建议在重新加载后的页面上：

1. 做一小段直纹放样，`fillet` `allEdges` 小半径。成功时体积必须变化；失败时代码是 `GEOMETRY_INVALID` 或 `MATERIAL_CHECK_FAILED`，实体与失败前一致。同一翼上的小倒角仍应成功。
2. 在并集体上做带签名的 logo 或 faceGroove，再 `feature.edit` 一个不贡献该面的上游特征。不应再出现 `UNSAFE_LEGACY_REFERENCE`。编辑真正改变该面时，应是 `STALE_REFERENCE` 而不是刻到别的面上。
3. 连续追加几个 `box`。`getPerformanceState` 的 `kernelRebuild.perFeatureMs` 里，未改动的前缀 `reused:true`。重布尔之后的下一步不应再把整个前缀重算一遍。
4. `getDebugReport` 里 `kernel:progress` 不应再占满 1500 条；同一次重建只有一条进度，错误仍在。
5. `preview.start` 后用返回的 `generation` 调用 `preview.commit`，应提交而不是 `Unknown field`。
6. `feature.edit` 只传 `featureId` 和 `params`，应提交。
7. `getTool({id:'feature.addMany'})` 的 `batchCapable` 为 true。10 个独立盒子用一次 `addMany`，应明显快于 10 次单步 `run`。
8. 单个盒子回执里 `requestContext` 与 `facts.nextContext` 都在，嵌套 context 不再重复整份。
9. `setView` 同时给 `camera` 和 `projection`，读回的相机位置应仍是传入值，除非同时给了 `fit:true` 或 `direction`。
10. 圆柱侧面 `faceGroove` 应失败并说明要平面。平面上的 `offsetXMm` 应移动槽的位置。
11. 大批次后的第一次 `capture` 回执应有 `displayWaitMs` 和 `frameMs`。`width`/`height` 对应该三维视口，而不是浏览器外框。
