# WebCAD 页面 API

WebCAD 的页面自动化入口是 `window.webcad.api`。正常产品使用是通过 HTTPS 或本机 localhost 打开构建后的静态页面。建模计算在浏览器 Worker 中完成。客户端需要具备获授权的页面 JS 调用及返回能力；页面公开这个对象本身，不代表现有 ChatGPT 侧边栏已接通。此文档是接口目标和发现说明，实际可用性以当前构建的 `info()` 与真实调用结果为准。

```js
const api = window.webcad.api;
const info = api.info();
const state = api.getState();
const tools = api.searchTools({ query: '安装板' });
const box = api.getTool({ id: 'box' });
const coordinates = api.readDocs({ docId: 'coordinates' });
```

`info()` 报告构建标识、`transport: "in-page"`、就绪状态、单位、目录哈希和能力限制。`getState(options)` 读取当前工程、特征、实体、revision、dirty、显示状态，以及已保存的 `parameters` 和计算后的 `parameterValues`；默认不返回导入源字节。`searchTools({query,category?,limit?,cursor?})` 从真实操作注册表查询。`getTool({id,version?})` 返回输入 Schema、默认值、单位、坐标约定、例子、限制与错误；旧 ID 与参数语义保持不变。`readDocs({docId,version?,cursor?,limitChars?})` 只读白名单说明，不接收文件路径。可读 `start`、`coordinates`、`errors`、`api.execute`、`api.named-parameters`、`api.query-geometry`、`recipes.mounting-plate` 和 `recipe.file-workflow`。操作工具说明可使用 `webcad://operations/<id>/<version>`，版本和哈希来自当前工具卡。

`queryGeometry(request)` 用当前 B-Rep 筛选面或边，处理零结果、歧义、分页及绑定当前几何快照的选择令牌。`execute(request)` 由同一 CommandService 提交建模、编辑、撤销等已注册命令。写入请求必须携带当前页面返回的完整上下文：

```js
{
  context: { sessionId, documentId, documentInstanceId, expectedRevision },
  idempotencyKey: '本次语义命令的唯一键',
  action: 'feature.add',
  args: {
    op: 'box',
    opVersion: box.version,
    schemaHash: box.schemaHash,
    params: { width: 50, depth: 30, height: 3 },
    refs: []
  }
}
```

示例中的上下文字段须取自当前 `getState()`，不得照抄或自行增加 revision。下一次修改读取本次真实提交结果或新状态。`box` 从世界坐标原点沿 +X/+Y/+Z 延伸，尺寸是宽、深、高，单位 mm。`hole` 和 `multiHole` 使用**半径**与世界 XYZ 刀具起点，不接受 `diameter` 或直接把二维 XY 点代入。工具卡的 `schemaHash` 必须与执行请求一致。当前严格 v2 参数契约覆盖 `box`、`hole`、`multiHole`、`faceHole`、`fillet`、`chamfer`、`shell`；其他操作通过页面 CommandService 的 advisory 适配器可执行，但 Schema 不保证内核结果。可复现的四孔板脚本见 [页面 API 示例](examples/page-api-plate.js)，按实际提交结果取特征与实体 ID。

## 命名参数与尺寸联动

`getTool({id:'document.parameters'})` 描述 `execute` 的 `document.parameters` 动作。`args.parameters` 中的每个名称映射到 `{value,unit}`，其中 `value` 是数字或表达式字符串，`unit` 为 `mm` 或 `scalar`；`args.bindings` 以实际特征 ID 为键，将特征现有数值字段路径映射到表达式。定义和绑定与已有工程内容合并，一次更新作为一个可撤销的原子重建。示例：

```js
await api.execute({
  context: currentContext(),
  idempotencyKey: crypto.randomUUID(),
  action: 'document.parameters',
  args: {
    parameters: {
      length: { value: 50, unit: 'mm' },
      edgeMargin: { value: 5, unit: 'mm' }
    },
    bindings: {
      [plateFeatureId]: { width: 'length' },
      [holesFeatureId]: {
        'points.1.0': 'length-edgeMargin',
        'points.3.0': 'length-edgeMargin'
      }
    }
  }
});
```

`plateFeatureId`、`holesFeatureId` 和 `currentContext()` 由实际页面状态及操作结果取得；完整可运行写法在示例文件中。此后只提交 `args:{parameters:{length:{value:63,unit:'mm'}}}`，右孔 X 会按绑定计算。用户也可在“参数表”只改数值，不需要 AI 运行。已绑定字段的直接数值编辑返回 `PARAMETER_BOUND`。表达式不执行 JS；循环、缺失参数、单位不符、越界和不安全的后续拓扑索引都会拒绝并保持上一好模型。当前没有通用二维约束求解或角度/面积表达式绑定。

`measure(request)` 读取精确几何的体积、包围尺寸或可识别的孔径，报告实测值而不是输入参数。`setView(request)` 控制已实现的标准方向、适合窗口及显示能力；相机改变不增加建模 revision。`redraw(request)` 等待当前提交版本的画面重绘，不刷新页面。`capture(request)` 返回真实画面资源、页面工程上下文、模型和渲染版本及相机信息；宿主若只能返回文本，需使用其已有的合法图像工具，不能声称 AI 已看到图片。

## 浏览器文件方法

`api.files` 提供 `register`、`new`、`open`、`import`、`save`、`export`、`read`、`download`、`write`、`release`。`register({name,data,mime?})` 的 `data` 是实际 `File`、`Blob`、`ArrayBuffer` 或 `Uint8Array`，`name` 是安全文件名；不能用本机路径字符串或远端 URL 代替。它返回 `resourceId`、字节长度和 SHA-256。`new({context})`、`open({context,resourceId})`、`import({context,resourceId})`、`save({context,name?})`、`export({context,format,ids?,name?})` 使用当前完整上下文。页面 API 的新建/打开遇 dirty **一律拒绝** `UNSAVED_REPLACEMENT`；UI 的真实用户确认是另一条路径。坏文件或重建失败保留原几何、历史、身份和 dirty。原生 `.webcad` 包含导入源字节和可编辑历史，重开生成新的 `documentInstanceId`。

`save`/`export` 返回 `status: 'generated'` 的资源描述；`read({resourceId,as:'blob'|'bytes'})` 返回实际 Blob 或 `Uint8Array`。`download({resourceId})` 仅返回 `download_initiated`；`write({resourceId,handle})` 在已授权的 File System Access 句柄写入、关闭并校验回读大小和 SHA-256 后返回 `write_verified`。保存旧快照时若已有新 revision，dirty 仍为真。`release({resourceId})` 释放资源；已经启动的下载 Object URL 由定时器回收，不因 release 立即撤销。文件选择或授权可能需要真实用户操作，页面 API 不会伪造授权点击。跨插件 JSON 边界不能假设 Blob 会无损传递；客户端不能传真实字节时，可由用户在 WebCAD 页面选择文件。每个资源上限 20 MiB，最多 32 个、合计 64 MiB，有效期 30 分钟。

静态版不含原有本机 IGES 转换器，也不含 DWG/DXF/矢量 PDF/AI 的服务端转换器。目录中相应卡片标为 `unavailable`，执行应返回 `CAPABILITY_UNAVAILABLE`。可先在现有 CAD 工具中离线转 STEP；这不算 WebCAD 的原生 IGES 支持。

## 运行与证据边界

应用不接收 `eval`、`new Function`、任意脚本源码、任意 URL 加载或任意文件系统路径。当前选择令牌只对其文档实例、revision 和 B-Rep 快照有效；旧令牌不得重定向到新拓扑。命令幂等回执只保证同一页面工程实例内的有限内存范围，重载后不保证。失败结果应区分未提交、已提交但显示或保存失败，以及无法确认的状态。

`src/page-api-docs.js` 从真实 `operation-registry.js` 生成操作目录。执行 `node scripts/generate-page-docs.mjs` 会更新 `public/automation/index.md` 和 `index.json`，构建时一并复制到静态包。模型可按版本和目录哈希缓存说明，不应把旧 session、revision、body ID 或拓扑编号当作永久事实。旧协议文档保留为开发历史，不用于正常页面调用。
