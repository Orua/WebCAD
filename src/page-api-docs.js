import { apiVersion, catalogHash as operationCatalogHash, getOperation, listOperations, migratedOperationIds } from './operation-registry.js';
import { readDocs as readLegacyDocs } from './ai-docs.js';
import { contractError, contractHash } from './contracts/operation-schema.js';

const PAGE_DOC_VERSION = '1.0.0';
const PAGE_METHODS = Object.freeze(['info', 'getState', 'searchTools', 'getTool', 'readDocs', 'queryGeometry',
  'execute', 'measure', 'setView', 'redraw', 'capture']);
const FILE_METHODS = Object.freeze(['capabilities', 'register', 'new', 'open', 'import', 'save', 'export', 'read', 'download', 'write', 'release']);
const PAGE_DOCS = Object.freeze({
  start: `WebCAD 页面自动化入口：window.webcad.api.info()。读取当前页面的 info()/getState()，再用 searchTools({query:"安装板"})、getTool({id:"box"})、readDocs({docId:"coordinates"}) 查询契约。当前页面的建模、文件和视图操作由页面 API 调用浏览器 Worker 中的精确内核。\n页面 JS 执行通道必须由调用客户端提供并获用户授权；页面公开函数不证明某个侧边栏已能调用。建模写入须传当前 sessionId、documentId、documentInstanceId、expectedRevision，不能猜 revision。页面方法不接收任意脚本源码、任意 URL 或本地路径。`,
  'api.execute': `execute(request) 使用当前 CommandService 的结构化请求：{context:{sessionId,documentId,documentInstanceId,expectedRevision},idempotencyKey,action,args}。feature.add 的 args 使用真实工具卡的 op、opVersion、schemaHash、params、refs；feature.edit 使用 featureId、opVersion、schemaHash、params 补丁。严格参数契约目前仅覆盖 box、hole、multiHole、faceHole、fillet、chamfer、shell。其他操作的卡片是 advisory，不得把它当成严格 v2 可执行保证。\n同一页面修改由原命令队列串行处理。幂等回执只在当前 documentInstanceId 的有限内存范围内有效，不跨页面重载。成功提交与后续显示或文件写入失败应分别报告。`,
  'recipes.mounting-plate': `四孔板示例，尺寸单位 mm。先调用 info()/getState() 取得当前完整上下文，再用 getTool({id:"box"}) 与 getTool({id:"multiHole"}) 读取实际版本、schemaHash 与示例。新增 box：{width:50,depth:30,height:3}、refs:[]。取得实际板件 bodyId 与新 revision 后新增 multiHole：{radius:2,depth:5,axis:"Z",direction:-1,points:[[5,5,4],[45,5,4],[5,25,4],[45,25,4]]}、refs:[实际 bodyId]。刀具从全局 Z=4 向下切至 Z=-1。体积期望值是 4500-48π mm³；须以当前精确 B-Rep 测量和导出回读验证。\n命名参数已通过 execute action document.parameters 接出；可绑定板长和右孔 X 到 length 与 length-edgeMargin，再只改 length。具体示例见 docs/examples/page-api-plate.js。`,
  'api.named-parameters': `读取 getState().parameters 和 parameterValues。execute({context,idempotencyKey,action:"document.parameters",args:{parameters:{length:{value:50,unit:"mm"},edgeMargin:{value:5,unit:"mm"}},bindings:{"<实际板特征ID>":{"width":"length"},"<实际孔特征ID>":{"points.1.0":"length-edgeMargin","points.3.0":"length-edgeMargin"}}}}) 在一个撤销步骤内计算受影响特征并重建。后续只传 parameters:{length:{value:63,unit:"mm"}} 更新数值，原绑定保持。\n参数定义按名称合并；绑定按特征 ID 和数值路径合并。单位仅 mm/scalar，表达式支持有界四则运算和已注册函数，不执行 JS。未定义参数、循环、单位不符、越界或不安全的后续拓扑索引会拒绝并保留原模型。已绑定字段的直接数值编辑返回 PARAMETER_BOUND；请通过参数表或 document.parameters 修改。`,
  'recipe.file-workflow': `浏览器文件流程：先调用 api.files.capabilities() 读取格式和限制。api.files.register({name,data,mime?}) 登记 File/Blob/ArrayBuffer/Uint8Array 真实字节，返回 resourceId。api.files.new({context})、open/import({context,resourceId}) 操作当前工程；save({context,name?})、export({context,format,ids?,name?}) 返回 status=generated 的资源描述。read({resourceId,as:"blob"|"bytes"}) 返回实际 Blob 或 Uint8Array。download({resourceId}) 返回 download_initiated；write({resourceId,handle}) 仅在已授权句柄写入、关闭与 SHA-256/大小回读匹配后返回 write_verified。release({resourceId}) 释放页面资源；已启动下载的 Object URL 由定时器回收，不因 release 立即撤销。\n单资源 20 MiB、最多 32 个、总计 64 MiB、有效期 30 分钟。生成 Blob 不等于写盘，下载启动不等于写盘成功。旧快照写入不能清除新 revision 的 dirty。页面 API 的新建/打开遇 dirty 一律拒绝 UNSAVED_REPLACEMENT；UI 的真实用户确认是独立路径。File/Blob 不保证能跨侧边栏 JSON 通道传递；宿主不能传字节时由用户在页面选择文件。当前静态版不含本机 IGES 转换器及服务端矢量转换器。`,
  'api.views': `setView({context,direction?,projection?,fit?,selectedIds?,section?}) 控制当前视口。direction 可为 top/bottom/front/back/left/right/side/iso；projection 可为 orthographic/perspective；fit 是布尔值；selectedIds 是当前实体 ID 数组，最多 200 个且不得重复。section 为 {axis:"X"|"Y"|"Z",position:有限数字,enabled:布尔值}，仅做显示裁剪，不切割精确 B-Rep。相机与裁剪变化不增加建模 revision。redraw({context}) 重绘当前提交版本；capture({context}) 等待匹配当前模型的渲染帧，返回 image/png dataUrl、context 和 display，失败时可能为 DISPLAY_FAILED。调用前从 getState().context 取完整当前身份与 expectedRevision。`,
  'api.file-errors': `页面建模、测量、视图与截图方法的失败通常返回 {status:"failed",commitState:"not_committed",error:{code,message},context}；execute 和 queryGeometry 使用 CommandService 的更完整结果。files 方法抛出带 code 的 Error，调用方应捕获，不能把异常解释为已保存。文件状态分别为 registered、generated、download_initiated、write_verified；generated 不证明磁盘写入。输入资源、导入和输出每项最多 20 MiB，最多 32 个资源、合计 64 MiB、30 分钟有效。自包含 .webcad 保存可能含 base64 导入源并超过上限；页面在限制前预留约 4 KiB 空间。读取 files.capabilities() 获得当前实际上限。`,
});
const LEGACY_READABLE = new Set(['coordinates', 'errors', 'api.query-geometry']);
const ALIASES = Object.freeze({ 'webcad://docs/start': 'start', 'webcad://docs/coordinates': 'coordinates',
  'webcad://docs/errors': 'errors', 'webcad://docs/api.execute': 'api.execute',
  'webcad://docs/api.named-parameters': 'api.named-parameters',
  'webcad://docs/api.views': 'api.views', 'webcad://docs/api.file-errors': 'api.file-errors',
  'webcad://recipes/mounting-plate/1.0.0': 'recipes.mounting-plate',
  'webcad://recipes/file-workflow/1.0.0': 'recipe.file-workflow' });
const fileDetails = {
  capabilities: ['capabilities(); no arguments.', 'Browser limits, supported formats and in-page transport.'],
  register: ['register({name,data,mime?}); data is File, Blob, ArrayBuffer or Uint8Array; name is a safe basename.', 'status=registered; resourceId, name, MIME, byte length, SHA-256 and expiry.'],
  new: ['new({context}); complete current context; dirty replacement is always rejected by page API.', 'New document identity and instance on commit.'],
  open: ['open({context,resourceId}); registered .webcad/.json resource; dirty replacement is rejected.', 'Rebuilt document with new documentInstanceId.'],
  import: ['import({context,resourceId}); registered STEP/STP/BREP/BRP resource.', 'Imported source-backed feature in current project.'],
  save: ['save({context,name?}); complete current context.', 'status=generated native project resource with exact source snapshot; not a disk save.'],
  export: ['export({context,format,ids?,name?}); format step/stl/brep/png.', 'status=generated output resource with exact source snapshot.'],
  read: ['read({resourceId,as?}); as is blob (default) or bytes.', 'Actual Blob or Uint8Array; host JSON boundaries may need bounded transfer.'],
  download: ['download({resourceId}); generated output only.', 'status=download_initiated; disk completion cannot be claimed.'],
  write: ['write({resourceId,handle}); previously authorized FileSystemFileHandle.', 'status=write_verified after close and size/SHA-256 readback; snapshot confirmation is separate.'],
  release: ['release({resourceId}); current page resource ID.', 'Page resource released; an already started download URL is revoked by its timer.'],
};
const FILE_LIMITS = Object.freeze({ maxBytes: 20 * 1024 * 1024, maxResources: 32,
  maxTotalBytes: 64 * 1024 * 1024, ttlSeconds: 1800 });
const unavailable = [
  { id: 'import.iges', title: 'IGES/IGS 导入', description: '当前静态版不含原本的本机 IGES 转换。可先在现有 CAD 工具中离线转 STEP。' },
  { id: 'import.vector-server', title: 'DWG/DXF/PDF/AI 服务端矢量转换', description: '当前静态版不含原本的本机矢量转换服务；浏览器已有的直接输入能力以运行时界面为准。' },
];
const pageWording = text => text
  .replaceAll('webcad_inspect_geometry(sessionId,bodyId,kind,topologyId)', 'queryGeometry(request) or measure(request)')
  .replaceAll('webcad_get_templates then webcad_apply_template', 'getTool({id:"quickModel"}) then execute(request)')
  .replaceAll('webcad_get_state_v2', 'getState()').replaceAll('webcad_get_state', 'getState()')
  .replaceAll('webcad_add_feature', 'execute({action:"feature.add",...})')
  .replaceAll('webcad_execute_v2', 'execute(request)')
  .replaceAll('get_templates', 'getTool({id:"quickModel"})')
  .replaceAll('Use tools/logo-extract.py on a reviewed DWG-converted DXF window.',
    'Use reviewed browser vector input or an existing .logo.json packet; the static page does not run a local converter.');
const mapPageText = value => typeof value === 'string' ? pageWording(value)
  : Array.isArray(value) ? value.map(mapPageText)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapPageText(item)])) : value;

function fileCard(name) {
  const [input, output] = fileDetails[name];
  return { id: `files.${name}`, title: `files.${name}`, category: 'file', version: PAGE_DOC_VERSION,
    description: input, inputContract: input, outputContract: output, units: { length: 'mm', angle: 'degrees' },
    implementationStatus: 'page-adapter', contractStatus: 'browser-file-adapter', runtimeAvailability: 'requires_ready_page',
    limits: FILE_LIMITS,
    caveats: name === 'import' ? ['IGES requires unavailable local conversion in the static build.'] : [],
    errorCodes: ['CAPABILITY_UNAVAILABLE', 'REVISION_CONFLICT', 'INSTANCE_MISMATCH', 'UNSAVED_REPLACEMENT',
      'HASH_MISMATCH', 'SIZE_LIMIT', 'RESOURCE_LIMIT', 'RESOURCE_EXPIRED', 'PERMISSION_REQUIRED'] };
}
function namedParameterCard() {
  return { id: 'document.parameters', title: '命名参数与尺寸联动', category: 'document', version: PAGE_DOC_VERSION,
    description: '通过 execute 的 document.parameters 动作合并命名定义和特征数值路径绑定，原子重建并形成一个撤销步骤。',
    synonyms: ['参数', '尺寸', '联动', 'expression', 'length', 'binding'],
    implementationStatus: 'implemented', contractStatus: 'page-command', strictContract: false,
    runtimeAvailability: 'requires_ready_page',
    inputSchema: { type: 'object', required: ['context', 'idempotencyKey', 'action', 'args'],
      properties: { context: { description: 'Current sessionId, documentId, documentInstanceId and expectedRevision.' },
        idempotencyKey: { type: 'string' }, action: { const: 'document.parameters' },
        args: { type: 'object', required: ['parameters'], properties: {
          parameters: { description: 'Name -> {value:number|string,unit:"mm"|"scalar"}; merged with current definitions.' },
          bindings: { description: 'Feature ID -> numeric params dot path -> expression; merged with existing bindings.' },
        } } } },
    outputContract: 'Committed revision plus getState().parameters/parameterValues; a failed expression leaves the previous model intact.',
    minimalExample: { action: 'document.parameters', args: { parameters: { length: { value: 63, unit: 'mm' } } } },
    errorCodes: ['PARAM_CYCLE', 'PARAM_UNDEFINED', 'PARAM_UNIT_MISMATCH', 'PARAM_PATH_INVALID',
      'PARAMETER_BOUND', 'UNSAFE_LEGACY_REFERENCE', 'REVISION_CONFLICT'],
    knownUnsupportedCases: ['No angular/area expression binding in this milestone.',
      'Indexed face/edge references downstream of a changed feature are rejected when stability cannot be proven.'],
    docs: 'api.named-parameters' };
}
const METHOD_DETAILS = Object.freeze({
  info: ['页面信息 构建 就绪', 'info() 无参数。', '构建/API 版本、in-page transport、当前 context、URL、display、就绪状态和能力。'],
  getState: ['工程状态 特征 实体 参数', 'getState({sessionId?,include?}={}); include 可选 summary/features/bodies/selection/capabilities。', '当前 context、工程状态、parameters、parameterValues 和 display；不会默认返回导入源字节。'],
  searchTools: ['搜索 工具 中文 目录', 'searchTools({query,category?,limit?,cursor?}); query 字符串必需，limit 1..50。', '目录卡片摘要、nextCursor、catalogHash；游标绑定查询与目录哈希。'],
  getTool: ['工具卡 参数 schema 契约', 'getTool({id,version?}); id 为当前登记的操作、页面方法或 files.*。', '完整工具卡、版本和 docsHash。'],
  readDocs: ['读取 文档 配方 白名单', 'readDocs({docId,version?,cursor?,limitChars?}); 只接受登记的文档 ID。', '限定长度的说明文本、版本、哈希和分页游标。'],
  queryGeometry: ['几何查询 面 边 选择令牌', 'queryGeometry({context,bodyId,kind:"face"|"edge",filter,requireUnique?,limit?,cursor?})。', '精确 B-Rep 候选项、歧义信息、快照绑定的 selectionToken 与当前 context。'],
  execute: ['建模 编辑 撤销 参数 命令', 'execute({context,idempotencyKey,action,args}); action 来自当前命令合同。', 'CommandService 的 committed/no_change/failed/unknown、revision 和实际创建 ID。'],
  measure: ['测量 实测 体积 包围尺寸 半径', 'measure({context,bodyId,kind?:"body"|"face"|"edge",topologyId?}); 面/边需非负整数 topologyId。', 'status=read、source=exact-brep、单位、当前 context 和内核实测结果。'],
  setView: ['视图 俯视 侧视 轴测 适配 剖切 显隐', 'setView({context,direction?,projection?,fit?,selectedIds?,section?}); section={axis:"X"|"Y"|"Z",position:number,enabled:boolean}。', 'status=read、当前 context、display；section 仅为显示裁剪，不是精确切割。'],
  redraw: ['重绘 刷新 画面 渲染', 'redraw({context}); 不接受额外字段。', 'status=read、当前 context 和 display；不重载页面或增加建模 revision。'],
  capture: ['截图 图像 PNG 当前画面', 'capture({context}); 不接受额外字段。', 'status=read、mime=image/png、真实 dataUrl、当前 context 和匹配渲染帧的 display。'],
});
function methodCard(name) {
  const [synonyms, input, output] = METHOD_DETAILS[name];
  const errors = {
    info: [], getState: ['PARAM_SCHEMA_INVALID', 'INSTANCE_MISMATCH'],
    searchTools: ['PARAM_SCHEMA_INVALID', 'PARAM_RANGE_INVALID'],
    getTool: ['PARAM_SCHEMA_INVALID', 'UNKNOWN_OPERATION', 'OPERATION_VERSION_UNSUPPORTED'],
    readDocs: ['PARAM_SCHEMA_INVALID', 'PARAM_RANGE_INVALID', 'OPERATION_VERSION_UNSUPPORTED'],
    queryGeometry: ['INSTANCE_MISMATCH', 'REVISION_CONFLICT', 'STALE_REFERENCE', 'NO_MATCH', 'AMBIGUOUS_SELECTION'],
    execute: ['INSTANCE_MISMATCH', 'REVISION_CONFLICT', 'PARAM_SCHEMA_INVALID', 'GEOMETRY_INVALID'],
    measure: ['PARAM_SCHEMA_INVALID', 'STALE_REFERENCE', 'REVISION_CONFLICT', 'CAPABILITY_UNAVAILABLE'],
    setView: ['PARAM_SCHEMA_INVALID', 'STALE_REFERENCE', 'REVISION_CONFLICT', 'CAPABILITY_UNAVAILABLE'],
    redraw: ['REVISION_CONFLICT', 'CAPABILITY_UNAVAILABLE', 'DISPLAY_FAILED'],
    capture: ['REVISION_CONFLICT', 'CAPABILITY_UNAVAILABLE', 'DISPLAY_FAILED'],
  };
  return { id: name, title: name, category: 'page-method', version: PAGE_DOC_VERSION,
    description: input, synonyms: [name, ...synonyms.split(' ')], inputContract: input, outputContract: output,
    implementationStatus: 'implemented', contractStatus: 'page-method', runtimeAvailability: 'requires_page',
    errorModel: ['info', 'getState', 'searchTools', 'getTool', 'readDocs'].includes(name) ? 'Read methods may return a structured state error or throw a coded contract error.'
      : ['execute', 'queryGeometry'].includes(name) ? 'CommandService structured result; inspect status and commitState.'
        : 'Guarded page method returns {status:"failed",commitState:"not_committed",error:{code,message},context} on failure.',
    errorCodes: errors[name],
    ...(name === 'setView' || name === 'redraw' || name === 'capture' ? { docs: 'api.views' } : {}) };
}
function pageCards() {
  return [
    ...listOperations().filter(card => !['import', 'remove'].includes(card.id)).map(raw => {
      const card = mapPageText(raw);
      return { ...card,
      title: pageWording(card.title), description: pageWording(card.description),
      coordinateConvention: pageWording(card.coordinateConvention),
      relatedTools: ['getState', 'getTool', 'queryGeometry', 'execute'],
      apiCompatibility: card.strictContract ? ['page-v2'] : ['page-advisory'],
      runtimeAvailability: 'requires_ready_page',
      usage: card.strictContract ? 'Use execute with the strict v2 action envelope.' : 'Available through the page CommandService advisory adapter; Schema is advisory and kernel prerequisites still apply. Verify the actual result.',
      idempotency: 'Current documentInstanceId in-memory receipts only; no cross-reload guarantee.',
      minimalExample: { ...card.minimalExample,
        referenceInstructions: 'Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().' },
      normalExample: { ...card.normalExample,
        referenceInstructions: 'Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().' },
      invalidExamples: card.strictContract ? card.invalidExamples : [],
      knownUnsupportedCases: card.knownUnsupportedCases.filter(item => !/MCP|legacy entry|M2/.test(item)) }; }),
    ...PAGE_METHODS.map(methodCard), namedParameterCard(), ...FILE_METHODS.map(fileCard),
    ...unavailable.map(card => ({ ...card, category: 'unavailable', version: PAGE_DOC_VERSION,
      implementationStatus: 'unavailable', contractStatus: 'unavailable', runtimeAvailability: 'unavailable',
      errorCodes: ['CAPABILITY_UNAVAILABLE'] })),
  ];
}
export const pageCatalogHash = contractHash({ operationCatalogHash, fileDetails, fileLimits: FILE_LIMITS,
  methodDetails: METHOD_DETAILS, namedParameterCard: namedParameterCard(), unavailable, pageDocVersion: PAGE_DOC_VERSION });
export const pageDocsHash = contractHash({ pageCatalogHash, pageDocs: PAGE_DOCS, legacyReadable: [...LEGACY_READABLE] });

export function infoMetadata({ buildId = 'unreported', browserReady = false } = {}) {
  return { product: 'WebCAD', buildId, apiVersion, pageApiVersion: PAGE_DOC_VERSION, transport: 'in-page',
    entrypoint: 'window.webcad.api', catalogHash: pageCatalogHash, docsHash: pageDocsHash,
    units: { length: 'mm', angle: 'degrees', volume: 'mm^3', scale: 'dimensionless' },
    ready: browserReady, modeling: browserReady ? 'available' : 'not_ready',
    methods: [...PAGE_METHODS], filesMethods: [...FILE_METHODS],
    docs: ['start', 'coordinates', 'errors', 'api.execute', 'api.named-parameters', 'api.query-geometry',
      'api.views', 'api.file-errors', 'recipes.mounting-plate', 'recipe.file-workflow'],
    fileLimits: FILE_LIMITS,
    strictOperations: [...migratedOperationIds], otherOperations: 'advisory; actual page adapter and kernel result determine availability',
    unavailable: unavailable.map(({ id, description }) => ({ id, reason: description })),
    limitations: ['Page API visibility does not confirm ChatGPT sidebar script execution.',
      'No cross-reload idempotency or permanent topology IDs.', 'File/Blob objects may not cross a JSON-only host boundary.'] };
}

export function searchTools(input = {}, runtime = {}) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || typeof input.query !== 'string' || input.query.length > 500)
    contractError('PARAM_SCHEMA_INVALID', 'input.query', 'Provide a query string of at most 500 characters.');
  const { query, category } = input, limit = input.limit ?? 10;
  const scope = contractHash({ pageCatalogHash, query, category: category || null }).slice(7);
  const cursorMatch = input.cursor === undefined ? null : new RegExp(`^${scope}:(\\d+)$`).exec(input.cursor);
  if (input.cursor !== undefined && !cursorMatch)
    contractError('PARAM_SCHEMA_INVALID', 'input.cursor', 'Cursor does not match this search and catalog.');
  const offset = cursorMatch ? Number(cursorMatch[1]) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0)
    contractError('PARAM_RANGE_INVALID', 'input', 'Invalid search limit or cursor.');
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = pageCards().filter(card => !category || card.category === category)
    .filter(card => words.every(word => `${card.id} ${card.title} ${card.description} ${(card.synonyms || []).join(' ')}`.toLocaleLowerCase().includes(word)));
  if (offset > matches.length) contractError('PARAM_RANGE_INVALID', 'input.cursor', 'Cursor exceeds result count.');
  return { items: matches.slice(offset, offset + limit).map(card => ({ id: card.id, title: card.title,
    version: card.version, schemaHash: card.schemaHash || null, description: card.description,
    category: card.category, contractStatus: card.contractStatus, strictContract: card.strictContract === true,
    runtimeAvailability: card.runtimeAvailability === 'unavailable' ? 'unavailable'
      : runtime.browserReady === false ? 'not_ready' : runtime.browserReady === true ? 'available' : 'unknown' })),
    nextCursor: offset + limit < matches.length ? `${scope}:${offset + limit}` : null, catalogHash: pageCatalogHash };
}

export function getTool(input) {
  if (!input || Array.isArray(input) || typeof input.id !== 'string')
    contractError('PARAM_SCHEMA_INVALID', 'input.id', 'Provide a registered tool ID.');
  let card;
  if (PAGE_METHODS.includes(input.id)) card = methodCard(input.id);
  else if (input.id === 'document.parameters') card = namedParameterCard();
  else if (input.id.startsWith('files.') && FILE_METHODS.includes(input.id.slice(6))) card = fileCard(input.id.slice(6));
  else if (unavailable.some(item => item.id === input.id)) card = pageCards().find(item => item.id === input.id);
  else {
    if (['import', 'remove'].includes(input.id))
      contractError('CAPABILITY_UNAVAILABLE', 'input.id', 'Use the dedicated page file or execute action.', 'READ_TOOL_CONTRACT');
    card = getOperation(input.id);
    card = pageCards().find(item => item.id === card.id);
  }
  if (input.version !== undefined && input.version !== card.version)
    contractError('OPERATION_VERSION_UNSUPPORTED', 'input.version', 'Requested version is not registered.', 'READ_TOOL_CONTRACT');
  return { ...card, docsHash: contractHash(card) };
}

export function readDocs(input) {
  if (!input || Array.isArray(input) || typeof input.docId !== 'string')
    contractError('PARAM_SCHEMA_INVALID', 'input.docId', 'Provide a whitelisted documentation ID.');
  const id = ALIASES[input.docId] || input.docId;
  const page = (body, actualVersion) => {
    if (input.version !== undefined && input.version !== actualVersion)
      contractError('OPERATION_VERSION_UNSUPPORTED', 'input.version', 'Requested documentation version is not registered.');
    const offset = input.cursor ? Number(input.cursor) : 0, limit = input.limitChars ?? 8000;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > body.length || !Number.isInteger(limit) || limit < 1000 || limit > 16000)
      contractError('PARAM_RANGE_INVALID', 'input', 'Invalid documentation cursor or limit.');
    return { docId: id, version: actualVersion, docsHash: contractHash({ id, body }),
      text: body.slice(offset, offset + limit), nextCursor: offset + limit < body.length ? String(offset + limit) : null };
  };
  if (Object.hasOwn(PAGE_DOCS, id)) {
    return page(PAGE_DOCS[id], PAGE_DOC_VERSION);
  }
  if (LEGACY_READABLE.has(id)) return readLegacyDocs({ ...input, docId: id });
  const match = /^webcad:\/\/operations\/([^/]+)\/([^/]+)$/.exec(id);
  if (match) {
    const card = getTool({ id: match[1], version: match[2] });
    return page(JSON.stringify(card, null, 2), card.version);
  }
  contractError('PARAM_SCHEMA_INVALID', 'input.docId', 'Unknown documentation ID; paths are not accepted.');
}

export function createStaticPageApiIndex() {
  const metadata = infoMetadata();
  const lines = ['# WebCAD 页面 API 索引', '', `API ${metadata.pageApiVersion} · 操作目录 ${pageCatalogHash}`, '',
    '入口：`window.webcad.api.info()`，然后 `searchTools`、`getTool`、`readDocs`。页面 JS 执行取决于获授权的客户端能力。', '',
    '长度 mm、角度 degrees、体积 mm³。严格契约：' + migratedOperationIds.join('、') + '；其余操作为 advisory。', '',
    '## 页面方法', '', ...PAGE_METHODS.map(name => `- \`${name}\``), '', '## 文件方法', '',
    ...FILE_METHODS.map(name => `- \`files.${name}\``), '', '## 工具目录', ''];
  for (const card of pageCards()) lines.push(`- \`${card.id}\` · ${card.contractStatus} · ${card.description}`);
  return lines.join('\n') + '\n';
}
