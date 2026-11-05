# Round 5 根因收敛升级说明（2026-11-05）

页面 API：`1.61.0`。基线：`main` @ `aac317ccc7e6d72b8a0b59dc84b12cbef198a978`。

这次把 Round 5 里反复出现的五类问题收到同一套规则上：几何后验、工具卡与批量白名单、快捷模型提交后统计、文件/批次说明，以及会在 `npm test` 里重跑的对等测试。

**`services/**` 没有修改。** 不需要替换 WebCADServices，也不需要跑 .NET 构建。柱面刻字、扫掠、抽壳、圆角仍在浏览器 OCCT 里完成。

发布时核对公开仓库地址会先去掉 `https://` 用户信息。Git 把 `github.com` 重写成带凭据的地址时，仍只接受 `Orua/WebCAD`，凭据不会写进开源清单。

## 根因

同一件事以前有多份互相独立的记录：

- 工具卡自己猜 `batchCapable`，运行时另有 `BATCH_METHODS`。
- 可复制的示例对象里塞了 `referenceInstructions` / `validation`。
- 快捷模型目录接受隐藏种类，提交成功后再按“模型库可见种类”抛错。
- 标准圆角的铣削回退不检查半径是否放得进相邻面；抽壳几乎只拒绝厚度 0。
- 闭合扫掠的 `profileSweep` 默认 `transformed`，`curveSweep` 却把闭合路径固定成 `right`，失败句子也不说明可以改过渡。

## 已修复

### 1. 圆角、抽壳、扫掠

- 单边 `fillet` 不再因为 `allowOversizedMill` 接受放不进相邻面的铣削回退。10×10×10 mm 方块、`edgeIds:[0]`、`radius:20` 或 `50` 返回 `GEOMETRY_INVALID`，源实体体积和序列化结果保持不变。合法小半径圆角仍然提交。过大的全边圆角和倒角仍拒绝。
- 原生圆角/倒角成功时还要过单实体、体积有变化、体积不得塌到源体积的 35% 以下。
- `shell`：正厚度向内，且必须小于实体最小尺寸的一半，结果必须是有效单实体且体积下降。负厚度向外，结果必须有效，并且体积增加或包围盒变大（开口抽壳会把实心掏空，材料体积可以下降）。厚度 0、以及把内腔掏没的厚度，返回 `GEOMETRY_INVALID`。
- 界面壁厚改为有符号非零，文案是「正值向内，负值向外」。契约同样写明这个规则。
- 闭合路径上转角大于 15° 且 `transitionMode` 为 `transformed` 时，`profileSweep` / `curveSweep` 直接说明应改用 `right` 或 `round`，或把尖角改成相切圆弧。`right` 和 `round` 的闭合矩形扫掠可以生成实体。`curveSweep` 在调用方传入 `transitionMode` 时按该值扫掠；不传时仍是开口分段 `transformed`、闭合路径 `right`。
- 重建每个 BRep 时仍做 `BRepCheck_Analyzer`。没有在每次重建上再做一次体积积分，因为那会改写 STEP 颜色实体的写出顺序。

### 2. 工具卡、`batchCapable`、示例

- 发布的每张卡的 `batchCapable` 等于该 id 是否在 `BATCH_METHODS` 里。`add` / `addMany` 仍是批次步骤，没有同名工具卡。
- `referenceInstructions` 和 `validation` 改到 `exampleNotes`。`minimalExample` / `normalExample` 可以按原样对照 `api.run` 的 add 步骤结构，不再因为说明字段报 `Unknown field`。

### 3. 隐藏快捷模型

`roundBadge`、`thinWallTray`、`roundedBossTray`、`uEndHolePlate`、`arcBandPlate`、`gableOpenFrame` 仍是 `visibleInLibrary:false`，但已注册。`recordQuickModelUse` 对它们直接返回当前统计，不抛 `未知快捷模型`，也不把它们算进模型库常用列表。几何提交之后，使用统计再失败也不会把这次提交改成 `RESULT_UNKNOWN`。

### 4. 批次、文件和提示

- `api.run` 不接受 `atomic`。传入即 `PARAM_SCHEMA_INVALID`。批次始终 `atomic:false`：某步失败时，前面已经提交的步骤保留。同一修订里要一次提交多个特征，用 `feature.addMany`。
- `files.read` 必须带 `as`：`bytes`、`text` 或 `blob`。缺省不再返回一个会被 JSON 收成 `{}` 的 Blob。`text` 要求 UTF-8。
- 未知操作名：`scale` / `move` / `rotate` 指向 `transform`，`offsetFace` 指向 `thickenFace` / `offsetSurface`，`deleteFace` 指向 `remove` / `split`。
- `preview.start` 的编号在 `result.preview.previewId`，回执顶层同时有 `previewId`、`generation`、`baseRevision`。

## 回归门禁

这些测试在 `npm test` 里，发布脚本也会跑前两项的同一检查：

| 测试 | 作用 |
| --- | --- |
| `tests/batch-capable-parity.test.mjs` | 每张卡的 `batchCapable` 与 `BATCH_METHODS` 一致 |
| `tests/tool-examples-schema.test.mjs` | 示例里没有说明字段，add 步骤对得上批处理结构 |
| `tests/quick-model-parity.test.mjs` | 全部快捷模型（含 6 个隐藏种类）能建成有效实体，且使用统计不抛错 |
| `tests/kernel-postconditions.test.mjs` | 过大圆角、抽壳正负厚度、闭合平滑/尖角扫掠 |

`scripts/verify-release.mjs` 会调用 `assertAutomationParity()`。

## 验证

在仓库根目录：

```text
npm test
npm run test:kernel
npm run build
```

`npm test` 是 `node scripts/test.mjs portable`，包含契约、内核和 MCP 测试。`npm run build` 会重写 `public/automation/**`、做 Vite 构建，并运行 `scripts/verify-release.mjs`。

干净的 `npm test`（portable，337 个测试文件，约 15.2 分钟）：**1364 通过，0 失败，5 跳过**。5 个跳过是没有 `WEBCAD_SERVICES_OCCT_WORKER` 时的原生 worker 用例。内核文件包含在这次 portable 运行里，其中有 `kernel-postconditions`、`quick-model-parity`、`edge-blend`、`curve-sweep` 和 `profile-solid-features`。中间有一次失败是重建时多做的体积积分打乱了 STEP 颜色顺序，去掉该积分后 `tests/step-export-colors.test.mjs` 已通过，并已重跑整套 portable。

当前生成目录（提交前若再次 `npm run build`，`buildId` 会改成当时的 git 提交）：

- `pageApiVersion`: `1.61.0`
- `catalogHash`: `sha256:fedacca90b7cc6294a2b9316e0e1c31e5f39aedd02250d1c495bc584d8ea5bd2`
- `docsHash`: `sha256:dfbd310c551d861bf163be4d0d6882e60b0ce188f003ee29703306b170134f67`

## 升级 `F:\Project\WebCAD`

1. 拉取包含本说明的提交。不要覆盖或重编 `services/**`。
2. 在仓库根目录执行 `npm ci`，然后 `npm test` 和 `npm run build`。
3. 用构建产物替换页面静态文件。核对 `automation/manifest.json` 的 `version` 为 `1.61.0`，并且 `catalogHash` / `docsHash` 与该次构建打印的一致。
4. 已打开的页面要重新加载。旧的 `1.60.11` 工具卡缓存不能继续用来判断 `batchCapable` 或复制示例。
5. 调用方需要调整的只有这些不兼容点：
   - `files.read` 必须写 `as`。页面里要 Blob 时用 `as:'blob'`，给 JSON 宿主用 `as:'bytes'` 或 `as:'text'`。
   - `api.run` 不要再传 `atomic`。
   - 复制工具卡示例时不要再期待里面有 `referenceInstructions`。
6. 已有工程不用迁移。隐藏快捷模型以前如果已经留下实体，撤销一次即可去掉那次未知结果；新的调用会正常 `completed`。
