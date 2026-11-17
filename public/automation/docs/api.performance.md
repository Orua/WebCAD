# api.performance

重建与保存性能
getState().kernelProgress 返回 requestId/operationId、revision、documentInstanceId、phaseId、completed、total、reused、elapsedMs、lastAdvanceAt。计算分母仅含待处理项；缓存不冒充进度。同步内核调用无可测子进度时显示阶段和已用时间，不估算百分比。geometry commit、snapshot-ready 与当前 revision 的 rendered 首帧分别确认。
getState().kernelPerformance 含 workerTiming、phaseTimings、snapshotStats、requestTiming、history 与 perFeatureMs。阶段计时按互斥区间统计；snapshotMs是子项，不能与其父阶段重复相加。mainTimings 按准备、Worker往返（内含执行/排队/消息传输）与提交收尾分段；往返与子项不可重复相加。主线程历史差量、校验、自动保存捕获/写入另列；未分类余量明确保留。
相同资产只注册一次，保存源按 SHA-256 引用和增量传输，实例/修订与请求绑定。隐藏只影响显示，不删除来源。精确刚体复制保留 BRep；只读源共享位置变换，布尔/圆角等修改操作仍深隔离；均匀缩放和非均匀变换不复用刚体校验结果。最终状态工程以 brep-instance 类型保存共用精确 BRep 资产与每个 import 的有限正交 location 矩阵；旧读取器因未知资产类型明确拒绝，不能忽略位置后误装。文件不包含参数配方或会话时间线，既有工程仍可读。
装配定位使用 measure 的精确 BRep bounds，不能使用保守/变换后的显示 bounds；boundsSource 标明来源。工具不推断支撑或自动移动悬浮零件。
长作业用 submit 短调用后 getJob/awaitJob 查同一 jobId。宿主超时不表示回滚，不换 key 重算。getBatchReceipt 缺少 documentInstanceId 返回 PARAM_SCHEMA_INVALID；传入旧实例才返回 INSTANCE_MISMATCH。执行预算从 Worker started 开始，排队有独立有限期限；心跳不延长硬期限。普通默认硬期限仍为180秒。失败先回执 not_committed，恢复独立记录在 getState().recovery，最多120秒，不循环重放候选。recoverKernel({context,stopRunning:true})立即停止 Worker并返回 stopped/recovery；recovered:false 表示恢复尚未完成，继续读取 recovery 和 kernelReady。失败时已提交快照仍可 files.save。

交互显示性能
getPerformanceState()只读当前工程实例/geometryRevision、独立perfSeq、有效性与原因、最多1200帧采样、前台/可见/交互标志、总/可见对象、内部实体/面/边、唯一模型显示三角形、多pass提交三角形、drawCalls和CPU提交P50/P95；GPU无来源为null。工具/LLM等待独立，不作GPU时间。
仅前台可见真实交互5秒且60样本后判负载；后台、空闲缓存、同步截图、初始化、resize/context-loss、几何和预览忙均不计入。500ms评估一次，不逐帧同步Agent。
initial-1是未校准参数，不是实测成绩。默认auto；对象150只观察、300建议、500提高建议优先级；P95>40ms且CPU提交P95>=12ms才降一档，30秒冷却，同修订继续慢先诊断而不反复remesh；P95<24ms累计30秒有效交互可恢复一档，升级间隔至少60秒，不超过preferredQuality。
configurePerformance({context,settings:{mode,preferredQuality,manualLock,allowAgentGrouping}})至少一项，设置仅本页会话。manualLock或manual禁止自动调档；setRenderQuality手动设置会更新preferred，自动降档不改preferred。所有调档只重网格，不重放造型历史、dirty或撤销，保留选择；失败保持原显示，版本过期不安装。截图排除采样，STEP/BREP用原精确形体，STL用独立导出网格，源网格保持原资产。
建议绑定工程实例和观测revision，最多32条，按实例+负载级别+结构阶段去重；同级增加实体不重复通知，拒绝在该阶段保留。acknowledgePerformanceAdvisory用当前context和advisoryId回执deferred/no-safe-candidates/declined/stale。allowAgentGrouping仅为候选授权标志，程序不执行组合；无Agent/公开版不发模型请求。已授权Agent只在当前批次结束后按语义结构、有效材质/显隐、后续加工需求选择安全候选，用新鲜context/IDs/幂等键调用group；检查映射、内部实体数、bounds、成员形体/体积/面积、外观/显隐与STEP读回，重查拓扑。失败仅在仍拥有最后编辑时回滚；无改善停止。禁止自动union/fuse。
开发单测不代表G5；真实2×2独立/compound×preferred/draft、同机每格至少3次交错、几何不变量与监测自身开销须另行冻结证据和实测。

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
recoverUnsaved: contextPolicy=revision
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
getPerformanceState: contextPolicy=none
configurePerformance: contextPolicy=identity
acknowledgePerformanceAdvisory: contextPolicy=identity
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
