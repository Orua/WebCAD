# api.prepare-operation

# 用准备单简化建模

优先读取 prepareOperation 和 applyPreparedOperation 两张短卡。准备不计算几何；返回 prepared 或 needs_input，不把缺设计参数当作已执行失败。工具补齐当前版本/hash、唯一实体refs、唯一已接受LOGO草稿和审核版次；LOGO的加工意图由调用者明确的模式/深度生成，widthMm按真实轮廓计算scale。深度、凹凸、多个实体/草稿/面不猜选。

例1：图片或PDF已由 readLogo(sessionFileId) automatic 转换，当前只有一块板和一份草稿：webcad_read(method:prepareOperation,args:{context,op:logo,face:top,params:{mode:engrave,depthMm:0.2,widthMm:35}})。prepared返回preparationId和摘要；随后webcad_submit(method:applyPreparedOperation,args:{context,preparationId:返回的原编号})。不要再拼refs、machiningIntent、logoId或opVersion。字符串按JSON加引号。

例2：本次真实倾斜支架：先导入STEP，用queryGeometry({kind:face,requireUnique:false})查明用户要求的倾斜面；prepareOperation({context,op:logo,bodyId:当前实体,face:当前倾斜面号,params:{mode:engrave,depthMm:0.15,widthMm:25}})。平面面积中心经精确点到有限面测量证实有效后才补point；中心落在孔/面外则返回问询。曲面必须传params.point为真实表面落点，不把面积中心当表面。

例3：prepareOperation({context,op:logo,face:top,params:{widthMm:20}})返回needs_input、preparationId、questions。若用户已说凹刻0.1mm，直接prepareOperation({context,preparationId,answers:{"params.mode":"engrave","params.depthMm":0.1}})；原话没有深度时向用户展示问题，得到答案后续接同一编号。questions的choices来自当前真实对象；不要重读全目录、重新矢量化或重建模型。

准备摘要是可审阅的普通JSON，不是任意JS/Python脚本。需要按顺序组合多步时沿现有run声明式批次，不执行eval。准备单32份/30分钟，绑定文档实例、修订及草稿版次；改模型后须重新准备。重复应用同编号只回原回执（含unknown），不会重复计算。prepared不是几何成功；最终按committed、精确量测与同修订渲染验收。

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
