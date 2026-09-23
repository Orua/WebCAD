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

`info()` 报告构建标识、`transport: "in-page"`、就绪状态、单位、目录哈希和能力限制。`getState(options)` 读取当前工程、特征、实体、revision、dirty 与显示状态；默认不返回导入源字节。`searchTools({query,category?,limit?,cursor?})` 从真实操作注册表查询。`getTool({id,version?})` 返回输入 Schema、默认值、单位、坐标约定、例子、限制与错误；旧 ID 与参数语义保持不变。`readDocs({docId,version?,cursor?,limitChars?})` 只读白名单说明，不接收文件路径。可读 `start`、`coordinates`、`errors`、`api.execute`、`api.query-geometry`、`recipes.mounting-plate` 和 `recipe.file-workflow`。工具说明可使用 `webcad://operations/<id>/<version>`，版本和哈希来自当前工具卡。

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

示例中的上下文字段须取自当前 `getState()`，不得照抄或自行增加 revision。下一次修改读取本次真实提交结果或新状态。`box` 从世界坐标原点沿 +X/+Y/+Z 延伸，尺寸是宽、深、高，单位 mm。`hole` 和 `multiHole` 使用**半径**与世界 XYZ 刀具起点，不接受 `diameter` 或直接把二维 XY 点代入。工具卡的 `schemaHash` 必须与执行请求一致。当前严格 v2 参数契约覆盖 `box`、`hole`、`multiHole`、`faceHole`、`fillet`、`chamfer`、`shell`；其他操作目录为 advisory，需确认页面适配器及实际内核结果。可复现的四孔板坐标配方由 `readDocs({docId:'recipes.mounting-plate'})` 给出。

`measure(request)` 读取精确几何的体积、包围尺寸或可识别的孔径，报告实测值而不是输入参数。`setView(request)` 控制已实现的标准方向、适合窗口及显示能力；相机改变不增加建模 revision。`redraw(request)` 等待当前提交版本的画面重绘，不刷新页面。`capture(request)` 返回真实画面资源、页面工程上下文、模型和渲染版本及相机信息；宿主若只能返回文本，需使用其已有的合法图像工具，不能声称 AI 已看到图片。

## 浏览器文件方法

`api.files` 的目标方法是 `register`、`new`、`open`、`import`、`save`、`export`、`read`、`download`、`write`、`release`。`register` 接收实际 `File`、`Blob`、`ArrayBuffer` 或 `Uint8Array`，不能用本机路径字符串或远端 URL 代替。新建、打开、导入、保存与导出须绑定当前工程上下文和 revision。打开/新建保护未保存工程；坏文件或重建失败保留原几何、历史、身份和 dirty。原生 `.webcad` 包含导入源字节和可编辑历史，重开生成新的 `documentInstanceId`。

`save`/`export` 生成带来源快照的 Blob；`read` 读取当前页面资源；`download` 仅能确认浏览器开始下载；`write` 在用户已授权的 File System Access 句柄写入、关闭并回读匹配后才能报告核验写入。保存旧快照时若已有新 revision，dirty 仍为真。文件选择或授权可能需要真实用户操作，页面 API 不会伪造授权点击。跨插件 JSON 边界不能假设 Blob 会无损传递；客户端不能传真实字节时，可由用户在 WebCAD 页面选择文件。

静态版不含原有本机 IGES 转换器，也不含 DWG/DXF/矢量 PDF/AI 的服务端转换器。目录中相应卡片标为 `unavailable`，执行应返回 `CAPABILITY_UNAVAILABLE`。可先在现有 CAD 工具中离线转 STEP；这不算 WebCAD 的原生 IGES 支持。

## 运行与证据边界

应用不接收 `eval`、`new Function`、任意脚本源码、任意 URL 加载或任意文件系统路径。当前选择令牌只对其文档实例、revision 和 B-Rep 快照有效；旧令牌不得重定向到新拓扑。命令幂等回执只保证同一页面工程实例内的有限内存范围，重载后不保证。失败结果应区分未提交、已提交但显示或保存失败，以及无法确认的状态。

`src/page-api-docs.js` 从真实 `operation-registry.js` 生成操作目录。执行 `node scripts/generate-page-docs.mjs` 会更新 `public/automation/index.md` 和 `index.json`，构建时一并复制到静态包。模型可按版本和目录哈希缓存说明，不应把旧 session、revision、body ID 或拓扑编号当作永久事实。旧协议文档保留为开发历史，不用于正常页面调用。
