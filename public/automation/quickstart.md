# WebCAD AI 连接与工具发现

AI 应通过宿主已授权的页面脚本通道在后台调用 window.webcad.api。不要为查工具或执行建模打开 JSON 调试面板、填输入框或点击执行按钮。没有可用脚本通道时，明确报告通道不可用；不要自动退回界面操作。

## 先选后台通道

当前 Codex Chrome/IAB 开发宿主：绑定目标标签页后检查 tab.capabilities.list()；若提供 cdp，先读 (await tab.capabilities.get("cdp")).documentation()，确认允许当前任务后用 Runtime.evaluate（awaitPromise:true、returnByValue:true）调用公开 API。只读 DOM evaluate 与该能力不同；不要直接改用填表。其他宿主使用其实际支持的授权脚本通道。完整说明：[api.connection](docs/api.connection.md)。

## 一次读取状态、相关完整卡与批次说明

将下面表达式交给已确认的页面脚本通道；按任务替换能力词。无需点击页面、读取全目录或构造查询用的 run 批次。

```js
JSON.stringify((()=>{
  const api = window.webcad.api;
  return {
    connection: api.connect({queries:["需要的能力关键词"],limit:2,includeContracts:true}),
    run: api.readDocs({docId:"api.run"})
  };
})())
```

- connect 使用 queries:[字符串]；searchTools 使用 query:字符串。不要混用。
- 完整卡已在 connection.contracts.items[].card；不要再逐项 getTool。补充工具用 getTools({ids:[实际ID]}) 批量读取，已知 ID 可直接读卡。
- queries 最多4项，支持中英文；每项默认返回5个候选。includeContracts:true 可连同前20个命中卡一次取回。
- 搜索是候选排序，不是执行计划。依据完整卡核对参数、约束及可用性；未知 ID 逐项返回错误。
- 建模使用 api.run 的 add/execute 步骤；返回的 connection.requestContext 可用于请求，后续实体用 $ref 引用回执。查询面边后再决定操作时重新核对 revision。
- CDP 异步表达式使用 (async()=>JSON.stringify(await window.webcad.api.run(请求对象)))()，并设置 awaitPromise:true；不要直接使用顶层 await。
- 检查逐步 status、partial/unknown 和 displayMatchesContext；批次不是全有全无事务。
- 已持有完整卡时传 getTools 的 knownHashes，未变只返回 not_modified。文档可传 knownHash。禁止缓存工程状态、实体/面边编号作为下一次操作依据。
- 可选离线库：[index.json](index.json) + [tool-library.mjs](tool-library.mjs)。下载由宿主持久保存，按 catalogHash/docsHash 更新，检索后只读取所需内容。不要把全库送入模型上下文。
- 完整缓存说明：[api.discovery](docs/api.discovery.md)。无页面脚本能力时，目录：[manifest.json](manifest.json)；执行仍需宿主实际支持的通道。
