# AI 连接、发现与契约缓存

定位能力先读 `connect({queries:["工作基准 放置"],includeContracts:true})`，再按需读 `api.references`。每张操作卡的 `placementPolicy` 是机器可读入口：`placementSupported:false` 给出不适用原因；`sourceAnchorRequired`、`defaultInsertionAnchor` 和 `historyBinding` 决定生成规则。只缓存静态卡与文档，比较实时 `catalogHash`、`docsHash`、卡片 `docsHash`；不缓存工程 context、实体 ID、拓扑编号和 referenceId。构建不匹配时重新连接/读卡后再执行。旧 CLI/MCP 卡不能代表当前页面定位能力。

WebCAD 使用统一注册表生成页面工具卡、按需文档和可选离线库。工具发现适用于全部操作、文件、视图与工程命令；没有按某个零件硬编码执行流程，也不调用额外语言模型。

## 1.4 握手与建模流程

当前页面 `connect` 返回 `protocol`、`canExecute`、`blockers`、`nextAction` 和批次执行说明。`ready` 仅表示内核已加载；忙碌或预览中 `canExecute` 仍为 false。`PREVIEW_ACTIVE` 应先确认当前预览的处理意图，不能因为等待而自动提交/取消。

已知工具可直接 `connect({toolIds:['advancedLoft','transform']})`，最多20个唯一 ID，自动带完整卡并逐项报告未知 ID。发现阶段无需为查询构造 `run`。首次使用按需读 `api.workflow`，复杂模型按部件拆分成最多20步的批次，测量关键尺寸并核对画面。

快捷模型现在有独立的 `template.<kind>` 搜索卡，与 UI 共用中英文名称，从真实父契约派生单模板参数、默认值和限制。例如“画一个圆圈”可找到 `template.ring`。它是说明卡，不是新增的几何操作：执行卡里的 `minimalExample`，仍为 `op:'quickModel', params:{kind:'ring',...}`。二维圆线和实体圆环必须按意图区分。旧的完整 `quickModel` 卡保持兼容。

批次回执新增 `progress.completedStepIds/failedStepId/unattemptedStepIds`、`recovery` 和回执时的 `requestContext`。失败不回滚之前的提交；读实时状态后只规划剩余步骤。相同请求/key只返回原回执，修改后的剩余批次使用新 key。`unknown` 或宿主超时先检查状态，不能盲目重建。

当前公开 API 不再暴露旧的 `window.webcad.action/execute/ready/viewport`。Agent 应先确认页面版本，不能用另一个目录的旧手册假定当前接口。可下载 `automation/webcad-page-api/SKILL.md` 作为宿主技能入口；安装由宿主进行，网页不会安装任何服务。详细运行说明仍以目标页面和匹配哈希的缓存为准。

## 连接与按需读取

AI 通过宿主已授权的页面脚本通道后台调用公开 API；JSON 面板仅供用户明确要求时手工调试，不能作为 AI 自动回退入口。无脚本通道时报告实际限制。

当前 Codex 开发宿主可先检查标签页 capabilities 中的 cdp，并读取其文档；允许时通过 Runtime.evaluate 调用页面 API。完整入口说明由 `readDocs({docId:"api.connection"})` / `automation/docs/api.connection.md` 提供。状态栏仅显示状态及文档链接；手工面板位于帮助菜单。全局 `webcad-page-api` 技能为独立任务提供相同路由，实际工具契约仍以目标页面为准。

在宿主已授权的页面脚本通道中执行：

```js
const api = window.webcad.api;
const connected = api.connect({ queries: ['能力关键词', '另一个能力关键词'] });
const contracts = api.getTools({
  ids: selectedToolIds,
  expectedCatalogHash: connected.catalogHash,
});
```

`connect` 一次返回当前文档身份、`requestContext`、内核/预览状态、最多20个实体引用、版本、工具类别和搜索候选。可传 `includeContracts:true` 同时读取前20个去重命中工具的完整卡；超过时返回 `contractIdsOmitted`。连接与工具发现不修改工程，内核加载期间也可使用。实际建模仍须等待就绪，并使用实时文档状态。

搜索以工具 ID、界面共用名称、已有同义词、功能描述和输入 Schema 为索引。精确 ID 优先；中文相邻字对支持无空格句子，英文按词匹配；候选按字段权重、词频和匹配覆盖排序。`searchTools({query:'',limit,cursor})` 可以分页列出全目录，`category` 可以缩小范围。工具变更和界面名称变化会改变 `catalogHash`，旧游标不能跨目录使用。

结果是相关能力候选，不能自动证明组合方案可行。AI 应选取所需工具，读取完整卡后检查单位、参数、引用、前置条件与不支持的情况，再通过现有 `run/execute` 执行。文档只在理解具体能力或错误时读取，不应先遍历整个源码树。

## 缓存与版本变化

`getTools({ids,knownHashes,expectedCatalogHash})` 接受1–20个唯一 ID；每项独立返回完整的 `read.card`、`not_modified` 或 `error`。未知 ID 不使其他结果丢失；目录不符抛出 `CATALOG_CHANGED`。返回的完整卡不删减约束、示例或 Schema。

只有实际持有完整卡才能传 `knownHashes:{id:docsHash}`。摘要里的哈希不代表客户端已缓存卡。`connect({knownCatalogHash,knownDocsHash})` 始终返回新鲜状态，并报告说明是否变化。`readDocs({docId,knownHash})` 支持完整文档复用；分页文档必须读完才能缓存，`knownHash` 不能与 `cursor` 混用。

`automation/manifest.json` 提供每张卡和每篇文档的 URL、版本/哈希；宿主可更新变化项并移除已删除 ID。缓存按发布来源/完整哈希区分。会话、工程 revision、实体/面边 ID、选择令牌及运行时就绪状态不能当作静态工具知识缓存。

## 可选离线工具库

发布包同时提供 `automation/index.json` 和 `automation/tool-library.mjs`。具备持久存储能力的客户端可以一次下载这两个文件，之后直接在宿主进程检索；页面使用同一份索引实现。

```js
import { createToolLibrary } from './tool-library.mjs';
const library = createToolLibrary(snapshot); // snapshot 是完整 index.json
const matches = library.search('能力关键词');
const card = library.get(matches[0].id);
const text = library.readDoc('api.run');
const current = library.isCurrent(connected);
```

`current=false` 时刷新快照；离线搜索不声明实时可用性。让程序下载、保存和索引全库，只向模型返回查询结果及需要的完整卡。侧栏没有磁盘能力时直接使用 `connect/searchTools/getTools`；静态网页不要求用户安装 CLI 或本地服务。

可编辑轮廓路线依次检索 `sketchProfile`、`profileOffset`、`profileExtrude`。先按工具卡建立解析线/圆弧/圆与有序环，再从当前状态取真实轮廓 body ID；偏移后重新取派生面 ID；加料/切除/相交还须取明确的实体目标 ID。新建轮廓可冻结当前参考锚点，后续加工不得再次套用活动锚点。人工任务面板锁定的目标不会被普通浏览选择替换；AI 写入若遇 `UI_TASK_ACTIVE`，应等待人工应用或取消，不能自动丢弃草稿。网页键盘的 Ctrl+A/C/V 使用工程内实体选择与剪贴板，文本输入框保持原生编辑行为。

生成命令为 `npm run build`，会从真实注册表生成上述所有文件。`getTool/info/readDocs` 的原调用方式继续兼容。首次发现入口还在页面 HTML 元数据、`llms.txt` 和 `automation/quickstart.md` 中提供。

加工与检查时优先检索精确 ID：`profileRepair` / `inspectProfile`，`projectProfile`，`profileExtrude`，`inspectFit`，`inspectThickness`，`measureRelation`，`holeWizard`，`draftFaces` / `inspectDraft`。读取工具卡后取得当前 body 与面/边序号，再固定本次任务的目标；不要根据上一次工程修订的拓扑 ID 猜目标。`draftFaces` 只接受完整四个平面侧壁加固定底面，`inspectDraft` 对曲面标未支持；未获得成功预览和精确几何读回时不要宣称压铸适用。`profileExtrude.extent='toPlane'` 是固定世界无限平面，不是裁剪面的有限边界。孔向导的 `includedAngleDeg` 是沉头锥体包含角，不是单侧斜角。


2026-09-26 接口复核：保留原有九页菜单与展开方式。推荐优先 connect({toolIds:['sketchProfile','profileExtrude']}) 精确载入已知工具，缓存后传knownHashes取得not_modified；未知工具使用queries与limit:1。setDisplayPreferences新增themeColor与snapThresholdMm；setView.display新增transparentEdges。

首次使用从 `automation/agent-start.html` 或机器入口 `automation/agent-start.json` 开始；页面 HTML 元数据、`llms.txt`、既有「设置 → AGENT 接口」和 `connect().onboarding` 都指向同一入口。先绑定用户指定的标签页并检查宿主 capabilities，再读取 CDP 等脚本能力的当前文档；不能把 DOM 只读或标签页会话占用误判为 API 缺失。

握手的 `onboarding.localKit` 提供 `agent-kit.json`、`install-agent.ps1`、技能、连接助手和真实操作路由 URL（相对 CAD 页面部署根地址）。有文件权限的 Windows 宿主查看下载的安装脚本后，可使用 `-BaseUrl` 和可选 `-Destination` 安装操作包；默认目录为 `~/.codex/skills/webcad-page-api`。安装器逐文件验证哈希、更新前备份；网页不自动安装或启动服务。包内 `scripts/page-client.mjs` 接收获授权的 CDP send adapter，只封装公开 API 调用，不增加宿主权限。

## 快捷五金模型与面加工（页面 API 1.13.0）

快捷模型新增弹簧 `spring`、螺丝 `screw`、丝筒 `threadedSleeve`、半圆钉 `domedPin`。模型菜单显示本浏览器累计成功创建次数最多的 5 个，剩余模型用“快捷模型”打开；同次数按简单模型优先的目录顺序。面板列表固定最小 240px，窗口高度不足时下方内容纵向滚动。历史工程的原 kind 均保持可用。

螺丝四个几何参数为头宽、头厚、M 规格、牙长，另选平头/沉头、十字/一字/梅花/内六角。默认十字；沉头固定 0.20 mm 外缘直升位加圆锥过渡，头厚包含直升位。头的下端在参考位置，牙杆朝本地 +Z。丝筒底在上、面在下，从参考位置向本地 -Z 延伸、从下方面端向 +Z 攻牙；参数为底直径、面直径、名义牙径、总高、牙深。名义牙径须匹配支持的 M 粗牙直径。半圆钉用直径和高度控制光滑凸面，不限于球面。弹簧使用中心线半径、线径、螺距、圈数和左旋，螺距须大于线径。螺纹是实际 V 型切削几何，不声称标准公差等级。粗牙螺距参考 [ADS 制造商表](https://www.advancedynamicsolution.com/resources/metric-thread-data.html) 和 [Carmex 小规格刀具目录](https://carmexusa.com/contentonly.aspx?file=pdf/2019_Inch/261-276_mini_mill_thread.pdf)。

先 `api.connect({toolIds:['template.screw','faceGroove','innerTurn','outerTurn','getQuickModelUsage'],includeContracts:true})`，按需 `api.readDocs({docId:'api.quick-hardware'})`；template 卡用于发现，执行仍是 `op:'quickModel',params:{kind:'screw',...}`。使用当前 context 和唯一幂等键通过 `api.run` 提交，显式 placement 可指定冻结参考位置；修改历史参数用 feature.edit。只读 `api.getQuickModelUsage()` 返回 counts、topKinds、maxVisible 和 storage，可经 invoke/run 调用，预览期间也能读。成功提交新快捷模型才计数；预览、失败、取消、修改、撤销重做、打开工程均不增加。默认 localStorage 持久化；受限时回退当前页内存。

三个基本加工工具直接展开在“加工 → 面加工”，不折叠进“更多”，也不进入快捷模型列表。锣槽 `faceGroove`：refs=[当前单实体]，params={faceId,lengthMm,widthMm,depthMm}。内车 `innerTurn` / 外车 `outerTurn`：params={faceId,diameterMm,depthMm}。先 queryGeometry 查询真实平面 faceId，三个工具均以面面积中心为轴心、沿反向外法线进入材料，不再次应用当前参考锚点。锣槽长边方向为世界 X 在面上的投影（退化时用世界 Y）。内车移除指定直径内的圆柱材料；外车在指定深度内去除目标直径之外的材料，下方保持。非平面、未切到材料、空结果、剩余多实体会失败，原模型保留。参数严格校验，失败回执可见 NO_MATERIAL_REMOVED/GEOMETRY_INVALID；它们没有机床刀路或进给设置。检查回执、精确测量和 rendered revision 后再确认完成。
