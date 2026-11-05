# 页面 API 第 4 轮探针修复升级说明（2026-11-05）

页面 API：`1.60.11`（版本号未加）。基线：`main` @ `748552ef`（PR #4 已合并）。现场证据是线上 `748552ef` 的 Round4 回执（R4-010…067）。下面的错误句来自这些回执或当前源码。

本次几何都在浏览器 OCCT（`replicad-opencascadejs`）里实测。**没有修改 `services/**`，也没有模拟 .NET 计算。** 柱面刻字、扫掠、放样、布尔都不在 WebCADServices 的 LogoVector / Runtime 路径上。部署时不要替换服务端二进制。

## 已修复

### 柱面 `singleFace` 等深凹刻（R4-010 / R4-043）

柱面面积重心在轴上，最近点经常正好落在周期母线（接缝）上。LOGO 中心压在接缝上时，投影被分成两片，以前报「投影为空、跨接缝或分成多片」。

- `pointOnFace`：若最近点距周期接缝不超过 0.05 mm，改到该面参数域中点，并返回 `periodicSeamAvoided:true`。边结果里的 `periodicSeam` 仍标出母线。
- `singleFace`：只越过周期接缝的多片，各自做法向等深，再融合后切除。体积与不压缝的同尺寸凹刻一致。碰到顶底边或孔洞仍拒绝。
- `connectedFaces` 仍是另一种深度（沿锚点法向投影），并且只接受凹刻。凸字继续拒绝。

核对：半径 10 mm、高 20 mm 的圆柱，4×4 mm、深 0.3 mm 的方块放在接缝 `[10,0,10]` 上可以提交，去除体积与放在 `[0,10,10]` 相同。半宽 0.05 mm 的方块也可以去除材料。

### 闭合非平面折线扫掠（R4-011 / R4-044 / R4-062）

内核检查没有关掉。单角抬高再回到原高度、以及冠部圆弧带 Z 的 D 形，仍然 `GEOMETRY_INVALID`，句子里保留「分段扫掠拓扑无效」，并写明：

- 切向不连续的闭合非平面折角不能形成有效实体。
- 同一平面的闭合折线可以。
- 对边整体抬到同一高度可以（实测 Z=0.2 mm、半径 1 mm 的矩形体积约 201 mm³）。
- 圆滑非平面（正弦密折线）可以。
- `closed:true` 只用于 `pathType:segments`。

`transitionMode` 换成 `round` 或 `transformed` 不能让单角路径通过有效性检查，所以没有改默认过渡，也没有把无效实体提交出去。

### `pathType:sections` 与 `closed:true`（R4-012 / R4-042 / R4-063）

没有做真正的周期多截面实体。契约直接拒绝：

`多截面模式不支持 closed:true。开放 stations 可以提交。近似闭环请让首尾截面重合且 closed:false（伪闭）。闭合变径圆线用 pathType:segments 与 widthLaw，不要给 sections 设闭环。`

这是 `PARAM_SCHEMA_INVALID`，路径 `params`。开放 stations、以及闭合 `widthLaw` 样条圆截面，行为不变。

### 步骤 id 与批内引用（R4-020 / R4-021 / R4-039 / R4-046 / R4-064）

`api.run` 先走步骤 schema。中文、全角、emoji 的 id 不再只剩「不符合当前工具契约」。`message` 和 `userMessage` 都写明不能使用中文、全角字符、emoji、空格或标点，并给出 `wave_1`、`wave-1`、`buckle`。

同批引用只有对象形式：`{"$ref":"wave_1.createdBodyIds.0"}`。`$c`、`${…}`、`step:`、`#`、`@` 这类字符串会 `STALE_REFERENCE`，并说明改用对象。没有实现字符串别名。

### 工作基准不再被 API 静默上移（R4-030 / R4-036）

用户在界面里新建实体时，若锚点所在竖列已经被占，工作基准仍会沿 +Z 让出 0.05 mm，避免下一次点击叠在一起。`origin==='agent'` 的创建（页面 API / 批次）**不会**再挪这个基准。

工具卡改成：局部实体从模型原点长出；省略 placement 时用当前工作基准，基准一开始在世界原点。`hole` 的 x/y/z 是定位框坐标，不是「盒子一定在世界原点」的局部坐标。要打孔先读包围盒。示例点 `[5,5,4]` 只在目标确实占据该世界点时才会切入。

### `profileSweep` 姿态（R4-037 / R4-045 / R4-056）

默认仍然不搬移已保存截面。两条出路写进工具卡和对话框：

- 路径沿 +X、截面在 XY：`placement.quaternion=[0, 0.7071067811865476, 0, 0.7071067811865476]`（绕 Y +90°）。
- `alignProfileToPath:true`：只摆放一份副本，把截面中心放到路径起点，并把截面法向转到起点切线。已保存截面不变。

实测：XY 上直径 2 mm 的圆，沿未对齐的 10 mm 路径，打开该开关后体积为 `10π` mm³；不打开仍拒绝。

### `guidedLoft` 恢复点（R4-022）

`GUIDED_LOFT_GUIDE_OFF_PROFILE` 在错误对象和 `error.report` 里都带 `nearestBoundaryPointMm`、`nearestCorner`。`error.recovery` 同样带上该点，`userMessage` 会写出毫米坐标。Worker 只转发 `report`，所以以前页面回执里看不到这个字段。

### 页面方法与批次（R4-023）

- `capture`、`recoverKernel`：`pageMethodOnly:true`，`batchCapable:false`。放进 `api.run` 时，在任何步骤执行前失败，并说明应直接调用 `api.capture` / `api.recoverKernel`。
- `inspectDesign` 可以进批次，也可以页面直调。卡上写明必须带 `requirements[]`。`toleranceMm` 是绝对毫米，必须 >0 且 ≤1。

### 未知操作名（R4-024 / R4-058）

`patternLinear` → `linearPattern`（dx/dy/dz）。`patternCircular` → `circularPattern`。`draft` → `draftByPlane` 或 `draftFaces`。`counterbore` → `holeWizard`。`text`、`wrap` 以及「阵列 / 线性阵列 / 环形阵列 / 拔模」会指出正式 id。`getTool` 和 `feature.add` 同一句。

### 无相交 `cut`（R4-032 / R4-059）

体积没有减少时返回 `NO_MATERIAL_REMOVED`：「切割与目标没有材料相交，体积没有减少，本次不提交，也不删除刀具。」`keepTools` 不能把一次空切变成成功。相交切割的体积范围检查不变。

### 工具卡 schema（R4-041 / R4-050 / R4-051 / R4-065）

`files.*` 以及还没有 `inputSchema` 的页面方法（含 `measure`、`inspectFit`、`recoverKernel`）把准备契约填进 `inputSchema`。`inspectFit` 的必填是 `bodyAId` 与 `bodyBId`。准备调用形状写在卡上：`prepareToolCall({toolId,context,args})`。

`quickModel` 的 kind 不在目录里时，不再只说 “Exactly one alternative”，会点名去读 `templates[].kind`，并举例 dBuckle、tube、washer、ring。草图圆的未知 `radiusMm` 会提示改用 `diameterMm`。`segments` 少于 2 段时说明不能配 `widthLaw`。

被特征替换掉的 body id：`STALE_REFERENCE` 说明改用 `createdBodyIds` 或 `replacements.after`。

## 明确未做

| 项 | 原因 |
|---|---|
| 真正的周期多截面闭环 | OCCT `ThruSections` 这条路径没有周期实体。伪闭（首尾重合且 `closed:false`）和闭合 `widthLaw` 仍可用。 |
| 单角闭合非平面扫掠的实体 | `right` / `round` / `transformed` 都过不了 `BRepCheck_Analyzer`。没有放行无效拓扑。 |
| 字符串步骤别名 | 对象 `$ref` 已经可用。别名只会造成第二套引用，所以拒绝并说明。 |
| 曲面 LOGO 凸字 | 与现有契约一致，跨面和曲面都只做凹刻。 |
| `services/**` | 这些失败不在 .NET 服务里。没有假造服务端产物。 |

## 改过的源码

- `src/curved-logo.js`、`src/geometry-query.js`
- `src/curve-sweep.js`、`src/section-curve-loft.js`、`src/advanced-operation-catalog.js`
- `src/loft-guided.js`、`src/cad-kernel.js`、`src/main.js`
- `src/page-batch.js`、`src/page-api-docs.js`
- `src/contracts/operation-schema.js`、`src/parameter-error-message.js`、`src/error-recovery.js`
- `src/operation-registry.js`、`src/operation-catalog.js`（示例数值未改）
- `src/command-service.js`、`src/tool-call-contracts.js`、`src/design-inspection.js`
- `src/modeling/profiles/profile-solid-features.js`、`profile-solid-contracts.js`
- `src/ui/forms/profile-solid-dialogs.js`
- `public/automation/**`（`node scripts/generate-page-docs.mjs` 重写；不要提交 `agent-bundle.zip`）
- 测试：`tests/curved-logo.test.mjs`、`tests/curve-sweep.test.mjs`、`tests/page-batch.test.mjs`、`tests/parameter-error-message.test.mjs`、`tests/mechanical-tools-integration.test.mjs`

## 在本机 Windows 树应用

先由曾智鹏看过本 PR，再合并。不要在确认前改 `F:\Project\WebCAD`，也不要部署。

1. 确认工作区干净，或先提交/另存已有修改。
2. 把本 PR 合并进该树的 `main`。
3. 在 `F:\Project\WebCAD` 执行 `npm test` 和 `npm run test:contracts`。内核测试需要本机 OCCT WASM。
4. 发布前执行 `node scripts/generate-page-docs.mjs` 或 `npm run build`，核对 `buildId`、`pageApiVersion`（仍为 `1.60.11`）、`catalogHash`、`docsHash`。本说明不授权生产发布。
5. 宿主若缓存了旧知识包，握手后按新的 `catalogHash` / `docsHash` 重新下载。
6. 不需要更新或重启 WebCADServices。

工程、Cookie、自定义颜色和后端任务数据不要为了这次升级覆盖。

## 回滚

1. 将 `F:\Project\WebCAD` 的 `main` revert 到合并本 PR 之前的提交（预期包含 `748552ef`）。
2. 再执行一次 `node scripts/generate-page-docs.mjs`，让 `public/automation` 的哈希回到旧契约。
3. 已提交的柱面凹刻和 `alignProfileToPath:true` 的特征可以在旧页面打开；旧页面不认识 `periodicSeamAvoided` 只是查询少一个字段。
4. 不要用旧包覆盖已经带有其他已授权功能的站点目录。

## 测试

`npm test`（portable）在 2026-11-05 跑完：**1360 项，1355 通过，0 失败，5 跳过**，约 902 秒，退出码 0。5 个跳过是原来的环境条件，这次没有新增 skip。

见 `docs/HANDOFF-20261105-page-api-round4.zh-CN.md`。云端没有浏览器，没有对 `goldenfu.cn` 或本机页面做端到端。柱面接缝、折线扫掠、自动姿态和空切是用仓库里的 OCCT WASM 跑的。
