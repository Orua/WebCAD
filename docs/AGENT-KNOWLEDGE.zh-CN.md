# Agent 首次知识下载与任务路由

首次握手返回 `connect().onboarding.knowledge`，主动要求准备统一知识包。宿主读取 `automation/agent-knowledge.json`，只下载一次 `agent-bundle.zip`；同包包含完整说明书/工具卡、建模技能正文、任务/UI路由、宿主技能与必要适配文件。先核对ZIP字节数和SHA-256，再逐文件校验后解压到宿主缓存，最后写入ready回执。无需再下载独立技能ZIP。压缩大小见 `archive.sizeBytes`，说明书未压缩大小仍见 `totalBytes`。

每次接入比较实际页面buildId、catalogHash、docsHash及本地knowledgeVersion与逐文件哈希。同版完好缓存复用；版本不符、缺文件或损坏时重新下载整个统一包。下载和解压不代表把全本读进上下文。回执明确completeLibrary、knowledgeVersion、installedDirectory/目录、installedFiles、cacheHit；询问是否下载时直接报告回执，不调用无关CAD工具。

缓存按“页面来源和子路径＋catalogHash＋docsHash”隔离。同一来源重连时校验本地文件，哈希一致就复用。缺文件、文件损坏或版本漂移时刷新；下载中断不能标为 ready。静态库不保存当前工程、会话身份、实体/面边编号；示例 ID 也不能当当前 ID 使用。

| 任务路由 | 先读 | 后续按需取卡 |
|---|---|---|
| 陌生品类、结构及配件 | api.product-source，再按planSource返回的product.* | 仅选中结构族所需完整卡 |
| 源图理解、DWG重建 | api.reconstruction、api.vector-import | readVector / connectVector / curveSweep / advancedLoft |
| 常用模板 | api.workflow | 精确 template.* 单模板卡 |
| 轮廓、截面、约束 | api.mechanical、api.references | sketchProfile / profileSweep / profileLoft / planeSection |
| 孔槽、螺纹加工 | api.mechanical | holeWizard / multiHole / multiPocket / thread |
| 布尔运算、局部切削修补 | api.workflow、api.run | cut / union / intersect |
| 插入锚点、对象锚点与基准 | api.references | reference.setWorkFrame / resolvePlacement / queryReferences / reference.setBodyAnchor |
| 圆角、端部圆润 | api.smooth-transition及对应工具卡 | round / fillet / rounding / roundEnd / chamfer |
| Logo、浮雕 | api.logo、api.relief | logo / curvedLogo / relief |
| 材料、尺寸、配合 | api.design-checks | inspectDesign / measure / inspectThickness / inspectFit |
| 定位、编辑、历史 | api.editor、api.references | transform / body.align / feature.edit / history.undo |
| 保存、导出、文件 | recipe.file-workflow、api.file-errors | files.* |

准确 UI 动作沿 `routes.json` 查；自然语言任务沿 `agent-routing.json` 查。路由只决定先读什么，不替代几何判断。未命中则调用当前页面 `searchTools`，已知 ID 直接 `getTools`。模板优先读单模板卡，避免把全部快捷模型目录塞进上下文。

布尔切削、并集、交集、实体移动及插入锚点的通用同义词由 `src/agent-knowledge.js` 声明并进入完整工具卡。页面与离线库读取同一契约；“移动”优先实体变换，“锚点”优先工作基准，不应默认选择视图移动或删除锚点。具体实体及基准类型仍按当前状态和完整卡片确认。

可选 Node 宿主 helper：

```js
const client = createPageClient({
  send: (method, params) => cdp.send(method, params), // 已授权宿主通道
  knowledge: { baseUrl: await tab.url() } // 默认 ~/.codex/cache/webcad
});
const connection = await client.connect(); // 自动下载/验证，只返回缓存回执
const route = await client.route('DWG图纸重建');
const selected = await client.readLocal({
  docIds: ['api.reconstruction'], toolIds: ['inspectDesign']
});
```

`knowledgeStatus` 分别报告 `ready/cacheHit/directory/downloadedFiles` 或 `download_required`。该 helper 的 `run` 在所需缓存未准备时拒绝执行；页面无法远程证明 Agent 已经写盘，不能把握手描述符当下载回执。其他宿主用其授权下载和存储接口实现同一协议。宿主不支持时明确说明能力限制，不添加服务或绕过权限。

标准Node宿主使用内置fetch；受限REPL没有fetch时，通过 `knowledge.fetchImpl` 注入已授权的静态文件读取适配器（返回ok/status/arrayBuffer）。缺下载能力会给出 `KNOWLEDGE_DOWNLOAD_UNAVAILABLE`；已有完整验证缓存仍可本地使用。

`client.planSource(brief)` 是宿主只读路由 helper。来源简表明示官方 TypeID、结构族、单件/装配范围、主件/活动件/安装件角色、来源版本和几何完整性、截面与未知项。它返回 `canPlan/blockers/docIds/toolIds`，没有CAD写入。类别只提供候选族；未选族不自动套模板。明确结构可以跨品类选族，结果标记 `categoryHintOverridden:true`。照片、残缺图和未定版本都保留待补项。只要求B件时，A/C可以作为参照保留而不强制建全套。完整契约见下载包内 `api.product-source`。简表由Agent核对，`sourceEvidenceVerified:false`；规划就绪不代表尺寸、3D或配合通过。私有DWG/照片/货号不随静态知识库分发。

默认本地读取预算 32,000 字符，可调 1,000–64,000。超过预算的整项返回 `omitted/CHAR_BUDGET`，不截断 schema；调用者缩小本次选择。知识下载不自动安装技能；五文件安装包仍由宿主选择执行。原产品继续是静态网页＋浏览器内核。

`planSource(brief,{includeKnowledge:true,maxChars:32000})` 在同一次验证的快照中返回所需完整知识，避免先路由再读卡重复校验/解析磁盘包。省略、未知卡仍逐项明示，不能当作已读契约。闭合原路径与已定位截面可以使用 `profileSweep`；杂类和尺寸冲突不会因此自动变成可生成的合格产品。

source.units 缺失/未定时返回 SOURCE_UNITS_UNRESOLVED；cm/m/in返回 SOURCE_UNIT_CONVERSION_REQUIRED。几何与尺寸实际换算至毫米并记录原单位/转换依据后，才提交units:mm；字段声明不是转换或证据校验。

## 建模方法与故障诊断

握手的 `onboarding.knowledge.modeling` 和下载清单提供轻量文档ID入口，正文与工具卡共存于 `index.json`；方法变更会改变 docsHash，使旧缓存失效。无需额外安装独立技能库或外部CAD引擎。

新建、复刻或修改模型：先读 `api.modeling.start`、首次读 `api.modeling.guide`；再用 `client.route(任务,{scope:"modeling"})` 或检查 `agent-routing.json` 的 `modeling.*` 路线，选择一个 `readFirst`。按来源/截面/基准判断构造分支后，只读该分支 `branches[].tools` 的完整卡。`docs` 是按需参考，不能全部自动加载。失败时先读 `api.modeling.problems.diagnosis`，按现象选诊断工具，未知结果先对账。

```js
const candidates = await client.route("在安装板上开两个通孔", {scope:"modeling"});
const selected = candidates.find(r => r.id === "modeling.cut-features");
const workflow = await client.readLocal({docIds:[selected.readFirst],maxChars:8000});
// 根据来源/结构选定单一分支后，读取该分支完整toolIds；不加载所有分支。
```

运行知识不携带旧版工具卡、历史测试回执、来源审计大表或项目状态。工作流/方法/例题用于推理，不代表当前模型已验收；制造、切片、打印和仿真按实际能力交接。
