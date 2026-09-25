# WebCAD MCP 使用指南

MCP 是需单独运行的兼容入口，当前 IIS 静态部署不包含 MCP 后台；AI 控制网页 CAD 的默认路径是已授权页面脚本通道和 `window.webcad.api`，详见 [页面 API](PAGE-API.zh-CN.md)。本文件中未带 placement 的坐标示例仍是旧世界坐标语义；不要将旧 MCP 说明当作新基准能力的声明。

本指南供 AI 代理、MCP 客户端和维护者使用。WebCAD 的 AI 操作与页面操作共用建模事务、精确几何内核及视口；不是另一套独立 CAD 引擎。原 21 个 MCP 工具保持兼容；M2A 文件工具为增量入口。

## 1. 启动和连接

1. 安装 Node.js 22 LTS 或更新版本，在 WebCAD 项目目录双击 `start-server.cmd`。运行依赖缺失时启动器会执行 `npm install`；首次安装需要网络。安装好的依赖和 `dist/` 齐全时可离线启动。
2. 保持浏览器的 [WebCAD 页面](http://127.0.0.1:667/) 打开，等待内核就绪、MCP 连接成功。只有静态服务在运行而没有页面，不能执行建模。
3. MCP 客户端连接 **`http://127.0.0.1:667/mcp`**，传输类型为 **Streamable HTTP**。它不是旧版 HTTP+SSE 的 `/sse` 地址，也不是 WebSocket 地址。
4. 客户端执行标准 `initialize` 握手后调用 `tools/list`。官方 SDK 客户端会处理握手和通知，不要把普通 REST POST 当作 MCP 调用。
5. 先调用 `webcad_list_sessions`，明确选择目标标签页；不存在默认标签页。会话 ID 是 WebCAD 标签页 ID，不是 MCP transport 的 session header。

连接配置示例见 [mcp-client.example.json](mcp-client.example.json)：

```json
{
  "mcpServers": {
    "webcad": {
      "url": "http://127.0.0.1:667/mcp"
    }
  }
}
```

不同客户端使用不同的外层字段名、配置文件位置，以及 `type` / `transport` 字段。本文件是通用 URL 示例，请按客户端要求填入 HTTP / Streamable HTTP；不要假设整段配置可原样用于所有客户端。本项目不会自动修改你的 Codex 或其他客户端配置。

服务的 `/healthz` 用于身份检查。`node scripts/serve.mjs --probe` 返回 0 表示当前 WebCAD MCP 服务、2 表示未监听、1 表示占用或无法确认。启动器不会停止占用端口的其他服务。

## 2. 先读状态，再修改

- 长度、坐标用 **毫米**，角度用 **度**，体积为 **mm³**；缩放比例无单位。
- `webcad_get_state` 返回 `revision`、`documentName`、`features`、`bodies`、`selectedIds`、`selectedTopology`、`busy`、`kernelReady`、`preview` 等。它不包含导入文件原字节或显示网格。
- `features[].id` 是历史特征 ID；`bodies[].id` 是当前实体 ID。修改特征使用 `featureId`，实体加工使用 `refs`，导出/选择使用 `ids`。不要用名称代替 ID。
- 所有修改、选择、刷新、导出都必须携带 `sessionId` 与非负整数 `expectedRevision`。**版本必须来自最近一次状态/操作返回值，禁止自行加 1 或写死。** 选择、导出和无可用历史的撤销等不一定改变版本；刷新却会增加版本。
- `busy=true` 或存在未完成 `preview` 时先让当前操作结束。不要同时通过页面和 AI 编辑同一模型。
- MCP 工具成功值目前位于 `content` 的 text 项中，内容是 JSON 字符串，需要再 `JSON.parse`。失败值通常带 `isError:true`，其 text JSON 为 `{ "error": "..." }`；协议或参数校验失败也可能由 SDK 直接抛出异常。

## 3. 原有 14 个基础工具（兼容保留）

M1 已在其上增加 7 个 v2 工具，本批再增加 9 个文件工具；当前共 30 个。下表仅列原有的14个基础工具，后续章节说明增量入口。

下表中 **S** 为 `sessionId`，**R** 为 `expectedRevision`。它们是字段简写，调用时必须使用完整字段名。标记“可选”的字段可以省略。

| 工具 | 必需/可选参数 | 行为与结果 |
|---|---|---|
| `webcad_list_sessions` | 无 | 返回 `{sessions:[...]}`：标签 ID、文档名、就绪信息、版本、最后消息时间 |
| `webcad_get_operations` | 无 | 返回 31 类内核操作的参数 JSON Schema、单位、refs 和拓扑约束；无需浏览器会话 |
| `webcad_get_state` | S | 读取当前页面的精简模型状态 |
| `webcad_get_templates` | S | 读取模板 ID、标签、参数字段、默认值 |
| `webcad_inspect_geometry` | S、`bodyId`、`kind`、`topologyId` | 检查一个面/边，返回精确测量及当前 revision；kind 为 face 或 edge |
| `webcad_add_feature` | S、R、`op`、`params`；可选 `refs`、`name` | 新建特征并等待重建，返回新状态 |
| `webcad_edit_feature` | S、R、`featureId`、`params`；可选 `name` | 将参数合并到已有特征，重建其后续历史；返回新状态 |
| `webcad_apply_template` | S、R、`templateId`；可选 `params` | 使用模板默认值与覆盖参数创建特征；返回新状态 |
| `webcad_remove` | S、R、`ids`（至少一个） | 通过可撤销的删除特征移除实体 |
| `webcad_select` | S、R、`ids`（可以为空） | 选择实体；清空面/边选择，返回状态 |
| `webcad_undo` | S、R | 撤销最近编辑；无可撤销项时可以不改变版本 |
| `webcad_redo` | S、R | 重做最近撤销；无可重做项时可以不改变版本 |
| `webcad_refresh` | S、R | 等待现有文档重新计算并刷新显示；不新增特征或撤销历史，但增加 revision |
| `webcad_export` | S、R、`format`；可选 `ids` | format 为 step/stl/brep，返回 revision、extension、mime、encoding、data |

模板当前共 11 类：`ring`、`dBuckle`、`dBarBuckle`、`rectBuckle`、`sliderBuckle`、`ovalBuckle`、`washer`、`flatFrame`、`mountingPlate`、`bossPlate`、`flangedBushing`。以实时 `get_templates` 返回值为准，不把旧模板参数套到另一模板。

常用 `add_feature` 操作：box、cylinder、sphere、cone、torus、extrude、revolve、sweep、loft、transform、copy、mirror、hole、multiHole、slot、logo、faceHole、faceExtrude、linearPattern、circularPattern、union、cut、intersect、fillet、chamfer、shell、split、extractSolid、quickModel。参数完整定义用 `get_operations` 查询；它列出的 import/remove 是内核操作说明，不能通过 add_feature 使用：导入文件走浏览器，删除走专用工具。

新建形体通常 `refs:[]`；单体修饰/变换需要恰好一个当前实体 ID；布尔运算至少两个 ID。相减先放目标实体，再放刀具体。阵列/分割通常产生一个包含多个 solid 的复合实体，不会自动拆成多个历史条目。原文件通过页面打开后，其实体也可供 MCP 加工，但不恢复原 CAD 软件的草图或特征历史。

## 4. 完整调用流程示例

以下使用已安装的官方 SDK，展示 **session → state → template → edit → refresh → inspect → export**。请针对用于试验的标签页运行；它会实际新增并修改一个垫圈，不会自动撤销。代码不会替你选择第一个标签页，也不会读取任意源文件。

将代码保存为项目内的 `.mjs` 后，可先不传参数列出会话，再执行 `node <脚本路径> <明确的会话ID>`。此处仅提供文档示例，没有自动执行。

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport }
  from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'webcad-example', version: '1.0.0' });
const sessionId = process.argv[2];

async function call(name, args = {}) {
  const response = await client.callTool({ name, arguments: args });
  const text = response.content.find(item => item.type === 'text')?.text;
  if (!text) throw new Error('MCP response has no JSON text');
  const result = JSON.parse(text);
  if (response.isError) throw new Error(result.error || text);
  return result;
}

try {
  await client.connect(new StreamableHTTPClientTransport(
    new URL('http://127.0.0.1:667/mcp')
  ));
  console.log((await client.listTools()).tools.map(tool => tool.name));
  const inventory = await call('webcad_list_sessions');
  console.log(inventory);
  if (!sessionId) throw new Error('请从会话列表选择明确的 sessionId 后再运行');
  if (!inventory.sessions.some(s => s.sessionId === sessionId && s.ready)) {
    throw new Error('目标页面尚未连接或不可用');
  }

  let state = await call('webcad_get_state', { sessionId });
  if (!state.kernelReady || state.busy || state.preview) {
    throw new Error('页面内核未就绪，或仍有操作/预览未完成');
  }
  const operations = await call('webcad_get_operations');
  const templates = await call('webcad_get_templates', { sessionId });
  if (!templates.washer) throw new Error('当前版本没有 washer 模板');
  console.log(operations.units, templates.washer);

  const oldFeatureIds = new Set(state.features.map(f => f.id));
  state = await call('webcad_apply_template', {
    sessionId, expectedRevision: state.revision,
    templateId: 'washer',
    params: { innerDiameter: 10, sectionSize: 3, innerHeight: 1.5 }
  });
  const created = state.features.filter(f => !oldFeatureIds.has(f.id));
  if (created.length !== 1) throw new Error('新增特征不唯一，请重新读取状态确认');
  const featureId = created[0].id;

  state = await call('webcad_edit_feature', {
    sessionId, expectedRevision: state.revision,
    featureId, params: { innerHeight: 2 }, name: 'MCP 垫圈'
  });
  state = await call('webcad_refresh', {
    sessionId, expectedRevision: state.revision
  });
  const body = state.bodies.find(b => b.id === featureId);
  if (!body) throw new Error('刷新后未找到目标实体');

  // 每次只检查一个面。编号没有固定的空间含义，不能直接假设 0 就是顶面。
  let topFace = null;
  for (let topologyId = 0; topologyId < body.faceCount; topologyId++) {
    const info = await call('webcad_inspect_geometry', {
      sessionId, bodyId: body.id, kind: 'face', topologyId
    });
    if (info.revision !== state.revision) {
      throw new Error('检查期间模型版本变化；请重新读取状态和拓扑');
    }
    if (info.geomType === 'PLANE' && info.normal?.[2] > 0.99) {
      topFace = info;
      break;
    }
  }
  console.log({ topFace, volumeMm3: body.volume, boundsMm: body.bounds });

  // 使用实时版本，并只导出这个实体。
  state = await call('webcad_get_state', { sessionId });
  const output = await call('webcad_export', {
    sessionId, expectedRevision: state.revision,
    format: 'step', ids: [body.id]
  });
  if (output.encoding !== 'base64') throw new Error('未知导出编码');
  const bytes = Buffer.from(output.data, 'base64');
  if (!bytes.toString('utf8').includes('ISO-10303-21')) {
    throw new Error('导出结果不是预期的 STEP 内容');
  }
  console.log({ revision: output.revision, bytes: bytes.length,
    extension: output.extension, mime: output.mime });
  // bytes 已是可保存的文件字节。交给客户端附件/另存为机制选择目标路径。
  // WebCAD MCP 没有任意服务器文件写入工具。
} finally {
  await client.close();
}
```

原始 MCP tools/call 的 params 形如下面这样；占位值须替换为实际返回值：

```json
{
  "name": "webcad_add_feature",
  "arguments": {
    "sessionId": "实际标签页ID",
    "expectedRevision": 7,
    "op": "box",
    "params": { "width": 40, "depth": 20, "height": 3 },
    "refs": [],
    "name": "板件"
  }
}
```

这里的 7 只是结构示例，不可照抄为真实版本。

## 5. 面、边与导出数据

`faceId`、`faceIds`、`edgeIds` 是当前实体中的零基拓扑索引，不是名称，也不是永久标识。范围来自 body 的 `faceCount` / `edgeCount`，用户选中的拓扑可从 `selectedTopology` 读取。重建可能改变编号，跨 revision 必须重新检查。

`inspect_geometry` 对面返回面积；对边返回长度；圆形边另外有半径、直径。只有平面面附带 `origin` 和 `normal` 等平面信息，不能假设所有曲面都有法向字段。面上打孔和面推拉要求平面。孔的 point 必须位于选定面的有效区域；例如垫圈平面中心可能落在孔内，不能把面中心一律当成有效孔位。

导出 `encoding` 当前固定 `base64`。应先解码为二进制字节，再按 `extension` 和 `mime` 保存；不要直接把 base64 字符串当作 `.step` 文件内容。STEP/BREP 是精确几何，STL 是三角网格。导出不包含 WebCAD 可编辑特征历史；保存原生工程仍通过页面的“保存工程”。大文件可改用页面导出，避免 MCP 客户端文本大小和 32 MiB WebSocket 消息上限。

## 6. 冲突、取消与断线

每个标签页内部串行执行，但浏览器用户仍可能修改模型。`expectedRevision` 在桥和提交前检查；版本冲突应重新读状态、核对用户最新修改，再决定新的操作，禁止只修改版本号后盲目重复原命令。

默认单个已派发命令超时为 90 秒。超时或取消会发送取消信号并关闭对应桥连接；关闭页面也会取消挂起操作。页面通常在约 2 秒后尝试重连，重连会得到新的 sessionId。WASM 计算可能先返回再执行回滚，取消不是强行中断内核线程。

遇到超时、断线、`isError` 或客户端不确定是否收到成功结果时：

1. 不立即重复创建/删除/编辑。
2. 等待页面恢复，重新 `list_sessions` 确认目标标签；旧 sessionId 可能失效。
3. `get_state` 检查 busy/preview、revision、features 和目标实体，确认实际结果。
4. 若结果已存在，继续下一步；若不存在且确需重试，基于新的状态构造操作。

失败事务设计为不提交文档，提交前取消会回滚内核到已提交文档；但“连接失败”不能单独证明操作从未成功，仍以读回结果为准。工具失败会返回错误，而不是伪装成刷新成功。

## 7. 本机访问范围

服务只绑定 `127.0.0.1:667`。HTTP Host 必须是正确端口的 127.0.0.1 或 localhost；若请求带 Origin，也必须是该本机 HTTP 源。WebSocket 桥必须带允许的本机 Origin。没有跨站 CORS 放行，没有任意 JavaScript 执行、shell、文件路径读写或外部业务上传工具。

这不是多用户身份认证系统：同一电脑上能够访问本机端口的程序仍可调用受支持的操作。不要将该端口通过外部代理公开。MCP 导出的字节通过本机客户端返回，由客户端决定如何保存。修改模型不会自动覆盖原始 STEP 文件。

## 8. 维护者：如何新增工具

1. 先确定能否使用现有 add_feature / edit_feature；新参数化形体通常只需扩展内核操作及操作目录，不必为每种形体添加独立 MCP 工具。
2. 新协议命令在 `scripts/mcp-bridge.mjs` 增加严格的 zod 参数 schema 和清楚的说明。影响模型的命令必须有 sessionId、expectedRevision；只读工具也要保持明确的会话边界。
3. 在 `src/main.js` 的 executeAI 分派到已有建模事务/worker。沿用 signal 和 expectedRevision 检查；提交前再次验证，取消时恢复已提交几何。不要直接绕过事务修改全局文档，也不要添加 eval 或任意文件访问。
4. `src/ai-bridge.js` 负责串行转发、deadline、取消和状态回传，通常无需为每种操作重复实现桥协议。新几何运算仍放到已有 worker/kernel。
5. 更新 `src/operation-catalog.js`、参数界面（如果需要）、本指南和工具测试。静态操作目录仅为帮助，最终参数与几何校验仍由实际内核执行。
6. 运行协议测试，再使用明确验收标签完成真实浏览器、内核、导出验证。更新工具数量断言时，同时检查新工具确实可列出、可调用、错误可读。
7. 浏览器源码变化后重新 build；服务器工具变化后重启自己启动的 WebCAD 服务，再让客户端重新列出工具。不要停止无关进程。

现有验证入口：

```powershell
node --test tests/mcp-bridge.test.mjs
node scripts/mcp-client-smoke.mjs
node scripts/mcp-client-smoke.mjs --session <明确会话ID> --exercise
```

最后一条会实际建一个 4×5×6 mm 方块、刷新、导出并撤销，保留可重做记录；应使用验收标签。协议测试中的模拟页面不等同于真实浏览器几何验收。实际已执行结果以 `agent/output/` 的报告为准，本指南本身不是测试通过证明。


## 9. IGS 学习归纳后的功能入口

从 IGS 几何分析归纳出的共性加工需求，通过以下通用功能进入建模流程；这些入口不表示能够恢复 IGS 的原始参数历史，也不代表启用了 IGS 精确实体直接导入编辑。

- `flatFrame`：平面框类快捷模板。调用 `webcad_get_templates` 读取其尺寸字段、限制和默认值，再用 `webcad_apply_template` 创建。
- `mountingPlate`：安装板类快捷模板，同样先读取实时模板定义。不要将其他模板的内宽/线径字段直接套用到安装板。
- `bossPlate`：双空心柱安装板模板，默认板为 40×16×3 mm、外角 R3；两柱中心位于 X=±12 mm，外径 8 mm，从 Z=-6 延伸到板底 Z=0，Ø4 通孔贯穿柱与板。尺寸可调；先从实时模板定义读取字段和默认值。
- `flangedBushing`：法兰轴套模板，默认法兰 Ø20、Z=0..3 mm，筒部 Ø12、Z=3..13 mm，通孔 Ø6；尺寸可调，不含螺纹。先读取实时模板字段和默认值。
- `multiHole`：在一个实体上按多组三维坐标依次打孔，使用现有 `webcad_add_feature`，没有增加新的 MCP 工具。
- `slot`：在一个实体上加工有圆头的直槽，使用现有 `webcad_add_feature`，没有增加 MCP 工具。

模板入口示例，params 留空表示使用实时默认值；生产设计应先核对模板尺寸后显式传入所需参数：

```json
{
  "name": "webcad_apply_template",
  "arguments": {
    "sessionId": "实际会话ID",
    "expectedRevision": 7,
    "templateId": "flatFrame",
    "params": {}
  }
}
```

如要创建安装板，将 templateId 换为 `mountingPlate` 并重新读取当前 revision。这里的 7 仍然只是结构示例。

`multiHole` 参数：`refs` 必须恰好含一个当前实体 ID；`radius` 和 `depth` 大于 0，单位 mm；`axis` 为 X/Y/Z；`direction` 为数值 1 或 -1；`points` 为 1–100 个 `[x,y,z]`。每个点是刀具的**全局起点**，所有孔共享轴向、方向、半径及深度。它们不是面编号，也不是二维草图点。

例如，对此前实际创建的 40×20×3 mm 原点板件，在两个位置沿 +Z 打孔：

```json
{
  "name": "webcad_add_feature",
  "arguments": {
    "sessionId": "实际会话ID",
    "expectedRevision": 8,
    "op": "multiHole",
    "refs": ["40x20x3板件的实际bodyId"],
    "name": "两个安装孔",
    "params": {
      "radius": 2.5,
      "depth": 3,
      "axis": "Z",
      "direction": 1,
      "points": [[10, 10, 0], [30, 10, 0]]
    }
  }
}
```

调用前须读取状态和几何，确认目标板件确实位于上述坐标，不能将这组坐标直接用于任意模板。每个孔都必须在前一孔加工后的形体上实际去除材料；孔在实体外或完全落入已有空洞时整个特征报错，不提交一半的加工结果。该工具不生成螺纹。重复同一刀具起点也不能用于表示多个重合孔。

`slot` 参数：`refs` 恰好含一个当前实体 ID；`length`、`width`、`depth` 为正数，单位 mm，且 `length >= width`。长度等于宽度时为圆孔；大于时为两端半圆加两条直线形成的圆头槽。`x`、`y`、`z` 是刀具起点中心坐标，默认 0；`axis` 为 X/Y/Z（默认 Z），`direction` 为 1 或 -1（默认 1），`angle` 为绕正轴右手旋转的角度（度，默认 0）。未旋转时，轴为 Z 的槽长边沿 +X，轴为 X 时沿 +Y，轴为 Y 时沿 +Z；深度沿指定轴及 direction 加工。槽必须实际从目标实体去除材料；无交集或不产生去料时失败，事务不提交部分结果。`angle` 旋转的是槽的长边方向。

两个新模板和槽加工来自本轮 30 个 IGS 样本分析的共性需求，不代表对任一源文件的原始参数历史恢复或完整实体复刻。IGS 的曲面集合/散面分析结果也不等于已完成修复、闭合或复刻原件。样本分析和实际验收分别记录在 [IGS30 分析记录](../agent/output/igs30/REVIEW.md) 与 [IGS30 验收记录](../agent/output/igs30/ACCEPTANCE.md)；请以验收记录中实际执行的项目为准，本指南不预先宣称测试通过。

本轮仍为 14 个 MCP 工具，操作目录为 30 类，快速模板为 11 类。协议/JSON Schema 检查只证明接口描述可读取，不能替代几何正确性验证；IGS 曲面集合也不能单独证明对应原件已被实体复刻。测试执行情况见 [IGS30 验收记录](../agent/output/igs30/ACCEPTANCE.md)。

## 10. M2A 工程与文件闭环

原有 21 个 MCP 工具保持可用，新增 9 个文件工具，共 30 个。通过 `webcad_bootstrap` 的 `entrypoints.fileTools`、`webcad_search_tools`、`webcad_get_tool` 和 `webcad_read_docs` 动态发现文件卡；文件卡 URI 为 `webcad://file-tools/<suffix>/1.0.0`。用 `webcad_read_docs({docId:"recipe.file-workflow"})` 读取完整配方。以下是受控文件传输流程，不使用页面 DOM、模拟鼠标、文件选择框或内部 `window` API 代替公开 MCP 接口。

### 输入文件：登记、上传、打开或导入

1. 先调用 `webcad_file_capabilities({})`。客户端在用户明确授权的本地路径读取文件，计算字节数及 SHA-256，然后调用 `webcad_register_asset({name,size,sha256,mime?})`。name 最长255字符、size 为0至20 MiB整数、sha256 为64位十六进制、可选 mime 最长127字符。注册只返回 `uploadUrl`/`uploadToken`；客户端对该 URL 发起原始字节 HTTP `PUT`，只有校验成功的 PUT 响应才会给 `assetId`。Asset ID 格式 `ast_` 加48位小写十六进制。
2. 文件和制品大小上限均为20 MiB，临时资源 TTL 为1800秒。上传 URL/token 只授权对应资源，不接受任意服务端路径。
3. 每个工程操作的 `context` 都必须完整提供 `{sessionId,documentId,documentInstanceId,expectedRevision}`，这些值从当前状态读取，不可猜测。`webcad_open_asset({context,assetId})` 只接受 `.webcad` 或 `.json` 工程，dirty 工程一律拒绝替换；`webcad_import_asset({context,assetId})` 只追加 STEP/BREP/IGES，拒绝 `.webcad`。`webcad_new_document({context})` 新建空工程。IGES 需要本机 OCP 转换环境；不可用时报告 `OCP_UNAVAILABLE`。
4. STEP/BREP/IGES 导入形成的源字节会嵌入之后保存的 `.webcad` 工程；该工程不依赖临时 assetId、原始路径或上传缓存。重新打开工程会产生新的 `documentInstanceId`，先前实例的选择令牌不可复用。

项目提供 Node 客户端适配器，可在已有 MCP `client` 和服务端基础 URL 下执行实际传输：

```js
import { uploadAsset, downloadArtifact } from '../scripts/file-transfer-client.mjs';

// directory 必须是用户明确授权、已存在的绝对目录；filePath 是相对此目录的文件路径。
const uploaded = await uploadAsset(client, {
  filePath: 'inputs/part.step', directory: 'C:/Users/me/WebCAD-files',
  baseUrl: 'http://127.0.0.1:667'
});
const assetId = uploaded.assetId; // 仅在受限 PUT 成功并校验后返回

// artifact 取自 webcad_save_document / webcad_export_artifact 的响应。
const written = await downloadArtifact(client, artifact, {
  directory: 'C:/Users/me/WebCAD-files', baseUrl: 'http://127.0.0.1:667', name: 'part.step'
});
```

`directory` 在两种函数中都必须是存在的绝对目录。`uploadAsset` 的 `filePath` 必须解析到该目录内部；`downloadArtifact` 实际 GET 字节、验证大小和 SHA-256、拒绝覆盖已有文件、做磁盘读回校验后再确认写入。适配器没有授权任意服务器路径，也不接受服务端提供的目标路径。

### 保存或导出：生成、取回、校验、写入确认

1. `webcad_save_document({context})` 为指定 revision 生成自包含 `.webcad` artifact。`webcad_export_artifact({context,format,ids?})` 接受 step/stl/brep/png；ids 可省略，否则必须唯一且最多200个。读取当前 state 获取最新 revision；不得自行猜测或递增版本。
2. 资源 ID 格式为 `art_` 加48位小写十六进制。工具返回 artifact 元数据只表示**已生成**。客户端必须通过受限文件传输适配器对下载地址真实 HTTP `GET`，核对 size 和 SHA-256，再写入用户授权目录。下载成功与写入声明是不同状态。
3. 适配器拒绝目录穿越、越界 URL、超大响应、过期资源和覆盖冲突。确认写入后，调用 `webcad_confirm_artifact_written({artifactId,size,sha256})`。旧 revision 对应的 artifact 仍可以成功下载并写入；若当前工程已变化，确认响应可为 `written:true, documentSaved:false`。`documentSaved:false` 只表示这份旧快照不能将当前文档标为 clean，不代表客户端写文件失败。保存期间的新编辑仍保持 dirty。服务端只能记录客户端已经校验并写入的声明，不能独立证明客户端磁盘 fsync。
4. `webcad_release_resource({resourceId})` 可提前释放归属资源。生成、下载、客户端声明写入三种状态保持区分。遇到 `SIZE_LIMIT`、`RESOURCE_EXPIRED`、`HASH_MISMATCH`、`UNSAVED_REPLACEMENT`、`REVISION_CONFLICT`、`INSTANCE_MISMATCH`、`FORMAT_UNSUPPORTED` 或 `OCP_UNAVAILABLE` 时停止并报告准确错误。

完整无鼠标闭环为：创建/编辑 → 检查 → 保存 `.webcad` → 客户端取回并确认写入 → 上传该文件并重开 → 再编辑 → 导出 STEP/BREP/STL → 客户端取回、校验及写入 → 重新登记并导入回读。接口细节以实时文件工具卡为准；不承诺跨服务重启 exactly-once。

## LOGO 平面凹凸字

当前操作目录源码为 31 类，新增 logo；14 个 MCP 工具和 11 个快捷模板数量不变。使用 webcad_add_feature，op 为 logo，refs 恰好一个实体，params 包含 regions、faceId、mode（engrave/emboss）、depth，并可设置 scale、angle、offsetX、offsetY、mirrorX 和 source。先 inspect_geometry 核实真实平面，保持 expectedRevision 新鲜；每次成功后模型自动更新，refresh 可显式重建。源轮廓格式、局部坐标规则、尺寸边界和示例见 [LOGO 工作流](LOGO-WORKFLOW.zh-CN.md)。

升级前启动的服务会缓存旧 get_operations 目录，正常重启服务后才能读取新版帮助；仅刷新页面即可加载已构建的新内核，但不能刷新服务端帮助目录。当前验收已验证 logo 编辑、刷新和 STEP 导出实际执行，目录缓存状态见 agent/output/logo-study/mcp-check.json。


## 精确位置与加工范围（2026-09-21）

- 常驻“选择”按钮关闭交互手柄并回到实体选择；“实体 / 面 / 边”决定拾取对象。
- “移动”支持相对 XYZ 位移和绝对 XYZ 位置。绝对位置指完成旋转、缩放后的包围盒中心；旋转和缩放仍以全局原点为基准。`transform.positionMode` 为 `relative`（默认）或 `absolute`；后者必须传入 x/y/z。
- `faceHole` 必须传入世界坐标 `point:[x,y,z]`，不再自动落在面中心。界面可先点击平面的孔位，再编辑显示的 XYZ。内核拒绝不在指定面上的孔中心。旧工程若该步骤没有 point，需补充明确坐标后重新载入。
- 新建圆角/倒角必须传入非空 `edgeIds` 或明确的 `allEdges:true`，不再在未选边时默认加工全部边。全部边选项优先于边列表。
- 普通打孔、长圆槽、多孔和环形阵列均使用各自表单显示的全局起点或轴心；镜像平面经过全局原点，分割平面偏移使用全局坐标。面拉伸作用于整张已选平面；LOGO 偏移相对于选定面的中心及局部平面坐标。
