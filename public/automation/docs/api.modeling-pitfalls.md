# api.modeling-pitfalls


## 坐标与默认放置
创建参数的坐标在该特征冻结的 placement 坐标系内解释。ellipsoid.centerMm 不是省略 placement 时仍保持不变的世界坐标。
省略 placement：冻结当前参考锚点；Agent 独立新增与已有模型在 XY 上重叠时，沿 X 放到已有包围框右侧，间隙 5 mm，实际步长取决于模型尺寸。参考锚点自身占用时还可能沿 Z 避让。不要预测下一次的 X/Z，也不要按固定步长抵消。
精确世界坐标创建示例：{id:'ball',method:'add',args:{op:'ellipsoid',refs:[],params:{radiiMm:[40,40,40],centerMm:[0,55,300]},placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}}}。
显式 placement 关闭独立新增的自动 XY 避让；已有历史保持冻结定位。用 run.bodyBounds 或 measure 精确确认位置。

## 变换、当前引用与批次
transform 是追加一个可编辑特征，消耗输入实体、产生新 bodyId；不是原地改 UUID。这与布尔/加工历史一致。不要改为稳定旧 UUID，也不要保存旧面边编号跨修订使用。
每一步结果在 batch.results[i]，由 id/stage 标识。当前 ID 用 results.find(x=>x.id==='move').result.createdBodyIds[0]，replacements 是 [{before,after}]。批内用 {$ref:'move.createdBodyIds.0'}；不要取创建步骤的旧 ID。
run 不是整批原子事务，atomic:false；前几步成功会保留，失败后只重规划尚未提交的部分。addMany 是独立的原子特征计划。
世界轴相对平移：params:{x:0,y:0,z:300}，不填 mode/delta/placement。
绝对包围盒中心：params:{positionMode:'absolute',x:0,y:55,z:300}，X/Y/Z 必须齐全，语义是缩放/旋转后包围盒中心。
空间平移：params:{mode:'translate',delta:[0,0,300]} 必须同时传 placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}；也可显式选择工作坐标系。delta 的方向由该坐标系决定。

## unknown 不是失败，不得盲目重发
传输超时可能发生在几何提交之后。UNKNOWN_OUTCOME / status:unknown 不能解释为未提交，协议不承诺“没收到确认就回滚”。
保留完整原请求、idempotencyKey、documentInstanceId、各步骤回执和 getJob 的 jobId。
只读查询：api.getBatchReceipt({idempotencyKey:original.idempotencyKey,documentInstanceId:original.context.documentInstanceId})。
found:true 时查看 receipt.status、receipt.results、progress 和当前 getState；found:false 可能仍在执行或回执已随页面重载丢失，不证明未提交。异步任务继续查原 getJob，不另起几何任务。
可选 page-client：异常中的 request 是原始批次，可 client.getBatchReceipt(error.request)；此查询不检查旧 revision、不执行写入。普通 client.run 会拒绝过期规划，不能拿它重放旧批次来查回执。
回执只在当前页面工程实例内有效；同一请求同一 key 取原回执，不同内容不能复用 key。transactionId/requestId 是关联标识，批次查回执使用 idempotencyKey。
成功后用返回的 requestContext 规划下一批。context 含 revision，写入 requestContext 含 expectedRevision，不可互换猜测。

## 内核故障与撤销
WASM 内存越界不能靠在损坏实例上继续 try/catch 恢复。重建故障时丢弃 Worker，从最后已提交工程重建一次，不重试坏候选；恢复会递增 revision，必须重新读上下文。
失败候选在 rebuild 成功和历史容量检查之后才成为当前工程；崩核本身不能证明坏特征已写入持久化。恢复失败仍可 files.save 保存最后提交快照，再 recoverKernel；保存与内核无关。
撤销动作为 execute action:'history.undo'，不是 'feature.undo'。一次撤销后核对实体/历史，禁止连续盲退。边界测试只用可丢弃工程，不在用户正在编辑的工程试崩溃半径。
blendRadiusMm 必须正值；可行半径取决于真实拓扑，不能凭包围盒比例承诺安全上限。失败报告不等于具备内存快照回滚能力。

## 扫掠与 SubD
curveSweep 的截面站模式是 pathType:'sections'，数据字段也是 sections；stations 是自然语言同义词，不是 pathType 枚举。不同工具 guidedLoft 的 stations 字段不要混用。
sections[].normal 与 widthDirection 必须接近垂直，容差 5°；normal 有非零 Y 不代表必失败，判断是归一化点积。需要修正方向时令 n=normal/|normal|，w'=normalize(w-dot(w,n)*n)，核实意图后显式提交；平行时投影为零不能自动猜方向。
SubD 笔刷作用于控制笼顶点，不是细分后的曲面采样点。push/inflate strength 为带符号毫米位移上限，乘距离衰减；smooth strength 为 [0,1] 无量纲插值比例。
每笔的命中控制点数和最大实际位移见 bodies[].subdApproximation.brushReport；零命中仍可创建有效未变形实体，但回执 warnings 包含 SUBD_BRUSH_NO_HIT，不能宣称雕刻生效。
面预算在细分前检查，包含额外一层收敛对照：cage.faces.length * 4 ** (sampleDepth + 1) <= 200000。24面、depth6为393216，必须降低深度，不是196608。
控制笼须封闭四边面且绕序一致；冲突错误返回两个从0开始的面索引和共边。修改后重新核验整个笼子，不自动更改用户拓扑。

## 显示、材质、检查与导出
setView({context,camera:{position:[x,y,z],target:[x,y,z]}}) 支持真实相机定位，成功 status:'read' 表示视图状态操作，不是几何提交。读回 view.camera/display.camera。direction、projection、fit 同传时也会调整相机；要精确姿态只给 camera。绝对相机和预设清除此前拖拽惯性。
front 从 -Y 看向 +Y，back 从 +Y 看向 -Y；top 为 +Z，right 为 +X。direction:'iso' 重设朝向并适配模型；不用累积鼠标拖拽拼固定视角。
旋转折线截面产生分段曲面；增加折线点数不等于升级为精确光滑母线。没有原始配方不能仅凭色带判定法线错误，强行跨锐边平均可能掩盖实际折角。
finish:'design' 配合 color:'#RRGGBB' 使用原色设计材质；现有金属 finish 包含哑光金属。没有独立 fabric 物理材质，不能把金属列表当成全部颜色能力。
getState include 分组仅 summary/features/bodies/bodiesLite/selection/capabilities/references。外观小回读用 getState({fields:['appearance','colors','renderFinish']})，不会返回全量特征；view 同理可用 fields:['view']。
bodies[].displayReport.watertight/boundaryEdges 是显示三角网格在焊接容差下的检测结果，不是 BRep 开边数量；有效 BRep 与三角网格水密性是不同证据。inspectPrintability 则检查悬垂/摆放，不提供精确实体闭合证明。诊断须保留精确输入/配方和对应检查结果，不从面数或不同输入的比较推导 union 算法失效。sewFaces 不自动补洞，不能凭空造材料；未提供原件的病例保留待复现。
导出是用户显式动作，生成字节/资源不等于下载落盘。普通建模不附带导出，Agent 不用模糊按钮文字猜 STP；用 files.export 的明确格式契约。额外确认不是所有导出的必要步骤。


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
