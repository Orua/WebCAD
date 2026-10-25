# api.placement

# 显式定位与默认摆放

placement:{version:1,frame,sourceAnchor} 是 add 的同级字段，不放在 params 内。
frame 有且只有以下四种形状：
- 世界坐标原点：{kind:'world'}，不能带 origin、quaternion 或 coordinates。
- 明确位置和姿态：{kind:'snapshot',origin:[x,y,z],quaternion:[qx,qy,qz,qw]}。
- 当前工作基准：{kind:'work',expectedFrameVersion:当前版本}。
- 已保存基准：{kind:'saved',frameId:实际ID,expectedFrameVersion:当前版本}。

任意世界位置/方向使用 snapshot。origin 是毫米世界坐标；quaternion 是单位四元数 [x,y,z,w]。sourceAnchor 可为 model-origin、bottom-center、bounds-center、point（另带 point）或 named（另带 anchorId）；优先按当前实体卡指定的插入锚点。不得发明 frame.coordinates 或把 origin 塞进 world。

显式 placement 固定位置，禁止默认自动摆放。省略 placement 会冻结当前工作基准，并可能收到 AUTO_PLACED；设置工作基准后省略 placement 仍不等于精确放置。收到 AUTO_PLACED 必须以最终 bounds/量测为准。

只读预检为 Page api.resolvePlacement({context,op,params,refs:[],placement})；MCP 为 webcad_read(method:'resolvePlacement',args:同一对象)。返回不计算几何，成功不等于实体已创建。

通用例：将一个半径 r、高 h 的圆柱底面中心置于世界点 p，沿 Z 轴：placement:{version:1,frame:{kind:'snapshot',origin:p,quaternion:[0,0,0,1]},sourceAnchor:{kind:'bottom-center'}}。姿态由用户要求计算，不能从示例借尺寸。沿 X 轴可用绕世界 Y 旋转90度的单位四元数 [0,Math.SQRT1_2,0,Math.SQRT1_2]。

变换有两条独立契约：省略 placement 的普通世界变换用 params:{x,y,z,rx,ry,rz,scale}；显式 placement 则使用 mode:'translate' 配 delta、mode:'rotate' 配 pivot/axisVector/angleDeg，或当前 transform 卡的其他 mode，不能混用旧 x/y/z 和 mode。变换后引用 createdBodyIds/replacements 中的新 ID；run 后续步骤用 $ref。


Context policy: none = no document context; identity = sessionId/documentId/documentInstanceId (revision ignored); revision = full context and current expectedRevision. Full context: pass api.getState().context.
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
