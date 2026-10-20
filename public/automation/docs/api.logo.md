# api.logo

图案加工分流 v1
先解释用户要的几何，再发现工具。恒深文字/凹线条（如 stripes.png 凹下0.4mm）→ LOGO；离散层高→分层relief；连续耳、眼、鼻口体块→连续雕刻；连续主体加恒深文字→分开的组合步骤。颜色、格式、题材、深度大小和关键词搜索都不能单独决定路线。沿用已确认上下文；明确请求不重复问工具，含糊的“做上去”只问缺失的几何意义。
planPatternMachining({context,intent})只读规划。intent.version=1；requestedGeometry=constantDepthContours|layeredRelief|continuousRelief|mixed|unspecified；sourceInterpretation=reviewedVectors|rasterArtwork|authoredHeightMap|shadedReference|sculptMesh；userIntentEvidence保留用户原请求/已确认上下文。提供原始sourceHash、dimensionsMm:{width,height}、direction、specifiedDepthsMm或targetPeakMm、preserve、supportBinding:{bodyId,geometryFingerprint}、placementSnapshot:{origin,quaternion}。看route/missingInputs/capabilityBlockers/canExecute，不把关键词命中视为执行许可。规划不证明来源/支撑绑定；执行仍读当前面与几何、完整工具卡。
新LOGO/relief创建和预览params必须携带machiningIntent；Worker执行端再次核对声明，UI明确修改已声明的深度/方向时同步数值声明；旧文件重建、编辑、撤销保留旧版本，无字段不自动升级。新LOGO需reviewedVectors及原孔/空白；照片浮雕标shadedReference，当前语义雕刻未启用，不得把亮度映射后报成品。readRelief显式提供sourceInterpretation；灰度只能用于authoredHeightMap。旧depthMm是控制点比例，不是实际峰值；targetPeakMm不走旧算法。自然圆滑不等于固定R。
转换失败、超时或不支持保持原目标和原工程；不互换LOGO/浮雕，不去耳朵/封孔/改深度或盲目重提任务。任务completed、几何提交、生成文件、落盘、离线重开及造型验收分别报告；取消先读已提交revision和原commandId。

LOGO校对：readLogo 返回 logoId/review.revision/sourceResourceId。reviewLogo get读取，select选择regionIndex/holeIndex/pointIndex，setPoint明确pointMm，deletePoint/deleteContour/undo编辑，confirm要求confirmed:true；每次非get传expectedRevision。草稿独立于工程revision，编辑后必须重新确认。action:artifacts按当前expectedRevision生成JSON/SVG/DXF/转换报告和可用inspection资源，经files.read/download读取；get不生成资源，再生成会替换该草稿的旧中间资源，独立exportDrawing导出不受影响。最近4个logoId保留，打开别的工程不可复用。logoWizard get读已打开的紧凑向导，parameters/read/back/load及同名编辑/confirm作用于同一UI；attach以wizard.revision把当前UI原件和同一review session登记成logoId/sourceResourceId，不生成派生文件，cad.read即可；artifacts需要cad.export，绑定并导出当前UI稿，不能返回编辑前旧稿。get纯读，不隐式登记。sourceStatus=unavailable-original表示恢复工程仅有轮廓，不能捏造原件资源；load传logoId同时使用原资源叠加底图，没打开返回LOGO_WIZARD_CLOSED。无需界面时直接reviewLogo。原图对齐依赖后台rasterFrame，旧结果无元数据不猜测叠加。本地直读支持受限SVG/LOGO JSON和明确单位的闭合直线DXF；其他格式需明确上传已配置Services。PDF/AI优先提取矢量，含文字/图像或复杂绘制时在受控Worker用匹配PDFium无V8渲染器一次栅格回退；最长边1024像素，PNG最多1MiB，needsReview不代表雕刻。raster参数也可用于该回退；直接矢量不应用位图参数。后台logo.pdfRasterRenderer读回可用性，缺组件保留原任务并说明。source.renderedRaster含原源SHA/页码/渲染器SHA/PNG哈希与字节，source.rasterFrame用于半透明底图毫米对齐；artifacts额外提供rendered-source PNG与原像素轮廓，不猜字体与细节精度；历史PDF描边接合与短折返清理规则保留：pdfJoinToleranceMm默认0，按完整LOGO源宽度×0.0025自动计算；正数0–0.1mm显式覆盖，readLogo和logoWizard.parameters可设，转换报告回读实际值和修复数量。该规则不用于位图平滑。位图新增显式raster.smoothingPx=0..0.5源像素，默认0关闭；保留区域/孔/节点及原稿，拓扑不合格整组退回原稿。source.rasterSmoothing读取实际状态和相对二值边界的偏差上界，不能当作图像重建误差。reviewLogo artifacts同时提供original-contours和smoothing资源。原始轮廓保留转换器毫米坐标和hash，source.rasterOriginalContoursToLogo给出它到当前logo毫米坐标的显式缩放。

LOGO轮廓导出：readLogo成功后用返回的logoId调用exportDrawing({context,logoId,format:"dxf"})；生成附件不依赖工作区文件写权限，不创建实体或工程图，保留毫米1:1外环和孔洞。可用format:"json"保存原轮廓包供以后本机重新读取，只有最近4份logoId有效。\n统一 LOGO：工具栏“面加工→LOGO”与页面 execute({action:"feature.add",args:{op:"logo",...}}) 共用建模内核。先 getState() 得到当前 bodyId/revision，queryGeometry({context,bodyId,kind:"face",requireUnique:false}) 找精确 BRep 面与 faceId；放置点 point 必须为该面的三维 XYZ。新操作 params 使用 {placementVersion:2,faceId,point:[x,y,z],mode:"engrave"|"emboss",depthMm:显式正数,draftAngle:0,scale:1,angle:0,offsetXMm:0,offsetYMm:0,mirrorX:false,regions:[{outer:[[x,y],...],holes:[]}],source:{kind:"reviewed-contours",reviewed:true,original:{...}}}，refs:[bodyId]。source.reviewed=true 是调用者已复核轮廓来源、尺寸和孔洞的明确声明；新流程不猜深度。平面可凹刻/凸字/拔模，非平面只允许 mode=engrave 且 draftAngle=0，仍受原曲面边界、接缝、薄壁校验。创建时记录源 BRep 哈希作快照审计；历史重建以稳定的面几何签名、类型、面积与中心校验，不能把跨内核不稳定的原始序列化字节误作历史匹配依据。旧 logo 缺少 placementVersion 沿用原平面语义，旧 curvedLogo 只供历史兼容。轮廓单位 mm、局部 X 为全局 X 投影到目标面切平面（X 法向附近改 Y）、局部 Y=法向×局部 X。浏览器 UI 本地读取 .logo.json/受限 SVG/粘贴 SVG 或闭合 d；外部 AI 可直接提供经复核的 regions，不能把 SVG 字符串当 regions。SVG 曲线离散误差源尺度约 0.005 mm，等比放大后误差也按比例增加。启用统一计算接口后，readLogo将PDF/AI、非本地支持的DXF和PNG/JPG/BMP交给受控后台；未配置后台时本机受限SVG/LOGO JSON和受支持闭合直线DXF可用。位图raster可省略；threshold与alphaThreshold是0–255整数，默认128与1，invert为布尔值且默认false。它不同于readRelief的0–1阈值；0.5不会自动换算或取整。NO_VECTOR_CONTENT表示本次前景为空；先读原作业并核对实际参数与源图，不自动反转、扫描阈值或重提交同一失败输入。

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
