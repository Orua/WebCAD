# Agent 首次知识下载与任务路由

首次握手返回 `connect().onboarding.knowledge`。Agent 下载网页 base URL 下的 `automation/agent-knowledge.json` 清单，再取 `index.json`（完整静态文档/工具卡）、`agent-routing.json`（任务路由）、`routes.json`（真实 UI/API 操作路由）。核对每份文件 SHA-256 与字节数后存到宿主本地。当前包约 1.8 MB，体积写在清单 `totalBytes`；它不进入模型上下文。

缓存按“页面来源和子路径＋catalogHash＋docsHash”隔离。同一来源重连时校验本地文件，哈希一致就复用。缺文件、文件损坏或版本漂移时刷新；下载中断不能标为 ready。静态库不保存当前工程、会话身份、实体/面边编号；示例 ID 也不能当当前 ID 使用。

| 任务路由 | 先读 | 后续按需取卡 |
|---|---|---|
| 陌生品类、结构及配件 | api.product-source，再按planSource返回的product.* | 仅选中结构族所需完整卡 |
| 源图理解、DWG重建 | api.reconstruction、api.vector-import | readVector / connectVector / curveSweep / advancedLoft |
| 常用模板 | api.workflow | 精确 template.* 单模板卡 |
| 轮廓、截面、约束 | api.mechanical、api.references | sketchProfile / profileSweep / profileLoft / planeSection |
| 孔槽、螺纹加工 | api.mechanical | holeWizard / multiHole / multiPocket / thread |
| 圆角、端部圆润 | api.smooth-transition及对应工具卡 | round / fillet / rounding / roundEnd / chamfer |
| Logo、浮雕 | api.logo、api.relief | logo / curvedLogo / relief |
| 材料、尺寸、配合 | api.design-checks | inspectDesign / measure / inspectThickness / inspectFit |
| 定位、编辑、历史 | api.editor、api.references | transform / body.align / feature.edit / history.undo |
| 保存、导出、文件 | recipe.file-workflow、api.file-errors | files.* |

准确 UI 动作沿 `routes.json` 查；自然语言任务沿 `agent-routing.json` 查。路由只决定先读什么，不替代几何判断。未命中则调用当前页面 `searchTools`，已知 ID 直接 `getTools`。模板优先读单模板卡，避免把全部快捷模型目录塞进上下文。

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
