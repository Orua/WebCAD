# 配置工作台与 AI 可靠性升级

入口配置是 `src/ui-layout.js`，无需另起服务。修改后运行 `npm run build` 并将 `dist` 发布至现有静态站点。

| 配置 | 作用 |
| --- | --- |
| `tabs` | 选项卡顺序、名称、工具分组和组内动作顺序 |
| `defaultTab` | 默认打开的选项卡 ID |
| `header` | 顶部常用动作、文字与主按钮样式 |
| `controls` | 视角、投影、网格、吸附与精度选项及参数映射 |
| `icons` | 工具 SVG 路径；文件工具分别使用文档、文件夹、磁盘、导出箭头等图标 |
| `panels` | 桌面模式左右面板宽度；窄屏规则在 `workspace-layout.css` |

`ui.js` 负责 DOM、对话框和事件，`ui-api-coverage.js` 负责动作与公开 API 的对应关系，`main.js` 负责状态与执行，几何继续由现有 Worker 管理。配置不包含任意 JavaScript 执行入口；新增动作需同时实现 API 和文档，构建会校验。原有参数表单继续由现有字段定义管理；并未把全部 CAD 表单重写成新框架。

顶部合并为品牌、七个选项卡、常用操作。工程名称放在左侧设计树顶部，可点击改名；标题栏显示未保存圆点。URL 的 document 参数仅用于辨别当前工程，不能凭链接恢复文件。

视口上方的工作基准可选“世界位置”或“相对位移”。世界位置直接输入原点 XYZ；相对位移沿提交当刻的工作基准局部轴输入 ΔXw/ΔYw/ΔZw，提交后位移字段归零。三个归零按钮分别重置位置、方向或两者；锁定时这些操作和拖动均被禁用。相对位移当前只接受有限数值，不解析参数表达式。

AI 通过 `getUILayout()` 查看布局；通过 `getState().requestContext` 或 `createRequestContext()` 获得写入上下文。所有已有的带 context 页面入口也接受原始状态快照的 revision，但不自动修复过期版本。

```js
const api = window.webcad.api;
const handshake = api.connect({toolIds:['setRenderQuality']});
const job = api.submit({
  jobId: crypto.randomUUID(),
  method: 'setRenderQuality',
  args: {context: handshake.context, quality: 'fine'}
});
// 宿主下次调用时查询；无需让一个脚本一直等待。
const receipt = api.getJob({jobId: job.jobId});
// receipt.result 是原方法的结果；running 时不重发新任务。
```

完整协议：`readDocs({docId:'api.reliability'})`、`api.workspace`、`api.query-geometry`。`invoke({method,args})` 捕获原同步/文件方法抛错并返回结构化错误；已有调用方式保持兼容。任务保存在当前页面内存，最多100份回执，刷新不保留；只能取消尚未开始的任务，运行中的 WASM 不伪造取消或进度百分比。

显示精度四档只是网格化参数；精确 BRep 和 STEP 不变，细化可能耗时。当前单文件20 MiB、总资源64 MiB；25/100 MiB 文件明确拒绝，不能称已支持大工程。保存回执区分生成、发起下载、句柄写入并回读校验；生成资源带大小、SHA-256 与 ID，界面可重试下载。未验证的下载不清除 dirty。

尚未实现：屏幕自适应细分、斑马纹、曲率梳、精确 G0/G1/G2 检查、完整控制网编辑、跨标签页工程列表、从 STEP 恢复原 CAD 特征树、完整强类型 SDK。样条查询目前提供真实编码、次数、控制点/节点数量；不将可显示或法线平滑宣称为曲率连续。
