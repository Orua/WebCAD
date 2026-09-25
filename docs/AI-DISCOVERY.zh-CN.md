# AI 连接、发现与契约缓存

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

生成命令为 `npm run build`，会从真实注册表生成上述所有文件。`getTool/info/readDocs` 的原调用方式继续兼容。首次发现入口还在页面 HTML 元数据、`llms.txt` 和 `automation/quickstart.md` 中提供。
