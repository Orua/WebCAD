# api.prepare-tools

# 全工具统一参数准备

每张当前工具卡都有preparation字段，建模操作使用prepareOperation，其他工具使用prepareToolCall。预检不执行几何或文件写入，也不增加任意脚本执行器。不同权限仍由原工具判断。

prepareToolCall({context,toolId:'inspectDraft',args:{}})会从唯一实体补bodyId，并逐项问pullDirection和thresholdDeg；原话已有的值直接回答，只有缺少真实设计意图才问用户。续接{context,callPreparationId,answers:{'args.pullDirection':[0,0,1],'args.thresholdDeg':2}}返回原工具nextCall。相同预检单不执行工具，因此不代表原目标已提交。

prepareToolCall({context,toolId:'files.export',args:{}})会问format，回答step后返回webcad_artifact/files.export。没有实体、格式不支持、来源过期等仍在原工具检查。files.register/write和凭证管理属于宿主；返回blocked及已公开alternative，不要求模型填写凭证/句柄。发现卡heightfieldSculpt/reliefSculpt返回guidance，不能误作为新增op。不可用工具返回具体blocker。

feature.edit只需实际featureId和params补丁，预检从该历史特征的真实op补opVersion/schemaHash，并校验合并补丁；不填feature.edit卡版本。下一步仍是原execute，需要宿主唯一请求键和编辑权限。不能复用旧拓扑号或跳过设计解算/拟合阶段。

浮雕：先readRelief({context,resourceId,name,style:'rounded',sourceInterpretation:'rasterArtwork'})；再prepareOperation({context,op:'relief',face:'top',params:{reliefId:原返回编号,widthMm:10,heightMm:10,depthMm:0.5,mode:'emboss'}})。唯一原件可省reliefId；多个原件须明确。页面保留原values/layers/regions/source并由真实来源用途生成加工意图。宽高/深度别名对应sizeXMm/sizeYMm/reliefHeightMm，冲突拒绝；未给实际尺寸、凹凸或高度会问询。平面中心必须在有限面材料内；曲面须明确落点。高度图、分层、原件轮廓与孔不改写，照片不能根据亮度猜深度。

prepareOperation对当前字段明确标注unit:mm且没有同名Mm字段时，支持widthMm→width、radiusMm→radius这类同单位简写；冲突拒绝，不做数值换算。readRelief({context,reliefId})可回读原件，不需要再提供文件。

quickModel按实际kind选择oneOf分支；缺kind列出可选类型，不把任一模板当默认。anyOf/oneOf缺输入时给出alternatives与answerPaths；可以回答对应子字段。数组和嵌套对象保持原值。全部工具的接入与结构预检覆盖单独统计，不等于逐工具真实几何或Luna验收。

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
