# api.logo

图案加工分流 v1
先解释用户要的几何，再发现工具。恒深文字/凹线条（如 stripes.png 凹下0.4mm）→ LOGO；离散层高→分层relief；连续耳、眼、鼻口体块→连续雕刻；连续主体加恒深文字→分开的组合步骤。颜色、格式、题材、深度大小和关键词搜索都不能单独决定路线。沿用已确认上下文；明确请求不重复问工具，含糊的“做上去”只问缺失的几何意义。
planPatternMachining({context,intent})只读规划。intent.version=1；requestedGeometry=constantDepthContours|layeredRelief|continuousRelief|mixed|unspecified；sourceInterpretation=reviewedVectors|rasterArtwork|authoredHeightMap|shadedReference|sculptMesh；userIntentEvidence保留用户原请求/已确认上下文。提供原始sourceHash、dimensionsMm:{width,height}、direction、specifiedDepthsMm或targetPeakMm、preserve、supportBinding:{bodyId,geometryFingerprint}、placementSnapshot:{origin,quaternion}。看route/missingInputs/capabilityBlockers/canExecute，不把关键词命中视为执行许可。规划不证明来源/支撑绑定；执行仍读当前面与几何、完整工具卡。
新LOGO/relief创建和预览params必须携带machiningIntent；Worker执行端再次核对声明，UI明确修改已声明的深度/方向时同步数值声明；旧文件重建、编辑、撤销保留旧版本，无字段不自动升级。新LOGO需reviewedVectors及原孔/空白；照片浮雕标shadedReference，当前语义雕刻未启用，不得把亮度映射后报成品。readRelief显式提供sourceInterpretation；灰度只能用于authoredHeightMap。旧depthMm是控制点比例，不是实际峰值；targetPeakMm不走旧算法。自然圆滑不等于固定R。
转换失败、超时或不支持保持原目标和原工程；不互换LOGO/浮雕，不去耳朵/封孔/改深度或盲目重提任务。任务completed、几何提交、生成文件、落盘、离线重开及造型验收分别报告；取消先读已提交revision和原commandId。

LOGO 表示按明确深度的凹刻/凸字，不从照片明暗猜立体高度。

人工：选择图片自动识别，技术精度由程序处理；每步保持缩略图。校对可打开大窗编辑，保存图标导出当前稿。确认轮廓后窗口收为画布浮动入口，点击精确平面显示目标面高亮、异色轮廓与四边距离。输入上/左间距、拖动、缩放、旋转、居中后点勾雕刻。定位不重算；最终几何保持真实面、源轮廓与撤销事务。

原生Agent约定：
1. 通过agent_session_file list取得用户当前对话原图的sessionFileId；不要在全盘猜文件，不把附件标题当实际字节。读取当前工具卡一次。
2. 优先webcad_read readLogo({context,sessionFileId,allowUpload:true,targetWidthMm,reviewPolicy})。宿主直接原图→Services→宿主磁盘；验证上传/产物身份与磁盘SHA256，使用总包中固定logo-preparer。模型不处理密钥或轮廓数组；页面只接收矢量，不搬运原图。
3. reviewPolicy默认automatic：按用户本次LOGO任务接受已验证矢量，立即输出“已完成矢量化，正在定位雕刻”等真实进度，随后使用当前logoId。只有用户说“先给我看看/先调整”等，才用preview，再调用logoWizard action open显示大窗，阶段性停止。确认后从logoWizard get读取当前logoId及修改稿，不重转原图、不用历史缓存覆盖用户编辑。
4. 选面/位置来自当前用户选面或明确的几何查询；不能复用旧revision拓扑号或猜歧义面。宽度是本次放置尺寸，未给定的位图35mm仅作可调稿；不称为源图实际尺寸。清楚的试板任务可按实际面外框选合适比例居中。
5. 雕刻使用run method add，op:logo，refs:[当前实体ID]，params:{logoId,faceId,placementVersion:2,point:[当前世界坐标],mode:engrave,depthMm:实际深度,scale:实际比例,machiningIntent:{version:1,requestedGeometry:constantDepthContours,sourceInterpretation:reviewedVectors,userIntentEvidence:实际任务要求}}。页面把logoId解析为当前已接受的矢量和来源后走同一CommandService。expectedReviewRevision可绑定已读草稿。preview未确认则拒绝，不静默越过用户要求的暂停。
6. 核验几何提交、实际体积/有效实体及同revision渲染；保存/生成字节/磁盘写入分开报告。连接未知只查询原请求/原任务，不换key重算。

没有原生直连能力的授权页面脚本可登记真实文件后readLogo({context,resourceId,name,...})，或把宿主已验证logo对象交给readLogo。只在真实通道能力缺失时报告限制，不安装新服务或伪造Origin。原生宿主的服务授权不进入模型；跨域服务使用管理员登记的现有私有授权配置。SVG/DXF/JSON优先保留可靠源单位，像素图的初始毫米稿须在放置时决定。

自动轮廓整理匹配150区域/总点12000/单环2000上限。较密位图共享有双向偏差证书的直线/圆弧拟合；失败保留有效原轮廓/RDP候选，不删除字形或孔洞凑成功。source.endpointAdaptation和machiningOptimization记录真实误差和来源，原始轮廓可读。照片、阴影不是精确矢量或高度图。

Context policy: none = no document context; identity = sessionId/documentId/documentInstanceId (revision ignored); revision = sessionId/documentId/documentInstanceId plus current expectedRevision. For writes use api.createRequestContext(), connect().requestContext or the last successful receipt nextContext/requestContext. getState().context contains revision; do not pass it unchanged as a revision-protected write context.
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
