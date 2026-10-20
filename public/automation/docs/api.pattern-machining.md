# api.pattern-machining

图案加工分流 v1
先解释用户要的几何，再发现工具。恒深文字/凹线条（如 stripes.png 凹下0.4mm）→ LOGO；离散层高→分层relief；连续耳、眼、鼻口体块→连续雕刻；连续主体加恒深文字→分开的组合步骤。颜色、格式、题材、深度大小和关键词搜索都不能单独决定路线。沿用已确认上下文；明确请求不重复问工具，含糊的“做上去”只问缺失的几何意义。
planPatternMachining({context,intent})只读规划。intent.version=1；requestedGeometry=constantDepthContours|layeredRelief|continuousRelief|mixed|unspecified；sourceInterpretation=reviewedVectors|rasterArtwork|authoredHeightMap|shadedReference|sculptMesh；userIntentEvidence保留用户原请求/已确认上下文。提供原始sourceHash、dimensionsMm:{width,height}、direction、specifiedDepthsMm或targetPeakMm、preserve、supportBinding:{bodyId,geometryFingerprint}、placementSnapshot:{origin,quaternion}。看route/missingInputs/capabilityBlockers/canExecute，不把关键词命中视为执行许可。规划不证明来源/支撑绑定；执行仍读当前面与几何、完整工具卡。
新LOGO/relief创建和预览params必须携带machiningIntent；Worker执行端再次核对声明，UI明确修改已声明的深度/方向时同步数值声明；旧文件重建、编辑、撤销保留旧版本，无字段不自动升级。新LOGO需reviewedVectors及原孔/空白；照片浮雕标shadedReference，当前语义雕刻未启用，不得把亮度映射后报成品。readRelief显式提供sourceInterpretation；灰度只能用于authoredHeightMap。旧depthMm是控制点比例，不是实际峰值；targetPeakMm不走旧算法。自然圆滑不等于固定R。
转换失败、超时或不支持保持原目标和原工程；不互换LOGO/浮雕，不去耳朵/封孔/改深度或盲目重提任务。任务completed、几何提交、生成文件、落盘、离线重开及造型验收分别报告；取消先读已提交revision和原commandId。

浮雕 Agent 决策表
输入/目标 | 工具 | 输出 | 限制
作者制作的灰度高度图，毛发/纹理、打印 | meshHeightfieldRelief | 封闭网格/STL | 2049/边，1900000采样
高度图局部抬高/压低/平滑/压平 | heightfieldSculpt，feature.edit追加params.sculpt | 网格/STL | 512笔，20000点
网格与实体合并/挖出 | transform定位，再meshBoolean | 网格/STL | 2–16封闭实体
恒深矢量LOGO | logo | BRep/STEP | 单精确面
小图案或分层矢量、精确STEP | readRelief→relief | BRep/STEP | 4–65采样，32层
精确浮雕局部修整 | reliefSculpt，prepareReliefSculpt→feature.edit | BRep | 7–65局部网格，128笔
外凸圆柱浮雕 | relief | BRep | 外凸、角宽≤90°、总高≤R×20%、无旋转
层间肩部过渡 | reliefShoulder | BRep | 需要Services
已有STL局部修高 | sampleMeshRelief→meshReliefEdit | 网格 | 200000三角面
圆形起伏底板 | meshReliefPlate | 网格 | 200000三角面
照片/光影参考 | 先人工制作高度图，再meshHeightfieldRelief | 不直接加工 | 禁止把照片亮度当几何深度
heightfieldSculpt和reliefSculpt是发现入口，执行真实feature.edit/prepareReliefSculpt，并非独立建模op。

Context policy: none = no document context; identity = sessionId/documentId/documentInstanceId (revision ignored); revision = full context and current expectedRevision. Full context: pass api.getState().context.
reliefDesignFit: contextPolicy=revision
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
