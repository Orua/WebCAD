# api.agent-contracts

# 页面 API 与 Agent 调用边界

先 connect，比较 pageApiVersion/catalogHash/docsHash，下载并校验 onboarding.knowledge 的完整包；只缓存静态合同。每次写入使用最新 requestContext，实体和拓扑编号必须来自当前工程修订。

1. 建模操作：工具卡 inputSchema 验证 params，refsSchema 验证 refs；api.run 步骤用 method:add、args:{op,params,refs,name?,placement?}。template.* 是发现 ID，实际 op:quickModel、params.kind，不能将发现 ID 当建模 op。
2. 编辑命令：mcpCall.action 对应 execute 的 action；argsSchema 验证内层 args，callSchema 验证完整 {context,idempotencyKey,action,args}。prepareToolCall 接收内层 args，不再嵌套 action/context。其 prepared.nextCall 含稳定的命令幂等键；读取同一准备单不生成另一条写入。MCP 外层 requestKey 由宿主管理，与页面幂等键不同。
3. 页面方法：按 mcpCall.tool/method 调用。batchCapable 只说明该准确 method 能否成为 api.run 步骤，不代表任意工具 ID 都能作为 method。capture、recoverKernel 和 run 自身不能嵌入 run。batchCapable:false 也不表示不能通过工具卡 mcpCall 直调。
4. 文件：按 mcpCall 区分公开入口与 host-only。files.read 必须传 as:bytes/text/blob；bytes 返回 Uint8Array，blob 返回 Blob，不能把普通 JSON.stringify 的结果当成文件字节。资源生成、下载发起、磁盘写入和哈希校验是不同回执；不绕过宿主文件句柄权限。
5. 预检：prepareOperation/prepareToolCall 的 prepared 只证明输入结构，不证明几何、来源、权限、生命周期或业务验收。needs_input 使用同一准备单的 answerPath 续接。错误、过期或工程变化后读取原回执，不用换键重算未知结果。

run 固定 atomic:false，失败保留之前已提交步骤；同次原子多特征提交用 feature.addMany。结果按 status/commitState、实际 context、createdBodyIds、精确量测和 rendered 修订核验。所有示例中的 <live...>、资源/准备单编号及 revision=0 必须替换为真实回执值；示例通过 schema 不代表可以脱离真实来源直接执行。

readDocs 参数为 docId/version?/cursor?/limitChars?/knownHash?；limitChars 为 1000–16000。knownHash 只能对应完整缓存，不能与 cursor 同传。没有 section/maxChars 参数。抽壳正厚度向内、负厚度向外；开口抽壳材料可能减少，向外用体积或外形增大验证。闭合相切圆弧的扫掠不应被尖角检测拒绝；真正尖角 transformed 使用 right/round 或修改真实路径，不能自动换过渡。

Context policy: none = no document context; identity = sessionId/documentId/documentInstanceId (revision ignored); revision = sessionId/documentId/documentInstanceId plus current expectedRevision. For writes use api.createRequestContext(), connect().requestContext or the last successful receipt nextContext/requestContext. getState().context contains revision; do not pass it unchanged as a revision-protected write context.
reliefWizard: contextPolicy=identity
prepareToolCall: contextPolicy=identity
prepareOperation: contextPolicy=identity
applyPreparedOperation: contextPolicy=identity
getDebugReport: contextPolicy=none
setDebugPanel: contextPolicy=identity
getMetalMaterials: contextPolicy=none
setMetalMaterials: contextPolicy=identity
getMaterials: contextPolicy=none
measureMass: contextPolicy=identity
reliefDesignFit: contextPolicy=revision
prepareReliefDesignRelief: contextPolicy=revision
reliefDesignReference: contextPolicy=revision
reliefDesignField: contextPolicy=revision
readLogo: contextPolicy=identity
reviewLogo: contextPolicy=identity
logoWizard: contextPolicy=identity
getBatchReceipt: contextPolicy=none
probeBlendRadius: contextPolicy=identity
recoverKernel: contextPolicy=revision
sampleMeshRelief: contextPolicy=identity
getModelLibrary: contextPolicy=none
updateModelLibrary: contextPolicy=revision
resolveModelLibrary: contextPolicy=identity
planPatternMachining: contextPolicy=identity
decideServicesWait: contextPolicy=none
recoverServicesJob: contextPolicy=none
prepareReliefTopologyUpgrade: contextPolicy=identity
sampleReliefHeight: contextPolicy=identity
prepareReliefSculpt: contextPolicy=identity
readRelief: contextPolicy=identity
getHistory: contextPolicy=none
planAlignment: contextPolicy=identity
selectRectangle: contextPolicy=identity
createDrawing: contextPolicy=revision
exportDrawing: contextPolicy=revision
getQuickModelUsage: contextPolicy=none
copySelection: contextPolicy=revision
pasteSelection: contextPolicy=revision
createRequestContext: contextPolicy=none
getUILayout: contextPolicy=none
setRenderQuality: contextPolicy=identity
invoke: contextPolicy=none
submit: contextPolicy=none
getJob: contextPolicy=none
cancelJob: contextPolicy=none
waitFor: contextPolicy=none
awaitJob: contextPolicy=revision
connect: contextPolicy=none
info: contextPolicy=none
getState: contextPolicy=none
searchTools: contextPolicy=none
getTools: contextPolicy=none
getTool: contextPolicy=none
readDocs: contextPolicy=none
queryGeometry: contextPolicy=identity
queryReferences: contextPolicy=identity
resolvePlacement: contextPolicy=identity
execute: contextPolicy=revision
measure: contextPolicy=identity
measureRelation: contextPolicy=identity
inspectDesign: contextPolicy=identity
inspectPrintability: contextPolicy=identity
inspectProfile: contextPolicy=identity
prepareProfileEdit: contextPolicy=identity
inspectConstraints: contextPolicy=identity
projectProfile: contextPolicy=identity
inspectFit: contextPolicy=identity
inspectThickness: contextPolicy=identity
inspectDraft: contextPolicy=identity
inspectRound: contextPolicy=identity
readVector: contextPolicy=identity
connectVector: contextPolicy=none
fitProfile: contextPolicy=identity
traceTwinWindow: contextPolicy=identity
executeText: contextPolicy=revision
setDisplayPreferences: contextPolicy=identity
getAgentPanel: contextPolicy=none
configureAgentPanel: contextPolicy=revision
setAgentPanel: contextPolicy=revision
markLocation: contextPolicy=revision
getServices: contextPolicy=none
setServices: contextPolicy=revision
getServicesCapabilities: contextPolicy=none
getServicesRouting: contextPolicy=none
clearServicesCredential: contextPolicy=revision
getServicesJob: contextPolicy=none
getServicesRequest: contextPolicy=none
cancelServicesJob: contextPolicy=revision
getLogoConverter: contextPolicy=none
setLogoConverter: contextPolicy=revision
convertLogoPdf: contextPolicy=revision
setView: contextPolicy=identity
redraw: contextPolicy=identity
capture: contextPolicy=identity
getEvidenceImage: contextPolicy=revision
run: contextPolicy=revision
files.capabilities: contextPolicy=none
files.register: contextPolicy=none
files.new: contextPolicy=none
files.open: contextPolicy=revision
files.import: contextPolicy=revision
files.save: contextPolicy=revision
files.export: contextPolicy=revision
files.reattach: contextPolicy=none
files.read: contextPolicy=none
files.download: contextPolicy=none
files.write: contextPolicy=none
files.confirmWritten: contextPolicy=none
files.release: contextPolicy=none
