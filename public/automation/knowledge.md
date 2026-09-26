# WebCAD AI 完整知识库

API 1.9.0 · sha256:39d9335d778f9da3c1c95f19ed0b1baa1a88c8d8334819d816eabf7cf8772035

这是一份构建时的完整快照。调用前读取页面 info() 对比版本和目录哈希；变化时更新相关工具卡。尺寸单位 mm。

## api.connection

AI 应通过宿主已授权的页面脚本通道在后台调用 window.webcad.api。不要为查工具或执行建模打开 JSON 调试面板、填输入框或点击执行按钮。没有可用脚本通道时，明确报告通道不可用；不要自动退回界面操作。

先确认宿主实际提供的能力。只读 DOM evaluate 不能据此推断公开 API 不可调用，也不能用于绕过宿主限制。
对于当前提供 cua_repl 的 Codex Chrome/IAB 开发环境：按该工具当前文档绑定用户指定标签页（不要刷新已有工程），检查 tab.capabilities.list()；若列出 cdp，读取 (await tab.capabilities.get('cdp')).documentation()。只有该通道确实提供并允许当前任务时，才用其 send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}) 调用页面公开 API。检查 exceptionDetails 与 result，不把命令已发送当作执行成功。其他宿主使用其明确提供的等价脚本接口，不猜测 CDP 方法或自行安装桥接服务。

首次表达式可一次返回状态、候选完整卡和批次说明：
JSON.stringify((()=>{const api=window.webcad.api;return {connection:api.connect({queries:['本次需要的能力'],limit:2,includeContracts:true}),run:api.readDocs({docId:'api.run'})};})())

connect 的 queries 是最多4个短字符串；searchTools 使用单个 query 字符串，两者不能混用。includeContracts=true 时完整卡已在 connection.contracts.items[].card，不要重复 getTool。需要补卡时用 getTools({ids:[实际ID]}) 一次取回；已知 ID 不必搜索。查询拓扑等补充说明可在同次表达式中按 docId 读取。不要为了发现工具构造 api.run 请求：这些只读方法直接调用，无需上下文或幂等键。

拿到契约后使用 api.run({context:connection.requestContext,idempotencyKey:唯一键,steps})。CDP expression 中异步调用应包成 (async()=>JSON.stringify(await window.webcad.api.run(请求对象)))()，配合 awaitPromise:true；不要直接使用顶层 await。修改前确认状态仍新鲜，依赖前步结果用 $ref；按需读取回执，不裁掉错误或必要约束。核对 committed 与当前渲染 revision。只执行用户要求的工作；保存/导出并非普通建模的自动收尾步骤。

先核对页面是否有 api.connect；不存在说明打开的是旧版，不能套用新版文档或偷偷刷新未保存工程。新版公开面只有 window.webcad.api，不沿用旧 action/execute/ready/viewport。握手返回 canExecute/blockers；ready 仅指内核初始化完成，忙碌或预览中仍不能执行。已知能力 ID 可用 connect({toolIds:['advancedLoft','transform'],includeContracts:true})，一次拿到实时上下文和完整卡。模板按名称检索，读 template.* 的单模板卡；按卡里的 minimalExample 用 op:quickModel 执行，不把 template.* 当几何操作 ID。

静态文档可直接按页面 base URL 读取 automation/quickstart.md、automation/tools/<id>.json、automation/docs/<docId>.md。HTTP 读取 JSON 必须按 UTF-8 解码，避免中文乱码。manifest/index 为程序索引输入，不要将全目录或全库打印进模型上下文。缓存只包含静态契约，不能代替实时工程状态。

## api.discovery

首次通过获授权页面脚本通道调用 api.connect({queries:[简短能力关键词]})。无需先遍历源文件或下载全库。connect 同时给出精简的实时 requestContext、ready/busy/preview、最多20个当前实体引用、目录/文档哈希和搜索结果；内核未就绪仍可查契约。queries 最多4项，每项最多500字符，limit 为每项1..10，默认5。结果是相关候选，不自动解释自然语言、不生成操作计划。category 可用于单独 searchTools 过滤；query 为空时分页列出全部工具。
接着 getTools({ids:[选中的工具ID],expectedCatalogHash:connect返回的catalogHash}) 一次读完整契约，最多20项。includeContracts:true 可在 connect 中直接取得前20个去重命中的契约，contractIdsOmitted 明示未附带的其余ID。已完整缓存的卡可传 knownHashes:{工具ID:docsHash}；匹配只返回 not_modified，新增或变化返回 read.card，未知ID逐项返回 error，不丢失其他卡。不可仅见过摘要哈希就声称持有完整卡。getTools 不省略约束、不截断 schema；getTool 保持兼容。
connect 可传 knownCatalogHash/knownDocsHash 检查整体漂移；changed 只表示静态说明变化，实时状态始终重新读取。manifest.json 为每张卡/每篇文档提供 docsHash，可比较增删变化；已删除ID必须从宿主缓存移除。readDocs({docId,knownHash}) 可复用完整文档缓存；knownHash 与 cursor 不可同时使用，分页文档须取完才能缓存为完整文档。缓存版本不能代替当前页面状态。
可选离线库：一次下载同版本 automation/index.json 与 automation/tool-library.mjs；在具备持久存储能力的宿主保存。import {createToolLibrary} from './tool-library.mjs'; const lib=createToolLibrary(snapshot); lib.search(query) 返回摘要，lib.get(id) 取完整卡，lib.readDoc(id) 取一篇说明；lib.isCurrent(api.connect()) 对比 catalogHash/docsHash，漂移时刷新快照。离线库与页面使用相同搜索实现，所有运行可用性为 unknown；始终从目标页面取得新鲜 requestContext/实体/拓扑。不要把完整快照打印进模型上下文。没有磁盘能力的侧栏直接调用页面搜索即可。

## api.display-preferences

设置主菜单分风格、渲染设置、LOGO转化、精度、吸附、语言和参数。风格预设支持原绿色 #0c827d 和灰度 #666666；LOGO配置经 getLogoConverter/setLogoConverter。dimensionPrecisionMm 默认0.01 mm、范围0.000001–10；anglePrecisionDeg 默认0.1°、范围0.000001–90。新输入和移动旋转按步长四舍五入，既有与导入几何不重算。themeColor 为 #RRGGBB，默认 #2563eb；snapThresholdMm 为 0–10 mm，默认0.2（20丝），0关闭拖动吸附。吸附后下一次拖动跳过吸附。透视+边线显示曲面三角网格，只是显示网格，不是精确等参线。setDisplayPreferences({context,values})：defaultColor/background 为 #RRGGBB，defaultFinish 为材质键；environmentMode 为 studio（均匀工作室，默认）或 hdr（原 HDR）。exposure 0.1–3；environmentIntensity 0–3；environmentRotation/lightAzimuth -180–180 度（绕世界Z）；lightElevation -89–89 度；roughnessOffset 0–0.6（只影响金属）；keyIntensity/fillIntensity/ambientIntensity 0–6。字段均可部分更新。getState().displayPreferences 读当前值。cookie 保存一年，同源浏览器自动读取，persisted=false 表示未持久化。全局设置不属于工程撤销历史；单体显式颜色和材质优先，工程 document.appearance finish:null 跟随全局，否则保持工程覆盖。UI 可选标准、柔和、明暗对比预设或恢复默认。环境反射方向与直接光源方向是不同设置；金属凹凸不等于实体几何缺陷。

## api.dwg-spline-twin-window

traceTwinWindow({context,outerLeft,outerRight,innerLeft,innerRight,barTopY,barBottomY,simplifyToleranceMm?}) 是只读闭合轮廓计算工具。四条曲线均为从上到下的有限 XY 采样点数组，每条3–2000点，左右对应端点 Y 差≤0.01 mm。外轮廓由左右外曲线及上下直线闭合；内轮廓在 barTopY/barBottomY 横向切分为上下两个孔，输出已按外包围盒中心归零的 vectorProfile regions、原始 bounds、size、简化前后点数与相对采样折线的最大观测偏差。simplifyToleranceMm 可选，范围0..0.2 mm，默认0表示不简化；保留端点和X极值点。工具不读取 DWG，不补造样条，不证明采样精度；源 DXF 样条必须由可靠解析器先按显式容差采样，且应核对原图横条边界。调用 api.run({steps:[{id:"shape",method:"add",args:{op:"vectorProfile",refs:[],params:{regions:result.regions,output:"solid",height:3.5}}}]}) 建实体。PG4307 源样条经 ezdxf 0.01 mm 参数采样得到24.006×21 mm、983.047 mm³的源线近似实体；再以简化公差0.01 mm处理628个侧曲线点，可降到162点，实际最大采样点偏差约0.00963 mm，体积约983.073648 mm³；样条采样及端点/交叉验证是独立前提。vectorProfile.params.source 应记录 DWG 哈希、采样距离和选用的实体 handle；本机采样脚本为 text-to-cad/agent/tools/cad-learning/export_spline_samples.py，完整调用见 docs/PAGE-API.zh-CN.md。非法或过大的输入返回 failed，不修改工程。

## api.editor

所有编辑动作均使用 execute({context,idempotencyKey,action,args}) 或 run 的 execute 步骤。先 getTool({id:动作名称})，不要猜字段。document.rename 修改工程名称；feature.rename 可改导入件名称；body.visibility 指定 bodyIds/visible；body.appearance 设置 color/finish；document.appearance 设置工程默认 finish；body.explode 拆多实体组合。颜色 #RRGGBB，null 重置；finish:null 跟随工程，design 显示原色，金属材质暂时盖住原色但保留其数值。getState().colors/appearance/renderFinish/hidden 可读回。外观/显隐/改名不重算几何，保存到 .webcad 且支持撤销。preview.start 的普通特征 args 同 feature.add；文件来源用 fileImport:{resourceId,placement}。回执返回 previewId/generation，更新用 preview.update 的 expectedGeneration，提交或取消也必须带当前预览身份；旧 UI 预览继续接受空 args。草稿不改工程 revision。

## api.execute

execute(request) 使用当前 CommandService 的结构化请求：{context:{sessionId,documentId,documentInstanceId,expectedRevision},idempotencyKey,action,args}。feature.add 的 args 使用真实工具卡的 op、opVersion、schemaHash、params、refs；feature.edit 使用 featureId、opVersion、schemaHash、params 补丁。严格参数契约列表以 info().capabilities.migratedOperations 和当前工具卡为准。其他操作的卡片是 advisory，不得把它当成严格 v2 可执行保证。
同一页面修改由原命令队列串行处理。幂等回执只在当前 documentInstanceId 的有限内存范围内有效，不跨页面重载。成功提交与后续显示或文件写入失败应分别报告。

## api.file-errors

页面建模、测量、视图与截图方法的失败通常返回 {status:"failed",commitState:"not_committed",error:{code,message},context}；execute 和 queryGeometry 使用 CommandService 的更完整结果。files 方法抛出带 code 的 Error，调用方应捕获，不能把异常解释为已保存。文件状态分别为 registered、generated、download_initiated、write_verified；generated 不证明磁盘写入。输入资源、导入和输出每项最多 20 MiB，最多 32 个资源、合计 64 MiB、30 分钟有效。自包含 .webcad 保存可能含 base64 导入源并超过上限；页面在限制前预留约 4 KiB 空间。读取 files.capabilities() 获得当前实际上限。

## api.logo

统一 LOGO：工具栏“加工→LOGO”与页面 execute({action:"feature.add",args:{op:"logo",...}}) 共用建模内核。先 getState() 得到当前 bodyId/revision，queryGeometry({context,bodyId,kind:"face",requireUnique:false}) 找精确 BRep 面与 faceId；放置点 point 必须为该面的三维 XYZ。新操作 params 使用 {placementVersion:2,faceId,point:[x,y,z],mode:"engrave"|"emboss",depth:显式正数,draftAngle:0,scale:1,angle:0,offsetX:0,offsetY:0,mirrorX:false,regions:[{outer:[[x,y],...],holes:[]}],source:{kind:"reviewed-contours",reviewed:true,original:{...}}}，refs:[bodyId]。source.reviewed=true 是调用者已复核轮廓来源、尺寸和孔洞的明确声明；新流程不猜深度。平面可凹刻/凸字/拔模，非平面只允许 mode=engrave 且 draftAngle=0，仍受原曲面边界、接缝、薄壁校验。创建时记录源 BRep 哈希作快照审计；历史重建以稳定的面几何签名、类型、面积与中心校验，不能把跨内核不稳定的原始序列化字节误作历史匹配依据。旧 logo 缺少 placementVersion 沿用原平面语义，旧 curvedLogo 只供历史兼容。轮廓单位 mm、局部 X 为全局 X 投影到目标面切平面（X 法向附近改 Y）、局部 Y=法向×局部 X。浏览器 UI 本地读取 .logo.json/受限 SVG/粘贴 SVG 或闭合 d；外部 AI 可直接提供经复核的 regions，不能把 SVG 字符串当 regions。SVG 曲线离散误差源尺度约 0.005 mm，等比放大后误差也按比例增加。静态版没有位图/复杂矢量转换服务。

## api.named-parameters

读取 getState().parameters 和 parameterValues。execute({context,idempotencyKey,action:"document.parameters",args:{parameters:{length:{value:50,unit:"mm"},edgeMargin:{value:5,unit:"mm"}},bindings:{"<实际板特征ID>":{"width":"length"},"<实际孔特征ID>":{"points.1.0":"length-edgeMargin","points.3.0":"length-edgeMargin"}}}}) 在一个撤销步骤内计算受影响特征并重建。后续只传 parameters:{length:{value:63,unit:"mm"}} 更新数值，原绑定保持。
参数定义按名称合并；绑定按特征 ID 和数值路径合并。单位仅 mm/scalar，表达式支持有界四则运算和已注册函数，不执行 JS。未定义参数、循环、单位不符、越界或不安全的后续拓扑索引会拒绝并保留原模型。已绑定字段的直接数值编辑返回 PARAMETER_BOUND；请通过参数表或 document.parameters 修改。

## api.printability

从 text-to-cad 的 dfam-check 迁移的浏览器几何事实检查。inspectPrintability({context,bodyId,angleLimitDeg?:45}) 接受当前实体 ID，角度须大于 0 小于 90 度。读取当前显示网格逐三角面计算表面积、六种轴向摆放的悬垂面积、面积占比、成型高度与支撑柱体粗估；距平台 0.1 mm 内的面视为已支撑。包围盒、体积与 solidCount 取内核 B-Rep 元数据。结果不改变工程 revision，不给合格判定。网格精度、材料、工艺、壁厚、孔径、粉末排出和切片支撑均需另行核验。

## api.profile-fitting

fitProfile({context,kind:"circle"|"line",plane?:"XY"|"XZ"|"YZ",points:[[u,v],...],maxResidualMm?}) 基于 3–1000 个按截面坐标给出的有限采样点，只计算圆或直线候选，不生成实体也不修改 revision。circle 返回圆心、半径、按输入顺序展开的角覆盖；line 返回中心点、方向和投影长度；两者都返回最大与 RMS 残差。maxResidualMm 只作用户输入阈值的数值比较，不是默认产品公差。源自 text-to-cad 的截面圆候选算法思想；结果是点样本的近似，不能替代原图尺寸、完整拓扑或内核精确实体。拟合曲面建模另有 fittedSurface 操作，需 3–12×3–12 对应点阵。

## api.query-geometry

queryGeometry({context,bodyId,kind:"face"|"edge",filter:{},requireUnique:false,limit:20}) 返回精确 BRep 候选、总数、分页及快照绑定令牌。face.surfaceType 筛选支持 plane/cylinder/cone/sphere/torus/bspline/bezier/revolution/extrusion/offset/other；edge.curveType 支持 line/circle/ellipse/hyperbola/parabola/bspline/bezier/offset/other，也兼容内核原始小写类型（cylindre、bspline_surface、bspline_curve 等）。返回 geomType/surfaceType/curveType 保留实际内核编码。plane 另包含已证实共面的 BSpline（planar=true）。normal 和 atExtreme 仍仅适用于可识别平面；非平面不能伪造统一法向。BSpline 返回 spline 次数、控制点数量与节点数量，尚不返回完整控制网或 G0/G1/G2 认证。圆边返回 radiusMm/center/axis；radiusRangeMm 不适用于椭圆。拓扑编号和 selectionToken 只属于返回的工程实例与 revision。改模型后重新查询。

## api.references

世界原点不可修改；工作基准是工程元数据，getState().referenceSystem.workFrame 返回 origin/quaternion/locked/frameVersion。reference.setWorkFrame、resetWorkFrame、setLocked 与保存/激活/改名/删除具名基准均经 execute 的 revision 与幂等检查，可撤销且不移动旧实体。queryReferences({context,kind:"point"|"axis"|"frame",bodyIds,filter:{types?,near?},limit?,offset?,requireUnique?}) 返回精确 B-Rep 或明确派生候选、referenceId、几何指纹、歧义和分页；edge-nearest/trimmed-face-point 必须给 near:{point:[x,y,z],radiusMm}。圆心不冒充面内点；凹面/有孔面面积重心标为不保证落在修剪区域。referenceId 在工程 revision、实例或几何指纹变化后失效。reference.setBodyAnchor 需要当前对象的精确点 referenceId、bodyId、name、单位 quaternion；保存版本和指纹。已知刚体 transform/copy 继承锚点，改形无法证明映射时标记 stale，named 锚点定位拒绝旧来源。placement:{version:1,frame:{kind:"world"|"snapshot"|"work"|"saved",...},sourceAnchor:{kind:"model-origin"|"bottom-center"|"bounds-center"|"named"|"point",anchorId?,point?}}；work/saved 要对应版本，历史保存 frameSnapshot。各工具卡 placementPolicy 声明定位是否适用。transform/copy 新 mode 有 translate、toPoint、rotate、scale、align；align 必须给源/目标点、轴、面内方向、同向/反向、间隙和扭转角，缺失或退化拒绝。旧世界坐标 API 语义保留。新版工程 version:2，仍读取 version:1。

## api.reliability

所有带 context 的页面入口接受 getState().context（revision）或 connect().requestContext（expectedRevision）。createRequestContext(context?) 可显式转换；两字段同时出现且不一致时报错，绝不自动采用新版本。大文件使用 files.register/read，禁止塞进批次或反复回传模型上下文。files.save 生成资源，files.download 只发起下载；files.write 返回 verified 才证明句柄文件写入校验。单资源仍限 20 MiB，总资源 64 MiB。统一异常入口 await api.invoke({method,args}) 支持当前页面方法及 files.*；原同步发现和 files 方法保持兼容，可抛带 code 的异常。后台计算回执：submit({jobId,method,args}) 立即返回 queued，轮询 getJob({jobId})，完全相同 jobId/参数只取原任务；不得换 key 重复提交超时任务。状态 queued/running/committed/completed/partial/failed/unknown/cancelled，result 保留原回执与 context。进度 progress:null 表示内核未提供可测百分比。cancelJob 只能取消尚未运行任务，运行中的内核不承诺中断。仅当前页面内存中保留最多100任务，刷新后先检查模型，不自动重放；无额外服务。

## api.run

AI 应通过宿主已授权的页面脚本通道在后台调用 window.webcad.api。不要为查工具或执行建模打开 JSON 调试面板、填输入框或点击执行按钮。没有可用脚本通道时，明确报告通道不可用；不要自动退回界面操作。 调用 await window.webcad.api.run(request)。一次提交最多 20 步。禁止 JS/eval、路径读写和隐式选择。
请求 {context:{sessionId,documentId,documentInstanceId,expectedRevision},idempotencyKey:"唯一键",steps:[{id:"ring",method:"add",args:{op:"torus",params:{majorRadius:15,minorRadius:2.5}}},{id:"size",method:"measure",args:{bodyId:{"$ref":"ring.createdBodyIds.0"}}}]}。context 必须来自本页 getState()；revision 转为 expectedRevision。线径5、内径25：minorRadius=2.5，majorRadius=15，外径35。
add 是 feature.add 的适配器，自动读取当前工具版本/schemaHash，接受 op/params/refs/name；几何参数、来源与实体引用仍须先读工具卡。advisory 操作并未因此升级为严格契约。refs 可用已有 body ID 或先前成功回执的 {$ref:"stepId.createdBodyIds"}。
可用方法：add、execute、info、getState、searchTools、getTool、readDocs、queryGeometry、queryReferences、resolvePlacement、measure、measureRelation、inspectProfile、prepareProfileEdit、projectProfile、inspectFit、inspectThickness、inspectDraft、fitProfile、inspectPrintability、setView、setRenderQuality、setDisplayPreferences、redraw、files.capabilities/register/import/save/export/release。execute 接受 action/args；context 和每步幂等键由批次提供。files.register 使用 {name,base64,mime?}；输入大小受批次 3 MiB 限制。LOGO 轮廓可直接放入建模 params.regions，无需点文件选择器；PDF/SVG 字节不是闭合轮廓。
步骤可省略 args。id 使用字母开头的 1..40 位字母数字下划线连字符；批次 key 最多80字符，当前文档实例最多保留100份回执。失败立即停止，completed/partial/failed/unknown 必须区分，atomic=false 表示先前成功步骤保留，可用 history.undo 逐步撤销。重新提交完全相同 key/请求返回原回执而不重复建模；更改请求需新 key；幂等仅本页面文档实例有效，重载后先读状态。
files.save/export 返回 generated 资源，未证明磁盘保存；脚本客户端再 files.read/download/write，面板使用“下载”按钮只证明发起下载。新建/打开工程和截图使用专用页面 API，不属于批次。几何修改由旧有命令队列执行，其他 UI/客户端插入修改后批次停止，不自动接受新 revision。

## api.smooth-transition

autoRound 是严格 v2 整件圆边：params:{radius:0.1}，refs:[bodyId]，所有尖锐边统一处理，失败不部分提交。smoothTransition 是严格 v2 面组过渡：params:{radius:0.1,faceIds:[当前相邻面序号,...]}，refs:[bodyId]。选至少两个相邻面，仅对其公共尖缝联动倒圆。queryGeometry 边含 startPoint/endPoint/midpoint/bounds/adjacentFaceIds/normalAngleDeg/sharp/degenerate，面含 edgeIds；按位置和邻接找交线。getState().bodies[].transitionReport 含 processedEdgeIds/processedSeams/remainingSharpEdges/remainingSharpEdgeCount。过大半径、自交、未消除目标尖缝或抽样发现非边界新尖缝时拒绝，原模型保留。局部过渡与未选面的结束边界可能锐利，boundarySharpEdges 单独报告。检查法向为边上20/50/80%三点与1度阈值，不是曲率连续证明或全部顶点认证。未选原有锐边（如文字边）保留，不能宣称整件无利角。UI 加工→曲面处理→整件圆边/平滑过渡，选实体或 Ctrl 多选面，预览再确认。完成后用 feature.edit 修改原特征 params.radius，会从源几何重建并重算后续步骤；不是在结果上再倒一次圆角。

## api.text-command

executeText({context,idempotencyKey,text,dryRun?}) 提供纯文本命令入口，不执行任意 JS 或 shell。每行一条，最多 20 行、总长 16384 字符。语法：add <操作ID> key=value ...；measure <bodyId|$last>。示例：add box width=30 depth=20 height=2.5 name="牌子"，下一行 measure $last。复杂参数可用 JSON 值，例如 points=[[[0,0,0],[1,0,0],[2,0,0]],[[0,1,0],[1,1,0],[2,1,0]],[[0,2,0],[1,2,0],[2,2,0]]]。refs 可用 JSON 数组或 $last。dryRun:true 仅返回解析后的步骤；正常执行交给同一 api.run/CommandService，返回逐步回执，非原子，已提交步骤保留。每次执行需新 idempotencyKey，重试同一请求可复用原 key。

## api.ui-coverage

界面动作与 AI 等价接口（手势以坐标和显式参数代替）：
{
  "reference.setWorkFrame": {
    "tools": [
      "reference.setWorkFrame"
    ],
    "method": "execute",
    "usage": "完整 context、idempotencyKey；args 指定 origin 和单位 quaternion。"
  },
  "reference.resetWorkFrame": {
    "tools": [
      "reference.resetWorkFrame"
    ],
    "method": "execute",
    "usage": "args.scope 为 position、orientation 或 all。"
  },
  "reference.setLocked": {
    "tools": [
      "reference.setLocked"
    ],
    "method": "execute",
    "usage": "args.locked 为布尔值。"
  },
  "anchorDrag": {
    "tools": [
      "reference.setWorkFrame"
    ],
    "method": "execute",
    "usage": "UI 中约束拖动参考锚点，松手仅更新任务草稿；用户点击应用后提交一次 reference.setWorkFrame。"
  },
  "anchorVisibility": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "参考锚点呼吸球显隐为本地 UI 偏好，不改变工程、固定原始坐标或几何 revision。"
  },
  "temporaryDisplay": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "temporaryDisplay 为 selectedOnly/transparentOthers/normal；只改临时显隐，不改变工程持久隐藏列表。"
  },
  "occlusionCandidates": {
    "tools": [
      "queryGeometry",
      "setView"
    ],
    "method": "queryGeometry",
    "usage": "人工 Alt+单击读取当前视线候选；AI 按精确几何 queryGeometry 取得明确 body/face/edge 引用，不依赖最前方网格。"
  },
  "commandSearch": {
    "tools": [
      "searchTools"
    ],
    "method": "searchTools",
    "usage": "全局命令搜索使用现有工具名称与 ID；AI 可直接 searchTools，不需打开对话框。"
  },
  "reference.snapNearest": {
    "tools": [
      "queryGeometry",
      "reference.setWorkFrame"
    ],
    "method": "execute",
    "usage": "查询选定 CAD 边的精确端点、弧长中点与解析圆心，明确选中一个候选后提交工作基准。"
  },
  "reference.alignSelectedFace": {
    "tools": [
      "queryGeometry",
      "reference.setWorkFrame"
    ],
    "method": "execute",
    "usage": "选定当前精确平面面片，读取法向；以当前工作 X 作为面内方向，确认后更新工作基准方向。"
  },
  "renderQuality": {
    "tools": [
      "setRenderQuality"
    ],
    "method": "setRenderQuality",
    "usage": "显式 quality=draft/standard/fine/ultra；getState().renderQuality 读公差、三角面数，不修改 BRep。"
  },
  "downloadResource": {
    "tools": [
      "files.download"
    ],
    "method": "files.download",
    "usage": "使用生成回执的 resourceId 重试下载；不重新生成或清除 dirty。"
  },
  "advancedLoft": {
    "tools": [
      "advancedLoft"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "arcProfile": {
    "tools": [
      "arcProfile"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "autoRound": {
    "tools": [
      "autoRound"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "box": {
    "tools": [
      "box"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "chamfer": {
    "tools": [
      "chamfer"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "circularPattern": {
    "tools": [
      "circularPattern"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "cone": {
    "tools": [
      "cone"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "copy": {
    "tools": [
      "copy"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "curveSweep": {
    "tools": [
      "curveSweep"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "curvedLogo": {
    "tools": [
      "curvedLogo"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "cut": {
    "tools": [
      "cut"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "cylinder": {
    "tools": [
      "cylinder"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "draftFaces": {
    "tools": [
      "draftFaces"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "extractFaces": {
    "tools": [
      "extractFaces"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "extractShell": {
    "tools": [
      "extractShell"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "extractSolid": {
    "tools": [
      "extractSolid"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "extrude": {
    "tools": [
      "extrude"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "faceBoundary": {
    "tools": [
      "faceBoundary"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "faceExtrude": {
    "tools": [
      "faceExtrude"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "faceHole": {
    "tools": [
      "faceHole"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "fillet": {
    "tools": [
      "fillet"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "fittedSurface": {
    "tools": [
      "fittedSurface"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "group": {
    "tools": [
      "group"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "hole": {
    "tools": [
      "hole"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "holeWizard": {
    "tools": [
      "holeWizard"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "import": {
    "tools": [
      "files.import"
    ],
    "method": "files.import",
    "usage": "先 files.register 登记真实字节；不模拟文件选择器。"
  },
  "intersect": {
    "tools": [
      "intersect"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "linearPattern": {
    "tools": [
      "linearPattern"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "loft": {
    "tools": [
      "loft"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "logo": {
    "tools": [
      "logo"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "mirror": {
    "tools": [
      "mirror"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "multiBoss": {
    "tools": [
      "multiBoss"
    ],
    "method": "execute",
    "usage": "getTool({id:\"multiBoss\"}) 读取 strict v2 卡；feature.add 或 run add 传 radius/height/axis/direction/points 与真实 refs；feature.edit 修改历史凸台。"
  },
  "multiHole": {
    "tools": [
      "multiHole"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "multiPocket": {
    "tools": [
      "multiPocket"
    ],
    "method": "execute",
    "usage": "getTool({id:\"multiPocket\"}) 读取 strict v2 卡；feature.add 或 run add 传 depth/axis/direction/pockets、真实 refs；feature.edit 修改历史凹槽列表。"
  },
  "planeSection": {
    "tools": [
      "planeSection"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "profileExtrude": {
    "tools": [
      "profileExtrude"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "profileOffset": {
    "tools": [
      "profileOffset"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "profileRepair": {
    "tools": [
      "profileRepair"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "quickModel": {
    "tools": [
      "quickModel"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "referenceExtrude": {
    "tools": [
      "referenceExtrude"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "referenceLoft": {
    "tools": [
      "referenceLoft"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "remove": {
    "tools": [
      "feature.remove"
    ],
    "method": "execute",
    "usage": "args:{bodyIds}；删除当前实体。"
  },
  "revolve": {
    "tools": [
      "revolve"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "sewFaces": {
    "tools": [
      "sewFaces"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "shell": {
    "tools": [
      "shell"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "sketchProfile": {
    "tools": [
      "sketchProfile"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "slot": {
    "tools": [
      "slot"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "smoothTransition": {
    "tools": [
      "smoothTransition"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "sphere": {
    "tools": [
      "sphere"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "split": {
    "tools": [
      "split"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "surfaceTrim": {
    "tools": [
      "surfaceTrim"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "sweep": {
    "tools": [
      "sweep"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "thickenFace": {
    "tools": [
      "thickenFace"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "torus": {
    "tools": [
      "torus"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "transform": {
    "tools": [
      "transform"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "union": {
    "tools": [
      "union"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "vectorProfile": {
    "tools": [
      "vectorProfile"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "precisionSettings": {
    "tools": [
      "setDisplayPreferences"
    ],
    "method": "setDisplayPreferences",
    "usage": "全局 themeColor 与 snapThresholdMm 在当前浏览器持久化。"
  },
  "themeSettings": {
    "tools": [
      "setDisplayPreferences"
    ],
    "method": "setDisplayPreferences",
    "usage": "全局 themeColor 与 snapThresholdMm 在当前浏览器持久化。"
  },
  "snapSettings": {
    "tools": [
      "setDisplayPreferences"
    ],
    "method": "setDisplayPreferences",
    "usage": "全局 themeColor 与 snapThresholdMm 在当前浏览器持久化。"
  },
  "languageSettings": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "language:zh/en。"
  },
  "agentGuide": {
    "tools": [
      "connect",
      "getTools",
      "readDocs"
    ],
    "method": "connect",
    "usage": "connect({queries,includeContracts:true}) 按任务快速加载；knownHashes 缓存工具卡，不缓存实体身份。"
  },
  "logoConverterSettings": {
    "tools": [
      "getLogoConverter",
      "setLogoConverter"
    ],
    "method": "setLogoConverter",
    "usage": "context、url、key；getLogoConverter 读回配置状态。"
  },
  "displayPreferences": {
    "tools": [
      "setDisplayPreferences"
    ],
    "method": "setDisplayPreferences",
    "usage": "渲染设置使用 setDisplayPreferences；LOGO 转化为独立入口。"
  },
  "panels": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "panels:{left:boolean,right:boolean}；getState().view.panels 读状态。"
  },
  "moveTool": {
    "tools": [
      "transform"
    ],
    "method": "execute"
  },
  "rotateTool": {
    "tools": [
      "transform"
    ],
    "method": "execute"
  },
  "copySelection": {
    "tools": [
      "copySelection"
    ],
    "method": "copySelection",
    "usage": "context、bodyIds，读 getState().view.clipboard。"
  },
  "pasteSelection": {
    "tools": [
      "pasteSelection"
    ],
    "method": "pasteSelection",
    "usage": "context、idempotencyKey；整体底面中心放在锚点。"
  },
  "importAtFrame": {
    "tools": [
      "files.register",
      "files.import"
    ],
    "method": "files.import",
    "usage": "用户选定真实 STEP/BREP 文件后登记字节；显式提交当前工作基准版本、来源包围盒中心和幂等键。"
  },
  "new": {
    "tools": [
      "files.new"
    ],
    "method": "files.new"
  },
  "open": {
    "tools": [
      "files.open",
      "files.import"
    ],
    "method": "files.open"
  },
  "save": {
    "tools": [
      "files.save",
      "files.download",
      "files.write"
    ],
    "method": "files.save"
  },
  "export": {
    "tools": [
      "files.export"
    ],
    "method": "files.export"
  },
  "rename": {
    "tools": [
      "document.rename"
    ],
    "method": "execute"
  },
  "editFeature": {
    "tools": [
      "feature.edit",
      "feature.rename"
    ],
    "method": "execute"
  },
  "visibility": {
    "tools": [
      "body.visibility"
    ],
    "method": "execute"
  },
  "explode": {
    "tools": [
      "body.explode"
    ],
    "method": "execute"
  },
  "perPartMetal": {
    "tools": [
      "body.appearance"
    ],
    "method": "execute"
  },
  "bodyColor": {
    "tools": [
      "body.appearance"
    ],
    "method": "execute"
  },
  "metalFinish": {
    "tools": [
      "document.appearance"
    ],
    "method": "execute"
  },
  "parameters": {
    "tools": [
      "document.parameters"
    ],
    "method": "execute"
  },
  "undo": {
    "tools": [
      "history.undo"
    ],
    "method": "execute"
  },
  "redo": {
    "tools": [
      "history.redo"
    ],
    "method": "execute"
  },
  "preview": {
    "tools": [
      "preview.start",
      "convertLogoPdf"
    ],
    "method": "execute",
    "usage": "PDF 字节可用 convertLogoPdf 取得待复核 regions，再用 preview.start 放置。"
  },
  "commitPreview": {
    "tools": [
      "preview.commit"
    ],
    "method": "execute"
  },
  "cancelPreview": {
    "tools": [
      "preview.cancel"
    ],
    "method": "execute"
  },
  "sketch": {
    "tools": [
      "extrude"
    ],
    "method": "execute",
    "usage": "传 profile/points/plane 等显式轮廓参数；不需要模拟逐点点击。"
  },
  "measure": {
    "tools": [
      "measure",
      "queryGeometry"
    ],
    "method": "measure",
    "usage": "实体/面/边精确测量；两点距离用 points:[XYZ,XYZ]，来源标为输入坐标。"
  },
  "inspectPrintability": {
    "tools": [
      "inspectPrintability"
    ],
    "method": "inspectPrintability",
    "usage": "选定当前 bodyId 与 angleLimitDeg；返回网格悬垂事实和六个摆放方向，不判定工艺合格。"
  },
  "inspectProfile": {
    "tools": [
      "inspectProfile"
    ],
    "method": "inspectProfile",
    "usage": "选定当前可编辑解析轮廓 bodyId；返回端点、零长、重线和直线相交问题，不修改工程。"
  },
  "inspectFit": {
    "tools": [
      "inspectFit"
    ],
    "method": "inspectFit",
    "usage": "显式给两个当前单实体 bodyId、mm 接触容差；精确 B-Rep 求交与最短距离，不修改工程。"
  },
  "inspectThickness": {
    "tools": [
      "inspectThickness"
    ],
    "method": "inspectThickness",
    "usage": "选择单一封闭实体、表面点与向内方向，或两个平行面；只读精确连续材料厚度。"
  },
  "inspectDraft": {
    "tools": [
      "inspectDraft"
    ],
    "method": "inspectDraft",
    "usage": "显式实体、拉出方向、用户阈值；解析平面精确法向倾角，曲面明确未支持，不判定完整脱模。"
  },
  "measureRelation": {
    "tools": [
      "measureRelation"
    ],
    "method": "measureRelation",
    "usage": "显式选择两个实体/边/面，或点与有限面，读取精确几何关系与见证点。"
  },
  "textCommand": {
    "tools": [
      "executeText"
    ],
    "method": "executeText",
    "usage": "仅解析白名单文本命令，编译为当前页面 run 事务；dryRun 可先读回实际步骤。"
  },
  "fitProfile": {
    "tools": [
      "fitProfile"
    ],
    "method": "fitProfile",
    "usage": "输入有序的二维截面点，返回圆或直线的数值拟合参数及残差；不修改工程。"
  },
  "screenshot": {
    "tools": [
      "capture",
      "files.export"
    ],
    "method": "capture"
  },
  "fit": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "view": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "display": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "projection": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "grid": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "snap": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "section": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "selectMode": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "selection": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "selectTool": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "gizmo": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "gizmoTranslate": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "gizmoRotate": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "gizmoOff": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "camera": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "language": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "help": {
    "tools": [
      "readDocs"
    ],
    "method": "readDocs"
  },
  "mcp": {
    "tools": [
      "run"
    ],
    "method": "run",
    "usage": "JSON 面板只是同一 api.run 的界面入口。"
  }
}

## api.views

setView({context,direction?,projection?,fit?,selectedIds?,section?,display?,grid?,snap?,gizmo?,selectionMode?,camera?,language?,temporaryDisplay?,anchorVisible?,panels?}) 控制当前视口。display 为 solid/edges/wire/transparentEdges（半透明实体、边线与显示曲面三角网格）；grid/snap 为布尔值；gizmo 为 off/translate/rotate；selectionMode 为 body/face/edge；language 为 zh/en；camera 为 {position:[x,y,z],target:[x,y,z]}，可替代旋转、平移、缩放手势。temporaryDisplay 为 normal/selectedOnly/transparentOthers，只改变临时显示并保留工程中原有隐藏状态；getState().view 读回设置。direction 可为 top/bottom/front/back/left/right/side/iso；projection 可为 orthographic/perspective；fit 是布尔值；selectedIds 是当前实体 ID 数组，最多 200 个且不得重复。section 为 {axis:"X"|"Y"|"Z",position:有限数字,enabled:布尔值}，仅做显示裁剪，不切割精确 B-Rep。相机与裁剪变化不增加建模 revision。redraw({context}) 重绘当前提交版本；capture({context}) 等待匹配当前模型的渲染帧，返回 image/png dataUrl、context 和 display，失败时可能为 DISPLAY_FAILED。调用前从 getState().context 取完整当前身份与 expectedRevision。

## api.workflow

先连接当前页面，而不是读取另一个工作目录的源码或旧手册。页面 buildId/pageApiVersion/catalogHash/docsHash 决定当前契约；本地知识包只作匹配哈希的缓存。只有诊断真实实现缺陷时才查源码。

1. 通过宿主实际允许的脚本通道调用 api.connect({queries:['任务中的具体能力'],limit:2,includeContracts:true})；已知工具改用 toolIds（最多20个）。canExecute=false 时按 blockers 等待计算或处理预览，不自动提交/取消用户预览。契约已有则不重复读；缓存失配就更新。
2. 先判断目标几何。圆圈可能指二维圆线或有线径的实体圆环；圆形拉伸是实体，不能冒充二维曲线。模板名命中 template.* 时读取该模板卡；若上下文无法区分影响几何的含义，简短澄清。不支持的目标应说明，不能用相近工具冒充。
3. 复杂模型按部件和依赖规划：外形/主体、附属件、细节。模型名称（如飞机）不是工具 ID；按放样、曲线扫掠、多边形拉伸、变换等能力检索。先确定尺寸/坐标和关键截面，读这些完整契约，再分阶段执行。模板只在形状确实匹配时使用。概念模型可说明合理尺寸假设；复刻源图时不猜尺寸。
4. 用 api.run 执行1–20步的有界批次；每步有明确 name/params/refs。创建用 method:add；修改/删除/撤销用 method:execute。后续步骤用 {$ref:'part.createdBodyIds.0'} 读取真实结果，变换后使用变换回执的新 ID，不沿用被替换的旧实体。跨批次重新读状态。所有修改共用页面 Worker/历史；不是修改产品源码或注入任意内核代码。
5. 在批次中测量关键部件，必要时设轴测/适配视图；最后核对每步 status、实际实体、尺寸/体积、displayMatchesContext，并检查画面。有形状或尺寸要求时，实体数量增加不能单独证明完成。不要对每个参数往返一次，也不要默认导出保存。
6. partial/failed：查看 progress.failedStepId、completedStepIds、unattemptedStepIds 和原始 error。前面已提交步骤保留；读当前状态后只规划剩余步骤，并给修改后的请求新 key。unknown/宿主超时：先查状态，不能盲目再次创建。相同请求/key只返回原回执，不会继续未完成步骤；回执 context 是当时快照，重连后核对。

示例（通过授权脚本通道；已阅读 template.ring/measure/setView 卡并确认要实体圆环）：
const api=window.webcad.api;
const c=api.connect();
// c.canExecute 必须为 true；尺寸为演示值，不替代用户尺寸。
await api.run({context:c.requestContext,idempotencyKey:crypto.randomUUID(),steps:[
 {id:'ring',method:'add',args:{op:'quickModel',name:'圆环',refs:[],params:{kind:'ring',innerDiameter:24,section:'round',sectionSize:3,gapWidth:0}}},
 {id:'size',method:'measure',args:{bodyId:{$ref:'ring.createdBodyIds.0'}}},
 {id:'view',method:'setView',args:{direction:'iso',fit:true}}
]});

删除只针对用户指定范围。用 getState 的当前 body IDs，execute action:feature.remove args:{bodyIds:[...]}；不能把“删除这个模型”无条件解释成清空所有项目。

## api.workspace

UI 配置源 src/ui-layout.js：tabs/groups/controls/header/panels/defaultTab，修改后构建生成静态站点。getUILayout() 读取当前完整配置。文件、创建、曲面、编辑、加工、检查、视图七个选项卡与常用操作共一行，工程名称放在左侧设计树顶部。浏览器标题显示未保存标记及工程名称；URL document 参数仅区分当前工程，不是可恢复工程的分享链接。setRenderQuality({context,quality}) 提供 draft/standard/fine/ultra 四档，getState().renderQuality 提供毫米公差、角度公差（弧度）及三角面数。只重算显示网格，不改工程 revision、精确 BRep 或 STEP 导出；不是屏幕自适应网格。OpenCascade 可保留已有更细网格，降档不承诺减少三角面数。当前不提供斑马纹、曲率梳和精确 G0/G1/G2 连续性认证；导入 STEP 也不能反推原始特征历史。

## coordinates

Lengths are millimetres; angles degrees; volume mm^3; scale dimensionless. Coordinates are right-handed world XYZ unless the individual tool states otherwise.
box width/depth/height means positive X/Y/Z extent from [0,0,0]. It does not center at the origin.
hole and multiHole use radius, never diameter. multiHole.points are 1..100 world [x,y,z] cutter START points, not local XY. Depth is positive; direction is 1 or -1 along axis X/Y/Z, default Z/+1. These tools do not accept through.
faceHole.point is world XYZ on a planar face. through=true computes sufficient depth from the body bounds; otherwise positive depth is required. Face direction comes from exact topology.
Face and edge indices are zero-based within one body at one snapshot. No index is a stable semantic name. Prefer query selectionToken for feature.add. Current-model tokens cannot retarget a historical feature.edit.
transform rotates/scales about world origin, applies rotations X/Y/Z, then translates; absolute positioning sets final bounding-box center. Its legacy contract is unchanged.
slot.angle is degrees, independent of the sign of cut direction.

## errors

Errors contain code,path,message,retryable,recoveryAction. A failure before commit has commitState=not_committed; unknown outcomes must preserve unknown status and cannot claim rollback.
PARAM_SCHEMA_INVALID / PARAM_RANGE_INVALID: correct the named field without silently changing requested dimensions.
UNKNOWN_OPERATION / OPERATION_VERSION_UNSUPPORTED / SCHEMA_MISMATCH / CAPABILITY_UNAVAILABLE: READ_TOOL_CONTRACT and check current runtime capabilities.
DOCUMENT_MISMATCH / INSTANCE_MISMATCH / REVISION_CONFLICT / STALE_REFERENCE / UNSAFE_LEGACY_REFERENCE: READ_STATE_AND_REPLAN; do not retry stale IDs or guess another face.
NO_MATCH / AMBIGUOUS_SELECTION / SELECTION_CONFLICT: refine or correct selection; never silently choose the first match.
GEOMETRY_INVALID / NO_MATERIAL_REMOVED: review geometry and explicit dimensions. No automatic radius or size reduction.
PREVIEW_ACTIVE / RESOURCE_LIMIT / IDEMPOTENCY_KEY_REUSED: resolve the reported constraint; do not change idempotency keys merely to bypass an uncertain result.
PERSISTENCE_FAILED / RESULT_UNKNOWN: distinguish committed memory from durable storage or unknown delivery. No durable guarantee in M1. When no automatic action exists, recoveryAction=NONE.

## recipe.examples

打开用户提供的 .webcad 工程：经授权取得文件字节，await api.files.register({name,data}) 后调用 files.open({context,resourceId})。context 在读文件前取得；遇并发修改拒绝，未保存工程不能替换。读取卡片 files.write 了解真实磁盘保存；仅 files.save 生成字节不清除 dirty。正式界面不提供预置示例。

## recipe.file-workflow

浏览器文件流程：先调用 api.files.capabilities() 读取格式和限制。api.files.register({name,data,mime?}) 登记 File/Blob/ArrayBuffer/Uint8Array 真实字节，返回 resourceId。api.files.new({context})、open/import({context,resourceId}) 操作当前工程；save({context,name?})、export({context,format,ids?,name?}) 返回 status=generated 的资源描述。read({resourceId,as:"blob"|"bytes"}) 返回实际 Blob 或 Uint8Array。download({resourceId}) 返回 download_initiated；write({resourceId,handle}) 仅在已授权句柄写入、关闭与 SHA-256/大小回读匹配后返回 write_verified。release({resourceId}) 释放页面资源；已启动下载的 Object URL 由定时器回收，不因 release 立即撤销。
单资源 20 MiB、最多 32 个、总计 64 MiB、有效期 30 分钟。生成 Blob 不等于写盘，下载启动不等于写盘成功。旧快照写入不能清除新 revision 的 dirty。页面 API 的新建/打开遇 dirty 一律拒绝 UNSAVED_REPLACEMENT；UI 的真实用户确认是独立路径。File/Blob 不保证能跨侧边栏 JSON 通道传递；宿主不能传字节时由用户在页面选择文件。当前静态版不含本机 IGES 转换器及服务端矢量转换器。

## recipes.analytic-arc-profile

解析线弧轮廓：先 getTool({id:'arcProfile'})。outer 是顺序相接且闭合的数组；每段 {type:'line',points:[[起点X,Y],[终点X,Y]]} 或 {type:'arc',points:[[起点X,Y],[弧中X,Y],[终点X,Y]]}。holes 是同样轮廓的数组，height 为非零有符号 Z 拉伸深度（mm）。相邻端点及首尾端点须在0.000001 mm内重合；孔必须切除材料，输出必须是拓扑有效单实体，失败不提交。页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const outer=[{type:'line',points:[[0,0],[10,0]]},{type:'arc',points:[[10,0],[12,2.5],[10,5]]},{type:'line',points:[[10,5],[0,5]]},{type:'line',points:[[0,5],[0,0]]}];const r=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'part',method:'add',args:{op:'arcProfile',refs:[],params:{outer,holes:[],height:3}}},{id:'size',method:'measure',args:{bodyId:{$ref:'part.createdBodyIds.0'}}}]});检查逐步 status、solidCount、精确测量和 getState().display.rendered.revision；历史可 feature.edit 修改原段列表及高度。该工具保留 CAD 中的解析圆弧与侧面圆柱面；不读取本地 DXF、不猜轮廓归属、不支持样条、变厚或曲面投影。PG11419 原 DXF 的12个明确 LINE/ARC handle 可经 text-to-cad/agent/tools/cad-learning/export_dxf_arc_profile.py 转为此操作参数，详见 recipes.pg11419-analytic-profile。

## recipes.arc-band-plate

双孔弧形带板：UI 在“快捷模型”选择同名工具，AI 先 getTool({id:"quickModel"}) 查 kind=arcBandPlate 参数。页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"band",method:"add",args:{op:"quickModel",refs:[],params:{kind:"arcBandPlate",outerRadius:20,innerRadius:15,centerAngle:270,spanAngle:111.2807337553,thickness:5,holeInsetAngle:8.4521160504,holeDiameter:2.3,recessDiameter:3.3,recessDepth:0.7}}},{id:"size",method:"measure",args:{bodyId:{$ref:"band.createdBodyIds.0"}}}]})。参数单位 mm/度；同心弧间形成恒宽平板，两孔沿中半径从弧端对称退让，可选上表面沉孔。要求外R>内R>0、0<spanAngle<350、孔及沉孔完整落在板上且彼此分离、0≤沉孔深<板厚，失败整步回滚。PG5752 B 件源 DWG 明确 R20/R15、孔中心距25.6757、孔 Ø2.3/Ø3.3；弧跨度111.2807338°和退让8.4521161°由源几何计算。沉孔深0.7 mm 是展示候选，源图未证实该层深，螺纹与 A 件另建。读取状态、测量和 rendered revision；feature.edit 可调同一历史。

## recipes.arched-twin-window

圆弧拱弯平板双窗扣：UI 在“快捷模型”选择同名工具；AI 先 getTool({id:"quickModel"}) 读取 kind=archedTwinWindowPlate 参数卡。PG5821 的薄条外观试建脚本：const api=window.webcad.api; const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"arch",method:"add",args:{op:"quickModel",refs:[],params:{kind:"archedTwinWindowPlate",outerWidth:32.9,outerHeight:25.5,outerRadius:3,windowWidth:25.4,totalInnerHeight:18.5,windowRadius:0.5,barWidth:3.5,bendRadius:43.90964782342324,radialThickness:2.3}}},{id:"size",method:"measure",args:{bodyId:{$ref:"arch.createdBodyIds.0"}}}]})。参数为正视圆角双窗、圆筒外弧 R 与径向板厚；沿 Y 弯曲，圆筒轴沿 X。工具用正视轮廓柱体裁切精确同轴圆筒薄壁，建成一个有效实体。PG5821 模型包围约32.9×25.5×4.302 mm，图面侧深4.2，尚未叠加原侧视及验证未知边缘过渡，只计薄条外观试建。PG7219 侧视含两端 Ø5 圆截面与中部 Ø4 圆杆，属于弯曲圆线框加横杆，不能套此薄板工具。要求内弧半径>外高一半、窗口完全在外廓内，失败整步回滚。读批次状态、精确尺寸/体积和 rendered revision；feature.edit 可改历史参数。此工具不构造原件可能存在的局部边缘过渡，也不适用于弯曲轴向不明的图。

## recipes.bowed-twin-window

鼓侧边平板双窗扣：UI 在“快捷模型”选择“鼓侧边平板双窗扣”，AI 先 getTool({id:"quickModel"}) 查看 kind=bowedTwinWindowPlate 参数卡。页面示例：const api=window.webcad.api; const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"plate",method:"add",args:{op:"quickModel",refs:[],params:{kind:"bowedTwinWindowPlate",outerHeight:24.5,topStraightWidth:30.2527,sideRadius:35.688467,cornerRadius:6,windowWidth:32,windowHeight:6.55,windowSpacing:10.35,thickness:3.7,edgeRadius:0.8}}},{id:"size",method:"measure",args:{bodyId:{$ref:"plate.createdBodyIds.0"}}}]})。外廓上下直段、四角小 R、两侧相切大 R 鼓弧；两窗为直段加半圆，windowSpacing 是中心距；edgeRadius 是三维边倒 R。侧弧圆心由直段、外高和两 R 计算。PG3781 名义对称试建得到约43.58336×24.5×3.7 mm、2204.792137 mm³；独立 text-to-cad 源圆弧 STEP 为43.597847×24.5×3.7、2206.094501，横向差约0.01449 mm、体积差约1.30236 mm³。源 DWG 左右及上下圆弧有微小非对称，本参数模型不声称源弧精确重合。输入需侧R>角R、两者可相切、两孔分离且位于板内、边R小于板厚和壁厚一半；失败整步不提交。读取批次状态、精确尺寸/体积、渲染修订；feature.edit 可调同一历史特征。不是侧向拱弯板或独立杆装配。

## recipes.capsule-wire

圆线直段长圈：UI 在“快捷模型”选择“圆线直段长圈”；AI 先 getTool({id:"quickModel"}) 查 kind=capsuleWire 参数。调用 const api=window.webcad.api; const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"loop",method:"add",args:{op:"quickModel",refs:[],params:{kind:"capsuleWire",innerWidth:34.9,innerHeight:13.9,sectionSize:6.1}}},{id:"size",method:"measure",args:{bodyId:{$ref:"loop.createdBodyIds.0"}}}]})。内宽>内高>0、圆线直径>0；两端是精确半圆，中间上下直段，闭合且没有人为缝宽。外宽=内宽+2×线径，外高=内高+2×线径。PG11140 得 47.1×26.1×6.1 mm、体积约 3063.675857 mm³；PG9782 的 12.3×8.4/Ø3 得 18.3×14.4×3 mm、约 308.290304 mm³，两款均与 text-to-cad 独立 STEP 回读一致。PG9782 的孤立无标注轮廓没有确定语义，工具只代表有完整尺寸的主侧视主体。PG4680 底部接缝无数值，不能借用此闭合模型声称其无缝；真椭圆、四圆弧、圆角扁方截面分别使用对应工具。读回执/精确测量/渲染修订，失败整步回滚，同一历史可 feature.edit。

## recipes.chamfered-wire-frame

倒角方线恒截面框：UI 在快捷模型选择 D 扣、方扣、日字扣、圆圈、开口 C 环或四圆弧旦扣；AI 先 getTool({id:'quickModel'})，选择 section:'chamferedSquare'、sectionSize 方线正面宽/侧深、sectionChamfer 单边 45°倒角切入量，须 0<C<sectionSize/2。截面是八条直线组成的等宽等深八边形，四角为平倒角而非圆角；sectionRadius 在该截面下忽略。PG4819 图面正视外37×28.5、内25×16.5，侧剖总深6、顶面平段3，所以截面边长6、C1.5。页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'frame',method:'add',args:{op:'quickModel',refs:[],params:{kind:'dBuckle',section:'chamferedSquare',sectionSize:6,sectionChamfer:1.5,innerWidth:25,innerHeight:16.5,innerRadius:2,gapWidth:0}}},{id:'size',method:'measure',args:{bodyId:{$ref:'frame.createdBodyIds.0'}}}]});检查 status、solidCount、精确 bounds/volume 和 getState().display.rendered.revision。该候选应为37×28.5×6 mm 单实体；innerRadius:2 与 D 扣半圆冠路径是外观试拟，PG4819 源冠部为多段不同 R 圆弧，故不可宣称逐线复刻或量化80%相似。方扣等其它中心路径复用同一截面，但须各自满足工具的几何护栏。非法 C 或扫掠失败不提交；历史用 feature.edit 修改 sectionChamfer。

## recipes.closed-chamfered-path

闭合线弧倒角方线：先 getTool({id:'curveSweep'}) 读取当前参数卡。给出按行进方向排列的 2–64 条精确线弧 segments，相邻点及首尾端点误差须≤0.000001 mm；设置 pathType:'segments',closed:true,section:'chamferedSquare',sectionSize:6,sectionChamfer:1.5。全部路径点必须同处 XY 平面，0<sectionChamfer<sectionSize/2。页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const p=(x,y)=>[x,y,0];const segments=[{type:'line',points:[p(10,-8),p(10,8)]},{type:'arc',points:[p(10,8),p(7.0710678118654755,15.071067811865476),p(0,18)]},{type:'arc',points:[p(0,18),p(-7.0710678118654755,15.071067811865476),p(-10,8)]},{type:'line',points:[p(-10,8),p(-10,-8)]},{type:'line',points:[p(-10,-8),p(10,-8)]}];const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'frame',method:'add',args:{op:'curveSweep',refs:[],params:{pathType:'segments',segments,closed:true,section:'chamferedSquare',sectionSize:2,sectionChamfer:0.5}}},{id:'size',method:'measure',args:{bodyId:{$ref:'frame.createdBodyIds.0'}}}]});检查 result.status、单实体/尺寸/体积和 getState().display.rendered.revision。可用 feature.edit 修改整段 segments 或截面参数；源图路径应由明确的 LINE/ARC handle 和侧剖截面推导，不从正视图自动猜测。该工具只支持恒截面，不表达局部变截面、侧向拱弯或未验证的倒圆。无效拓扑失败回滚。

## recipes.compact-rect-buckle

紧凑圆线方扣：UI 在快捷模型中选择“方扣”，AI 先用 getTool({id:"quickModel"}) 读 kind=rectBuckle 的当前参数。例：const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"frame",method:"add",args:{op:"quickModel",refs:[],params:{kind:"rectBuckle",section:"round",innerWidth:10,innerHeight:25,sectionSize:3.5,innerRadius:0.9,gapWidth:0}}},{id:"size",method:"measure",args:{bodyId:{$ref:"frame.createdBodyIds.0"}}}]})。圆线闭合方框与日字扣的内宽高下限为线径 2.5 倍；开缝圆框、方线框仍为 4 倍。0<innerRadius<内短边/2，截面 0.5–20 mm，内宽高上限 200 mm。PG10251 的名义正视由此形成外 17×32、外 R4.4、深 3.5 mm 单实体候选；原 DWG 使用回退预览，尚不能据此断言其它表面特征已完整复刻。读每步回执、精确测量、当前 rendered revision；用 feature.edit 修改历史参数。

## recipes.compact-slider-buckle

紧凑圆线日字扣：UI 在快捷模型中选择“日字扣”；AI 先用 getTool({id:"quickModel"}) 读 kind=sliderBuckle 参数。const api=window.webcad.api; const {revision,...identity}=api.getState().context; const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"frame",method:"add",args:{op:"quickModel",refs:[],params:{kind:"sliderBuckle",section:"round",innerWidth:19.9,innerHeight:20.5,innerRadius:3,sectionSize:5.8,barDiameter:3.5,barOffset:0,gapWidth:0}}},{id:"size",method:"measure",args:{bodyId:{$ref:"frame.createdBodyIds.0"}}}]})。闭合圆线内宽高各≥2.5倍线径，横杆直径>0且≤框线径；横杆必须接在左右直腿，上下各留至少一倍框线径的净孔高。以上数值取 PG3014 图面内宽19.9、内高20.5、框截面Ø5.8、中杆Ø3.5；innerRadius=3 是未标注试拟。内核实体外廓31.5×32.1×5.8 mm，与图面外廓31.7×32.3 mm 各差0.2 mm；不要擅改Ø5.8去凑外廓。源图还示局部细节，须独立核验。读取 status/results/精确尺寸和 rendered revision；失败不提交，可通过 feature.edit 修订。

## recipes.d-flat-frame

独立底角 R 平板 D 框：UI 在“快捷模型”选择同名工具；AI 先 getTool({id:"quickModel"}) 查看当前参数卡。页面调用：const api=window.webcad.api; const {revision,...identity}=api.getState().context; const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"d",method:"add",args:{op:"quickModel",refs:[],params:{kind:"dFlatFrame",outerWidth:28,outerHeight:25,innerWidth:20,innerHeight:17,outerBottomRadius:3.5,innerBottomRadius:2,thickness:4,gapWidth:1}}},{id:"size",method:"measure",args:{bodyId:{$ref:"d.createdBodyIds.0"}}}]}); 形状为半圆冠、直腿、独立内外底角 R 的平板单实体；gapWidth=0 为闭合，正数按实际平行缝宽切开底部中央。上例缝宽 1 mm 只是工具演示，PG9998 图面未确认该数值，不能把试算当源件复刻。厚度是平板 Z 深度，不是圆线直径；两条 D 轮廓不得相交或相切，内外高须足以容纳半圆冠和底角；底缝小于内底直段。失败整步回滚。检查批次状态、精确测量和 rendered revision；后续用 feature.edit 修改历史参数。

## recipes.dxf-arc-profile

DXF 闭合源轮廓：先在原图核定有效产品视图与 LINE/ARC/CIRCLE/SPLINE handle，使用 text-to-cad/agent/tools/cad-learning/export_dxf_profile.py 经 run-silent.ps1 以 --dxf 输入路径、--output 临时 JSON、--outer 逗号分隔外轮廓 handle、重复 --hole 指定各孔，--distance 0.01（圆弧弦高或样条展平距离 mm）、--join 0.01（源端点相接容差 mm）导出。工具自动沿端点连接并反向必要的边，拒绝断链/分叉/重复 handle/非闭合，输出居中的 regions、point_counts、max_join_gap_mm、源坐标包围和 handle 清单；每轮廓≤2000点、总数≤12000。页面已有 AI 可调用 add.vectorProfile：const api=window.webcad.api; const {revision,...identity}=api.getState().context; const sampled=已复核的导出JSON; const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"profile",method:"add",args:{op:"vectorProfile",refs:[],params:{regions:sampled.regions,output:"solid",height:5,source:{kind:"dxf-arc-profile",outerHandles:sampled.outer_handles,holeHandles:sampled.hole_handles,distanceMm:sampled.distance_mm}}}},{id:"size",method:"measure",args:{bodyId:{$ref:"profile.createdBodyIds.0"}}}]})。PG8091 有效改模版例：外轮廓 F6,FE,FF,F8,F7,FB,F9,FA,FD,FC；孔 F5 与 100,102,103,101,105,104。采样轮廓为112/87/60点，源闭合最大接缝约0.000001 mm；源轮廓拉伸5 mm 试件为41.202×52.181×5 mm、4146.667412 mm³ 单实体。图面标外宽40.6、高52.2，宽度与采样几何差约0.602 mm，未解释前不称精确复刻；源图3D截面和边缘过渡也未证明。PG4307 两条 LINE + 两条 SPLINE 的外轮廓可用同一脚本导出，采样宽 24.006007、高 21 mm；内样条与邻近直线端点不重合，应继续使用 traceTwinWindow 专用拼接，不能放宽 --join 强凑。开放中心路径不适用。导出脚本不自动选择产品或猜孔层级，页面也不直接读取本机 DXF。读运行回执、精确尺寸、渲染修订；失败不提交。

## recipes.dxf-bulge-analytic-profile

DXF 闭合 LWPOLYLINE bulge 圆弧：先核定有效产品视图及每个外/孔 handle。text-to-cad/agent/tools/cad-learning/export_dxf_arc_profile.py 经 run-silent.ps1 输入 --dxf 源图转换的 DXF、--outer 一个闭合 LWPOLYLINE handle、每个 --hole 一个闭合 LWPOLYLINE 或 CIRCLE handle、--height 侧视支持的等深厚度、--output 临时 JSON。脚本将各段 bulge 转为解析三点圆弧，保留正负弧向，拒绝开放多段线、零长边、非有限 bulge、非 XY 挤出方向或非零源 Z。AI 先读 getTool({id:'arcProfile'})，再以 const api=window.webcad.api;const {revision,...identity}=api.getState().context;const r=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'part',method:'add',args:{op:'arcProfile',refs:[],params:data.params}},{id:'size',method:'measure',args:{bodyId:{$ref:'part.createdBodyIds.0'}}}]});复核回执和渲染。PG7440 的外 BCA1、内 BCA0 是闭合圆角方框：该脚本精确提取 33×23 mm 正视轮廓，但侧视 Ø4 是圆线截面，直接 arcProfile 等深板会错误表达截面。应复用 quickModel.rectBuckle 与 recipes.source-round-rect 建源件候选；arcProfile 仅作正视轮廓校验或适用于确有平板截面的其他产品。

## recipes.dxf-paired-midline

DXF 成对边界推导闭合或开放中心线：在 text-to-cad 仓库使用 agent/tools/cad-learning/run-silent.ps1 调用 agent/tools/cad-learning/export_dxf_midline.py。指定 --dxf 源 DXF、--output 临时 JSON、--diameter 截面正面宽度，按行进顺序重复 --segment TYPE:OUTER_HANDLE:INNER_HANDLE:forward|reverse。TYPE 是 line 或 arc；圆弧两条边须同心同角域、半径差等于 diameter，直线等长平行且垂直偏移 diameter。--join 允许源端点接缝误差，最大0.1 mm；输出 max_join_gap_mm，超过容差拒绝。闭环加 --closed；倒角方线加 --section chamferedSquare --chamfer 倒角切入量，否则默认圆线。示例 PowerShell：& agent/tools/cad-learning/run-silent.ps1 -Script agent/tools/cad-learning/export_dxf_midline.py -ScriptArguments @('--dxf','source.dxf','--output','agent/temp/midline.json','--diameter','2','--closed','--section','chamferedSquare','--chamfer','0.5','--segment','arc:OUTER1:INNER1:forward','--segment','arc:OUTER2:INNER2:forward')。导出 params 可直接作为 WebCAD api.run 的 curveSweep 参数；先 getTool({id:'curveSweep'})，再按 recipes.closed-chamfered-path 调用、测量并读回。脚本不替用户选 handle，不修复自交、变截面或源 DXF 圆弧角度截断。PG4819 的 8 段源路径最大端点偏差约0.04935 mm，导出成功，但 WebCAD/OCCT 扫掠拓扑无效，未生成源路径实体；不能把该候选称为复刻。

## recipes.ellipse-bar

椭圆圈固定横杆：UI 在“快捷模型”选择“椭圆圈固定横杆”；AI 先从 getTool({id:"quickModel"}) 查 kind=ellipseBar 参数。调用 const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"oval",method:"add",args:{op:"quickModel",refs:[],params:{kind:"ellipseBar",innerWidth:35,innerHeight:25,sectionSize:5,barDiameter:5,barDepthOffset:0}}},{id:"size",method:"measure",args:{bodyId:{$ref:"oval.createdBodyIds.0"}}}]})。从给定的真椭圆内轮廓向外偏置半线径成中心路径，以圆线扫掠，并融合一根沿 X 的固定圆杆；barDepthOffset 沿 Z 调整杆轴。约束：innerWidth>innerHeight≥4×sectionSize>0，0<barDiameter≤sectionSize，abs(barDepthOffset)<(sectionSize+barDiameter)/2。PG5155 DWG 有内 35×25 真椭圆、外样条和 Ø5 侧截面；当前内核候选实际包围 45.058424×35×5 mm，X 比 nominal 45 多约 0.058424 mm，不能按 45 mm 精确交付。一次构建在本地约 25 秒，生产源样条与杆端过渡尚未逐曲面核对。读回执、精确测量和 rendered revision；失败整步回滚，历史可由 feature.edit 修改。

## recipes.ellipse-open-wire

内真椭圆开缝圆线圈：UI 在“快捷模型”选择“内真椭圆开缝圆线圈”；AI 先从 getTool({id:"quickModel"}) 查 kind=ellipseOpenWire 参数。调用 const api=window.webcad.api; const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"loop",method:"add",args:{op:"quickModel",refs:[],params:{kind:"ellipseOpenWire",innerWidth:15,innerHeight:20,sectionSize:3.5,gapWidth:0.2}}},{id:"size",method:"measure",args:{bodyId:{$ref:"loop.createdBodyIds.0"}}}]})。输入真椭圆内孔宽高、圆线直径、底中实际平切缝宽，单位 mm；两轴须不等，短轴≥4×线径>0，0<缝宽<线径。内真椭圆外偏半线径为扫掠中心路径，再切出 X=±gapWidth/2 的平行端面。PG11580 名义参数的内核单实体约 22×26.999563×3.5 mm，平切端间距 0.2 mm；开缝会让实际总高略低于闭环名义 27 mm。当前只支持内轮廓是真椭圆、底中缝且平行平切；PG9432 外真椭圆基准的 WebCAD 切缝试验拓扑无效，不能填本工具的 innerWidth/innerHeight 强行冒充。PG12429 双独立椭圆亦须先确定轮廓基准。读回执和渲染修订，失败整步回滚；修改参数用 feature.edit。

## recipes.ellipse-section-rect

椭圆截面圆角方框：UI 在“快捷模型”选择同名工具，AI 先 getTool({id:"quickModel"}) 读取 kind=ellipseSectionRectFrame 参数卡。页面脚本：const api=window.webcad.api; const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"frame",method:"add",args:{op:"quickModel",refs:[],params:{kind:"ellipseSectionRectFrame",innerWidth:25,innerHeight:19,innerRadius:2.5,sectionWidth:5.5,sectionDepth:6}}},{id:"size",method:"measure",args:{bodyId:{$ref:"frame.createdBodyIds.0"}}}]})。正面宽=内宽+2×sectionWidth，正面高=内高+2×sectionWidth；侧深独立。沿圆角矩形中心线扫掠精确椭圆截面，PG5866 名义尺寸得36×30×6 mm、2617.38796 mm³ 单实体候选。源图仅明示宽高及侧视 Ø6，内 R2.5 和椭圆截面是试拟，不能把椭圆当源图已证实截面或声称完整复刻。sectionWidth 与 sectionDepth 必须不等，内宽高至少为正面料宽2.5倍、均≤200，0<内R<内短边一半；失败整步回滚。读批次 status、measure、rendered revision；feature.edit 改历史参数。PG5134 可反向设置：内17.7×19.7、正面料宽5.25、侧深4，内 R2.5 仍为试拟；名义实体28.2×30.2×4 mm。圆截面请用 rectBuckle。

## recipes.ellipse-section-ring

椭圆截面圆环：UI 在“快捷模型”选择同名工具，AI 先 getTool({id:"quickModel"}) 查 kind=ellipseSectionRing 参数。页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"ring",method:"add",args:{op:"quickModel",refs:[],params:{kind:"ellipseSectionRing",innerDiameter:37.4,sectionWidth:4.1,sectionDepth:5}}},{id:"size",method:"measure",args:{bodyId:{$ref:"ring.createdBodyIds.0"}}}]})。内径、正面带宽和侧深独立；沿圆形中心线扫掠精确椭圆截面，外径=内径+2×带宽。要求内径≥2.5×带宽、宽深均正且不等；失败整步回滚。PG6148 源 DWG 同心圆内Ø37.4/外Ø45.6、侧深5，而把侧深当圆线径会错误得到外Ø47.4；椭圆截面是对两投影的试拟，不是源已证实曲面。名义候选单实体45.6×45.6×5 mm、约2099.141486 mm³。读 status、measure、rendered revision；feature.edit 可调历史。

## recipes.ellipse-u-wire

开口 U 形椭圆截面线：先 getTool({id:'curveSweep'})。由外宽 W、内宽 I 得正面料宽 s=(W-I)/2；外冠 R、外高 H 得中心线冠 R_c=R-s/2、冠圆心 X_c=W/2-R、Y_c=H-s/2-R_c。路径为右直腿、右四分之一圆弧、顶短直线、左四分之一圆弧、左直腿，所有段按行进方向首尾精确相接。section:'ellipse',sectionWidth:s,sectionDepth:侧视深度，均为 mm 且宽深不同。PG10537 图面 W26.8、I21、H36、外冠R11、内冠约R8、侧深4.3，故 s2.9、R_c9.55、X_c2.4、Y_c25；内冠计算R8.1与名义R8差0.1 mm，截面椭圆是外观试拟。页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const p=(x,y)=>[x,y,0],q=Math.SQRT1_2,segments=[{type:'line',points:[p(11.95,0),p(11.95,25)]},{type:'arc',points:[p(11.95,25),p(2.4+9.55*q,25+9.55*q),p(2.4,34.55)]},{type:'line',points:[p(2.4,34.55),p(-2.4,34.55)]},{type:'arc',points:[p(-2.4,34.55),p(-2.4-9.55*q,25+9.55*q),p(-11.95,25)]},{type:'line',points:[p(-11.95,25),p(-11.95,0)]}];const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'u',method:'add',args:{op:'curveSweep',refs:[],params:{pathType:'segments',segments,section:'ellipse',sectionWidth:2.9,sectionDepth:4.3}}},{id:'size',method:'measure',args:{bodyId:{$ref:'u.createdBodyIds.0'}}}]});检查逐步 status、单实体、包围尺寸、体积及 getState().display.rendered.revision。历史用 feature.edit 修改 segments/sectionWidth/sectionDepth。工具生成恒截面开口 U；端部 M2.5、倒角、打磨及实际截面没有足够源证据，未构造，不称完整复刻。

## recipes.figure-eight-capsule

双孔葫芦形圆线：复用 quickModel.kind='capsuleWire'、transform、union 三张现有工具卡，不增内核原语。先 getTool({id:'quickModel'})、getTool({id:'transform'})、getTool({id:'union'})。设每孔 innerWidth、innerHoleHeight、wireDiameter、两孔中心距 centerSpacing，要求 innerWidth>innerHoleHeight>0、wireDiameter>0、innerHoleHeight<centerSpacing<innerHoleHeight+2*wireDiameter，保证两孔分开且圆线实体有体积交叠。页面批量脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const p={kind:'capsuleWire',innerWidth:34.7,innerHeight:8.3,sectionSize:5.5};const offset=11.4/2;const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'top',method:'add',args:{op:'quickModel',refs:[],params:p}},{id:'topMove',method:'add',args:{op:'transform',refs:[{$ref:'top.createdBodyIds.0'}],params:{y:offset}}},{id:'bottom',method:'add',args:{op:'quickModel',refs:[],params:p}},{id:'bottomMove',method:'add',args:{op:'transform',refs:[{$ref:'bottom.createdBodyIds.0'}],params:{y:-offset}}},{id:'joined',method:'add',args:{op:'union',refs:[{$ref:'topMove.createdBodyIds.0'},{$ref:'bottomMove.createdBodyIds.0'}],params:{}}},{id:'size',method:'measure',args:{bodyId:{$ref:'joined.createdBodyIds.0'}}}]});检查 result.status、逐步回执、measure.solidCount 和 getState().display.rendered.revision。理论包围宽=innerWidth+2*wireDiameter，高=innerHoleHeight+2*wireDiameter+centerSpacing，厚=wireDiameter。PG2145 的源内孔端 R4.15、外端 R9.65、圆心上下距11.4，合并模型 45.7×30.7×5.5 mm；图面名义高30.6，存在0.1 mm差，源腰部 R0.6 圆滑连接未复刻。该配方有5个可编辑历史特征，不自动猜源件全部三维接头；调参须同步修改两圈和对称偏移，或重新执行配方。

## recipes.flat-washer

平垫圈：UI 在“快捷模型”选择“平垫圈”；AI 用 getTool({id:"quickModel"}) 读取 kind=washer 当前参数卡。PG1797 名义例：const api=window.webcad.api; const {revision,...identity}=api.getState().context; const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"washer",method:"add",args:{op:"quickModel",refs:[],params:{kind:"washer",innerDiameter:36.2,sectionSize:7,innerHeight:3.2}}},{id:"size",method:"measure",args:{bodyId:{$ref:"washer.createdBodyIds.0"}}}]}); sectionSize 是径向壁宽=(外径−内径)/2，并非圆线直径；innerHeight 在此工具是轴向厚度。结果外 Ø50.2、内 Ø36.2、厚 3.2 mm，体积约 3040.056379 mm³。PG0203 输入内径25、径向壁宽4.4、厚3.8，得外 Ø33.8、体积约1544.306418 mm³。内径、壁宽、厚度都必须大于0；输出是锐边平面圆环。原图未标边缘 R/C 时不自动添加。读批次状态、精确测量和 rendered revision；失败不提交，历史可用 feature.edit 改参数。不要把 washer 当作圆线圈 ring，也不要把 sectionSize 当作外径。

## recipes.gable-open-frame

斜肩开口框：UI 在“快捷模型”选择“斜肩开口框”；AI 先 getTool({id:"quickModel"}) 读 kind=gableOpenFrame 参数。页面脚本：const api=window.webcad.api; const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"gable",method:"add",args:{op:"quickModel",refs:[],params:{kind:"gableOpenFrame",outerWidth:25,innerWidth:20,outerPeakHeight:16,outerShoulderHeight:12.4,innerPeakHeight:13.5,innerShoulderHeight:10.5,thickness:4,endRadius:1}}},{id:"size",method:"measure",args:{bodyId:{$ref:"gable.createdBodyIds.0"}}}]})。正视两个斜肩屋顶轮廓之间留开口，脚端有真实 R1 四分之一圆弧和短平底，外 25×16×4 mm；不通过事后倒圆改变总高。PG7918 图面明确外宽25、内宽20、外峰高16、外肩约12.4、脚端R1、侧深4；内峰13.5/内肩10.5依据图面轮廓试拟，尚未逐边回读源 CAD，不宣称完全复刻。此工具是平板正视轮廓拉伸，未处理侧视的完整圆端截面。须满足内外峰、肩分离和端R≤带宽一半；失败整步回滚。检查批次 status、measure 和 rendered revision；历史参数用 feature.edit。

## recipes.mounting-plate

四孔板示例，尺寸单位 mm。先调用 info()/getState() 取得当前完整上下文，再用 getTool({id:"box"}) 与 getTool({id:"multiHole"}) 读取实际版本、schemaHash 与示例。新增 box：{width:50,depth:30,height:3}、refs:[]。取得实际板件 bodyId 与新 revision 后新增 multiHole：{radius:2,depth:5,axis:"Z",direction:-1,points:[[5,5,4],[45,5,4],[5,25,4],[45,25,4]]}、refs:[实际 bodyId]。刀具从全局 Z=4 向下切至 Z=-1。体积期望值是 4500-48π mm³；须以当前精确 B-Rep 测量和导出回读验证。
命名参数已通过 execute action document.parameters 接出；可绑定板长和右孔 X 到 length 与 length-edgeMargin，再只改 length。具体示例见 docs/examples/page-api-plate.js。

## recipes.multi-boss

批量圆柱凸台：先 getState() 取得当前上下文和真实 bodyId，getTool({id:"multiBoss"}) 读取严格 v2 卡。UI 路径“加工 → 孔与槽 → 批量圆柱凸台”。在 40×20×3 mm 板顶加两个凸台：feature.add 的 refs:[实际 bodyId]、params:{radius:2,height:3,axis:"Z",direction:1,points:[[10,10,3],[30,10,3]]}。每个 XYZ 是世界坐标的凸台底面中心，圆柱沿指定轴和符号方向长出。最多 64 个；每个都必须与当前主体融合为一个实体且增加材料，否则整步不提交。成功后读回 revision/body/feature，测量精确体积；示例理论值 2400+2×π×2²×3 mm³。历史修改用 feature.edit 传 radius/height/axis/direction 或完整 points 数组。工具只生成实心圆柱；通孔另用 multiHole，圆角另用 fillet/autoRound，不猜轴心或表面。

## recipes.multi-pocket

批量矩形凹槽：先用 getState() 取得当前上下文和实际 bodyId，再用 getTool({id:"multiPocket"}) 读取版本、schemaHash 和严格参数。UI 路径为“加工 → 孔与槽 → 批量矩形凹槽”。在一个已有 40×20×3 mm 板件上执行 feature.add，refs:[实际 bodyId]，params:{depth:0.5,axis:"Z",direction:-1,pockets:[{x:10,y:10,z:3,width:6,height:4},{x:25,y:10,z:3,width:6,height:4,cornerRadius:0.5}]}。每组 XYZ 是世界坐标的刀具入口中心；切入轴 Z 时宽/高沿 X/Y，X 时沿 Y/Z，Y 时沿 Z/X。例中从 Z=3 向下切至 2.5。cornerRadius 可省略或为 0，若提供则必须小于宽高短边一半。1–64 个凹槽，每个都须去除剩余材料；任一失败，整步不提交。用 getState() 读回新 feature/body/revision，再 measure 精确体积。可通过 feature.edit 修改历史步骤的 depth、axis、direction 或完整 pockets 数组，从原始几何重建。圆孔用 multiHole；任意曲面区域另用相应面工具。

## recipes.open-oval

竖向底部开口四圆弧圈：先分别读 getTool({id:"quickModel"}) 中 kind=ovalBuckle 与 getTool({id:"transform"})。可在同一个 api.run 请求的 steps 依次使用 {id:"oval",method:"add",args:{op:"quickModel",refs:[],params:{kind:"ovalBuckle",section:"round",innerWidth:20,innerHeight:15,innerRadius:7,sectionSize:3.5,gapWidth:0.2}}} 和 {id:"upright",method:"add",args:{op:"transform",refs:[{$ref:"oval.createdBodyIds.0"}],params:{rz:-90}}}。请求使用 const {revision,...identity}=getState().context，context:{...identity,expectedRevision:revision}，idempotencyKey 每个新请求唯一。横向模板右端开口经绕 Z -90° 后移到竖向底部；旋转后的外包围约 22×27×3.5 mm。用 upright 步实际回执里的新 bodyId 测量及读 rendered revision。四圆弧不等于真椭圆；innerRadius 必须由源图或拟合证据决定，例中 7 mm 仅为操作演示。没有源证据时不能把这个示例宣称为实际产品复刻。

## recipes.pg11419-analytic-profile

PG11419 倒置 D 框源线实例：在 text-to-cad 目录使用 run-silent.ps1 调用 agent/tools/cad-learning/export_dxf_arc_profile.py，--dxf 指向由源 DWG 只读转换的 DXF，--output 指向 agent/temp 下 JSON，--outer 62BF,62CC,62D0,62C3,62C5,62C8,62C9,62BB，--hole 62F5,676A,6774,62F2，--height 3.5，--join 0.01。先核对 JSON 的 source_bounds、max_join_gap_mm、原图句柄与侧视。页面脚本：const api=window.webcad.api;const data=已复核的导出JSON;const {revision,...identity}=api.getState().context;const r=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'part',method:'add',args:{op:'arcProfile',refs:[],params:data.params}},{id:'size',method:'measure',args:{bodyId:{$ref:'part.createdBodyIds.0'}}}]});检查 r.status、逐步回执、单实体、尺寸体积、渲染 revision。height=3.5 mm 是侧视 3.4 与 3.7 mm 之间的等深试拟；源件变深和局部加工未重建。

## recipes.pg5752-two-source-parts

PG5752 A/B 两件源图分别试建：在 text-to-cad 目录通过 run-silent.ps1 调用 export_dxf_arc_profile.py。A 用 --outer 3D2,3D6,3D8,3D9 --hole 3DD --hole 3E1 --height 5 --join 0.01；B 用 --outer 52E,532,52F,530 --hole 579 --hole 57A --height 5 --join 0.05；均指定同一已核对 DXF 与 agent/temp 下不同 --output。A 两孔 R0.85，源标 2-M2，普通圆柱孔不表示螺纹；B 两孔 R1.15，大同心圆的沉孔深度不明。先 getTool({id:'arcProfile'}) 和 getTool({id:'transform'})，把导出 JSON 分别作为 dataA/dataB。页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const r=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'a',method:'add',args:{op:'arcProfile',refs:[],params:dataA.params}},{id:'b',method:'add',args:{op:'arcProfile',refs:[],params:dataB.params}},{id:'bDisplay',method:'add',args:{op:'transform',refs:[{$ref:'b.createdBodyIds.0'}],params:{x:60}}},{id:'aSize',method:'measure',args:{bodyId:{$ref:'a.createdBodyIds.0'}}},{id:'bSize',method:'measure',args:{bodyId:{$ref:'bDisplay.createdBodyIds.0'}}}]});检查逐步回执、两个单实体的尺寸体积和渲染 revision。B 的 x=60 仅供同屏对照，不是源图装配定位，不做布尔合并。A 实测40×35.725769605×5 mm、2156.407441 mm³；B 实测33.020453×11.534217×5 mm、808.171586 mm³。装配间距、配合、螺纹和孔口层深仍需源证据。

## recipes.pg8091-analytic-profile

PG8091 改模版源线试建：从源 DWG 只读转换 DXF 后，用 text-to-cad/agent/tools/cad-learning/run-silent.ps1 调用 export_dxf_arc_profile.py。外 handle F6,FE,FF,F8,F7,FB,F9,FA,FD,FC；中心圆孔 F5（单个 CIRCLE 被拆为两条精确半圆弧）；弧槽孔 100,102,103,101,105,104；--height 5 取自侧视，--join 0.01。导出 JSON 的 params 可直接传入 api.run({context:{...api.getState().context,expectedRevision:api.getState().context.revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'part',method:'add',args:{op:'arcProfile',refs:[],params:data.params}},{id:'size',method:'measure',args:{bodyId:{$ref:'part.createdBodyIds.0'}}}]})。先读取 getTool({id:'arcProfile'}) 和 recipes.analytic-arc-profile。源 DXF 解析外宽约41.208906 mm、图面标40.6 mm，差约0.608906 mm；未解释前按源线候选，不缩放成名义尺寸。只建正视等深实体，不推断侧面局部加工。

## recipes.polar-hole-ring

圆周重复孔位：复用 quickModel/washer 和 multiHole 两个现有脚本工具，无需专用固定孔数模型。先 getTool({id:"quickModel"})、getTool({id:"multiHole"}) 查当前参数卡。PG3389 源图主视同心圆内 R10/外 R14.5，侧厚3.6；16个 R1.5 圆位均匀分布在中心半径12.25上，首孔90°，角步22.5°。页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const points=Array.from({length:16},(_,i)=>{const a=(90+i*360/16)*Math.PI/180;return [12.25*Math.cos(a),12.25*Math.sin(a),1.8]});const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"ring",method:"add",args:{op:"quickModel",refs:[],params:{kind:"washer",innerDiameter:20,sectionSize:4.5,innerHeight:3.6}}},{id:"holes",method:"add",args:{op:"multiHole",refs:[{$ref:"ring.createdBodyIds.0"}],params:{radius:1.5,depth:0.5,axis:"Z",direction:-1,points}}},{id:"size",method:"measure",args:{bodyId:{$ref:"holes.createdBodyIds.0"}}}]}); 浅圆座深0.5 mm仅是可见试拟；源图文字说明为镶钻，未给出石座深度和宝石形状。外观试建为一个29×29×3.6 mm实体，体积=π(14.5²−10²)×3.6−16π1.5²×0.5。通用时改变 count、中心半径、起始角和半径，并检查每个孔完全在环带内、不互交；depth 从上表面向下切，PG3389 的0.5只是试拟。读 status、measure、rendered revision；参数变化用 feature.edit 改完整 points 数组。

## recipes.profile-loop

圆角扁方截面直段长圈：UI 在“快捷模型”选择“圆角扁方截面直段长圈”；AI 先 getTool({id:"quickModel"}) 查 kind=profileLoop 参数。调用 const api=window.webcad.api; const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"loop",method:"add",args:{op:"quickModel",refs:[],params:{kind:"profileLoop",innerWidth:35.2,innerHeight:14.6,sectionWidth:5.5,sectionDepth:6,sectionRadius:2.5}}},{id:"size",method:"measure",args:{bodyId:{$ref:"loop.createdBodyIds.0"}}}]})。内宽>内高>0；sectionWidth 为正面料宽，sectionDepth 为侧面总厚，sectionRadius 是截面 R，0<R≤min(宽,厚)/2，全部单位 mm。R 等于短边一半时用两半圆加直段构造截面，避免圆角矩形草图退化。中心路径为上下直段加两端半圆；外宽=内宽+2×料宽，外高=内高+2×料宽。PG3195 名义参数得 46.2×25.6×6 mm、约 2883.597260 mm³；独立 text-to-cad STEP 体积约 2883.597257。PG10669 参数为内51×15、sectionWidth4、sectionDepth8、sectionRadius2，名义实体59×23×8 mm；侧视细部和源曲面尚未逐线核对。别把厚 6 当 Ø6 圆线、别把跑道形误认为真椭圆。读批次回执、测量和 rendered revision；失败整步回滚，feature.edit 可修改参数。

## recipes.reference-reconstruction

读取 info()/getState() 后，搜索 referenceExtrude/referenceLoft 并读工具卡。已有 planeSection 与 faceBoundary 提供精确参考线框。referenceExtrude 接收一个平面闭合线框或单张带孔平面面，params:{direction:[0,0,1],distance:3}；散边多环不猜孔关系。referenceLoft 按 refs 顺序使用 2–12 个平面单闭环截面，params:{ruled:false}。结果均保留原参考对象；STEP 导出应显式传新实体 ids。可先平移/复制一个参考截面再放样。不自动补缺边，不提高公差来强行闭合。参考驱动的成体不等同从零参数化重建，放样的截面间形状必须对照源件验证。静态版仍无直接 IGES 转换器，离线开发检查的 OCP 不属于产品运行依赖。

## recipes.ring-bar

圆环内接横杆：UI 在快捷模型中选“圆环内接横杆”；AI 用 getTool({id:"quickModel"}) 找 kind=ringBar 的参数卡。先用 const {revision,...identity}=getState().context 分离当前身份与版本，再调用 api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"ring",method:"add",args:{op:"quickModel",refs:[],params:{kind:"ringBar",section:"round",innerDiameter:20,sectionSize:3,barDiameter:2,barOffset:0,barDepthOffset:0}}},{id:"size",method:"measure",args:{bodyId:{$ref:"ring.createdBodyIds.0"}}}]})。读取每步回执、新 revision 和 rendered revision。内径为孔的名义直径，外径=内径+2×截面尺寸；横杆沿 X，barOffset 是 Y 偏移，barDepthOffset 是相对环中面的 Z 错层，默认 0。还支持 section:"square" 和 0<sectionRadius<sectionSize/2。约束：内径≥4×截面尺寸、0<杆径≤截面尺寸、杆必须在孔内、abs(barDepthOffset)<(sectionSize+barDiameter)/2 才能交叠。PG10225/PG10226 的 Ø5 框与杆用错层 4 mm 可建 9 mm 总深的单实体名义轮廓，但源图 R1.5 接头、背面端部和制造表面未复刻，不能宣称完整产品。只适用固定单横杆；活动件、多个横杆和真实源图未标注的尺寸需分别建模。历史参数通过 feature.edit 修改。

## recipes.round-wire-slider

圆线日字扣外观候选：UI 选择“快捷模型 → 日字扣”，AI 先读 getTool({id:'quickModel'}) 的 kind=sliderBuckle 参数卡。const api=window.webcad.api;const {revision,...identity}=api.getState().context;const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'frame',method:'add',args:{op:'quickModel',refs:[],params:{kind:'sliderBuckle',section:'round',innerWidth:45,innerHeight:20,innerRadius:7,sectionSize:5,barDiameter:5,barOffset:0,gapWidth:0}}},{id:'size',method:'measure',args:{bodyId:{$ref:'frame.createdBodyIds.0'}}}]});检查 result.status、measure.solidCount、bounds、volume，并等 getState().display.rendered.revision 与新 revision 一致。PG8570 源 DWG 标内 45×20、外 55×30、框 Ø5；上述一体单实体候选实测 55×30×5 mm、3523.416492 mm³。innerRadius=7 是外观试拟，源上下边轻微鼓弧尚未复刻；侧视 4.3 的指向和中杆真实截面尚未完全消歧，不能把圆杆假设当源实体精确复原。若设 innerRadius=8 且 barDiameter=5，横杆端落在弯角区，工具返回 GEOMETRY_INVALID 且不提交。适用闭合圆线外框与固定中杆，不适用平板双窗或可动杆；历史可 feature.edit，失败时须调整源证实的参数而非放宽几何约束。

## recipes.rounded-flat-frame

圆边独立 R 框：UI 在“快捷模型”选择“圆边独立 R 平面框”；AI 先 getTool({id:"quickModel"}) 查 kind=roundedFlatFrame 的当前参数卡。用 const {revision,...identity}=getState().context，再 api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"frame",method:"add",args:{op:"quickModel",refs:[],params:{kind:"roundedFlatFrame",outerWidth:48,outerHeight:28,innerWidth:40,innerHeight:20,outerRadius:5,innerRadius:1.5,thickness:4,edgeRadius:1.9}}},{id:"size",method:"measure",args:{bodyId:{$ref:"frame.createdBodyIds.0"}}}]})。一个可编辑历史特征先生成独立内外 R 闭合框，再对所有尖锐边一次倒圆。参数要求真实内外轮廓不相交、0<edgeRadius≤thickness/2；任一尖边无法完成则整步不提交，不缩小输入 R。PG8016/PG8017 型尺寸在 R1.9 mm 下内核通过；R2 mm 在这些测试中被拒绝，故 R1.9 是外观近似，不等于精确半圆截面或原件全面验收。PG3213 可设外42×23、内30×11、外R6/内R1.5、厚6、整件圆边R2.9，精确测量42×23×6 mm、2923.414344 mm³；R3内核拒绝，不能称精确Ø6截面。其直边料宽6而外内角R差4.5，不满足恒截面扫掠的同心偏置，需保留独立内外R。读取批次回执、精确体积和 rendered revision；后续用 feature.edit 修改同一特征的参数。

## recipes.segmented-curve-sweep

连续线弧圆线：先 getTool({id:'curveSweep'}) 获取当前参数卡。pathType:'segments' 接受 2–64 个有序段，每段 {type:'line',points:[起点XYZ,终点XYZ]} 或 {type:'arc',points:[起点XYZ,弧中XYZ,终点XYZ]}；相邻端点误差必须≤0.000001 mm，整条路径须开放，圆弧三点不能共线。radius 是圆截面半径（mm）。示例：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const segments=[{type:'line',points:[[0,0,0],[1,0,0]]},{type:'arc',points:[[1,0,0],[2,1,0],[1,2,0]]},{type:'line',points:[[1,2,0],[0,2,0]]}];const r=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'wire',method:'add',args:{op:'curveSweep',refs:[],params:{pathType:'segments',segments,radius:0.2}}},{id:'size',method:'measure',args:{bodyId:{$ref:'wire.createdBodyIds.0'}}}]});检查逐步 status、measure 的 solidCount/体积、getState().display.rendered.revision。此模式用连续解析线弧的精确 BRep 扫掠及 transformed 过渡，内核拓扑无效则整步拒绝；不从正视轮廓自动猜三维中心线、截面或端头。源图 PG8061 的成对同心弧可用于计算候选中心路径，但源端部 R0.8 与完整三维端面仍需另验。历史中可用 feature.edit 修改整段数组或 radius。

## recipes.small-twin-window

小双窗扣外观候选：UI 选“快捷模型 → 平板双窗扣”，AI 先 getTool({id:"quickModel"}) 查 kind=twinWindowPlate 的当前参数卡。PG4307 页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"plate",method:"add",args:{op:"quickModel",refs:[],params:{kind:"twinWindowPlate",outerWidth:24,outerHeight:21,outerRadius:6,windowWidth:17,totalInnerHeight:14,windowRadius:2,barWidth:3,thickness:3.5,edgeRadius:0}}},{id:"size",method:"measure",args:{bodyId:{$ref:"plate.createdBodyIds.0"}}}]})。源图外廓标24×21、横条3、侧厚3.5；产品栏17×14作为名义内孔总范围。外R6、窗R2是从图面选择的圆角矩形试拟，源实体含 SPLINE，不能宣称与源曲线重合；真实双窗也可能有局部过渡或侧面变化。工具给一实体24×21×3.5 mm，正视双窗+横条可见；不自动添加未标边缘R。历史可 feature.edit 修改；下一步若要求更高保真，应引入源样条拟合后的闭合轮廓并核验偏差，而非继续猜圆角。读批次 status、measure、rendered revision；失败回滚。

## recipes.source-analytic-round

源线弧薄板加前后圆边：先确认产品有效正视的闭合外轮廓与每个孔、侧视板厚和边缘 R。text-to-cad/agent/tools/cad-learning/export_dxf_arc_profile.py 经 run-silent.ps1 导出 arcProfile 的 params；页面先 getTool({id:'arcProfile'}) 与 getTool({id:'autoRound'})。脚本 const api=window.webcad.api;const {revision,...identity}=api.getState().context;const r=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'profile',method:'add',args:{op:'arcProfile',refs:[],params:data.params}},{id:'rounded',method:'add',args:{op:'autoRound',refs:[{$ref:'profile.createdBodyIds.0'}],params:{radius:0.5}}},{id:'size',method:'measure',args:{bodyId:{$ref:'rounded.createdBodyIds.0'}}}]});检查每步 committed、单实体、精确测量和渲染 revision；圆边失败不缩小源 R，应保留前一步并复核局部空间。PG6217 有效视图外 LINE 97E2,97E3,97E7,97EB 与 ARC 9A99,9AA3,9AB6,9AC0；上孔 LINE 97F0,97F1,97F2,97F8 与 ARC 97F4,97F5,97FE,97FF；下孔 LINE 97F9,97FA,97FB,97F3 与 ARC 97FC,97FD,97F6,97F7。侧厚3.5、前后 R0.5；源线外宽44.8、高26.646181，图面名义高26.6，保留差0.046181 mm。该流程为可编辑的两个历史特征，适合源 LINE/ARC 清晰的等厚薄板，不适用圆线截面、变深或来源散乱的 DXF。

## recipes.source-arc-band-profile

PG5752 B 件源线弧带板：先在有效工程视图选 B 件，不混 A 件。DXF 外 ARC 52E(R20)、532(R15) 与端 LINE 52F、530；两只通孔 CIRCLE 579、57A(R1.15)，板厚5。text-to-cad 下用 run-silent.ps1 调用 export_dxf_arc_profile.py，传 --dxf 源 DXF、--output agent/temp 下 JSON、--outer 52E,532,52F,530、--hole 579、--hole 57A、--height 5、--join 0.05。默认0.01会正确拒绝源内弧与端线约0.040002 mm 缝；0.05 为明确修缝容差，导出器保留原 ARC 三点并只把邻接 LINE 端点吸附到弧端，JSON 与 params.source 记录 maxJoinGapMm 和 joinStrategy。AI 先读 getTool({id:'arcProfile'})，再用 const api=window.webcad.api;const {revision,...identity}=api.getState().context;const r=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'part',method:'add',args:{op:'arcProfile',refs:[],params:data.params}},{id:'size',method:'measure',args:{bodyId:{$ref:'part.createdBodyIds.0'}}}]});检查单实体、测量和渲染 revision。另两只 R1.65 同心圆代表更大孔口轮廓，但深度未标；本配方不造沉孔、不建 A 件或装配。修缝后不称原始轮廓完全闭合或制造级复刻。

## recipes.source-faces

源件参考建模：先 queryGeometry({context,bodyId,kind:"face",filter:{surfaceType:"plane"},requireUnique:false}) 找平面。planar=true 包括解析平面和全部控制点共面（1e-7 mm）的 BSpline；geomType/surfaceType 保留源编码，不伪装成解析 PLANE。未识别的 offset/revolution 等曲面不猜成平面。面结果的 wireCount 表示边界环数；面查询只计算边邻接，不计算全部边的锐角，要查锐边请查询 kind:"edge"。按面积、中心与法向选定当前 faceId，再 add extractFaces，params:{faceIds:[faceId]}，refs:[sourceId]；结果保留内孔并保留源对象，多个 faceIds 得到面复合体。提取结果不是实体。单张平面可再 referenceExtrude，指定世界 direction 与 distance；多截面可 referenceLoft。闭合轮廓端点偏差超过 1e-7 mm 会拒绝，即使源文件带闭合标志也不会自动补缝。识别成几何平面不代表 faceHole/faceExtrude 接受 BSpline 编码；这两个工具仍要求解析平面。所有结果仍须对照源件，局部成体、参考面加厚都不能计作完整产品重建。多壳源件先 sewFaces({tolerance:0.01,makeSolid:false})，从 getState().bodies 或 measure 读 shellCount，再 extractShell({shellIndex:0}) 提取当前零起始序号的壳（保留源对象）。按提取结果的边界、位置和尺寸识别部件，必要时 feature.edit 修改 shellIndex；重建可能重排序号，必须重新核对。已确认独立且闭合的壳可单独 sewFaces({tolerance:0.01,makeSolid:true})；开放壳报错，不自动补洞；内外嵌套壳可能表示空腔，不能逐壳实心化后当作原产品。缝合/提壳属于源件恢复，不是参数化产品重建。

## recipes.source-round-rect

源图内外角可校验的圆线方框：UI 选择“快捷模型 → 方扣”，AI 先读 getTool({id:'quickModel'}) 的 kind=rectBuckle 参数卡。对任一图，先核外宽-内宽=外高-内高=2×线径，外角R-内角R=线径，侧视截面为同一圆线且闭合；不满足任一条件时不要套此配方。PG7440 的有效正视闭合多段线给外33×23、内25×15、外角R4.5、内角R0.5，侧视圆端R2，故可取线径4。页面脚本：const api=window.webcad.api;const {revision,...identity}=api.getState().context;const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:'frame',method:'add',args:{op:'quickModel',refs:[],params:{kind:'rectBuckle',section:'round',innerWidth:25,innerHeight:15,innerRadius:0.5,sectionSize:4,gapWidth:0}}},{id:'size',method:'measure',args:{bodyId:{$ref:'frame.createdBodyIds.0'}}}]});检查 status、solidCount、bounds、volume，再核 getState().display.rendered.revision。实测单实体33×23×4 mm，1152.436255 mm³；体积与圆截面积 π×2² 乘圆角中心路径长度 76+5π 一致。该几何复现正视理想圆弧与圆截面；图面未说明的接缝、局部表面和制造过渡仍须单独核验。历史用 feature.edit 修订，失败不提交。

## recipes.twin-window-plate

平板双窗扣：UI 在“快捷模型”选择“平板双窗扣”；AI 从 getTool({id:"quickModel"}) 查 kind=twinWindowPlate 参数。PG6217 图纸名义例：const {revision,...identity}=api.getState().context; await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"plate",method:"add",args:{op:"quickModel",refs:[],params:{kind:"twinWindowPlate",outerWidth:44.8,outerHeight:26.6,outerRadius:3.5,windowWidth:37.8,totalInnerHeight:19.6,windowRadius:2,barWidth:3.5,thickness:3.5,edgeRadius:0.5}}},{id:"size",method:"measure",args:{bodyId:{$ref:"plate.createdBodyIds.0"}}}]})。两孔等高=(totalInnerHeight-barWidth)/2=8.05，孔中心 Y=±(totalInnerHeight+barWidth)/4；横条是板体，不是圆杆。outerRadius/windowRadius 为 XY 平面角半径，edgeRadius 为前后尖边截面 R。约束：外宽>孔宽，外高>总内高>横条宽>0，平面 R 严格小于相应短边一半，2*edgeRadius 严格小于板厚、横条宽和最窄框壁；R=0 可做未倒边板。任何切孔或倒边失败时整步不提交，不自动缩小半径。成功读步骤回执、精确测量和 rendered revision；feature.edit 可改这一历史特征。只适用平板对称双窗；PG6217 产品照片外角比该 DWG 名义 R3.5 尖，版本仍待确认。鼓侧边、侧向拱弯、偏置孔及独立杆不属于此模板。

## recipes.u-end-hole-plate

半圆冠双端孔 U 板：UI 在快捷模型中选择同名工具；AI 先 getTool({id:"quickModel"}) 读取 kind=uEndHolePlate 参数。页面脚本 const api=window.webcad.api; const {revision,...identity}=api.getState().context; const result=await api.run({context:{...identity,expectedRevision:revision},idempotencyKey:crypto.randomUUID(),steps:[{id:"partA",method:"add",args:{op:"quickModel",refs:[],params:{kind:"uEndHolePlate",outerWidth:22,innerWidth:10,totalHeight:31.7,thickness:3,holeDiameter:3.3,holeInset:2.7}}},{id:"size",method:"measure",args:{bodyId:{$ref:"partA.createdBodyIds.0"}}}]})。内外冠同心且均为半圆，两条直腿等宽、两端通孔沿 Z 贯穿。孔心 X=±(outerWidth+innerWidth)/4，Y 自端面向冠方向量 holeInset。限制 outerWidth>innerWidth>0、totalHeight>outerWidth/2、thickness>0、0<holeDiameter<(outerWidth-innerWidth)/2，孔与端面、冠保持净距；非法输入失败回滚。PG11804 A 件图面外宽22、内宽10、总高31.7、侧深3、孔位标注2-Ø3.3，另有2-M2标注；holeInset=2.7 是试拟，通孔不能代表真实攻牙。B 件和装配、局部圆润截面未建。读结果 status、精确 measure 和 rendered revision；历史修改用 feature.edit。

## start

WebCAD 页面自动化入口：window.webcad.api.connect({queries:[能力关键词]})。优先读取精简状态和搜索结果，再 getTools({ids}) 批量读取契约，详见 api.discovery。先读 automation/quickstart.md 或 readDocs({docId:"api.run"})，通过页面脚本调用 run 批次；AI 应通过宿主已授权的页面脚本通道在后台调用 window.webcad.api。不要为查工具或执行建模打开 JSON 调试面板、填输入框或点击执行按钮。没有可用脚本通道时，明确报告通道不可用；不要自动退回界面操作。 宿主通道发现见 api.connection。无需终端 CLI。读取当前页面的 info()/getState()，再用 searchTools({query:"安装板"})、getTool({id:"box"})、readDocs({docId:"coordinates"}) 查询契约。当前页面的建模、文件和视图操作由页面 API 调用浏览器 Worker 中的精确内核。
页面 JS 执行通道必须由调用客户端提供并获用户授权；页面公开函数不证明某个侧边栏已能调用。建模写入须传当前 sessionId、documentId、documentInstanceId、expectedRevision，不能猜 revision。页面方法不接收任意脚本源码、任意 URL 或本地路径。

## 工具 advancedLoft · Solid or open shell through hand-defined XY sections

```json
{
  "id": "advancedLoft",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "sections": {
        "type": "array",
        "minItems": 2,
        "maxItems": 12,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "z",
            "points"
          ],
          "properties": {
            "z": {
              "type": "number"
            },
            "points": {
              "type": "array",
              "minItems": 3,
              "maxItems": 64,
              "items": {
                "type": "array",
                "items": {
                  "type": "number"
                },
                "minItems": 2,
                "maxItems": 2
              }
            }
          }
        }
      },
      "ruled": {
        "type": "boolean"
      },
      "output": {
        "type": "string",
        "enum": [
          "solid",
          "shell"
        ]
      }
    },
    "required": [
      "sections"
    ],
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Z must increase. Same vertex count, winding and corresponding start vertex. Default smooth solid. Shell has no caps and is not a closed solid.",
  "title": "Solid or open shell through hand-defined XY sections",
  "category": "surface",
  "synonyms": [
    "advancedLoft",
    "高级放样"
  ],
  "description": "Solid or open shell through hand-defined XY sections",
  "schemaHash": "sha256:eaa15b48474e993f48c4cefaba0125b4a49db7db4ae483899b2766b3e6a50cc1",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "shell",
    "face (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Z must increase. Same vertex count, winding and corresponding start vertex. Default smooth solid. Shell has no caps and is not a closed solid."
  ],
  "minimalExample": {
    "op": "advancedLoft",
    "params": {
      "sections": [
        {
          "z": 0,
          "points": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        },
        {
          "z": 10,
          "points": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        }
      ]
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "advancedLoft",
    "params": {
      "sections": [
        {
          "z": 0,
          "points": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        },
        {
          "z": 10,
          "points": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        }
      ]
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "高级放样",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:2283b9246731bf3472c6b04a326ad214bb982e4ea227c9a041826cb97cd29d6e"
}
```

## 工具 arcProfile · Extrude exact closed XY LINE/ARC boundaries with optional holes

```json
{
  "id": "arcProfile",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "outer",
      "height"
    ],
    "properties": {
      "outer": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "type",
            "points"
          ],
          "properties": {
            "type": {
              "type": "string",
              "description": "Exact edge type",
              "enum": [
                "line",
                "arc"
              ]
            },
            "points": {
              "type": "array",
              "items": {
                "type": "array",
                "items": {
                  "type": "number"
                },
                "minItems": 2,
                "maxItems": 2,
                "description": "XY coordinate in mm"
              },
              "minItems": 2,
              "maxItems": 3
            }
          }
        },
        "minItems": 2,
        "maxItems": 128
      },
      "holes": {
        "type": "array",
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "points"
            ],
            "properties": {
              "type": {
                "type": "string",
                "description": "Exact edge type",
                "enum": [
                  "line",
                  "arc"
                ]
              },
              "points": {
                "type": "array",
                "items": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  },
                  "minItems": 2,
                  "maxItems": 2,
                  "description": "XY coordinate in mm"
                },
                "minItems": 2,
                "maxItems": 3
              }
            }
          },
          "minItems": 2,
          "maxItems": 128
        },
        "maxItems": 16
      },
      "height": {
        "type": "number",
        "description": "Signed nonzero Z extrusion (mm)"
      },
      "source": {
        "type": "object"
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Ordered line start/end or arc start/middle/end XY points. Each adjacent endpoint and closure must agree within 0.000001 mm. Output is one exact BRep solid; holes must remove material. Supports XY only, constant Z depth, no spline, variable thickness or source-DXF auto selection. Invalid topology rejects the step.",
  "title": "Extrude exact closed XY LINE/ARC boundaries with optional holes",
  "category": "creation",
  "synonyms": [
    "arcProfile",
    "解析线弧轮廓"
  ],
  "description": "Extrude exact closed XY LINE/ARC boundaries with optional holes",
  "schemaHash": "sha256:0444170c6454f0deb8129a2a979c255e394578513f067cfbf6c70a1c801ea754",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Ordered line start/end or arc start/middle/end XY points. Each adjacent endpoint and closure must agree within 0.000001 mm. Output is one exact BRep solid; holes must remove material. Supports XY only, constant Z depth, no spline, variable thickness or source-DXF auto selection. Invalid topology rejects the step."
  ],
  "minimalExample": {
    "op": "arcProfile",
    "params": {
      "outer": [
        {
          "type": "line",
          "points": [
            [
              0,
              0
            ],
            [
              10,
              0
            ]
          ]
        },
        {
          "type": "line",
          "points": [
            [
              10,
              0
            ],
            [
              10,
              5
            ]
          ]
        },
        {
          "type": "line",
          "points": [
            [
              10,
              5
            ],
            [
              0,
              5
            ]
          ]
        },
        {
          "type": "line",
          "points": [
            [
              0,
              5
            ],
            [
              0,
              0
            ]
          ]
        }
      ],
      "height": 2
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "arcProfile",
    "params": {
      "outer": [
        {
          "type": "line",
          "points": [
            [
              0,
              0
            ],
            [
              10,
              0
            ]
          ]
        },
        {
          "type": "line",
          "points": [
            [
              10,
              0
            ],
            [
              10,
              5
            ]
          ]
        },
        {
          "type": "line",
          "points": [
            [
              10,
              5
            ],
            [
              0,
              5
            ]
          ]
        },
        {
          "type": "line",
          "points": [
            [
              0,
              5
            ],
            [
              0,
              0
            ]
          ]
        }
      ],
      "height": 2
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "解析线弧轮廓",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:ca79a9ddeef0a619fa6b28cb59030226dde1aed51df1fd59d14cc59c70c47b93"
}
```

## 工具 autoRound · 整件圆边 / Round every sharp edge of one solid

```json
{
  "id": "autoRound",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "radius": {
        "type": "number",
        "description": "Uniform exact radius in mm (mm)",
        "exclusiveMinimum": 0
      }
    },
    "required": [
      "radius"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Detect every sharp edge including holes and lettering, skip tangent seams and solve together. Fail atomically if any required edge cannot be rounded. No automatic smaller radius or partial success. Edit radius in the same feature to rebuild from its source, not the already-rounded result.",
  "title": "整件圆边 / Round every sharp edge of one solid",
  "category": "modification",
  "synonyms": [
    "autoRound",
    "整件圆边"
  ],
  "description": "整件圆边 / Round every sharp edge of one solid",
  "schemaHash": "sha256:ff0d4d81af0d18ade309f8da29ad806e75747493087eb505a5d9d36893bd47bb",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Detect every sharp edge including holes and lettering, skip tangent seams and solve together. Fail atomically if any required edge cannot be rounded. No automatic smaller radius or partial success. Edit radius in the same feature to rebuild from its source, not the already-rounded result."
  ],
  "minimalExample": {
    "op": "autoRound",
    "params": {
      "radius": 0.1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "autoRound",
    "params": {
      "radius": 0.1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "radius": 0.1,
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "整件圆边",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:1118af9792eea3f68d1c3c735164ff34ea707041ffbfade0f0b7b3e21d939407"
}
```

## 工具 box · Box from [0,0,0] to [width,depth,height]

```json
{
  "id": "box",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "width": {
        "type": "number",
        "description": "Width (mm)",
        "exclusiveMinimum": 0
      },
      "depth": {
        "type": "number",
        "description": "Depth (mm)",
        "exclusiveMinimum": 0
      },
      "height": {
        "type": "number",
        "description": "Height (mm)",
        "exclusiveMinimum": 0
      }
    },
    "required": [
      "width",
      "depth",
      "height"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "World [0,0,0] to [width,depth,height], all in mm.",
  "title": "Box from [0,0,0] to [width,depth,height]",
  "category": "creation",
  "synonyms": [
    "长方体",
    "安装板",
    "plate"
  ],
  "description": "Box from [0,0,0] to [width,depth,height]",
  "schemaHash": "sha256:943047a54224d6d94371866e96e2801f75e757da9978f9cdb69d8916306ca10b",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Box from [0,0,0] to [width,depth,height]"
  ],
  "minimalExample": {
    "op": "box",
    "params": {
      "width": 50,
      "depth": 30,
      "height": 3
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "box",
    "params": {
      "width": 50,
      "depth": 30,
      "height": 3
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "width": -1,
        "depth": 30,
        "height": 3
      },
      "errorCode": "PARAM_RANGE_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [
    "recipes.mounting-plate"
  ],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "长方体",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "bottom-center",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Strict v2 validation applies.",
  "docsHash": "sha256:1a5c42c44adaba15d925bf79ce66bdc3bc9dc8dc2dd0bcf8c9dfa8e9d6d6cb35"
}
```

## 工具 chamfer · Chamfer selected edges, face boundaries, or all body edges

```json
{
  "id": "chamfer",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "distance": {
        "type": "number",
        "description": "Chamfer distance (mm)",
        "exclusiveMinimum": 0
      },
      "edgeIds": {
        "type": "array",
        "items": {
          "type": "integer",
          "description": "Zero-based topology index",
          "minimum": 0
        },
        "minItems": 1,
        "uniqueItems": true
      },
      "faceIds": {
        "type": "array",
        "items": {
          "type": "integer",
          "description": "Zero-based topology index",
          "minimum": 0
        },
        "minItems": 1,
        "uniqueItems": true
      },
      "allEdges": {
        "type": "boolean",
        "description": "Explicitly process all body edges"
      }
    },
    "required": [
      "distance"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "anyOf": [
      {
        "required": [
          "edgeIds"
        ]
      },
      {
        "required": [
          "faceIds"
        ]
      },
      {
        "required": [
          "allEdges"
        ],
        "properties": {
          "allEdges": {
            "const": true
          }
        }
      }
    ]
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": true,
    "kind": "edge",
    "location": "args.selectionToken",
    "featureAddOnly": true,
    "conflictsWith": [
      "faceId",
      "faceIds",
      "edgeIds",
      "allEdges"
    ],
    "phases": "Validate user params with phase=input and selectionToken, resolve against current snapshot, then validate complete params with phase=resolved."
  },
  "editRule": "On edit, patch edgeIds or faceIds selects that exact current topology scope and removes the other scope. Patch allEdges=true selects all body edges. Supplying multiple scopes in one patch conflicts. Amount is merged from existing params.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Choose exactly one scope: nonempty edgeIds, nonempty faceIds (all boundary edges of those exact current faces, including holes), or allEdges=true. No automatic distance reduction.",
  "title": "Chamfer selected edges, face boundaries, or all body edges",
  "category": "modification",
  "synonyms": [
    "倒角"
  ],
  "description": "Chamfer selected edges, face boundaries, or all body edges",
  "schemaHash": "sha256:ee7dd4d3e267c71eb45063c643efbb49fcfcbf58d1e4dc206bf329f6f252fd40",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision.",
    "Resolve topology against the current snapshot; do not reuse indices across revisions."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Choose exactly one scope: nonempty edgeIds, nonempty faceIds (all boundary edges of those exact current faces, including holes), or allEdges=true. No automatic distance reduction."
  ],
  "minimalExample": {
    "op": "chamfer",
    "params": {
      "distance": 0.5,
      "edgeIds": [
        0
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "chamfer",
    "params": {
      "distance": 0.5,
      "edgeIds": [
        0
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "distance": 0.5,
        "edgeIds": [
          0
        ],
        "allEdges": true
      },
      "errorCode": "SELECTION_CONFLICT",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID",
    "SELECTION_CONFLICT",
    "STALE_REFERENCE",
    "UNSAFE_LEGACY_REFERENCE"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "倒角",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:d626df45b49b0c2dbbda5f9b28ddf838d404b174484e50634c9009bc003aba38"
}
```

## 工具 circularPattern · Rotated copies as one compound

```json
{
  "id": "circularPattern",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "count": {
        "type": "integer",
        "description": "Count including original",
        "minimum": 2,
        "maximum": 100
      },
      "angle": {
        "type": "number",
        "description": "Degrees",
        "exclusiveMinimum": 0,
        "maximum": 360
      },
      "axis": {
        "type": "string",
        "description": "Global axis",
        "enum": [
          "X",
          "Y",
          "Z"
        ]
      },
      "cx": {
        "type": "number",
        "description": "Axis center X (mm)"
      },
      "cy": {
        "type": "number",
        "description": "Axis center Y (mm)"
      },
      "cz": {
        "type": "number",
        "description": "Axis center Z (mm)"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Defaults count=3,angle=360,axis=Z,center=origin. Full circle excludes duplicate endpoint; partial angle includes both endpoints.",
  "title": "Rotated copies as one compound",
  "category": "organization",
  "synonyms": [
    "circularPattern",
    "环形阵列"
  ],
  "description": "Rotated copies as one compound",
  "schemaHash": "sha256:2e9b193edc844517db95f928da31f30722c02c3ff1376309bf2d7ac19bd208d6",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Defaults count=3,angle=360,axis=Z,center=origin. Full circle excludes duplicate endpoint; partial angle includes both endpoints."
  ],
  "minimalExample": {
    "op": "circularPattern",
    "params": {
      "count": 3,
      "angle": 360,
      "axis": "Z"
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "circularPattern",
    "params": {
      "count": 3,
      "angle": 360,
      "axis": "Z"
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "环形阵列",
  "placementPolicy": {
    "mode": "spatial-operation",
    "placementSupported": true,
    "originUsage": "axis-plane-pivot-or-vector",
    "orientationUsage": "declared-transform-or-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:ca72e651d93d723094d277ef735d1eb21c4a40642f3efd97dad4092fae240591"
}
```

## 工具 cone · Cone/frustum along +Z

```json
{
  "id": "cone",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "radius1": {
        "type": "number",
        "description": "Bottom radius (mm)",
        "minimum": 0
      },
      "radius2": {
        "type": "number",
        "description": "Top radius (mm)",
        "minimum": 0
      },
      "height": {
        "type": "number",
        "description": "Height (mm)",
        "exclusiveMinimum": 0
      }
    },
    "required": [
      "height"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. At least one radius >0. Defaults radius1=10,radius2=0.",
  "title": "Cone/frustum along +Z",
  "category": "creation",
  "synonyms": [
    "cone",
    "圆锥"
  ],
  "description": "Cone/frustum along +Z",
  "schemaHash": "sha256:5f2672471f50436aea8fb78de99db9d7d0d357995436a69f90f6a573e51e58a5",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "At least one radius >0. Defaults radius1=10,radius2=0."
  ],
  "minimalExample": {
    "op": "cone",
    "params": {
      "radius1": 10,
      "radius2": 0,
      "height": 20
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "cone",
    "params": {
      "radius1": 10,
      "radius2": 0,
      "height": 20
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "圆锥",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "bottom-center",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:154d0e8a2a5d72f1876f296edb299d23249f9154caf9ce5c301dd0b0ba23487d"
}
```

## 工具 copy · Copy with scale, rotation and translation

```json
{
  "id": "copy",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "positionMode": {
        "type": "string",
        "description": "relative offset or absolute bounding-box center after rotation/scaling",
        "enum": [
          "relative",
          "absolute"
        ]
      },
      "x": {
        "type": "number",
        "description": "X translation (mm)"
      },
      "y": {
        "type": "number",
        "description": "Y translation (mm)"
      },
      "z": {
        "type": "number",
        "description": "Z translation (mm)"
      },
      "rx": {
        "type": "number",
        "description": "X rotation (degrees)"
      },
      "ry": {
        "type": "number",
        "description": "Y rotation (degrees)"
      },
      "rz": {
        "type": "number",
        "description": "Z rotation (degrees)"
      },
      "scale": {
        "type": "number",
        "description": "Uniform dimensionless scale",
        "exclusiveMinimum": 0
      },
      "mode": {
        "type": "string",
        "description": "Explicit spatial mode",
        "enum": [
          "translate",
          "toPoint",
          "rotate",
          "scale",
          "align"
        ]
      },
      "delta": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "targetPoint": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "orientation": {
        "type": "string",
        "description": "Preserve or align to work frame",
        "enum": [
          "preserve",
          "align-frame"
        ]
      },
      "pivot": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "axisVector": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "angleDeg": {
        "type": "number",
        "description": "Signed rotation angle (degrees)"
      },
      "sourcePoint": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "sourceAxis": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "sourceUp": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "targetAxis": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "targetUp": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "axisRelation": {
        "type": "string",
        "description": "Same or opposite axis direction",
        "enum": [
          "same",
          "opposite"
        ]
      },
      "gapMm": {
        "type": "number",
        "description": "Signed gap along target axis (mm)"
      },
      "twistAngleDeg": {
        "type": "number",
        "description": "Explicit in-plane twist angle (degrees)"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Preserves original; defaults same as transform.",
  "title": "Copy with scale, rotation and translation",
  "category": "organization",
  "synonyms": [
    "copy",
    "复制"
  ],
  "description": "Copy with scale, rotation and translation",
  "schemaHash": "sha256:6ba9932df2b7e4298603b6a6ba5f03b2a8a3e1d7ee8b4eab9ce0bc0ca6af4e97",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Preserves original; defaults same as transform."
  ],
  "minimalExample": {
    "op": "copy",
    "params": {
      "x": 10
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "copy",
    "params": {
      "x": 10
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "复制",
  "placementPolicy": {
    "mode": "spatial-operation",
    "placementSupported": true,
    "originUsage": "axis-plane-pivot-or-vector",
    "orientationUsage": "declared-transform-or-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:5022f8d3b28e28afb1d5dd66b7b2edcf1aceb84131d228ea649aa129bcd66326"
}
```

## 工具 curveSweep · Sweep a round, chamfered-square or elliptical section along an arc, approximated spline or connected line/arc segments

```json
{
  "id": "curveSweep",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "pathType": {
        "type": "string",
        "enum": [
          "arc",
          "spline",
          "segments"
        ]
      },
      "points": {
        "type": "array",
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "minItems": 3,
          "maxItems": 3
        },
        "minItems": 3,
        "maxItems": 30
      },
      "segments": {
        "type": "array",
        "minItems": 2,
        "maxItems": 64,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "type",
            "points"
          ],
          "properties": {
            "type": {
              "type": "string",
              "enum": [
                "line",
                "arc"
              ]
            },
            "points": {
              "type": "array",
              "items": {
                "type": "array",
                "items": {
                  "type": "number"
                },
                "minItems": 3,
                "maxItems": 3
              },
              "minItems": 2,
              "maxItems": 3
            }
          }
        }
      },
      "radius": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "section": {
        "type": "string",
        "enum": [
          "round",
          "chamferedSquare",
          "ellipse"
        ]
      },
      "sectionSize": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "sectionChamfer": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "sectionWidth": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "sectionDepth": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "closed": {
        "type": "boolean"
      },
      "tolerance": {
        "type": "number",
        "minimum": 0.00001,
        "maximum": 0.5,
        "description": "Millimetres; default 0.01"
      }
    },
    "required": [
      "pathType"
    ],
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Arc needs exactly 3 noncollinear points. Spline approximates 3–30 ordered points. Segments use line endpoints or arc start/middle/end, with exact shared endpoints. Set closed:true only for a closed segment chain. Round requires radius; chamferedSquare needs sectionSize and sectionChamfer; ellipse needs unequal sectionWidth and sectionDepth. Non-round sections need an XY-planar path. Topology must be valid.",
  "title": "Sweep a round, chamfered-square or elliptical section along an arc, approximated spline or connected line/arc segments",
  "category": "creation",
  "synonyms": [
    "curveSweep",
    "曲线扫掠"
  ],
  "description": "Sweep a round, chamfered-square or elliptical section along an arc, approximated spline or connected line/arc segments",
  "schemaHash": "sha256:85ec07e926415deba8072b2b087af05ad111b82034351622d6bb0efca53a6ff8",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Arc needs exactly 3 noncollinear points. Spline approximates 3–30 ordered points. Segments use line endpoints or arc start/middle/end, with exact shared endpoints. Set closed:true only for a closed segment chain. Round requires radius; chamferedSquare needs sectionSize and sectionChamfer; ellipse needs unequal sectionWidth and sectionDepth. Non-round sections need an XY-planar path. Topology must be valid."
  ],
  "minimalExample": {
    "op": "curveSweep",
    "params": {
      "pathType": "arc",
      "points": [
        [
          10,
          0,
          0
        ],
        [
          7.071,
          7.071,
          0
        ],
        [
          0,
          10,
          0
        ]
      ],
      "radius": 1
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "curveSweep",
    "params": {
      "pathType": "arc",
      "points": [
        [
          10,
          0,
          0
        ],
        [
          7.071,
          7.071,
          0
        ],
        [
          0,
          10,
          0
        ]
      ],
      "radius": 1
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "曲线扫掠",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:4b315ff67ab5528ee146e409c8c17cff07bec9ffa8d8cee858005ddf2fd20c6f"
}
```

## 工具 curvedLogo · Legacy curved LOGO operation retained for historical project compatibility; use unified logo placementVersion 2 for new work

```json
{
  "id": "curvedLogo",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "faceId": {
        "type": "integer",
        "minimum": 0
      },
      "point": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3
      },
      "depth": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "scale": {
        "type": "number",
        "exclusiveMinimum": 0
      },
      "angle": {
        "type": "number"
      },
      "offsetX": {
        "type": "number"
      },
      "offsetY": {
        "type": "number"
      },
      "mirrorX": {
        "type": "boolean"
      },
      "regions": {
        "type": "array",
        "minItems": 1,
        "maxItems": 150,
        "items": {
          "type": "object",
          "required": [
            "outer"
          ],
          "properties": {
            "outer": {
              "type": "array",
              "minItems": 3,
              "maxItems": 2000,
              "items": {
                "type": "array",
                "items": {
                  "type": "number"
                },
                "minItems": 2,
                "maxItems": 2
              }
            },
            "holes": {
              "type": "array",
              "items": {
                "type": "array",
                "minItems": 3,
                "maxItems": 2000,
                "items": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  },
                  "minItems": 2,
                  "maxItems": 2
                }
              }
            }
          }
        }
      },
      "mode": {
        "type": "string",
        "enum": [
          "engrave"
        ]
      },
      "draftAngle": {
        "type": "number",
        "const": 0
      },
      "source": {
        "type": "object"
      },
      "name": {
        "type": "string"
      },
      "sizeMm": {
        "type": "array",
        "items": {
          "type": "number"
        }
      },
      "areaMm2": {
        "type": "number"
      }
    },
    "required": [
      "faceId",
      "point",
      "depth",
      "regions"
    ],
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Single closed solid. Pick a point on the face; tangent frame uses projected world X or Y. Orthographic projection of reviewed polygonal contours, then actual normal offset. Reject boundaries, holes, seams, grazing, invalid offsets and breakthrough. No emboss/draft/multi-face wrap. Imported contour approximation is retained.",
  "title": "Legacy curved LOGO operation retained for historical project compatibility; use unified logo placementVersion 2 for new work",
  "category": "surface",
  "synonyms": [
    "curvedLogo",
    "曲面 LOGO"
  ],
  "description": "Legacy curved LOGO operation retained for historical project compatibility; use unified logo placementVersion 2 for new work",
  "schemaHash": "sha256:331db68f5d80f3a60c787c67a4c569c8cbda757b2e695951c4edc395f86a94ea",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Single closed solid. Pick a point on the face; tangent frame uses projected world X or Y. Orthographic projection of reviewed polygonal contours, then actual normal offset. Reject boundaries, holes, seams, grazing, invalid offsets and breakthrough. No emboss/draft/multi-face wrap. Imported contour approximation is retained."
  ],
  "minimalExample": {
    "op": "curvedLogo",
    "params": {
      "faceId": 0,
      "point": [
        10,
        0,
        5
      ],
      "depth": 0.2,
      "regions": [
        {
          "outer": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        }
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "curvedLogo",
    "params": {
      "faceId": 0,
      "point": [
        10,
        0,
        5
      ],
      "depth": 0.2,
      "regions": [
        {
          "outer": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        }
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "曲面 LOGO",
  "placementPolicy": {
    "mode": "legacy-only",
    "placementSupported": false,
    "notApplicableReason": "Existing curved-logo entry retains legacy semantics",
    "originUsage": "legacy-geometry-only",
    "orientationUsage": "legacy-only",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:e257737d17b0a82b093a36664e35396b8a91c4187e62ea100f5b7bc1afa909e8"
}
```

## 工具 cut · Subtract other bodies from first

```json
{
  "id": "cut",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "keepTools": {
        "type": "boolean",
        "description": "Keep original tools"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 2
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. refs[0] is the explicit target; refs[1..] are tools. Optional keepTools preserves tool bodies.",
  "title": "Subtract other bodies from first",
  "category": "modification",
  "synonyms": [
    "cut",
    "相减"
  ],
  "description": "Subtract other bodies from first",
  "schemaHash": "sha256:04e2451c1117c0a2e470c79585b4ecc4a3615f8fd14e432df683e989c1cc049e",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "refs[0] is the explicit target; refs[1..] are tools. Optional keepTools preserves tool bodies."
  ],
  "minimalExample": {
    "op": "cut",
    "params": {},
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "cut",
    "params": {},
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "相减",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:75b99b24f9047ff35243995ff428d9f27ffba1e491e0c3a62040e80bb4f8b172"
}
```

## 工具 cylinder · Cylinder on +Z from origin

```json
{
  "id": "cylinder",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "radius": {
        "type": "number",
        "description": "Radius (mm)",
        "exclusiveMinimum": 0
      },
      "height": {
        "type": "number",
        "description": "Height (mm)",
        "exclusiveMinimum": 0
      }
    },
    "required": [
      "radius",
      "height"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Cylinder on +Z from origin",
  "title": "Cylinder on +Z from origin",
  "category": "creation",
  "synonyms": [
    "cylinder",
    "圆柱"
  ],
  "description": "Cylinder on +Z from origin",
  "schemaHash": "sha256:dd3943a038bca62c7883222cc436f100b0cf7695dfd9c185684fa7944d7cc432",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Cylinder on +Z from origin"
  ],
  "minimalExample": {
    "op": "cylinder",
    "params": {
      "radius": 10,
      "height": 20
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "cylinder",
    "params": {
      "radius": 10,
      "height": 20
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "圆柱",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "bottom-center",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:f34464544a2ab428cc188acd78489f81bf50c6cacdb875a9c58eba70bd9e0be5"
}
```

## 工具 draftFaces · Exact restricted four-side planar prism draft around one fixed bottom plane

```json
{
  "id": "draftFaces",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "faceIds": {
        "type": "array",
        "minItems": 4,
        "maxItems": 4,
        "uniqueItems": true,
        "items": {
          "type": "integer",
          "minimum": 0
        }
      },
      "neutralFaceId": {
        "type": "integer",
        "minimum": 0
      },
      "pullDirection": {
        "type": "array",
        "minItems": 3,
        "maxItems": 3,
        "items": {
          "type": "number"
        }
      },
      "angleDeg": {
        "type": "number",
        "description": "Draft angle degrees",
        "exclusiveMinimum": 0,
        "exclusiveMaximum": 45
      }
    },
    "required": [
      "faceIds",
      "neutralFaceId",
      "pullDirection",
      "angleDeg"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. One explicit six-plane twelve-edge single-solid prism target. Exactly all four side faces and fixed bottom must be listed. Source is not mutated; topology outside this verified subset is rejected. Preview before commit. Not a castability certification.",
  "title": "Exact restricted four-side planar prism draft around one fixed bottom plane",
  "category": "modification",
  "synonyms": [
    "draftFaces",
    "受限拔模"
  ],
  "description": "Exact restricted four-side planar prism draft around one fixed bottom plane",
  "schemaHash": "sha256:189437fbcdd292f9ab7ead4deb4e4a4def1634ff4250babcbc905f02439a94de",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "One explicit six-plane twelve-edge single-solid prism target. Exactly all four side faces and fixed bottom must be listed. Source is not mutated; topology outside this verified subset is rejected. Preview before commit. Not a castability certification."
  ],
  "minimalExample": {
    "op": "draftFaces",
    "params": {
      "faceIds": [
        0,
        1,
        2,
        3
      ],
      "neutralFaceId": 4,
      "pullDirection": [
        0,
        0,
        1
      ],
      "angleDeg": 2
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "draftFaces",
    "params": {
      "faceIds": [
        0,
        1,
        2,
        3
      ],
      "neutralFaceId": 4,
      "pullDirection": [
        0,
        0,
        1
      ],
      "angleDeg": 2
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "faceIds": [
          0,
          1,
          2,
          3
        ],
        "neutralFaceId": 4,
        "pullDirection": [
          0,
          0,
          1
        ],
        "angleDeg": 2,
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "受限拔模",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:94b652a44a31efec476cc9bcc1c30f7149c998f555e83c9cf48c5624a6015050"
}
```

## 工具 extractFaces · 先在一个实体上选择一个或多个面。faceIds 是该实体当前拓扑快照中的零起始面编号，必须非空、整数、互不重复且在范围内。单面返回保留孔环的面副本；多面返回由面副本组成的复合体。保留原对象，不缝合、不补洞、不生成实体。

```json
{
  "id": "extractFaces",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "faceIds"
    ],
    "properties": {
      "faceIds": {
        "type": "array",
        "minItems": 1,
        "uniqueItems": true,
        "items": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. 先在一个实体上选择一个或多个面。faceIds 是该实体当前拓扑快照中的零起始面编号，必须非空、整数、互不重复且在范围内。单面返回保留孔环的面副本；多面返回由面副本组成的复合体。保留原对象，不缝合、不补洞、不生成实体。",
  "title": "先在一个实体上选择一个或多个面。faceIds 是该实体当前拓扑快照中的零起始面编号，必须非空、整数、互不重复且在范围内。单面返回保留孔环的面副本；多面返回由面副本组成的复合体。保留原对象，不缝合、不补洞、不生成实体。",
  "category": "reference",
  "synonyms": [
    "extractFaces",
    "提取指定面"
  ],
  "description": "先在一个实体上选择一个或多个面。faceIds 是该实体当前拓扑快照中的零起始面编号，必须非空、整数、互不重复且在范围内。单面返回保留孔环的面副本；多面返回由面副本组成的复合体。保留原对象，不缝合、不补洞、不生成实体。",
  "schemaHash": "sha256:3ce05e65da1d2aed60d062933a42c9829a46c245a5b56658903a706dd31ed7a1",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "face",
    "compound of faces"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "先在一个实体上选择一个或多个面。faceIds 是该实体当前拓扑快照中的零起始面编号，必须非空、整数、互不重复且在范围内。单面返回保留孔环的面副本；多面返回由面副本组成的复合体。保留原对象，不缝合、不补洞、不生成实体。"
  ],
  "minimalExample": {
    "op": "extractFaces",
    "params": {
      "faceIds": [
        0
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "extractFaces",
    "params": {
      "faceIds": [
        0
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "faceIds": [
          0
        ],
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "提取指定面",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:bf59336d93e71c4ba2b9a6cb4d7cab618e35208f2b6b8ac101425bc1649ee31d"
}
```

## 工具 extractShell · 先选中包含多个壳的对象。shellIndex 是当前对象壳拓扑顺序中的零起始索引，必须是范围内整数。提取选中壳的副本并保留原对象，不自动填成实体；闭壳可单独交给曲面缝合并要求生成实体。

```json
{
  "id": "extractShell",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "shellIndex"
    ],
    "properties": {
      "shellIndex": {
        "type": "integer",
        "minimum": 0
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. 先选中包含多个壳的对象。shellIndex 是当前对象壳拓扑顺序中的零起始索引，必须是范围内整数。提取选中壳的副本并保留原对象，不自动填成实体；闭壳可单独交给曲面缝合并要求生成实体。",
  "title": "先选中包含多个壳的对象。shellIndex 是当前对象壳拓扑顺序中的零起始索引，必须是范围内整数。提取选中壳的副本并保留原对象，不自动填成实体；闭壳可单独交给曲面缝合并要求生成实体。",
  "category": "reference",
  "synonyms": [
    "extractShell",
    "提取壳"
  ],
  "description": "先选中包含多个壳的对象。shellIndex 是当前对象壳拓扑顺序中的零起始索引，必须是范围内整数。提取选中壳的副本并保留原对象，不自动填成实体；闭壳可单独交给曲面缝合并要求生成实体。",
  "schemaHash": "sha256:7ceed85e8c45961c22ba1421a0b5c9bd76d065191a1f44dca17b9475ba4dc05a",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "shell"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "先选中包含多个壳的对象。shellIndex 是当前对象壳拓扑顺序中的零起始索引，必须是范围内整数。提取选中壳的副本并保留原对象，不自动填成实体；闭壳可单独交给曲面缝合并要求生成实体。"
  ],
  "minimalExample": {
    "op": "extractShell",
    "params": {
      "shellIndex": 0
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "extractShell",
    "params": {
      "shellIndex": 0
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "shellIndex": 0,
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "提取壳",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:2fdc906016795aacca4820c4f58c2d764ac0567312d775dd3c0d196553752658"
}
```

## 工具 extractSolid · Extract one solid from a compound

```json
{
  "id": "extractSolid",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "solidIndex": {
        "type": "integer",
        "description": "Zero-based solid index",
        "minimum": 0
      },
      "keepOriginal": {
        "type": "boolean",
        "description": "Preserve source; default true"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Use body.solidCount; default index=0.",
  "title": "Extract one solid from a compound",
  "category": "organization",
  "synonyms": [
    "extractSolid",
    "提取实体"
  ],
  "description": "Extract one solid from a compound",
  "schemaHash": "sha256:ec060d7e732ae81d12aab4e030163b5ee0c5bd71ac95bf252affd0d0b6c55b92",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": "unless keepOriginal=false",
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Use body.solidCount; default index=0."
  ],
  "minimalExample": {
    "op": "extractSolid",
    "params": {
      "solidIndex": 0
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "extractSolid",
    "params": {
      "solidIndex": 0
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "提取实体",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:7a50cd47f282e560f1728f1563a4616cf7844721c76a4ae671a5a3f17dc8b3e8"
}
```

## 工具 extrude · Extrude a closed profile normal to the chosen plane

```json
{
  "id": "extrude",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "profile": {
        "type": "string",
        "description": "Closed cross-section",
        "enum": [
          "rectangle",
          "circle",
          "polygon",
          "roundedRectangle",
          "arc"
        ]
      },
      "width": {
        "type": "number",
        "description": "Width (mm)",
        "exclusiveMinimum": 0
      },
      "depth": {
        "type": "number",
        "description": "Depth (mm)",
        "exclusiveMinimum": 0
      },
      "radius": {
        "type": "number",
        "description": "Circle/arc radius (mm)",
        "exclusiveMinimum": 0
      },
      "cornerRadius": {
        "type": "number",
        "description": "Rounded rectangle corner radius; less than half shorter side (mm)",
        "exclusiveMinimum": 0
      },
      "points": {
        "type": "array",
        "minItems": 3,
        "maxItems": 1000,
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "minItems": 2,
          "maxItems": 2
        }
      },
      "startAngle": {
        "type": "number",
        "description": "Arc start (degrees)"
      },
      "endAngle": {
        "type": "number",
        "description": "Arc end (degrees); absolute span > 0 and < 360"
      },
      "closure": {
        "type": "string",
        "description": "Arc closure",
        "enum": [
          "sector",
          "segment"
        ]
      },
      "plane": {
        "type": "string",
        "description": "Global plane",
        "enum": [
          "XY",
          "XZ",
          "YZ"
        ]
      },
      "height": {
        "type": "number",
        "description": "Signed nonzero extrusion (mm)"
      }
    },
    "required": [
      "height"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Rectangle/circle are centered profiles. Polygon points are plane coordinates. Profile defaults rectangle; plane XY. Rounded rectangle and arc also supported.",
  "title": "Extrude a closed profile normal to the chosen plane",
  "category": "creation",
  "synonyms": [
    "extrude",
    "拉伸"
  ],
  "description": "Extrude a closed profile normal to the chosen plane",
  "schemaHash": "sha256:b346d48ed8dff9b71f11df69c278e10cca3d88eb1bd18ff6f24082bbbabbfc1c",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Rectangle/circle are centered profiles. Polygon points are plane coordinates. Profile defaults rectangle; plane XY. Rounded rectangle and arc also supported."
  ],
  "minimalExample": {
    "op": "extrude",
    "params": {
      "profile": "rectangle",
      "width": 20,
      "depth": 10,
      "height": 5
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "extrude",
    "params": {
      "profile": "rectangle",
      "width": 20,
      "depth": 10,
      "height": 5
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "拉伸",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:3160f3595ee6a26a940bd13d1ced3c6f8486305d47c2e3deac6bf06972e742cc"
}
```

## 工具 faceBoundary · 先选中一张面。all 提取包括内孔在内的全部边界；outer 明确只提取外环，不带孔。保留源模型，生成精确线框。单闭环可接参考轮廓拉伸/放样；带孔拉伸应使用完整平面面，不能把忽略内孔的外环当成原件。

```json
{
  "id": "faceBoundary",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "faceId"
    ],
    "properties": {
      "faceId": {
        "type": "integer",
        "minimum": 0
      },
      "boundary": {
        "type": "string",
        "enum": [
          "all",
          "outer"
        ]
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. 先选中一张面。all 提取包括内孔在内的全部边界；outer 明确只提取外环，不带孔。保留源模型，生成精确线框。单闭环可接参考轮廓拉伸/放样；带孔拉伸应使用完整平面面，不能把忽略内孔的外环当成原件。",
  "title": "先选中一张面。all 提取包括内孔在内的全部边界；outer 明确只提取外环，不带孔。保留源模型，生成精确线框。单闭环可接参考轮廓拉伸/放样；带孔拉伸应使用完整平面面，不能把忽略内孔的外环当成原件。",
  "category": "reference",
  "synonyms": [
    "faceBoundary",
    "提取面边界"
  ],
  "description": "先选中一张面。all 提取包括内孔在内的全部边界；outer 明确只提取外环，不带孔。保留源模型，生成精确线框。单闭环可接参考轮廓拉伸/放样；带孔拉伸应使用完整平面面，不能把忽略内孔的外环当成原件。",
  "schemaHash": "sha256:679809ed847814e39c84c6adb857b773d42d04a6a8cac2546340281ed50cd14e",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "curve compound"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "先选中一张面。all 提取包括内孔在内的全部边界；outer 明确只提取外环，不带孔。保留源模型，生成精确线框。单闭环可接参考轮廓拉伸/放样；带孔拉伸应使用完整平面面，不能把忽略内孔的外环当成原件。"
  ],
  "minimalExample": {
    "op": "faceBoundary",
    "params": {
      "faceId": 0
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "faceBoundary",
    "params": {
      "faceId": 0
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "提取面边界",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:e49ceb3e4ff2ff26ec4390e88dfc26c32bb6ceef5479c9fb4260001dd9c39380"
}
```

## 工具 faceExtrude · Push/pull a planar face along its normal

```json
{
  "id": "faceExtrude",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "faceId": {
        "type": "integer",
        "description": "Planar face index",
        "minimum": 0
      },
      "height": {
        "type": "number",
        "description": "Signed nonzero height (mm)"
      }
    },
    "required": [
      "faceId",
      "height"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Positive fuses outward material; negative cuts inward.",
  "title": "Push/pull a planar face along its normal",
  "category": "modification",
  "synonyms": [
    "faceExtrude",
    "面上拉伸"
  ],
  "description": "Push/pull a planar face along its normal",
  "schemaHash": "sha256:c199ff938acacd0c0abc0173c02892a41bd4d541c6105dbfc6be021125e70785",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Positive fuses outward material; negative cuts inward."
  ],
  "minimalExample": {
    "op": "faceExtrude",
    "params": {
      "faceId": 0,
      "height": 2
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "faceExtrude",
    "params": {
      "faceId": 0,
      "height": 2
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "面上拉伸",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:db523a5e530cb9bea564b40e1151783fc398f4564d1eba2acb0c7f03c3e971b9"
}
```

## 工具 faceHole · Drill inward from a planar face

```json
{
  "id": "faceHole",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "faceId": {
        "type": "integer",
        "description": "Planar face index",
        "minimum": 0
      },
      "point": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "radius": {
        "type": "number",
        "description": "Hole radius (mm)",
        "exclusiveMinimum": 0
      },
      "depth": {
        "type": "number",
        "description": "Hole depth unless through (mm)",
        "exclusiveMinimum": 0
      },
      "through": {
        "type": "boolean",
        "description": "Through body",
        "default": false
      }
    },
    "required": [
      "faceId",
      "point",
      "radius"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "anyOf": [
      {
        "required": [
          "depth"
        ]
      },
      {
        "required": [
          "through"
        ],
        "properties": {
          "through": {
            "const": true
          }
        }
      }
    ]
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {
    "through": false
  },
  "selectionTokenSupport": {
    "supported": true,
    "kind": "face",
    "location": "args.selectionToken",
    "featureAddOnly": true,
    "conflictsWith": [
      "faceId",
      "faceIds",
      "edgeIds",
      "allEdges"
    ],
    "phases": "Validate user params with phase=input and selectionToken, resolve against current snapshot, then validate complete params with phase=resolved."
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "World XYZ point on a planar face. Drill inward along the negative outward face normal. through computes depth from body bounds.",
  "title": "Drill inward from a planar face",
  "category": "modification",
  "synonyms": [
    "面钻孔",
    "贯穿",
    "面上打孔"
  ],
  "description": "Drill inward from a planar face",
  "schemaHash": "sha256:a2a2aa4113daa67cdbb938cc92a2561bddd132b510477adbf24340e5b91ad96e",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision.",
    "Resolve topology against the current snapshot; do not reuse indices across revisions."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Explicit world point required and must lie inside/on selected face; no automatic center. through=true computes sufficient depth from body bounds; otherwise supply depth."
  ],
  "minimalExample": {
    "op": "faceHole",
    "params": {
      "faceId": 0,
      "point": [
        5,
        5,
        3
      ],
      "radius": 2,
      "through": true
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "faceHole",
    "params": {
      "faceId": 0,
      "point": [
        5,
        5,
        3
      ],
      "radius": 2,
      "through": true
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "faceId": 0,
        "point": [
          5,
          5,
          3
        ],
        "radius": 2,
        "through": true,
        "diameter": 4
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID",
    "SELECTION_CONFLICT",
    "STALE_REFERENCE",
    "UNSAFE_LEGACY_REFERENCE",
    "NO_MATERIAL_REMOVED"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "面上打孔",
  "placementPolicy": {
    "mode": "target-face",
    "placementSupported": true,
    "originUsage": "target-face-point",
    "orientationUsage": "face-compatible-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Strict v2 validation applies.",
  "docsHash": "sha256:3a786504736b0901c22a36c24ea7439bd70d3dacfd641fa48eeaa25c8d3b74be"
}
```

## 工具 fillet · Round selected edges, all boundary edges of selected faces, or all body edges

```json
{
  "id": "fillet",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "radius": {
        "type": "number",
        "description": "Fillet radius (mm)",
        "exclusiveMinimum": 0
      },
      "edgeIds": {
        "type": "array",
        "items": {
          "type": "integer",
          "description": "Zero-based topology index",
          "minimum": 0
        },
        "minItems": 1,
        "uniqueItems": true
      },
      "faceIds": {
        "type": "array",
        "items": {
          "type": "integer",
          "description": "Zero-based topology index",
          "minimum": 0
        },
        "minItems": 1,
        "uniqueItems": true
      },
      "allEdges": {
        "type": "boolean",
        "description": "Explicitly process all body edges"
      }
    },
    "required": [
      "radius"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "anyOf": [
      {
        "required": [
          "edgeIds"
        ]
      },
      {
        "required": [
          "faceIds"
        ]
      },
      {
        "required": [
          "allEdges"
        ],
        "properties": {
          "allEdges": {
            "const": true
          }
        }
      }
    ]
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": true,
    "kind": "edge",
    "location": "args.selectionToken",
    "featureAddOnly": true,
    "conflictsWith": [
      "faceId",
      "faceIds",
      "edgeIds",
      "allEdges"
    ],
    "phases": "Validate user params with phase=input and selectionToken, resolve against current snapshot, then validate complete params with phase=resolved."
  },
  "editRule": "On edit, patch edgeIds or faceIds selects that exact current topology scope and removes the other scope. Patch allEdges=true selects all body edges. Supplying multiple scopes in one patch conflicts. Amount is merged from existing params.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Choose exactly one scope: nonempty edgeIds, nonempty faceIds (all boundary edges of those exact current faces, including holes), or allEdges=true. The radius may fail for tight corners or thin bodies; no automatic reduction.",
  "title": "Round selected edges, all boundary edges of selected faces, or all body edges",
  "category": "modification",
  "synonyms": [
    "圆角"
  ],
  "description": "Round selected edges, all boundary edges of selected faces, or all body edges",
  "schemaHash": "sha256:9042dcc1d4a2b0daaba92d913f7ac9ab1d44bc2ac39d74f1246a832fea78582c",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision.",
    "Resolve topology against the current snapshot; do not reuse indices across revisions."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Choose exactly one scope: nonempty edgeIds, nonempty faceIds (all boundary edges of those exact current faces, including holes), or allEdges=true. The radius may fail for tight corners or thin bodies; no automatic reduction."
  ],
  "minimalExample": {
    "op": "fillet",
    "params": {
      "radius": 0.5,
      "edgeIds": [
        0
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "fillet",
    "params": {
      "radius": 0.5,
      "edgeIds": [
        0
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "radius": 0.5,
        "edgeIds": [
          0
        ],
        "allEdges": true
      },
      "errorCode": "SELECTION_CONFLICT",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID",
    "SELECTION_CONFLICT",
    "STALE_REFERENCE",
    "UNSAFE_LEGACY_REFERENCE"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "圆角",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:3e31a76cb0f0b6f40d86f209bfa9900446312f4b5d965dd7d46f51a1312e5a5b"
}
```

## 工具 fittedSurface · Fit a single B-spline face to a structured point grid

```json
{
  "id": "fittedSurface",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "points": {
        "type": "array",
        "minItems": 3,
        "maxItems": 12,
        "items": {
          "type": "array",
          "minItems": 3,
          "maxItems": 12,
          "items": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "minItems": 3,
            "maxItems": 3
          }
        }
      },
      "tolerance": {
        "type": "number",
        "minimum": 0.00001,
        "maximum": 0.5,
        "description": "Millimetres; default 0.01"
      }
    },
    "required": [
      "points"
    ],
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Rectangular grid with consistent row/column correspondence, not unordered point-cloud reconstruction. Verifies point-to-face residuals. Output is one face, zero solids; thicken a selected face to obtain a solid.",
  "title": "Fit a single B-spline face to a structured point grid",
  "category": "surface",
  "synonyms": [
    "fittedSurface",
    "拟合曲面"
  ],
  "description": "Fit a single B-spline face to a structured point grid",
  "schemaHash": "sha256:39f5a52d34c74bfbd7715b2b4c3dac6cb355707dfa726a6d88335d6f98a65a3f",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "face"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Rectangular grid with consistent row/column correspondence, not unordered point-cloud reconstruction. Verifies point-to-face residuals. Output is one face, zero solids; thicken a selected face to obtain a solid."
  ],
  "minimalExample": {
    "op": "fittedSurface",
    "params": {
      "points": [
        [
          [
            0,
            0,
            0
          ],
          [
            5,
            0,
            0
          ],
          [
            10,
            0,
            0
          ]
        ],
        [
          [
            0,
            5,
            0
          ],
          [
            5,
            5,
            0
          ],
          [
            10,
            5,
            0
          ]
        ],
        [
          [
            0,
            10,
            0
          ],
          [
            5,
            10,
            0
          ],
          [
            10,
            10,
            0
          ]
        ]
      ]
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "fittedSurface",
    "params": {
      "points": [
        [
          [
            0,
            0,
            0
          ],
          [
            5,
            0,
            0
          ],
          [
            10,
            0,
            0
          ]
        ],
        [
          [
            0,
            5,
            0
          ],
          [
            5,
            5,
            0
          ],
          [
            10,
            5,
            0
          ]
        ],
        [
          [
            0,
            10,
            0
          ],
          [
            5,
            10,
            0
          ],
          [
            10,
            10,
            0
          ]
        ]
      ]
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "拟合曲面",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:eb9abb0ee51793bb43cda6a651c0c1f1e233833913833dc06484b051a0bd9a96"
}
```

## 工具 group · Group bodies as a compound without fusing

```json
{
  "id": "group",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 2
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Preserves constituent solid boundaries and positions. UI explode creates separate extractSolid features in one undo transaction. Already-fused single solids cannot be ungrouped into their original components.",
  "title": "Group bodies as a compound without fusing",
  "category": "organization",
  "synonyms": [
    "group",
    "组合"
  ],
  "description": "Group bodies as a compound without fusing",
  "schemaHash": "sha256:2e464d8fd896124c014d22862b864ced9023a675a71145ca402bb47c2eb0fac0",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Preserves constituent solid boundaries and positions. UI explode creates separate extractSolid features in one undo transaction. Already-fused single solids cannot be ungrouped into their original components."
  ],
  "minimalExample": {
    "op": "group",
    "params": {},
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "group",
    "params": {},
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "组合",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:58b8486a88121524fac2477296507064c999e0bbf27b7c5e3a2f272d32a0370e"
}
```

## 工具 hole · Cylindrical cut starting at global coordinates

```json
{
  "id": "hole",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "radius": {
        "type": "number",
        "description": "Hole radius (mm)",
        "exclusiveMinimum": 0
      },
      "depth": {
        "type": "number",
        "description": "Hole depth (mm)",
        "exclusiveMinimum": 0
      },
      "x": {
        "type": "number",
        "description": "Start X (mm)",
        "default": 0
      },
      "y": {
        "type": "number",
        "description": "Start Y (mm)",
        "default": 0
      },
      "z": {
        "type": "number",
        "description": "Start Z (mm)",
        "default": 0
      },
      "axis": {
        "type": "string",
        "description": "Global axis",
        "enum": [
          "X",
          "Y",
          "Z"
        ],
        "default": "Z"
      },
      "direction": {
        "type": "number",
        "enum": [
          1,
          -1
        ],
        "default": 1
      }
    },
    "required": [
      "radius",
      "depth"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {
    "x": 0,
    "y": 0,
    "z": 0,
    "axis": "Z",
    "direction": 1
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "World XYZ cutter start, signed principal axis, radius in mm (not diameter), fixed positive depth. No through parameter.",
  "title": "Cylindrical cut starting at global coordinates",
  "category": "modification",
  "synonyms": [
    "孔",
    "钻孔",
    "radius",
    "打孔"
  ],
  "description": "Cylindrical cut starting at global coordinates",
  "schemaHash": "sha256:01c467262a03594b5d9ce4dabfca229cf3fbb9909fd3a43434a6a3c6019853f7",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Start defaults origin,axis=Z,direction=1. Must remove material."
  ],
  "minimalExample": {
    "op": "hole",
    "params": {
      "radius": 2,
      "depth": 5,
      "x": 5,
      "y": 5,
      "z": 4,
      "axis": "Z",
      "direction": -1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "hole",
    "params": {
      "radius": 2,
      "depth": 5,
      "x": 5,
      "y": 5,
      "z": 4,
      "axis": "Z",
      "direction": -1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "radius": 2,
        "depth": 5,
        "x": 5,
        "y": 5,
        "z": 4,
        "axis": "Z",
        "direction": -1,
        "diameter": 4
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID",
    "NO_MATERIAL_REMOVED"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [
    "recipes.mounting-plate"
  ],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "打孔",
  "placementPolicy": {
    "mode": "tool-frame",
    "placementSupported": true,
    "originUsage": "cutter-start-reference",
    "orientationUsage": "cutter-direction-and-cross-section",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Strict v2 validation applies.",
  "docsHash": "sha256:2cfb75a81e4f89a2246aa4b54940668fc7b72f2a7dbb65236f9c4779efdd5048"
}
```

## 工具 holeWizard · Exact plain, counterbore, or included-angle countersink hole in one feature

```json
{
  "id": "holeWizard",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "kind": {
        "type": "string",
        "description": "Hole type",
        "enum": [
          "plain",
          "counterbore",
          "countersink"
        ],
        "default": "plain"
      },
      "diameterMm": {
        "type": "number",
        "description": "Small hole diameter (mm)",
        "exclusiveMinimum": 0
      },
      "depthMm": {
        "type": "number",
        "description": "Blind hole depth (mm)",
        "exclusiveMinimum": 0
      },
      "through": {
        "type": "boolean",
        "description": "Through first body along drilling axis",
        "default": false
      },
      "recessDiameterMm": {
        "type": "number",
        "description": "Counterbore/countersink opening diameter (mm)",
        "exclusiveMinimum": 0
      },
      "recessDepthMm": {
        "type": "number",
        "description": "Counterbore depth (mm)",
        "exclusiveMinimum": 0
      },
      "includedAngleDeg": {
        "type": "number",
        "description": "Countersink included angle in degrees",
        "exclusiveMinimum": 0,
        "exclusiveMaximum": 179
      },
      "x": {
        "type": "number",
        "description": "Cutter entrance X (mm)"
      },
      "y": {
        "type": "number",
        "description": "Cutter entrance Y (mm)"
      },
      "z": {
        "type": "number",
        "description": "Cutter entrance Z (mm)"
      },
      "axis": {
        "type": "string",
        "description": "Global axis",
        "enum": [
          "X",
          "Y",
          "Z"
        ],
        "default": "Z"
      },
      "direction": {
        "type": "number",
        "enum": [
          1,
          -1
        ],
        "default": 1
      }
    },
    "required": [
      "kind",
      "diameterMm",
      "through",
      "x",
      "y",
      "z"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {
    "kind": "plain",
    "axis": "Z",
    "direction": 1,
    "through": false
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. One current solid target. Start point must lie on the boundary and direction enter continuous material. Blind depth must stop before its first exit. Counterbore uses recessDepthMm; countersink derives depth (D-d)/(2*tan(includedAngle/2)). No modeled thread geometry.",
  "title": "Exact plain, counterbore, or included-angle countersink hole in one feature",
  "category": "modification",
  "synonyms": [
    "holeWizard",
    "孔向导"
  ],
  "description": "Exact plain, counterbore, or included-angle countersink hole in one feature",
  "schemaHash": "sha256:2cc8457e64372f9f6edc394e8289acaefc6cee0c70f349d612354a64c787c84d",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "One current solid target. Start point must lie on the boundary and direction enter continuous material. Blind depth must stop before its first exit. Counterbore uses recessDepthMm; countersink derives depth (D-d)/(2*tan(includedAngle/2)). No modeled thread geometry."
  ],
  "minimalExample": {
    "op": "holeWizard",
    "params": {
      "kind": "counterbore",
      "diameterMm": 4,
      "depthMm": 6,
      "through": false,
      "recessDiameterMm": 7,
      "recessDepthMm": 2,
      "x": 10,
      "y": 10,
      "z": 10,
      "axis": "Z",
      "direction": -1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "holeWizard",
    "params": {
      "kind": "counterbore",
      "diameterMm": 4,
      "depthMm": 6,
      "through": false,
      "recessDiameterMm": 7,
      "recessDepthMm": 2,
      "x": 10,
      "y": 10,
      "z": 10,
      "axis": "Z",
      "direction": -1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "kind": "counterbore",
        "diameterMm": 4,
        "depthMm": 6,
        "through": false,
        "recessDiameterMm": 7,
        "recessDepthMm": 2,
        "x": 10,
        "y": 10,
        "z": 10,
        "axis": "Z",
        "direction": -1,
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "孔向导",
  "placementPolicy": {
    "mode": "tool-frame",
    "placementSupported": true,
    "originUsage": "cutter-start-reference",
    "orientationUsage": "cutter-direction-and-cross-section",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Strict v2 validation applies.",
  "docsHash": "sha256:184e69a68e83483b2d875ad4eadaee4c432062cb8251c494aca5b5df9d7d6cfb"
}
```

## 工具 intersect · Common volume of bodies

```json
{
  "id": "intersect",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "keepTools": {
        "type": "boolean",
        "description": "Keep original tools"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 2
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. refs[0] is the explicit target. Optional keepTools preserves refs[1..] as separate original bodies.",
  "title": "Common volume of bodies",
  "category": "modification",
  "synonyms": [
    "intersect",
    "相交"
  ],
  "description": "Common volume of bodies",
  "schemaHash": "sha256:a213fbac77fc226cd766431756dd5828591558a98742efad910e56a97cb3d29d",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "refs[0] is the explicit target. Optional keepTools preserves refs[1..] as separate original bodies."
  ],
  "minimalExample": {
    "op": "intersect",
    "params": {},
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "intersect",
    "params": {},
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "相交",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:0eb61d15b7479fa2142379db51095dcf0db91e758e6e08e83d40dec56238afed"
}
```

## 工具 linearPattern · Linear copies as one compound

```json
{
  "id": "linearPattern",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "count": {
        "type": "integer",
        "description": "Count including original",
        "minimum": 2,
        "maximum": 100
      },
      "dx": {
        "type": "number",
        "description": "Per-copy X step (mm)"
      },
      "dy": {
        "type": "number",
        "description": "Per-copy Y step (mm)"
      },
      "dz": {
        "type": "number",
        "description": "Per-copy Z step (mm)"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Defaults count=3; at least one step nonzero.",
  "title": "Linear copies as one compound",
  "category": "organization",
  "synonyms": [
    "linearPattern",
    "直线阵列"
  ],
  "description": "Linear copies as one compound",
  "schemaHash": "sha256:ffee6f640f50dfadf76b16fd54cceb4b4cd86a05a97972865a71e080fc456fdc",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Defaults count=3; at least one step nonzero."
  ],
  "minimalExample": {
    "op": "linearPattern",
    "params": {
      "count": 3,
      "dx": 20
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "linearPattern",
    "params": {
      "count": 3,
      "dx": 20
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "直线阵列",
  "placementPolicy": {
    "mode": "spatial-operation",
    "placementSupported": true,
    "originUsage": "axis-plane-pivot-or-vector",
    "orientationUsage": "declared-transform-or-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:7fdbbb1d5886ffebe9c05676308a0d1295c016128e96a60f1bcf2857039e6656"
}
```

## 工具 loft · Ruled loft between parallel XY profiles

```json
{
  "id": "loft",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "profile": {
        "type": "string",
        "description": "Profile",
        "enum": [
          "circle",
          "rectangle"
        ]
      },
      "radius": {
        "type": "number",
        "description": "Start radius (mm)",
        "exclusiveMinimum": 0
      },
      "width": {
        "type": "number",
        "description": "Start width (mm)",
        "exclusiveMinimum": 0
      },
      "depth": {
        "type": "number",
        "description": "Start depth (mm)",
        "exclusiveMinimum": 0
      },
      "endRadius": {
        "type": "number",
        "description": "End radius (mm)",
        "exclusiveMinimum": 0
      },
      "endWidth": {
        "type": "number",
        "description": "End width (mm)",
        "exclusiveMinimum": 0
      },
      "endDepth": {
        "type": "number",
        "description": "End depth (mm)",
        "exclusiveMinimum": 0
      },
      "height": {
        "type": "number",
        "description": "Signed nonzero Z spacing (mm)"
      },
      "offsetX": {
        "type": "number",
        "description": "End X offset (mm)"
      },
      "offsetY": {
        "type": "number",
        "description": "End Y offset (mm)"
      }
    },
    "required": [
      "profile",
      "height"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Missing end dimensions use corresponding start dimensions.",
  "title": "Ruled loft between parallel XY profiles",
  "category": "creation",
  "synonyms": [
    "loft",
    "放样"
  ],
  "description": "Ruled loft between parallel XY profiles",
  "schemaHash": "sha256:622c460eda079d8fa33f077247d4699cae3b0c5241407d7f8cd80fcd937f416e",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Missing end dimensions use corresponding start dimensions."
  ],
  "minimalExample": {
    "op": "loft",
    "params": {
      "profile": "circle",
      "radius": 5,
      "endRadius": 3,
      "height": 10
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "loft",
    "params": {
      "profile": "circle",
      "radius": 5,
      "endRadius": 3,
      "height": 10
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "放样",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:d0d2ad7250b6886e273043ca7b9737a2962835eccaaf3290907a6796dd8a9aac"
}
```

## 工具 logo · Unified reviewed LOGO on one exact face; legacy entries remain planar

```json
{
  "id": "logo",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "faceId": {
        "type": "integer",
        "description": "Current selected face index",
        "minimum": 0
      },
      "point": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "placementVersion": {
        "type": "integer",
        "const": 2
      },
      "targetSurfaceType": {
        "type": "string",
        "minLength": 1,
        "maxLength": 40
      },
      "targetFaceArea": {
        "type": "number",
        "description": "Area of target face at placement (mm^2)",
        "exclusiveMinimum": 0
      },
      "targetFaceCenter": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "targetFaceSignature": {
        "type": "string",
        "minLength": 12,
        "maxLength": 100
      },
      "targetGeometryFingerprint": {
        "type": "string",
        "minLength": 12,
        "maxLength": 100
      },
      "mode": {
        "type": "string",
        "description": "Material operation",
        "enum": [
          "engrave",
          "emboss"
        ]
      },
      "depth": {
        "type": "number",
        "description": "Explicit engraving depth or emboss height (mm)",
        "exclusiveMinimum": 0
      },
      "draftAngle": {
        "type": "number",
        "description": "Draft angle degrees; legacy missing value means 0; unified UI initially 0",
        "minimum": 0,
        "exclusiveMaximum": 45
      },
      "scale": {
        "type": "number",
        "description": "Uniform outline scale",
        "exclusiveMinimum": 0
      },
      "angle": {
        "type": "number",
        "description": "Local rotation in degrees"
      },
      "offsetX": {
        "type": "number",
        "description": "Offset along local face X (mm)"
      },
      "offsetY": {
        "type": "number",
        "description": "Offset along local face Y (mm)"
      },
      "mirrorX": {
        "type": "boolean",
        "description": "Mirror outline local X before rotation"
      },
      "regions": {
        "type": "array",
        "minItems": 1,
        "maxItems": 150,
        "items": {
          "type": "object",
          "required": [
            "outer"
          ],
          "properties": {
            "outer": {
              "type": "array",
              "minItems": 3,
              "maxItems": 2000,
              "items": {
                "type": "array",
                "items": {
                  "type": "number"
                },
                "minItems": 2,
                "maxItems": 2
              }
            },
            "holes": {
              "type": "array",
              "items": {
                "type": "array",
                "minItems": 3,
                "maxItems": 2000,
                "items": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  },
                  "minItems": 2,
                  "maxItems": 2
                }
              }
            }
          }
        }
      },
      "source": {
        "type": "object",
        "description": "New v2 requires source.reviewed=true after contour/size/hole review; preserve original provenance"
      },
      "name": {
        "type": "string"
      },
      "sizeMm": {
        "type": "array",
        "items": {
          "type": "number"
        }
      }
    },
    "required": [
      "faceId",
      "mode",
      "depth",
      "regions"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. New unified placement uses placementVersion:2, explicit world point and source.reviewed=true; WebCAD records exact face type/area/center, stable face signature for reloaded history and current BRep hash for creation audit, then dispatches planar or curved engraving. Curved emboss and draft remain unsupported. Missing placementVersion retains legacy planar semantics and missing draft defaults to 0. Source coordinates are centered X-right/Y-up mm. Local X is projected global X, or Y near X-aligned normal; local Y=normal cross X. Mirror, scale, rotate, then offset. Holes preserved; 12000 vertices total. Reject boundary, seam, invalid geometry or stale face.",
  "title": "Unified reviewed LOGO on one exact face; legacy entries remain planar",
  "category": "modification",
  "synonyms": [
    "logo",
    "LOGO"
  ],
  "description": "Unified reviewed LOGO on one exact face; legacy entries remain planar",
  "schemaHash": "sha256:2c0768edcccea8397342059a1ffcc4d9a9441129a373736bb8f8dc3982496805",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "New unified placement uses placementVersion:2, explicit world point and source.reviewed=true; WebCAD records exact face type/area/center, stable face signature for reloaded history and current BRep hash for creation audit, then dispatches planar or curved engraving. Curved emboss and draft remain unsupported. Missing placementVersion retains legacy planar semantics and missing draft defaults to 0. Source coordinates are centered X-right/Y-up mm. Local X is projected global X, or Y near X-aligned normal; local Y=normal cross X. Mirror, scale, rotate, then offset. Holes preserved; 12000 vertices total. Reject boundary, seam, invalid geometry or stale face."
  ],
  "minimalExample": {
    "op": "logo",
    "params": {
      "placementVersion": 2,
      "faceId": 0,
      "point": [
        5,
        5,
        3
      ],
      "mode": "engrave",
      "depth": 0.2,
      "draftAngle": 0,
      "regions": [
        {
          "outer": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        }
      ],
      "source": {
        "kind": "reviewed-contours",
        "reviewed": true
      }
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "logo",
    "params": {
      "placementVersion": 2,
      "faceId": 0,
      "point": [
        5,
        5,
        3
      ],
      "mode": "engrave",
      "depth": 0.2,
      "draftAngle": 0,
      "regions": [
        {
          "outer": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        }
      ],
      "source": {
        "kind": "reviewed-contours",
        "reviewed": true
      }
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "LOGO",
  "placementPolicy": {
    "mode": "target-face",
    "placementSupported": true,
    "originUsage": "target-face-point",
    "orientationUsage": "face-compatible-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:f4d15952d8756f12bf94ddda828d4f5946332dde3aee2c0a8fe314275dd15819"
}
```

## 工具 mirror · Mirror across a global origin plane

```json
{
  "id": "mirror",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "plane": {
        "type": "string",
        "description": "Global plane",
        "enum": [
          "XY",
          "XZ",
          "YZ"
        ]
      },
      "keepOriginal": {
        "type": "boolean",
        "description": "Preserve original; default true"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Default plane XY.",
  "title": "Mirror across a global origin plane",
  "category": "organization",
  "synonyms": [
    "mirror",
    "镜像"
  ],
  "description": "Mirror across a global origin plane",
  "schemaHash": "sha256:0a41388108df4ef019f5411e670bf1e25fa25968a2264b2a3ed0f93ea67ef2b6",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": "unless keepOriginal=false",
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Default plane XY."
  ],
  "minimalExample": {
    "op": "mirror",
    "params": {
      "plane": "YZ"
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "mirror",
    "params": {
      "plane": "YZ"
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "镜像",
  "placementPolicy": {
    "mode": "spatial-operation",
    "placementSupported": true,
    "originUsage": "axis-plane-pivot-or-vector",
    "orientationUsage": "declared-transform-or-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:07bc1c4503465f85cef00f68b09ee25b73cad9684684ecdfc3e23f93164ab6e7"
}
```

## 工具 multiBoss · Fuse multiple exact solid cylindrical bosses onto one body

```json
{
  "id": "multiBoss",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "radius": {
        "type": "number",
        "description": "Shared boss radius (mm)",
        "exclusiveMinimum": 0
      },
      "height": {
        "type": "number",
        "description": "Shared boss height (mm)",
        "exclusiveMinimum": 0
      },
      "axis": {
        "type": "string",
        "description": "Global axis",
        "enum": [
          "X",
          "Y",
          "Z"
        ],
        "default": "Z"
      },
      "direction": {
        "type": "number",
        "enum": [
          1,
          -1
        ],
        "default": 1
      },
      "points": {
        "type": "array",
        "minItems": 1,
        "maxItems": 64,
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "minItems": 3,
          "maxItems": 3,
          "description": "World coordinate [x,y,z] in mm"
        }
      }
    },
    "required": [
      "radius",
      "height",
      "points"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {
    "axis": "Z",
    "direction": 1
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "Each world XYZ is a boss base center; shared radius and positive height extend along signed X/Y/Z. Each must fuse to one solid and add material. No bore.",
  "title": "Fuse multiple exact solid cylindrical bosses onto one body",
  "category": "modification",
  "synonyms": [
    "多凸台",
    "批量圆柱凸台",
    "cylindrical boss"
  ],
  "description": "Fuse multiple exact solid cylindrical bosses onto one body",
  "schemaHash": "sha256:24e43b060bae1bb817b54b0acbaab4044705b032ccd45be79ff14e7773f5acf4",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Every world XYZ point is a boss base center. Cylinder grows along signed X/Y/Z axis. Defaults axis=Z,direction=1. Each boss must add material and fuse into one solid; the whole feature fails atomically otherwise. Solid bosses only: drill holes in a separate multiHole step. No inferred face or automatic fillet."
  ],
  "minimalExample": {
    "op": "multiBoss",
    "params": {
      "radius": 2,
      "height": 3,
      "axis": "Z",
      "direction": 1,
      "points": [
        [
          10,
          10,
          3
        ],
        [
          30,
          10,
          3
        ]
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "multiBoss",
    "params": {
      "radius": 2,
      "height": 3,
      "axis": "Z",
      "direction": 1,
      "points": [
        [
          10,
          10,
          3
        ],
        [
          30,
          10,
          3
        ]
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "radius": 2,
        "height": 3,
        "axis": "Z",
        "direction": 1,
        "points": [
          [
            10,
            10,
            3
          ],
          [
            30,
            10,
            3
          ]
        ],
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID",
    "NO_MATERIAL_ADDED"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "批量圆柱凸台",
  "placementPolicy": {
    "mode": "tool-frame",
    "placementSupported": true,
    "originUsage": "cutter-start-reference",
    "orientationUsage": "cutter-direction-and-cross-section",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Strict v2 validation applies.",
  "docsHash": "sha256:35ea8309e4a9aae4a84b6e2b63ee22cba93e5324c975ebe8c98c002bd390035a"
}
```

## 工具 multiHole · Cut cylindrical holes sequentially at multiple global start points

```json
{
  "id": "multiHole",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "radius": {
        "type": "number",
        "description": "Shared hole radius (mm)",
        "exclusiveMinimum": 0
      },
      "depth": {
        "type": "number",
        "description": "Shared hole depth (mm)",
        "exclusiveMinimum": 0
      },
      "axis": {
        "type": "string",
        "description": "Global axis",
        "enum": [
          "X",
          "Y",
          "Z"
        ],
        "default": "Z"
      },
      "direction": {
        "type": "number",
        "enum": [
          1,
          -1
        ],
        "default": 1
      },
      "points": {
        "type": "array",
        "minItems": 1,
        "maxItems": 100,
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "minItems": 3,
          "maxItems": 3,
          "description": "World coordinate [x,y,z] in mm"
        }
      }
    },
    "required": [
      "radius",
      "depth",
      "points"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {
    "axis": "Z",
    "direction": 1
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "World XYZ cutter start, signed principal axis, radius in mm (not diameter), fixed positive depth. No through parameter.",
  "title": "Cut cylindrical holes sequentially at multiple global start points",
  "category": "modification",
  "synonyms": [
    "多孔",
    "孔位",
    "mounting plate",
    "多位置打孔"
  ],
  "description": "Cut cylindrical holes sequentially at multiple global start points",
  "schemaHash": "sha256:721711340db5482a051682fd5bc282175b8fc64d7fa56f88600beed3c61fe1eb",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "One referenced body. Each point is a cutter START [x,y,z], not a face identifier or 2D sketch point. All holes share radius/depth/axis/direction. Defaults axis=Z,direction=1. Every hole must remove material from the sequential result; an off-body or already-empty hole fails the whole feature. Does not create threads."
  ],
  "minimalExample": {
    "op": "multiHole",
    "params": {
      "radius": 2,
      "depth": 5,
      "axis": "Z",
      "direction": -1,
      "points": [
        [
          5,
          5,
          4
        ],
        [
          45,
          5,
          4
        ],
        [
          5,
          25,
          4
        ],
        [
          45,
          25,
          4
        ]
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "multiHole",
    "params": {
      "radius": 2,
      "depth": 5,
      "axis": "Z",
      "direction": -1,
      "points": [
        [
          5,
          5,
          4
        ],
        [
          45,
          5,
          4
        ],
        [
          5,
          25,
          4
        ],
        [
          45,
          25,
          4
        ]
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "radius": 2,
        "depth": 5,
        "axis": "Z",
        "direction": -1,
        "points": [
          [
            5,
            5,
            4
          ],
          [
            45,
            5,
            4
          ],
          [
            5,
            25,
            4
          ],
          [
            45,
            25,
            4
          ]
        ],
        "diameter": 4
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID",
    "NO_MATERIAL_REMOVED"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [
    "recipes.mounting-plate"
  ],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "多位置打孔",
  "placementPolicy": {
    "mode": "tool-frame",
    "placementSupported": true,
    "originUsage": "cutter-start-reference",
    "orientationUsage": "cutter-direction-and-cross-section",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Strict v2 validation applies.",
  "docsHash": "sha256:e807b5b1dfe2061294c937cd40b69bde82ea82ad10745929eb13853ea1a4e87b"
}
```

## 工具 multiPocket · Cut multiple exact rectangular or rounded rectangular pockets

```json
{
  "id": "multiPocket",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "depth": {
        "type": "number",
        "description": "Shared cut depth (mm)",
        "exclusiveMinimum": 0
      },
      "axis": {
        "type": "string",
        "description": "Global axis",
        "enum": [
          "X",
          "Y",
          "Z"
        ],
        "default": "Z"
      },
      "direction": {
        "type": "number",
        "enum": [
          1,
          -1
        ],
        "default": -1
      },
      "pockets": {
        "type": "array",
        "minItems": 1,
        "maxItems": 64,
        "items": {
          "type": "object",
          "required": [
            "x",
            "y",
            "z",
            "width",
            "height"
          ],
          "additionalProperties": false,
          "properties": {
            "x": {
              "type": "number",
              "description": "World cutter start center X (mm)"
            },
            "y": {
              "type": "number",
              "description": "World cutter start center Y (mm)"
            },
            "z": {
              "type": "number",
              "description": "World cutter start center Z (mm)"
            },
            "width": {
              "type": "number",
              "description": "Pocket width in the first in-plane axis (mm)",
              "exclusiveMinimum": 0
            },
            "height": {
              "type": "number",
              "description": "Pocket height in the second in-plane axis (mm)",
              "exclusiveMinimum": 0
            },
            "cornerRadius": {
              "type": "number",
              "description": "Optional corner radius; 0 means square corners (mm)",
              "minimum": 0
            }
          }
        }
      }
    },
    "required": [
      "depth",
      "pockets"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {
    "axis": "Z",
    "direction": -1
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "Each world XYZ is a pocket cutter start center; shared positive depth cuts along signed axis. Width/height directions: Z axis X/Y, X axis Y/Z, Y axis Z/X. No automatic through or inferred surface.",
  "title": "Cut multiple exact rectangular or rounded rectangular pockets",
  "category": "modification",
  "synonyms": [
    "多凹槽",
    "批量凹刻",
    "rectangular pocket",
    "recess",
    "批量矩形凹槽"
  ],
  "description": "Cut multiple exact rectangular or rounded rectangular pockets",
  "schemaHash": "sha256:8dbfe98f1890b42bda2613e2b2808587c30ccda15c8ed9d72fdcc6905fa39bc9",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Each pocket is centered at world XYZ on a plane normal to axis and cuts along direction * axis. Defaults axis=Z,direction=-1,cornerRadius=0. In-plane width/height directions: Z -> X/Y; X -> Y/Z; Y -> Z/X. Rounded corners require cornerRadius < half the shorter side. Every pocket must remove remaining material; the entire feature fails atomically otherwise. No automatic through depth or inferred surface."
  ],
  "minimalExample": {
    "op": "multiPocket",
    "params": {
      "depth": 0.5,
      "axis": "Z",
      "direction": -1,
      "pockets": [
        {
          "x": 10,
          "y": 10,
          "z": 3,
          "width": 6,
          "height": 4
        },
        {
          "x": 25,
          "y": 10,
          "z": 3,
          "width": 6,
          "height": 4,
          "cornerRadius": 0.5
        }
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "multiPocket",
    "params": {
      "depth": 0.5,
      "axis": "Z",
      "direction": -1,
      "pockets": [
        {
          "x": 10,
          "y": 10,
          "z": 3,
          "width": 6,
          "height": 4
        },
        {
          "x": 25,
          "y": 10,
          "z": 3,
          "width": 6,
          "height": 4,
          "cornerRadius": 0.5
        }
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "depth": 0.5,
        "axis": "Z",
        "direction": -1,
        "pockets": [
          {
            "x": 10,
            "y": 10,
            "z": 3,
            "width": 6,
            "height": 4
          },
          {
            "x": 25,
            "y": 10,
            "z": 3,
            "width": 6,
            "height": 4,
            "cornerRadius": 0.5
          }
        ],
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID",
    "NO_MATERIAL_REMOVED"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "批量矩形凹槽",
  "placementPolicy": {
    "mode": "tool-frame",
    "placementSupported": true,
    "originUsage": "cutter-start-reference",
    "orientationUsage": "cutter-direction-and-cross-section",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Strict v2 validation applies.",
  "docsHash": "sha256:ca87e5baecdc5d57e144c5a27ed01fb203ea61bf740b3d9155d38b88a3f0d3c3"
}
```

## 工具 planeSection · 选择一个源对象，提取与指定平面的真实交线，保留原对象。XY 的坐标为 Z，XZ 为 Y，YZ 为 X。结果是精确线框，不是实体。

```json
{
  "id": "planeSection",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "plane": {
        "type": "string",
        "enum": [
          "XY",
          "XZ",
          "YZ"
        ]
      },
      "offset": {
        "type": "number"
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. 选择一个源对象，提取与指定平面的真实交线，保留原对象。XY 的坐标为 Z，XZ 为 Y，YZ 为 X。结果是精确线框，不是实体。",
  "title": "选择一个源对象，提取与指定平面的真实交线，保留原对象。XY 的坐标为 Z，XZ 为 Y，YZ 为 X。结果是精确线框，不是实体。",
  "category": "reference",
  "synonyms": [
    "planeSection",
    "提取真实截面"
  ],
  "description": "选择一个源对象，提取与指定平面的真实交线，保留原对象。XY 的坐标为 Z，XZ 为 Y，YZ 为 X。结果是精确线框，不是实体。",
  "schemaHash": "sha256:70c3c48e02229ffb45e5d17ea9c3b10faa4ad1c13d5f7f77a88dbee215179aba",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "curve compound"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "选择一个源对象，提取与指定平面的真实交线，保留原对象。XY 的坐标为 Z，XZ 为 Y，YZ 为 X。结果是精确线框，不是实体。"
  ],
  "minimalExample": {
    "op": "planeSection",
    "params": {
      "plane": "XY",
      "offset": 1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "planeSection",
    "params": {
      "plane": "XY",
      "offset": 1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "提取真实截面",
  "placementPolicy": {
    "mode": "spatial-operation",
    "placementSupported": true,
    "originUsage": "axis-plane-pivot-or-vector",
    "orientationUsage": "declared-transform-or-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:5cc84b772d534763c2383707e83f74bb3490f78d0d552819dc5294dabb6dc47f"
}
```

## 工具 profileExtrude · Extrude a placed exact profile into a new solid, join, cut or intersection

```json
{
  "id": "profileExtrude",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "operation": {
        "type": "string",
        "description": "Result mode",
        "enum": [
          "newBody",
          "join",
          "cut",
          "intersect"
        ]
      },
      "extent": {
        "type": "string",
        "description": "Depth mode",
        "enum": [
          "distance",
          "throughSelected",
          "toPlane"
        ]
      },
      "distanceMm": {
        "type": "number",
        "description": "Explicit positive depth (mm)",
        "exclusiveMinimum": 0
      },
      "direction": {
        "type": "integer",
        "enum": [
          1,
          -1
        ],
        "description": "Positive or negative saved profile normal"
      },
      "planePoint": {
        "type": "array",
        "minItems": 3,
        "maxItems": 3,
        "items": {
          "type": "number"
        },
        "description": "Fixed world point on infinite target plane"
      },
      "planeNormal": {
        "type": "array",
        "minItems": 3,
        "maxItems": 3,
        "items": {
          "type": "number"
        },
        "description": "Fixed world plane normal"
      },
      "allowanceMm": {
        "type": "number",
        "description": "Signed distance added along extrusion direction"
      }
    },
    "required": [
      "operation",
      "extent",
      "direction"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 2
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. refs[0] is the placed planar profile. newBody requires only that ref; join/cut/intersect require refs[1] as one explicit solid target. The profile remains in history and the target is replaced. throughSelected computes depth from that target only and refuses a cutter starting inside it. toPlane supports only a fixed world plane parallel to the source profile plus signed allowance; oblique end planes are explicitly rejected. It uses an infinite world plane; it does not claim the cutter stops at a finite face boundary. No active anchor transform is applied again.",
  "title": "Extrude a placed exact profile into a new solid, join, cut or intersection",
  "category": "reference",
  "synonyms": [
    "profileExtrude",
    "轮廓拉伸",
    "加工"
  ],
  "description": "Extrude a placed exact profile into a new solid, join, cut or intersection",
  "schemaHash": "sha256:f3eecce4f6a6bdf443657839fb6bfac65c15d13a8d0051889f5d75ac67d0064a",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "refs[0] is the placed planar profile. newBody requires only that ref; join/cut/intersect require refs[1] as one explicit solid target. The profile remains in history and the target is replaced. throughSelected computes depth from that target only and refuses a cutter starting inside it. toPlane supports only a fixed world plane parallel to the source profile plus signed allowance; oblique end planes are explicitly rejected. It uses an infinite world plane; it does not claim the cutter stops at a finite face boundary. No active anchor transform is applied again."
  ],
  "minimalExample": {
    "op": "profileExtrude",
    "params": {
      "operation": "newBody",
      "extent": "distance",
      "distanceMm": 3,
      "direction": 1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "profileExtrude",
    "params": {
      "operation": "newBody",
      "extent": "distance",
      "distanceMm": 3,
      "direction": 1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "operation": "newBody",
        "extent": "distance",
        "distanceMm": 3,
        "direction": 1,
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "轮廓拉伸 / 加工",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:18ac3e4c6fa4363341e85b528c8eb7c736765fcc933ba267fdd454e08845ec70"
}
```

## 工具 profileOffset · Create an exact planar equidistant offset or band from one closed face

```json
{
  "id": "profileOffset",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "distanceMm": {
        "type": "number",
        "description": "Equidistant offset (mm)",
        "exclusiveMinimum": 0
      },
      "side": {
        "type": "string",
        "description": "Offset direction",
        "enum": [
          "inside",
          "outside"
        ]
      },
      "join": {
        "type": "string",
        "description": "Corner join",
        "enum": [
          "intersection",
          "round"
        ]
      },
      "output": {
        "type": "string",
        "description": "Result",
        "enum": [
          "wire",
          "face",
          "band"
        ]
      }
    },
    "required": [
      "distanceMm",
      "side",
      "join",
      "output"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Source face is preserved. A single planar unholed region is supported. Collapse, multiple outputs and ambiguous offsets are rejected; geometry is never scaled as a substitute.",
  "title": "Create an exact planar equidistant offset or band from one closed face",
  "category": "reference",
  "synonyms": [
    "profileOffset",
    "等距偏移",
    "边框"
  ],
  "description": "Create an exact planar equidistant offset or band from one closed face",
  "schemaHash": "sha256:1a4d2f576b3abcf0dd939e414c14350b59950acbee1e88960089668394469265",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "wire",
    "planar face"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Source face is preserved. A single planar unholed region is supported. Collapse, multiple outputs and ambiguous offsets are rejected; geometry is never scaled as a substitute."
  ],
  "minimalExample": {
    "op": "profileOffset",
    "params": {
      "distanceMm": 2,
      "side": "inside",
      "join": "intersection",
      "output": "band"
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "profileOffset",
    "params": {
      "distanceMm": 2,
      "side": "inside",
      "join": "intersection",
      "output": "band"
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "distanceMm": 2,
        "side": "inside",
        "join": "intersection",
        "output": "band",
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "等距偏移 / 边框",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:13325dd00031f96ad788e1db79e9a2e01afa01985871d684b24a5dba26dc9198"
}
```

## 工具 profileRepair · Derive a repaired analytic profile by moving one explicitly identified endpoint within the stated maximum displacement

```json
{
  "id": "profileRepair",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "issueId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 150
      },
      "maxEndpointMoveMm": {
        "type": "number",
        "exclusiveMinimum": 0,
        "maximum": 1,
        "description": "Maximum permitted movement of one endpoint in mm"
      }
    },
    "required": [
      "issueId",
      "maxEndpointMoveMm"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. refs[0] is the current saved sketchProfile source. The source is preserved. The issueId must come from inspectProfile on this source and only an explicit endpoint gap is supported. Closing an open chain yields a face. Failure leaves the source untouched.",
  "title": "Derive a repaired analytic profile by moving one explicitly identified endpoint within the stated maximum displacement",
  "category": "reference",
  "synonyms": [
    "profileRepair",
    "修复轮廓"
  ],
  "description": "Derive a repaired analytic profile by moving one explicitly identified endpoint within the stated maximum displacement",
  "schemaHash": "sha256:b8521660d1a2f2cbd2093c07568a49057e56fa05fc141353e0614b259df9f364",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "wire",
    "planar face"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "refs[0] is the current saved sketchProfile source. The source is preserved. The issueId must come from inspectProfile on this source and only an explicit endpoint gap is supported. Closing an open chain yields a face. Failure leaves the source untouched."
  ],
  "minimalExample": {
    "op": "profileRepair",
    "params": {
      "issueId": "closure:outline",
      "maxEndpointMoveMm": 0.03
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "profileRepair",
    "params": {
      "issueId": "closure:outline",
      "maxEndpointMoveMm": 0.03
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "issueId": "closure:outline",
        "maxEndpointMoveMm": 0.03,
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "修复轮廓",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:7bbfd5479c5cef6165a4608e53bb88ab2b2fa8af54ca6479d3fbcb13fea41aa9"
}
```

## 工具 quickModel · Parameterized product model; prefer getTool({id:"quickModel"}) then execute(request)

```json
{
  "id": "quickModel",
  "version": "legacy-1",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "oneOf": [
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "One flat U plate with concentric semicircular crowns, equal-width straight legs and one through-hole at each end. No second assembly component, thread or round-wire section.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "uEndHolePlate"
          },
          "outerWidth": {
            "type": "number",
            "default": 22,
            "description": "Outer width"
          },
          "innerWidth": {
            "type": "number",
            "default": 10,
            "description": "Inner width"
          },
          "totalHeight": {
            "type": "number",
            "default": 31.7,
            "description": "Total height"
          },
          "thickness": {
            "type": "number",
            "default": 3,
            "description": "Plate thickness"
          },
          "holeDiameter": {
            "type": "number",
            "default": 3.3,
            "description": "End-hole diameter"
          },
          "holeInset": {
            "type": "number",
            "default": 2.7,
            "description": "Hole center inset from leg end"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Circular ring swept from an elliptical section with independent front band width and side depth. Section shape is an editable candidate to verify against the source.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "ellipseSectionRing"
          },
          "innerDiameter": {
            "type": "number",
            "default": 37.4,
            "description": "Inner front diameter"
          },
          "sectionWidth": {
            "type": "number",
            "default": 4.1,
            "description": "Front band width"
          },
          "sectionDepth": {
            "type": "number",
            "default": 5,
            "description": "Side depth"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Annular band segment with editable sweep, plate thickness, symmetric end-hole inset and optional counterbores. Threads and mating parts are separate.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "arcBandPlate"
          },
          "outerRadius": {
            "type": "number",
            "default": 20,
            "description": "Outer radius"
          },
          "innerRadius": {
            "type": "number",
            "default": 15,
            "description": "Inner radius"
          },
          "centerAngle": {
            "type": "number",
            "default": 270,
            "description": "Arc center angle"
          },
          "spanAngle": {
            "type": "number",
            "default": 111.2807337553,
            "description": "Arc sweep angle"
          },
          "thickness": {
            "type": "number",
            "default": 5,
            "description": "Plate thickness"
          },
          "holeInsetAngle": {
            "type": "number",
            "default": 8.4521160504,
            "description": "Hole inset from each end"
          },
          "holeDiameter": {
            "type": "number",
            "default": 2.3,
            "description": "Through-hole diameter"
          },
          "recessDiameter": {
            "type": "number",
            "default": 3.3,
            "description": "Top recess diameter"
          },
          "recessDepth": {
            "type": "number",
            "default": 0,
            "description": "Top recess depth"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Open gable frame with straight legs, sloped shoulders and rounded open ends. Independent inner/outer widths, shoulder and peak heights, depth and end radius.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "gableOpenFrame"
          },
          "outerWidth": {
            "type": "number",
            "default": 25,
            "description": "Outer width"
          },
          "innerWidth": {
            "type": "number",
            "default": 20,
            "description": "Inner width"
          },
          "outerPeakHeight": {
            "type": "number",
            "default": 16,
            "description": "Outer peak height"
          },
          "outerShoulderHeight": {
            "type": "number",
            "default": 12.4,
            "description": "Outer shoulder height"
          },
          "innerPeakHeight": {
            "type": "number",
            "default": 13.5,
            "description": "Inner peak height"
          },
          "innerShoulderHeight": {
            "type": "number",
            "default": 10.5,
            "description": "Inner shoulder height"
          },
          "thickness": {
            "type": "number",
            "default": 4,
            "description": "Plate depth"
          },
          "endRadius": {
            "type": "number",
            "default": 1,
            "description": "Leg end radius"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Sweep an elliptical cross-section around a rounded rectangular centerline. Front band width and side depth are independent; the inner planar radius is separate from section shape.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "ellipseSectionRectFrame"
          },
          "innerWidth": {
            "type": "number",
            "default": 25,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 19,
            "description": "Inner height"
          },
          "innerRadius": {
            "type": "number",
            "default": 2.5,
            "description": "Inner planar radius"
          },
          "sectionWidth": {
            "type": "number",
            "default": 5.5,
            "description": "Front band width"
          },
          "sectionDepth": {
            "type": "number",
            "default": 6,
            "description": "Side depth"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Flat D frame with semicircular crown, straight legs, independent inner/outer bottom radii and optional measured bottom gap. Thickness is a flat plate depth, not a round-wire section.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "dFlatFrame"
          },
          "outerWidth": {
            "type": "number",
            "default": 28,
            "description": "Outer width"
          },
          "outerHeight": {
            "type": "number",
            "default": 25,
            "description": "Outer height"
          },
          "innerWidth": {
            "type": "number",
            "default": 20,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 17,
            "description": "Inner height"
          },
          "outerBottomRadius": {
            "type": "number",
            "default": 3.5,
            "description": "Outer bottom radius"
          },
          "innerBottomRadius": {
            "type": "number",
            "default": 2,
            "description": "Inner bottom radius"
          },
          "thickness": {
            "type": "number",
            "default": 4,
            "description": "Flat plate thickness"
          },
          "gapWidth": {
            "type": "number",
            "default": 0,
            "description": "Bottom gap (0 = closed)"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Intersect a rounded twin-window footprint with a coaxial cylindrical wall to create an arched plate. Set outer bend radius and radial thickness independently. Projected strip construction without source-specific edge treatment; round-wire frames need another tool.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "archedTwinWindowPlate"
          },
          "outerWidth": {
            "type": "number",
            "default": 32.9,
            "description": "Outer width"
          },
          "outerHeight": {
            "type": "number",
            "default": 25.5,
            "description": "Outer height"
          },
          "outerRadius": {
            "type": "number",
            "default": 3,
            "description": "Outer planar radius"
          },
          "windowWidth": {
            "type": "number",
            "default": 25.4,
            "description": "Window width"
          },
          "totalInnerHeight": {
            "type": "number",
            "default": 18.5,
            "description": "Total inner height"
          },
          "windowRadius": {
            "type": "number",
            "default": 0.5,
            "description": "Window planar radius"
          },
          "barWidth": {
            "type": "number",
            "default": 3.5,
            "description": "Center bar width"
          },
          "bendRadius": {
            "type": "number",
            "default": 43.90964782342324,
            "description": "Outer bend radius"
          },
          "radialThickness": {
            "type": "number",
            "default": 2.3,
            "description": "Radial thickness"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "A flat plate with straight top/bottom, tangent bowed sides and four small corner arcs, plus two symmetric capsule windows. Optional edge fillet. Symmetric parameter model only.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "bowedTwinWindowPlate"
          },
          "outerHeight": {
            "type": "number",
            "default": 24.5,
            "description": "Outer height"
          },
          "topStraightWidth": {
            "type": "number",
            "default": 30.2527,
            "description": "Top/bottom straight length"
          },
          "sideRadius": {
            "type": "number",
            "default": 35.688467,
            "description": "Bowed side radius"
          },
          "cornerRadius": {
            "type": "number",
            "default": 6,
            "description": "Corner radius"
          },
          "windowWidth": {
            "type": "number",
            "default": 32,
            "description": "Window width"
          },
          "windowHeight": {
            "type": "number",
            "default": 6.55,
            "description": "Window height"
          },
          "windowSpacing": {
            "type": "number",
            "default": 10.35,
            "description": "Window center spacing"
          },
          "thickness": {
            "type": "number",
            "default": 3.7,
            "description": "Thickness"
          },
          "edgeRadius": {
            "type": "number",
            "default": 0.8,
            "description": "Front/back edge radius"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Independent inner/outer outlines and thickness. Half-short-side radii allow capsule frames. A parametric tool, not a complete reconstruction of an IGS part.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "flatFrame"
          },
          "outerWidth": {
            "type": "number",
            "default": 40,
            "description": "Outer width"
          },
          "outerHeight": {
            "type": "number",
            "default": 28,
            "description": "Outer height"
          },
          "innerWidth": {
            "type": "number",
            "default": 28,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 16,
            "description": "Inner height"
          },
          "outerRadius": {
            "type": "number",
            "default": 5,
            "description": "Outer corner radius"
          },
          "innerRadius": {
            "type": "number",
            "default": 3,
            "description": "Inner corner radius"
          },
          "thickness": {
            "type": "number",
            "default": 3,
            "description": "Thickness"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "A flat frame with independent inner and outer corner radii, then one exact fillet of every sharp edge. The specified edge radius fails atomically if unsolvable. Near half-thickness can approximate a round section but is not certified as a semicircle.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "roundedFlatFrame"
          },
          "outerWidth": {
            "type": "number",
            "default": 40,
            "description": "Outer width"
          },
          "outerHeight": {
            "type": "number",
            "default": 28,
            "description": "Outer height"
          },
          "innerWidth": {
            "type": "number",
            "default": 30,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 18,
            "description": "Inner height"
          },
          "outerRadius": {
            "type": "number",
            "default": 5,
            "description": "Outer corner radius"
          },
          "innerRadius": {
            "type": "number",
            "default": 2,
            "description": "Inner corner radius"
          },
          "thickness": {
            "type": "number",
            "default": 4,
            "description": "Thickness"
          },
          "edgeRadius": {
            "type": "number",
            "default": 1.5,
            "description": "All-edge fillet radius"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "A flat plate with two equal symmetric rounded windows and an integral center bridge. Independent outline, window and front/back edge radii. No round bar, offset windows or side arch.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "twinWindowPlate"
          },
          "outerWidth": {
            "type": "number",
            "default": 44.8,
            "description": "Outer width"
          },
          "outerHeight": {
            "type": "number",
            "default": 26.6,
            "description": "Outer height"
          },
          "outerRadius": {
            "type": "number",
            "default": 3.5,
            "description": "Outer planar radius"
          },
          "windowWidth": {
            "type": "number",
            "default": 37.8,
            "description": "Window clear width"
          },
          "totalInnerHeight": {
            "type": "number",
            "default": 19.6,
            "description": "Total inner height"
          },
          "windowRadius": {
            "type": "number",
            "default": 2,
            "description": "Window planar radius"
          },
          "barWidth": {
            "type": "number",
            "default": 3.5,
            "description": "Center bridge width"
          },
          "thickness": {
            "type": "number",
            "default": 3.5,
            "description": "Plate thickness"
          },
          "edgeRadius": {
            "type": "number",
            "default": 0.5,
            "description": "Front/back edge radius"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Two symmetric X-axis holes with independent center spacing. Plain through holes only; no threads, countersinks or counterbores.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "mountingPlate"
          },
          "width": {
            "type": "number",
            "default": 40,
            "description": "Plate width X"
          },
          "depth": {
            "type": "number",
            "default": 16,
            "description": "Plate depth Y"
          },
          "thickness": {
            "type": "number",
            "default": 3,
            "description": "Thickness"
          },
          "cornerRadius": {
            "type": "number",
            "default": 3,
            "description": "Outer corner radius"
          },
          "holeDiameter": {
            "type": "number",
            "default": 4,
            "description": "Hole diameter"
          },
          "holeSpacing": {
            "type": "number",
            "default": 24,
            "description": "Hole center spacing"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Rectangular plate with four through holes. Set X/Y edge insets and optional outer corner radius; no threads or counterbores.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "fourHolePlate"
          },
          "width": {
            "type": "number",
            "default": 50,
            "description": "Plate width X"
          },
          "depth": {
            "type": "number",
            "default": 30,
            "description": "Plate depth Y"
          },
          "thickness": {
            "type": "number",
            "default": 3,
            "description": "Thickness"
          },
          "cornerRadius": {
            "type": "number",
            "default": 0,
            "description": "Outer corner radius"
          },
          "holeDiameter": {
            "type": "number",
            "default": 4,
            "description": "Hole diameter"
          },
          "insetX": {
            "type": "number",
            "default": 5,
            "description": "Hole inset X"
          },
          "insetY": {
            "type": "number",
            "default": 5,
            "description": "Hole inset Y"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "A rounded plate with two symmetric hollow cylindrical bosses; each bore passes through both boss and plate. Generic parametric geometry, not a threaded, counterbored, or source-product reconstruction.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "bossPlate"
          },
          "width": {
            "type": "number",
            "default": 40,
            "description": "Plate width X"
          },
          "depth": {
            "type": "number",
            "default": 16,
            "description": "Plate depth Y"
          },
          "thickness": {
            "type": "number",
            "default": 3,
            "description": "Plate thickness"
          },
          "cornerRadius": {
            "type": "number",
            "default": 3,
            "description": "Plate corner radius"
          },
          "bossSpacing": {
            "type": "number",
            "default": 24,
            "description": "Boss center spacing"
          },
          "bossOuterDiameter": {
            "type": "number",
            "default": 8,
            "description": "Boss outer diameter"
          },
          "boreDiameter": {
            "type": "number",
            "default": 4,
            "description": "Through-bore diameter"
          },
          "bossHeight": {
            "type": "number",
            "default": 6,
            "description": "Boss height (below plate)"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "A coaxial flange and cylindrical bushing with a straight bore through the full length. Generic parametric geometry, with no threads or source-product feature reconstruction.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "flangedBushing"
          },
          "bodyDiameter": {
            "type": "number",
            "default": 12,
            "description": "Bushing body diameter"
          },
          "flangeDiameter": {
            "type": "number",
            "default": 20,
            "description": "Flange diameter"
          },
          "boreDiameter": {
            "type": "number",
            "default": 6,
            "description": "Through-bore diameter"
          },
          "bodyHeight": {
            "type": "number",
            "default": 10,
            "description": "Body height"
          },
          "flangeThickness": {
            "type": "number",
            "default": 3,
            "description": "Flange thickness"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Constant-section circular arc with an adjustable opening angle for C rings, hook rings and open circular frames. End balls, hinges and variable sections are excluded.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "openArcRing"
          },
          "section": {
            "type": "string",
            "default": "round",
            "description": "Section",
            "enum": [
              "round",
              "square",
              "chamferedSquare"
            ]
          },
          "innerDiameter": {
            "type": "number",
            "default": 30,
            "description": "Inner diameter"
          },
          "sectionSize": {
            "type": "number",
            "default": 4,
            "description": "Wire diameter / square size"
          },
          "sectionRadius": {
            "type": "number",
            "default": 0.4,
            "description": "Square section corner R"
          },
          "sectionChamfer": {
            "type": "number",
            "default": 0.6,
            "description": "Square section chamfer C"
          },
          "openingAngle": {
            "type": "number",
            "default": 70,
            "description": "Opening angle (degrees)"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Open rounded-rectangle tray with two hollow bosses on the inner floor. Outer corner radius, wall/floor thickness and boss dimensions are editable. Straight walls only; no draft, clips, lettering or texture.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "roundedBossTray"
          },
          "outerWidth": {
            "type": "number",
            "default": 60,
            "description": "Outer width X"
          },
          "outerDepth": {
            "type": "number",
            "default": 38,
            "description": "Outer depth Y"
          },
          "height": {
            "type": "number",
            "default": 12,
            "description": "Total height"
          },
          "cornerRadius": {
            "type": "number",
            "default": 6,
            "description": "Outer corner radius"
          },
          "wallThickness": {
            "type": "number",
            "default": 2,
            "description": "Wall thickness"
          },
          "floorThickness": {
            "type": "number",
            "default": 2,
            "description": "Floor thickness"
          },
          "bossSpacing": {
            "type": "number",
            "default": 30,
            "description": "Boss center spacing X"
          },
          "bossOuterDiameter": {
            "type": "number",
            "default": 7,
            "description": "Boss outer diameter"
          },
          "boreDiameter": {
            "type": "number",
            "default": 3,
            "description": "Through-bore diameter"
          },
          "bossHeight": {
            "type": "number",
            "default": 7,
            "description": "Boss height above inner floor"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "One solid combining a round badge plate, raised front rim and two rear mounting posts. Posts may be hollow. Brand artwork, knurling, doming and production dimensions are excluded.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "roundBadge"
          },
          "diameter": {
            "type": "number",
            "default": 40,
            "description": "Badge diameter"
          },
          "thickness": {
            "type": "number",
            "default": 2,
            "description": "Plate thickness"
          },
          "rimWidth": {
            "type": "number",
            "default": 2,
            "description": "Front rim width"
          },
          "rimHeight": {
            "type": "number",
            "default": 0.8,
            "description": "Front rim height"
          },
          "postSpacing": {
            "type": "number",
            "default": 18,
            "description": "Rear post spacing X"
          },
          "postDiameter": {
            "type": "number",
            "default": 4,
            "description": "Rear post diameter"
          },
          "postHeight": {
            "type": "number",
            "default": 4,
            "description": "Rear post height"
          },
          "postBoreDiameter": {
            "type": "number",
            "default": 0,
            "description": "Post bore diameter (0 = solid)"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "One fused solid, centered in XY, bottom at Z=0, open top. Clear cavity width/depth = outer width/depth minus twice wall thickness; clear height = height minus floor thickness. Two X-symmetric bosses rise from the inner floor; bores pass through bosses and floor. Straight walls/corners only; no draft, fillets, threads or assembly relationships.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "thinWallTray"
          },
          "outerWidth": {
            "type": "number",
            "default": 60,
            "description": "Outer width X"
          },
          "outerDepth": {
            "type": "number",
            "default": 36,
            "description": "Outer depth Y"
          },
          "height": {
            "type": "number",
            "default": 14,
            "description": "Total height"
          },
          "wallThickness": {
            "type": "number",
            "default": 2,
            "description": "Wall thickness"
          },
          "floorThickness": {
            "type": "number",
            "default": 2,
            "description": "Floor thickness"
          },
          "bossSpacing": {
            "type": "number",
            "default": 30,
            "description": "Boss center spacing X"
          },
          "bossOuterDiameter": {
            "type": "number",
            "default": 8,
            "description": "Boss outer diameter"
          },
          "boreDiameter": {
            "type": "number",
            "default": 3,
            "description": "Through-bore diameter"
          },
          "bossHeight": {
            "type": "number",
            "default": 8,
            "description": "Boss height above inner floor"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Coaxial tube; defaults 13.4 outer diameter, 12.4 inner diameter and 3 height for the user C-part.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "tube"
          },
          "outerDiameter": {
            "type": "number",
            "default": 13.4,
            "description": "Outer diameter"
          },
          "innerDiameter": {
            "type": "number",
            "default": 12.4,
            "description": "Inner diameter"
          },
          "height": {
            "type": "number",
            "default": 3,
            "description": "Height"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Tool solid: entry at Z=0, extending along +Z. Position at the workpiece surface, rotate 180 degrees if needed, then select the body first and subtract the tool.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "counterboreTool"
          },
          "holeDiameter": {
            "type": "number",
            "default": 4,
            "description": "Hole diameter"
          },
          "depth": {
            "type": "number",
            "default": 8,
            "description": "Total depth"
          },
          "headDiameter": {
            "type": "number",
            "default": 8,
            "description": "Head diameter"
          },
          "headDepth": {
            "type": "number",
            "default": 2,
            "description": "Head depth"
          },
          "style": {
            "type": "string",
            "default": "bore",
            "description": "Style",
            "enum": [
              "bore",
              "sink"
            ]
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "同心圆恒截面单圈；开缝为底部正中平行平切。",
        "properties": {
          "kind": {
            "type": "string",
            "const": "ring"
          },
          "section": {
            "type": "string",
            "default": "round",
            "description": "Section",
            "enum": [
              "round",
              "square",
              "chamferedSquare"
            ]
          },
          "sectionSize": {
            "type": "number",
            "default": 3,
            "description": "Wire diameter / square size"
          },
          "sectionRadius": {
            "type": "number",
            "default": 0.3,
            "description": "Square section corner R"
          },
          "sectionChamfer": {
            "type": "number",
            "default": 0.6,
            "description": "Square section chamfer C"
          },
          "gapWidth": {
            "type": "number",
            "default": 0,
            "description": "Bottom gap (0 = closed)"
          },
          "innerDiameter": {
            "type": "number",
            "default": 24,
            "description": "Inner diameter"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "A constant-section circular frame fused to one round X-axis crossbar. The bar has editable Y and depth Z offsets. Moving bars, hinges and exact joint transitions are excluded.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "ringBar"
          },
          "section": {
            "type": "string",
            "default": "round",
            "description": "Section",
            "enum": [
              "round",
              "square",
              "chamferedSquare"
            ]
          },
          "innerDiameter": {
            "type": "number",
            "default": 20,
            "description": "Ring inner diameter"
          },
          "sectionSize": {
            "type": "number",
            "default": 3,
            "description": "Wire diameter / square size"
          },
          "sectionRadius": {
            "type": "number",
            "default": 0.3,
            "description": "Square section corner R"
          },
          "sectionChamfer": {
            "type": "number",
            "default": 0.6,
            "description": "Square section chamfer C"
          },
          "barDiameter": {
            "type": "number",
            "default": 2,
            "description": "Bar diameter"
          },
          "barOffset": {
            "type": "number",
            "default": 0,
            "description": "Bar Y offset"
          },
          "barDepthOffset": {
            "type": "number",
            "default": 0,
            "description": "Bar Z depth offset"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Offset a true inner ellipse for a round-wire sweep and fuse one centered fixed round bar. Read back exact bounds; source spline and joint continuity still require comparison.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "ellipseBar"
          },
          "innerWidth": {
            "type": "number",
            "default": 35,
            "description": "Inner ellipse major diameter"
          },
          "innerHeight": {
            "type": "number",
            "default": 25,
            "description": "Inner ellipse minor diameter"
          },
          "sectionSize": {
            "type": "number",
            "default": 5,
            "description": "Wire diameter / square size"
          },
          "barDiameter": {
            "type": "number",
            "default": 5,
            "description": "Bar diameter"
          },
          "barDepthOffset": {
            "type": "number",
            "default": 0,
            "description": "Bar Z depth offset"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Sweep round wire along a half-wire outward offset of a true inner ellipse, then cut a bottom-center parallel flat gap. Source drawings with a true outer ellipse need another tool.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "ellipseOpenWire"
          },
          "innerWidth": {
            "type": "number",
            "default": 15,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 20,
            "description": "Inner height"
          },
          "sectionSize": {
            "type": "number",
            "default": 3.5,
            "description": "Wire diameter / square size"
          },
          "gapWidth": {
            "type": "number",
            "default": 0.2,
            "description": "Bottom-center parallel gap width"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Closed capsule loop with semicircular ends and straight runs. Front width, side depth and section radius are independent; a half-short-side radius forms an exact stadium section.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "profileLoop"
          },
          "innerWidth": {
            "type": "number",
            "default": 35.2,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 14.6,
            "description": "Inner height"
          },
          "sectionWidth": {
            "type": "number",
            "default": 5.5,
            "description": "Front section width"
          },
          "sectionDepth": {
            "type": "number",
            "default": 6,
            "description": "Side section depth"
          },
          "sectionRadius": {
            "type": "number",
            "default": 2.5,
            "description": "Square section corner R"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Closed round-wire capsule loop with exact semicircular ends and straight runs. Set inner width, inner height and wire diameter; an unmarked seam is not guessed.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "capsuleWire"
          },
          "innerWidth": {
            "type": "number",
            "default": 34.9,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 13.9,
            "description": "Inner height"
          },
          "sectionSize": {
            "type": "number",
            "default": 6.1,
            "description": "Wire diameter / square size"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "半圆冠、两直腿、底部圆弯；内高量到下横杠上沿。圆线、圆角方线或倒角方线截面。",
        "properties": {
          "kind": {
            "type": "string",
            "const": "dBuckle"
          },
          "section": {
            "type": "string",
            "default": "round",
            "description": "Section",
            "enum": [
              "round",
              "square",
              "chamferedSquare"
            ]
          },
          "sectionSize": {
            "type": "number",
            "default": 3,
            "description": "Wire diameter / square size"
          },
          "sectionRadius": {
            "type": "number",
            "default": 0.3,
            "description": "Square section corner R"
          },
          "sectionChamfer": {
            "type": "number",
            "default": 0.6,
            "description": "Square section chamfer C"
          },
          "gapWidth": {
            "type": "number",
            "default": 0,
            "description": "Bottom gap (0 = closed)"
          },
          "innerWidth": {
            "type": "number",
            "default": 24,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 19,
            "description": "Inner height"
          },
          "innerRadius": {
            "type": "number",
            "default": 2,
            "description": "Bottom inner radius"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "圆角方线 U 主体与固定圆杆融合；杆底与脚底齐平。",
        "properties": {
          "kind": {
            "type": "string",
            "const": "dBarBuckle"
          },
          "section": {
            "type": "string",
            "default": "square",
            "description": "section"
          },
          "sectionSize": {
            "type": "number",
            "default": 6,
            "description": "Wire diameter / square size"
          },
          "sectionRadius": {
            "type": "number",
            "default": 0.6,
            "description": "Square section corner R"
          },
          "sectionChamfer": {
            "type": "number",
            "default": 0.6,
            "description": "sectionChamfer"
          },
          "gapWidth": {
            "type": "number",
            "default": 0,
            "description": "gapWidth"
          },
          "innerWidth": {
            "type": "number",
            "default": 32,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 24,
            "description": "Inner height"
          },
          "barDiameter": {
            "type": "number",
            "default": 4.5,
            "description": "Bar diameter"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "Constant-section rounded rectangular frame. A closed round-wire frame supports an inner short side at least 2.5 times the wire diameter; other variants require four times the section size.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "rectBuckle"
          },
          "section": {
            "type": "string",
            "default": "round",
            "description": "Section",
            "enum": [
              "round",
              "square",
              "chamferedSquare"
            ]
          },
          "sectionSize": {
            "type": "number",
            "default": 3,
            "description": "Wire diameter / square size"
          },
          "sectionRadius": {
            "type": "number",
            "default": 0.3,
            "description": "Square section corner R"
          },
          "sectionChamfer": {
            "type": "number",
            "default": 0.6,
            "description": "Square section chamfer C"
          },
          "gapWidth": {
            "type": "number",
            "default": 0,
            "description": "Bottom gap (0 = closed)"
          },
          "innerWidth": {
            "type": "number",
            "default": 28,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 20,
            "description": "Inner height"
          },
          "innerRadius": {
            "type": "number",
            "default": 3,
            "description": "Frame inner radius"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "The inner height spans the full frame; the fused round bar has an editable vertical offset and no opening. Compact round-wire frames require an inner short side at least 2.5 wire diameters and each window at least one wire diameter high.",
        "properties": {
          "kind": {
            "type": "string",
            "const": "sliderBuckle"
          },
          "section": {
            "type": "string",
            "default": "round",
            "description": "Section",
            "enum": [
              "round",
              "square",
              "chamferedSquare"
            ]
          },
          "sectionSize": {
            "type": "number",
            "default": 3,
            "description": "Wire diameter / square size"
          },
          "sectionRadius": {
            "type": "number",
            "default": 0.3,
            "description": "Square section corner R"
          },
          "sectionChamfer": {
            "type": "number",
            "default": 0.6,
            "description": "Square section chamfer C"
          },
          "gapWidth": {
            "type": "number",
            "default": 0,
            "description": "gapWidth"
          },
          "innerWidth": {
            "type": "number",
            "default": 30,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 24,
            "description": "Inner height"
          },
          "innerRadius": {
            "type": "number",
            "default": 3,
            "description": "Frame inner radius"
          },
          "barDiameter": {
            "type": "number",
            "default": 2.5,
            "description": "Bar diameter"
          },
          "barOffset": {
            "type": "number",
            "default": 0,
            "description": "Bar offset (+up)"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "四段相切圆弧，不是椭圆或跑道圈；缝在右端正中。",
        "properties": {
          "kind": {
            "type": "string",
            "const": "ovalBuckle"
          },
          "section": {
            "type": "string",
            "default": "round",
            "description": "Section",
            "enum": [
              "round",
              "square",
              "chamferedSquare"
            ]
          },
          "sectionSize": {
            "type": "number",
            "default": 3,
            "description": "Wire diameter / square size"
          },
          "sectionRadius": {
            "type": "number",
            "default": 0.3,
            "description": "Square section corner R"
          },
          "sectionChamfer": {
            "type": "number",
            "default": 0.6,
            "description": "Square section chamfer C"
          },
          "gapWidth": {
            "type": "number",
            "default": 0,
            "description": "Right gap (0 = closed)"
          },
          "innerWidth": {
            "type": "number",
            "default": 28,
            "description": "Inner width"
          },
          "innerHeight": {
            "type": "number",
            "default": 16,
            "description": "Inner height"
          },
          "innerRadius": {
            "type": "number",
            "default": 5.6,
            "description": "End inner radius"
          }
        }
      },
      {
        "type": "object",
        "required": [
          "kind"
        ],
        "additionalProperties": false,
        "description": "平面环片，外径 = 内径 + 2 × 径向宽度；无额外倒角。",
        "properties": {
          "kind": {
            "type": "string",
            "const": "washer"
          },
          "innerDiameter": {
            "type": "number",
            "default": 10,
            "description": "Inner diameter"
          },
          "sectionSize": {
            "type": "number",
            "default": 3,
            "description": "Radial width"
          },
          "innerHeight": {
            "type": "number",
            "default": 1.5,
            "description": "Thickness"
          }
        }
      }
    ]
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {
    "uEndHolePlate": {
      "outerWidth": 22,
      "innerWidth": 10,
      "totalHeight": 31.7,
      "thickness": 3,
      "holeDiameter": 3.3,
      "holeInset": 2.7
    },
    "ellipseSectionRing": {
      "innerDiameter": 37.4,
      "sectionWidth": 4.1,
      "sectionDepth": 5
    },
    "arcBandPlate": {
      "outerRadius": 20,
      "innerRadius": 15,
      "centerAngle": 270,
      "spanAngle": 111.2807337553,
      "thickness": 5,
      "holeInsetAngle": 8.4521160504,
      "holeDiameter": 2.3,
      "recessDiameter": 3.3,
      "recessDepth": 0
    },
    "gableOpenFrame": {
      "outerWidth": 25,
      "innerWidth": 20,
      "outerPeakHeight": 16,
      "outerShoulderHeight": 12.4,
      "innerPeakHeight": 13.5,
      "innerShoulderHeight": 10.5,
      "thickness": 4,
      "endRadius": 1
    },
    "ellipseSectionRectFrame": {
      "innerWidth": 25,
      "innerHeight": 19,
      "innerRadius": 2.5,
      "sectionWidth": 5.5,
      "sectionDepth": 6
    },
    "dFlatFrame": {
      "outerWidth": 28,
      "outerHeight": 25,
      "innerWidth": 20,
      "innerHeight": 17,
      "outerBottomRadius": 3.5,
      "innerBottomRadius": 2,
      "thickness": 4,
      "gapWidth": 0
    },
    "archedTwinWindowPlate": {
      "outerWidth": 32.9,
      "outerHeight": 25.5,
      "outerRadius": 3,
      "windowWidth": 25.4,
      "totalInnerHeight": 18.5,
      "windowRadius": 0.5,
      "barWidth": 3.5,
      "bendRadius": 43.90964782342324,
      "radialThickness": 2.3
    },
    "bowedTwinWindowPlate": {
      "outerHeight": 24.5,
      "topStraightWidth": 30.2527,
      "sideRadius": 35.688467,
      "cornerRadius": 6,
      "windowWidth": 32,
      "windowHeight": 6.55,
      "windowSpacing": 10.35,
      "thickness": 3.7,
      "edgeRadius": 0.8
    },
    "flatFrame": {
      "outerWidth": 40,
      "outerHeight": 28,
      "innerWidth": 28,
      "innerHeight": 16,
      "outerRadius": 5,
      "innerRadius": 3,
      "thickness": 3
    },
    "roundedFlatFrame": {
      "outerWidth": 40,
      "outerHeight": 28,
      "innerWidth": 30,
      "innerHeight": 18,
      "outerRadius": 5,
      "innerRadius": 2,
      "thickness": 4,
      "edgeRadius": 1.5
    },
    "twinWindowPlate": {
      "outerWidth": 44.8,
      "outerHeight": 26.6,
      "outerRadius": 3.5,
      "windowWidth": 37.8,
      "totalInnerHeight": 19.6,
      "windowRadius": 2,
      "barWidth": 3.5,
      "thickness": 3.5,
      "edgeRadius": 0.5
    },
    "mountingPlate": {
      "width": 40,
      "depth": 16,
      "thickness": 3,
      "cornerRadius": 3,
      "holeDiameter": 4,
      "holeSpacing": 24
    },
    "fourHolePlate": {
      "width": 50,
      "depth": 30,
      "thickness": 3,
      "cornerRadius": 0,
      "holeDiameter": 4,
      "insetX": 5,
      "insetY": 5
    },
    "bossPlate": {
      "width": 40,
      "depth": 16,
      "thickness": 3,
      "cornerRadius": 3,
      "bossSpacing": 24,
      "bossOuterDiameter": 8,
      "boreDiameter": 4,
      "bossHeight": 6
    },
    "flangedBushing": {
      "bodyDiameter": 12,
      "flangeDiameter": 20,
      "boreDiameter": 6,
      "bodyHeight": 10,
      "flangeThickness": 3
    },
    "openArcRing": {
      "section": "round",
      "innerDiameter": 30,
      "sectionSize": 4,
      "sectionRadius": 0.4,
      "sectionChamfer": 0.6,
      "openingAngle": 70
    },
    "roundedBossTray": {
      "outerWidth": 60,
      "outerDepth": 38,
      "height": 12,
      "cornerRadius": 6,
      "wallThickness": 2,
      "floorThickness": 2,
      "bossSpacing": 30,
      "bossOuterDiameter": 7,
      "boreDiameter": 3,
      "bossHeight": 7
    },
    "roundBadge": {
      "diameter": 40,
      "thickness": 2,
      "rimWidth": 2,
      "rimHeight": 0.8,
      "postSpacing": 18,
      "postDiameter": 4,
      "postHeight": 4,
      "postBoreDiameter": 0
    },
    "thinWallTray": {
      "outerWidth": 60,
      "outerDepth": 36,
      "height": 14,
      "wallThickness": 2,
      "floorThickness": 2,
      "bossSpacing": 30,
      "bossOuterDiameter": 8,
      "boreDiameter": 3,
      "bossHeight": 8
    },
    "tube": {
      "outerDiameter": 13.4,
      "innerDiameter": 12.4,
      "height": 3
    },
    "counterboreTool": {
      "holeDiameter": 4,
      "depth": 8,
      "headDiameter": 8,
      "headDepth": 2,
      "style": "bore"
    },
    "ring": {
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerDiameter": 24
    },
    "ringBar": {
      "section": "round",
      "innerDiameter": 20,
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "barDiameter": 2,
      "barOffset": 0,
      "barDepthOffset": 0
    },
    "ellipseBar": {
      "innerWidth": 35,
      "innerHeight": 25,
      "sectionSize": 5,
      "barDiameter": 5,
      "barDepthOffset": 0
    },
    "ellipseOpenWire": {
      "innerWidth": 15,
      "innerHeight": 20,
      "sectionSize": 3.5,
      "gapWidth": 0.2
    },
    "profileLoop": {
      "innerWidth": 35.2,
      "innerHeight": 14.6,
      "sectionWidth": 5.5,
      "sectionDepth": 6,
      "sectionRadius": 2.5
    },
    "capsuleWire": {
      "innerWidth": 34.9,
      "innerHeight": 13.9,
      "sectionSize": 6.1
    },
    "dBuckle": {
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 24,
      "innerHeight": 19,
      "innerRadius": 2
    },
    "dBarBuckle": {
      "section": "square",
      "sectionSize": 6,
      "sectionRadius": 0.6,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 32,
      "innerHeight": 24,
      "barDiameter": 4.5
    },
    "rectBuckle": {
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 28,
      "innerHeight": 20,
      "innerRadius": 3
    },
    "sliderBuckle": {
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 30,
      "innerHeight": 24,
      "innerRadius": 3,
      "barDiameter": 2.5,
      "barOffset": 0
    },
    "ovalBuckle": {
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 28,
      "innerHeight": 16,
      "innerRadius": 5.6
    },
    "washer": {
      "innerDiameter": 10,
      "sectionSize": 3,
      "innerHeight": 1.5
    }
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "Parameterized product model; prefer getTool({id:\"quickModel\"}) then execute(request)",
  "category": "creation",
  "synonyms": [
    "quickModel",
    "快捷模型"
  ],
  "description": "Parameterized product model; prefer getTool({id:\"quickModel\"}) then execute(request)",
  "schemaHash": "sha256:9b68d004b2e25581aa2e42e5ce6add9c563e9c1791d565910dd4eeb796f1aa61",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code."
  ],
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "tube"
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "tube"
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "templates": [
    {
      "kind": "uEndHolePlate",
      "title": "Arched U plate with two end holes",
      "description": "One flat U plate with concentric semicircular crowns, equal-width straight legs and one through-hole at each end. No second assembly component, thread or round-wire section.",
      "defaults": {
        "outerWidth": 22,
        "innerWidth": 10,
        "totalHeight": 31.7,
        "thickness": 3,
        "holeDiameter": 3.3,
        "holeInset": 2.7
      },
      "fields": [
        {
          "key": "outerWidth",
          "label": "外宽",
          "labelEn": "Outer width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "totalHeight",
          "label": "外总高",
          "labelEn": "Total height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "板厚",
          "labelEn": "Plate thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "holeDiameter",
          "label": "两端通孔直径",
          "labelEn": "End-hole diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "holeInset",
          "label": "孔心距直腿端面",
          "labelEn": "Hole center inset from leg end",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "uEndHolePlate"
      },
      "normalExample": {
        "kind": "uEndHolePlate",
        "outerWidth": 22,
        "innerWidth": 10,
        "totalHeight": 31.7,
        "thickness": 3,
        "holeDiameter": 3.3,
        "holeInset": 2.7
      }
    },
    {
      "kind": "ellipseSectionRing",
      "title": "Circular ring with elliptical section",
      "description": "Circular ring swept from an elliptical section with independent front band width and side depth. Section shape is an editable candidate to verify against the source.",
      "defaults": {
        "innerDiameter": 37.4,
        "sectionWidth": 4.1,
        "sectionDepth": 5
      },
      "fields": [
        {
          "key": "innerDiameter",
          "label": "正面内径",
          "labelEn": "Inner front diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionWidth",
          "label": "正面料宽",
          "labelEn": "Front band width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionDepth",
          "label": "侧面总深度",
          "labelEn": "Side depth",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "ellipseSectionRing"
      },
      "normalExample": {
        "kind": "ellipseSectionRing",
        "innerDiameter": 37.4,
        "sectionWidth": 4.1,
        "sectionDepth": 5
      }
    },
    {
      "kind": "arcBandPlate",
      "title": "Two-hole annular band plate",
      "description": "Annular band segment with editable sweep, plate thickness, symmetric end-hole inset and optional counterbores. Threads and mating parts are separate.",
      "defaults": {
        "outerRadius": 20,
        "innerRadius": 15,
        "centerAngle": 270,
        "spanAngle": 111.2807337553,
        "thickness": 5,
        "holeInsetAngle": 8.4521160504,
        "holeDiameter": 2.3,
        "recessDiameter": 3.3,
        "recessDepth": 0
      },
      "fields": [
        {
          "key": "outerRadius",
          "label": "外弧半径",
          "labelEn": "Outer radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerRadius",
          "label": "内弧半径",
          "labelEn": "Inner radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "centerAngle",
          "label": "弧中心角（°）",
          "labelEn": "Arc center angle",
          "type": "number",
          "min": -360,
          "step": 1
        },
        {
          "key": "spanAngle",
          "label": "弧跨度（°）",
          "labelEn": "Arc sweep angle",
          "type": "number",
          "min": 1,
          "step": 1
        },
        {
          "key": "thickness",
          "label": "板厚",
          "labelEn": "Plate thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "holeInsetAngle",
          "label": "两端孔退让角（°）",
          "labelEn": "Hole inset from each end",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "holeDiameter",
          "label": "通孔直径",
          "labelEn": "Through-hole diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "recessDiameter",
          "label": "上表面沉孔直径",
          "labelEn": "Top recess diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "recessDepth",
          "label": "上表面沉孔深度",
          "labelEn": "Top recess depth",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "arcBandPlate"
      },
      "normalExample": {
        "kind": "arcBandPlate",
        "outerRadius": 20,
        "innerRadius": 15,
        "centerAngle": 270,
        "spanAngle": 111.2807337553,
        "thickness": 5,
        "holeInsetAngle": 8.4521160504,
        "holeDiameter": 2.3,
        "recessDiameter": 3.3,
        "recessDepth": 0
      }
    },
    {
      "kind": "gableOpenFrame",
      "title": "Open gable frame",
      "description": "Open gable frame with straight legs, sloped shoulders and rounded open ends. Independent inner/outer widths, shoulder and peak heights, depth and end radius.",
      "defaults": {
        "outerWidth": 25,
        "innerWidth": 20,
        "outerPeakHeight": 16,
        "outerShoulderHeight": 12.4,
        "innerPeakHeight": 13.5,
        "innerShoulderHeight": 10.5,
        "thickness": 4,
        "endRadius": 1
      },
      "fields": [
        {
          "key": "outerWidth",
          "label": "外宽",
          "labelEn": "Outer width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerPeakHeight",
          "label": "外峰高",
          "labelEn": "Outer peak height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerShoulderHeight",
          "label": "外肩高",
          "labelEn": "Outer shoulder height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerPeakHeight",
          "label": "内峰高",
          "labelEn": "Inner peak height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerShoulderHeight",
          "label": "内肩高",
          "labelEn": "Inner shoulder height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "板厚",
          "labelEn": "Plate depth",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "endRadius",
          "label": "脚端 R",
          "labelEn": "Leg end radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "gableOpenFrame"
      },
      "normalExample": {
        "kind": "gableOpenFrame",
        "outerWidth": 25,
        "innerWidth": 20,
        "outerPeakHeight": 16,
        "outerShoulderHeight": 12.4,
        "innerPeakHeight": 13.5,
        "innerShoulderHeight": 10.5,
        "thickness": 4,
        "endRadius": 1
      }
    },
    {
      "kind": "ellipseSectionRectFrame",
      "title": "Rounded rectangle with elliptical section",
      "description": "Sweep an elliptical cross-section around a rounded rectangular centerline. Front band width and side depth are independent; the inner planar radius is separate from section shape.",
      "defaults": {
        "innerWidth": 25,
        "innerHeight": 19,
        "innerRadius": 2.5,
        "sectionWidth": 5.5,
        "sectionDepth": 6
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerRadius",
          "label": "平面内 R",
          "labelEn": "Inner planar radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionWidth",
          "label": "正面料宽",
          "labelEn": "Front band width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionDepth",
          "label": "侧面深度",
          "labelEn": "Side depth",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "ellipseSectionRectFrame"
      },
      "normalExample": {
        "kind": "ellipseSectionRectFrame",
        "innerWidth": 25,
        "innerHeight": 19,
        "innerRadius": 2.5,
        "sectionWidth": 5.5,
        "sectionDepth": 6
      }
    },
    {
      "kind": "dFlatFrame",
      "title": "Flat D frame with independent bottom radii",
      "description": "Flat D frame with semicircular crown, straight legs, independent inner/outer bottom radii and optional measured bottom gap. Thickness is a flat plate depth, not a round-wire section.",
      "defaults": {
        "outerWidth": 28,
        "outerHeight": 25,
        "innerWidth": 20,
        "innerHeight": 17,
        "outerBottomRadius": 3.5,
        "innerBottomRadius": 2,
        "thickness": 4,
        "gapWidth": 0
      },
      "fields": [
        {
          "key": "outerWidth",
          "label": "外宽",
          "labelEn": "Outer width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerHeight",
          "label": "外高",
          "labelEn": "Outer height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerBottomRadius",
          "label": "底外 R",
          "labelEn": "Outer bottom radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "innerBottomRadius",
          "label": "底内 R",
          "labelEn": "Inner bottom radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "平板厚度",
          "labelEn": "Flat plate thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "gapWidth",
          "label": "底部实际缝宽（0 闭合）",
          "labelEn": "Bottom gap (0 = closed)",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "dFlatFrame"
      },
      "normalExample": {
        "kind": "dFlatFrame",
        "outerWidth": 28,
        "outerHeight": 25,
        "innerWidth": 20,
        "innerHeight": 17,
        "outerBottomRadius": 3.5,
        "innerBottomRadius": 2,
        "thickness": 4,
        "gapWidth": 0
      }
    },
    {
      "kind": "archedTwinWindowPlate",
      "title": "Cylindrically arched twin-window plate",
      "description": "Intersect a rounded twin-window footprint with a coaxial cylindrical wall to create an arched plate. Set outer bend radius and radial thickness independently. Projected strip construction without source-specific edge treatment; round-wire frames need another tool.",
      "defaults": {
        "outerWidth": 32.9,
        "outerHeight": 25.5,
        "outerRadius": 3,
        "windowWidth": 25.4,
        "totalInnerHeight": 18.5,
        "windowRadius": 0.5,
        "barWidth": 3.5,
        "bendRadius": 43.90964782342324,
        "radialThickness": 2.3
      },
      "fields": [
        {
          "key": "outerWidth",
          "label": "外宽",
          "labelEn": "Outer width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerHeight",
          "label": "外高",
          "labelEn": "Outer height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerRadius",
          "label": "外轮廓平面 R",
          "labelEn": "Outer planar radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "windowWidth",
          "label": "每孔净宽",
          "labelEn": "Window width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "totalInnerHeight",
          "label": "双孔与中条总高",
          "labelEn": "Total inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "windowRadius",
          "label": "孔角平面 R",
          "labelEn": "Window planar radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "barWidth",
          "label": "中条宽",
          "labelEn": "Center bar width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bendRadius",
          "label": "外侧拱弧 R",
          "labelEn": "Outer bend radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "radialThickness",
          "label": "径向板厚",
          "labelEn": "Radial thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "archedTwinWindowPlate"
      },
      "normalExample": {
        "kind": "archedTwinWindowPlate",
        "outerWidth": 32.9,
        "outerHeight": 25.5,
        "outerRadius": 3,
        "windowWidth": 25.4,
        "totalInnerHeight": 18.5,
        "windowRadius": 0.5,
        "barWidth": 3.5,
        "bendRadius": 43.90964782342324,
        "radialThickness": 2.3
      }
    },
    {
      "kind": "bowedTwinWindowPlate",
      "title": "Bowed-side twin-window plate",
      "description": "A flat plate with straight top/bottom, tangent bowed sides and four small corner arcs, plus two symmetric capsule windows. Optional edge fillet. Symmetric parameter model only.",
      "defaults": {
        "outerHeight": 24.5,
        "topStraightWidth": 30.2527,
        "sideRadius": 35.688467,
        "cornerRadius": 6,
        "windowWidth": 32,
        "windowHeight": 6.55,
        "windowSpacing": 10.35,
        "thickness": 3.7,
        "edgeRadius": 0.8
      },
      "fields": [
        {
          "key": "outerHeight",
          "label": "外高",
          "labelEn": "Outer height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "topStraightWidth",
          "label": "上/下直段长度",
          "labelEn": "Top/bottom straight length",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sideRadius",
          "label": "侧边鼓弧 R",
          "labelEn": "Bowed side radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "cornerRadius",
          "label": "四角 R",
          "labelEn": "Corner radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "windowWidth",
          "label": "每孔净宽",
          "labelEn": "Window width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "windowHeight",
          "label": "每孔净高",
          "labelEn": "Window height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "windowSpacing",
          "label": "两孔中心距",
          "labelEn": "Window center spacing",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "板厚",
          "labelEn": "Thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "edgeRadius",
          "label": "前后边缘 R",
          "labelEn": "Front/back edge radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "bowedTwinWindowPlate"
      },
      "normalExample": {
        "kind": "bowedTwinWindowPlate",
        "outerHeight": 24.5,
        "topStraightWidth": 30.2527,
        "sideRadius": 35.688467,
        "cornerRadius": 6,
        "windowWidth": 32,
        "windowHeight": 6.55,
        "windowSpacing": 10.35,
        "thickness": 3.7,
        "edgeRadius": 0.8
      }
    },
    {
      "kind": "flatFrame",
      "title": "Flat frame with independent corner radii",
      "description": "Independent inner/outer outlines and thickness. Half-short-side radii allow capsule frames. A parametric tool, not a complete reconstruction of an IGS part.",
      "defaults": {
        "outerWidth": 40,
        "outerHeight": 28,
        "innerWidth": 28,
        "innerHeight": 16,
        "outerRadius": 5,
        "innerRadius": 3,
        "thickness": 3
      },
      "fields": [
        {
          "key": "outerWidth",
          "label": "外宽",
          "labelEn": "Outer width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerHeight",
          "label": "外高",
          "labelEn": "Outer height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerRadius",
          "label": "外轮廓 R",
          "labelEn": "Outer corner radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "innerRadius",
          "label": "内轮廓 R",
          "labelEn": "Inner corner radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "厚度",
          "labelEn": "Thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "flatFrame"
      },
      "normalExample": {
        "kind": "flatFrame",
        "outerWidth": 40,
        "outerHeight": 28,
        "innerWidth": 28,
        "innerHeight": 16,
        "outerRadius": 5,
        "innerRadius": 3,
        "thickness": 3
      }
    },
    {
      "kind": "roundedFlatFrame",
      "title": "Rounded frame with independent radii",
      "description": "A flat frame with independent inner and outer corner radii, then one exact fillet of every sharp edge. The specified edge radius fails atomically if unsolvable. Near half-thickness can approximate a round section but is not certified as a semicircle.",
      "defaults": {
        "outerWidth": 40,
        "outerHeight": 28,
        "innerWidth": 30,
        "innerHeight": 18,
        "outerRadius": 5,
        "innerRadius": 2,
        "thickness": 4,
        "edgeRadius": 1.5
      },
      "fields": [
        {
          "key": "outerWidth",
          "label": "外宽",
          "labelEn": "Outer width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerHeight",
          "label": "外高",
          "labelEn": "Outer height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerRadius",
          "label": "外轮廓 R",
          "labelEn": "Outer corner radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "innerRadius",
          "label": "内轮廓 R",
          "labelEn": "Inner corner radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "厚度",
          "labelEn": "Thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "edgeRadius",
          "label": "整件圆边 R",
          "labelEn": "All-edge fillet radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "roundedFlatFrame"
      },
      "normalExample": {
        "kind": "roundedFlatFrame",
        "outerWidth": 40,
        "outerHeight": 28,
        "innerWidth": 30,
        "innerHeight": 18,
        "outerRadius": 5,
        "innerRadius": 2,
        "thickness": 4,
        "edgeRadius": 1.5
      }
    },
    {
      "kind": "twinWindowPlate",
      "title": "Flat twin-window buckle",
      "description": "A flat plate with two equal symmetric rounded windows and an integral center bridge. Independent outline, window and front/back edge radii. No round bar, offset windows or side arch.",
      "defaults": {
        "outerWidth": 44.8,
        "outerHeight": 26.6,
        "outerRadius": 3.5,
        "windowWidth": 37.8,
        "totalInnerHeight": 19.6,
        "windowRadius": 2,
        "barWidth": 3.5,
        "thickness": 3.5,
        "edgeRadius": 0.5
      },
      "fields": [
        {
          "key": "outerWidth",
          "label": "外宽",
          "labelEn": "Outer width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerHeight",
          "label": "外高",
          "labelEn": "Outer height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerRadius",
          "label": "外平面 R",
          "labelEn": "Outer planar radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "windowWidth",
          "label": "每孔净宽",
          "labelEn": "Window clear width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "totalInnerHeight",
          "label": "双孔与横条总内高",
          "labelEn": "Total inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "windowRadius",
          "label": "孔内平面 R",
          "labelEn": "Window planar radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "barWidth",
          "label": "中横条正面宽",
          "labelEn": "Center bridge width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "整板厚度",
          "labelEn": "Plate thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "edgeRadius",
          "label": "前后边缘截面 R",
          "labelEn": "Front/back edge radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "twinWindowPlate"
      },
      "normalExample": {
        "kind": "twinWindowPlate",
        "outerWidth": 44.8,
        "outerHeight": 26.6,
        "outerRadius": 3.5,
        "windowWidth": 37.8,
        "totalInnerHeight": 19.6,
        "windowRadius": 2,
        "barWidth": 3.5,
        "thickness": 3.5,
        "edgeRadius": 0.5
      }
    },
    {
      "kind": "mountingPlate",
      "title": "Two-hole rounded mounting plate",
      "description": "Two symmetric X-axis holes with independent center spacing. Plain through holes only; no threads, countersinks or counterbores.",
      "defaults": {
        "width": 40,
        "depth": 16,
        "thickness": 3,
        "cornerRadius": 3,
        "holeDiameter": 4,
        "holeSpacing": 24
      },
      "fields": [
        {
          "key": "width",
          "label": "板宽 X",
          "labelEn": "Plate width X",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "depth",
          "label": "板深 Y",
          "labelEn": "Plate depth Y",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "厚度",
          "labelEn": "Thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "cornerRadius",
          "label": "外角 R",
          "labelEn": "Outer corner radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "holeDiameter",
          "label": "孔径",
          "labelEn": "Hole diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "holeSpacing",
          "label": "两孔中心距",
          "labelEn": "Hole center spacing",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "mountingPlate"
      },
      "normalExample": {
        "kind": "mountingPlate",
        "width": 40,
        "depth": 16,
        "thickness": 3,
        "cornerRadius": 3,
        "holeDiameter": 4,
        "holeSpacing": 24
      }
    },
    {
      "kind": "fourHolePlate",
      "title": "Four-hole mounting plate",
      "description": "Rectangular plate with four through holes. Set X/Y edge insets and optional outer corner radius; no threads or counterbores.",
      "defaults": {
        "width": 50,
        "depth": 30,
        "thickness": 3,
        "cornerRadius": 0,
        "holeDiameter": 4,
        "insetX": 5,
        "insetY": 5
      },
      "fields": [
        {
          "key": "width",
          "label": "板宽 X",
          "labelEn": "Plate width X",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "depth",
          "label": "板深 Y",
          "labelEn": "Plate depth Y",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "厚度",
          "labelEn": "Thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "cornerRadius",
          "label": "外角 R",
          "labelEn": "Outer corner radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "holeDiameter",
          "label": "孔径",
          "labelEn": "Hole diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "insetX",
          "label": "左右孔心边距",
          "labelEn": "Hole inset X",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "insetY",
          "label": "前后孔心边距",
          "labelEn": "Hole inset Y",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "fourHolePlate"
      },
      "normalExample": {
        "kind": "fourHolePlate",
        "width": 50,
        "depth": 30,
        "thickness": 3,
        "cornerRadius": 0,
        "holeDiameter": 4,
        "insetX": 5,
        "insetY": 5
      }
    },
    {
      "kind": "bossPlate",
      "title": "Two hollow-boss mounting plate",
      "description": "A rounded plate with two symmetric hollow cylindrical bosses; each bore passes through both boss and plate. Generic parametric geometry, not a threaded, counterbored, or source-product reconstruction.",
      "defaults": {
        "width": 40,
        "depth": 16,
        "thickness": 3,
        "cornerRadius": 3,
        "bossSpacing": 24,
        "bossOuterDiameter": 8,
        "boreDiameter": 4,
        "bossHeight": 6
      },
      "fields": [
        {
          "key": "width",
          "label": "板宽 X",
          "labelEn": "Plate width X",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "depth",
          "label": "板深 Y",
          "labelEn": "Plate depth Y",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "板厚",
          "labelEn": "Plate thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "cornerRadius",
          "label": "板角 R",
          "labelEn": "Plate corner radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "bossSpacing",
          "label": "凸台中心距",
          "labelEn": "Boss center spacing",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bossOuterDiameter",
          "label": "凸台外径",
          "labelEn": "Boss outer diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "boreDiameter",
          "label": "通孔直径",
          "labelEn": "Through-bore diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bossHeight",
          "label": "凸台高度（板下）",
          "labelEn": "Boss height (below plate)",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "bossPlate"
      },
      "normalExample": {
        "kind": "bossPlate",
        "width": 40,
        "depth": 16,
        "thickness": 3,
        "cornerRadius": 3,
        "bossSpacing": 24,
        "bossOuterDiameter": 8,
        "boreDiameter": 4,
        "bossHeight": 6
      }
    },
    {
      "kind": "flangedBushing",
      "title": "Flanged bushing",
      "description": "A coaxial flange and cylindrical bushing with a straight bore through the full length. Generic parametric geometry, with no threads or source-product feature reconstruction.",
      "defaults": {
        "bodyDiameter": 12,
        "flangeDiameter": 20,
        "boreDiameter": 6,
        "bodyHeight": 10,
        "flangeThickness": 3
      },
      "fields": [
        {
          "key": "bodyDiameter",
          "label": "轴套外径",
          "labelEn": "Bushing body diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "flangeDiameter",
          "label": "法兰外径",
          "labelEn": "Flange diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "boreDiameter",
          "label": "通孔直径",
          "labelEn": "Through-bore diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bodyHeight",
          "label": "筒体高度",
          "labelEn": "Body height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "flangeThickness",
          "label": "法兰厚度",
          "labelEn": "Flange thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "flangedBushing"
      },
      "normalExample": {
        "kind": "flangedBushing",
        "bodyDiameter": 12,
        "flangeDiameter": 20,
        "boreDiameter": 6,
        "bodyHeight": 10,
        "flangeThickness": 3
      }
    },
    {
      "kind": "openArcRing",
      "title": "Wide-gap C ring",
      "description": "Constant-section circular arc with an adjustable opening angle for C rings, hook rings and open circular frames. End balls, hinges and variable sections are excluded.",
      "defaults": {
        "section": "round",
        "innerDiameter": 30,
        "sectionSize": 4,
        "sectionRadius": 0.4,
        "sectionChamfer": 0.6,
        "openingAngle": 70
      },
      "fields": [
        {
          "key": "innerDiameter",
          "label": "内径",
          "labelEn": "Inner diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "section",
          "label": "截面",
          "labelEn": "Section",
          "type": "select",
          "options": [
            {
              "value": "round",
              "label": "圆线",
              "labelEn": "Round wire"
            },
            {
              "value": "square",
              "label": "圆角方线",
              "labelEn": "Rounded square"
            },
            {
              "value": "chamferedSquare",
              "label": "倒角方线",
              "labelEn": "Chamfered square"
            }
          ]
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionRadius",
          "label": "方线截面 R（圆线忽略）",
          "labelEn": "Square section corner R",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "sectionChamfer",
          "label": "方线截面倒角 C（仅倒角方线）",
          "labelEn": "Square section chamfer C",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "openingAngle",
          "label": "开口角度（°）",
          "labelEn": "Opening angle (degrees)",
          "type": "number",
          "min": 5,
          "step": 1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "openArcRing"
      },
      "normalExample": {
        "kind": "openArcRing",
        "section": "round",
        "innerDiameter": 30,
        "sectionSize": 4,
        "sectionRadius": 0.4,
        "sectionChamfer": 0.6,
        "openingAngle": 70
      }
    },
    {
      "kind": "roundedBossTray",
      "title": "Rounded tray with two hollow bosses",
      "description": "Open rounded-rectangle tray with two hollow bosses on the inner floor. Outer corner radius, wall/floor thickness and boss dimensions are editable. Straight walls only; no draft, clips, lettering or texture.",
      "defaults": {
        "outerWidth": 60,
        "outerDepth": 38,
        "height": 12,
        "cornerRadius": 6,
        "wallThickness": 2,
        "floorThickness": 2,
        "bossSpacing": 30,
        "bossOuterDiameter": 7,
        "boreDiameter": 3,
        "bossHeight": 7
      },
      "fields": [
        {
          "key": "outerWidth",
          "label": "外宽 X",
          "labelEn": "Outer width X",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerDepth",
          "label": "外深 Y",
          "labelEn": "Outer depth Y",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "height",
          "label": "壳体总高",
          "labelEn": "Total height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "cornerRadius",
          "label": "外轮廓圆角 R",
          "labelEn": "Outer corner radius",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "wallThickness",
          "label": "侧壁厚",
          "labelEn": "Wall thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "floorThickness",
          "label": "底板厚",
          "labelEn": "Floor thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bossSpacing",
          "label": "两柱中心距 X",
          "labelEn": "Boss center spacing X",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bossOuterDiameter",
          "label": "柱外径",
          "labelEn": "Boss outer diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "boreDiameter",
          "label": "贯穿孔径",
          "labelEn": "Through-bore diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bossHeight",
          "label": "内底面以上柱高",
          "labelEn": "Boss height above inner floor",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "roundedBossTray"
      },
      "normalExample": {
        "kind": "roundedBossTray",
        "outerWidth": 60,
        "outerDepth": 38,
        "height": 12,
        "cornerRadius": 6,
        "wallThickness": 2,
        "floorThickness": 2,
        "bossSpacing": 30,
        "bossOuterDiameter": 7,
        "boreDiameter": 3,
        "bossHeight": 7
      }
    },
    {
      "kind": "roundBadge",
      "title": "Round badge base with two posts",
      "description": "One solid combining a round badge plate, raised front rim and two rear mounting posts. Posts may be hollow. Brand artwork, knurling, doming and production dimensions are excluded.",
      "defaults": {
        "diameter": 40,
        "thickness": 2,
        "rimWidth": 2,
        "rimHeight": 0.8,
        "postSpacing": 18,
        "postDiameter": 4,
        "postHeight": 4,
        "postBoreDiameter": 0
      },
      "fields": [
        {
          "key": "diameter",
          "label": "牌面直径",
          "labelEn": "Badge diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "thickness",
          "label": "牌面厚度",
          "labelEn": "Plate thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "rimWidth",
          "label": "正面环边宽",
          "labelEn": "Front rim width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "rimHeight",
          "label": "正面环边高度",
          "labelEn": "Front rim height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "postSpacing",
          "label": "背柱中心距 X",
          "labelEn": "Rear post spacing X",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "postDiameter",
          "label": "背柱直径",
          "labelEn": "Rear post diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "postHeight",
          "label": "背柱高度",
          "labelEn": "Rear post height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "postBoreDiameter",
          "label": "背柱孔径（0 为实心）",
          "labelEn": "Post bore diameter (0 = solid)",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "roundBadge"
      },
      "normalExample": {
        "kind": "roundBadge",
        "diameter": 40,
        "thickness": 2,
        "rimWidth": 2,
        "rimHeight": 0.8,
        "postSpacing": 18,
        "postDiameter": 4,
        "postHeight": 4,
        "postBoreDiameter": 0
      }
    },
    {
      "kind": "thinWallTray",
      "title": "Open tray with two hollow bosses",
      "description": "One fused solid, centered in XY, bottom at Z=0, open top. Clear cavity width/depth = outer width/depth minus twice wall thickness; clear height = height minus floor thickness. Two X-symmetric bosses rise from the inner floor; bores pass through bosses and floor. Straight walls/corners only; no draft, fillets, threads or assembly relationships.",
      "defaults": {
        "outerWidth": 60,
        "outerDepth": 36,
        "height": 14,
        "wallThickness": 2,
        "floorThickness": 2,
        "bossSpacing": 30,
        "bossOuterDiameter": 8,
        "boreDiameter": 3,
        "bossHeight": 8
      },
      "fields": [
        {
          "key": "outerWidth",
          "label": "外宽 X",
          "labelEn": "Outer width X",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "outerDepth",
          "label": "外深 Y",
          "labelEn": "Outer depth Y",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "height",
          "label": "壳体总高",
          "labelEn": "Total height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "wallThickness",
          "label": "侧壁厚",
          "labelEn": "Wall thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "floorThickness",
          "label": "底板厚",
          "labelEn": "Floor thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bossSpacing",
          "label": "两柱中心距 X",
          "labelEn": "Boss center spacing X",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bossOuterDiameter",
          "label": "柱外径",
          "labelEn": "Boss outer diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "boreDiameter",
          "label": "贯穿孔径",
          "labelEn": "Through-bore diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "bossHeight",
          "label": "内底面以上柱高",
          "labelEn": "Boss height above inner floor",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "thinWallTray"
      },
      "normalExample": {
        "kind": "thinWallTray",
        "outerWidth": 60,
        "outerDepth": 36,
        "height": 14,
        "wallThickness": 2,
        "floorThickness": 2,
        "bossSpacing": 30,
        "bossOuterDiameter": 8,
        "boreDiameter": 3,
        "bossHeight": 8
      }
    },
    {
      "kind": "tube",
      "title": "Tube (C-part default)",
      "description": "Coaxial tube; defaults 13.4 outer diameter, 12.4 inner diameter and 3 height for the user C-part.",
      "defaults": {
        "outerDiameter": 13.4,
        "innerDiameter": 12.4,
        "height": 3
      },
      "fields": [
        {
          "key": "outerDiameter",
          "label": "外径",
          "labelEn": "Outer diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerDiameter",
          "label": "内径",
          "labelEn": "Inner diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "height",
          "label": "高度",
          "labelEn": "Height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "tube"
      },
      "normalExample": {
        "kind": "tube",
        "outerDiameter": 13.4,
        "innerDiameter": 12.4,
        "height": 3
      }
    },
    {
      "kind": "counterboreTool",
      "title": "Counterbore / countersink tool",
      "description": "Tool solid: entry at Z=0, extending along +Z. Position at the workpiece surface, rotate 180 degrees if needed, then select the body first and subtract the tool.",
      "defaults": {
        "holeDiameter": 4,
        "depth": 8,
        "headDiameter": 8,
        "headDepth": 2,
        "style": "bore"
      },
      "fields": [
        {
          "key": "holeDiameter",
          "label": "孔直径",
          "labelEn": "Hole diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "depth",
          "label": "总深",
          "labelEn": "Total depth",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "headDiameter",
          "label": "头径",
          "labelEn": "Head diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "headDepth",
          "label": "头深",
          "labelEn": "Head depth",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "style",
          "label": "类型",
          "labelEn": "Style",
          "type": "select",
          "options": [
            {
              "value": "bore",
              "label": "沉孔",
              "labelEn": "Counterbore"
            },
            {
              "value": "sink",
              "label": "沉头孔",
              "labelEn": "Countersink"
            }
          ]
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "counterboreTool"
      },
      "normalExample": {
        "kind": "counterboreTool",
        "holeDiameter": 4,
        "depth": 8,
        "headDiameter": 8,
        "headDepth": 2,
        "style": "bore"
      }
    },
    {
      "kind": "ring",
      "title": "Ring",
      "description": "同心圆恒截面单圈；开缝为底部正中平行平切。",
      "defaults": {
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerDiameter": 24
      },
      "fields": [
        {
          "key": "innerDiameter",
          "label": "内径",
          "labelEn": "Inner diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "section",
          "label": "截面",
          "labelEn": "Section",
          "type": "select",
          "options": [
            {
              "value": "round",
              "label": "圆线",
              "labelEn": "Round wire"
            },
            {
              "value": "square",
              "label": "圆角方线",
              "labelEn": "Rounded square"
            },
            {
              "value": "chamferedSquare",
              "label": "倒角方线",
              "labelEn": "Chamfered square"
            }
          ]
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionRadius",
          "label": "方线截面 R（圆线忽略）",
          "labelEn": "Square section corner R",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "sectionChamfer",
          "label": "方线截面倒角 C（仅倒角方线）",
          "labelEn": "Square section chamfer C",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "gapWidth",
          "label": "底部实际缝宽（0 闭合）",
          "labelEn": "Bottom gap (0 = closed)",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "ring"
      },
      "normalExample": {
        "kind": "ring",
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerDiameter": 24
      }
    },
    {
      "kind": "ringBar",
      "title": "Ring with fixed crossbar",
      "description": "A constant-section circular frame fused to one round X-axis crossbar. The bar has editable Y and depth Z offsets. Moving bars, hinges and exact joint transitions are excluded.",
      "defaults": {
        "section": "round",
        "innerDiameter": 20,
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "barDiameter": 2,
        "barOffset": 0,
        "barDepthOffset": 0
      },
      "fields": [
        {
          "key": "innerDiameter",
          "label": "环内径",
          "labelEn": "Ring inner diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "section",
          "label": "截面",
          "labelEn": "Section",
          "type": "select",
          "options": [
            {
              "value": "round",
              "label": "圆线",
              "labelEn": "Round wire"
            },
            {
              "value": "square",
              "label": "圆角方线",
              "labelEn": "Rounded square"
            },
            {
              "value": "chamferedSquare",
              "label": "倒角方线",
              "labelEn": "Chamfered square"
            }
          ]
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionRadius",
          "label": "方线截面 R（圆线忽略）",
          "labelEn": "Square section corner R",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "sectionChamfer",
          "label": "方线截面倒角 C（仅倒角方线）",
          "labelEn": "Square section chamfer C",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "barDiameter",
          "label": "横杆直径",
          "labelEn": "Bar diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "barOffset",
          "label": "横杆 Y 偏移",
          "labelEn": "Bar Y offset",
          "type": "number",
          "min": -100,
          "step": 0.1
        },
        {
          "key": "barDepthOffset",
          "label": "横杆 Z 错层",
          "labelEn": "Bar Z depth offset",
          "type": "number",
          "min": -100,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "ringBar"
      },
      "normalExample": {
        "kind": "ringBar",
        "section": "round",
        "innerDiameter": 20,
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "barDiameter": 2,
        "barOffset": 0,
        "barDepthOffset": 0
      }
    },
    {
      "kind": "ellipseBar",
      "title": "Elliptical ring with fixed bar",
      "description": "Offset a true inner ellipse for a round-wire sweep and fuse one centered fixed round bar. Read back exact bounds; source spline and joint continuity still require comparison.",
      "defaults": {
        "innerWidth": 35,
        "innerHeight": 25,
        "sectionSize": 5,
        "barDiameter": 5,
        "barDepthOffset": 0
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内椭圆长径",
          "labelEn": "Inner ellipse major diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内椭圆短径",
          "labelEn": "Inner ellipse minor diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "barDiameter",
          "label": "横杆直径",
          "labelEn": "Bar diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "barDepthOffset",
          "label": "横杆 Z 错层",
          "labelEn": "Bar Z depth offset",
          "type": "number",
          "min": -100,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "ellipseBar"
      },
      "normalExample": {
        "kind": "ellipseBar",
        "innerWidth": 35,
        "innerHeight": 25,
        "sectionSize": 5,
        "barDiameter": 5,
        "barDepthOffset": 0
      }
    },
    {
      "kind": "ellipseOpenWire",
      "title": "Open round-wire ellipse from inner outline",
      "description": "Sweep round wire along a half-wire outward offset of a true inner ellipse, then cut a bottom-center parallel flat gap. Source drawings with a true outer ellipse need another tool.",
      "defaults": {
        "innerWidth": 15,
        "innerHeight": 20,
        "sectionSize": 3.5,
        "gapWidth": 0.2
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "gapWidth",
          "label": "底中实际平切缝宽",
          "labelEn": "Bottom-center parallel gap width",
          "type": "number",
          "min": 0.01,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "ellipseOpenWire"
      },
      "normalExample": {
        "kind": "ellipseOpenWire",
        "innerWidth": 15,
        "innerHeight": 20,
        "sectionSize": 3.5,
        "gapWidth": 0.2
      }
    },
    {
      "kind": "profileLoop",
      "title": "Capsule loop with rounded rectangular section",
      "description": "Closed capsule loop with semicircular ends and straight runs. Front width, side depth and section radius are independent; a half-short-side radius forms an exact stadium section.",
      "defaults": {
        "innerWidth": 35.2,
        "innerHeight": 14.6,
        "sectionWidth": 5.5,
        "sectionDepth": 6,
        "sectionRadius": 2.5
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionWidth",
          "label": "正面料宽",
          "labelEn": "Front section width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionDepth",
          "label": "侧面厚度",
          "labelEn": "Side section depth",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionRadius",
          "label": "方线截面 R（圆线忽略）",
          "labelEn": "Square section corner R",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "profileLoop"
      },
      "normalExample": {
        "kind": "profileLoop",
        "innerWidth": 35.2,
        "innerHeight": 14.6,
        "sectionWidth": 5.5,
        "sectionDepth": 6,
        "sectionRadius": 2.5
      }
    },
    {
      "kind": "capsuleWire",
      "title": "Round-wire capsule loop",
      "description": "Closed round-wire capsule loop with exact semicircular ends and straight runs. Set inner width, inner height and wire diameter; an unmarked seam is not guessed.",
      "defaults": {
        "innerWidth": 34.9,
        "innerHeight": 13.9,
        "sectionSize": 6.1
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "capsuleWire"
      },
      "normalExample": {
        "kind": "capsuleWire",
        "innerWidth": 34.9,
        "innerHeight": 13.9,
        "sectionSize": 6.1
      }
    },
    {
      "kind": "dBuckle",
      "title": "D buckle",
      "description": "半圆冠、两直腿、底部圆弯；内高量到下横杠上沿。圆线、圆角方线或倒角方线截面。",
      "defaults": {
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 24,
        "innerHeight": 19,
        "innerRadius": 2
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "section",
          "label": "截面",
          "labelEn": "Section",
          "type": "select",
          "options": [
            {
              "value": "round",
              "label": "圆线",
              "labelEn": "Round wire"
            },
            {
              "value": "square",
              "label": "圆角方线",
              "labelEn": "Rounded square"
            },
            {
              "value": "chamferedSquare",
              "label": "倒角方线",
              "labelEn": "Chamfered square"
            }
          ]
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionRadius",
          "label": "方线截面 R（圆线忽略）",
          "labelEn": "Square section corner R",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "sectionChamfer",
          "label": "方线截面倒角 C（仅倒角方线）",
          "labelEn": "Square section chamfer C",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "innerRadius",
          "label": "底内 R",
          "labelEn": "Bottom inner radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "gapWidth",
          "label": "底部实际缝宽（0 闭合）",
          "labelEn": "Bottom gap (0 = closed)",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "dBuckle"
      },
      "normalExample": {
        "kind": "dBuckle",
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 24,
        "innerHeight": 19,
        "innerRadius": 2
      }
    },
    {
      "kind": "dBarBuckle",
      "title": "D buckle with round bar",
      "description": "圆角方线 U 主体与固定圆杆融合；杆底与脚底齐平。",
      "defaults": {
        "section": "square",
        "sectionSize": 6,
        "sectionRadius": 0.6,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 32,
        "innerHeight": 24,
        "barDiameter": 4.5
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionRadius",
          "label": "方线截面 R（圆线忽略）",
          "labelEn": "Square section corner R",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "barDiameter",
          "label": "固定横杆直径",
          "labelEn": "Bar diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "dBarBuckle"
      },
      "normalExample": {
        "kind": "dBarBuckle",
        "section": "square",
        "sectionSize": 6,
        "sectionRadius": 0.6,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 32,
        "innerHeight": 24,
        "barDiameter": 4.5
      }
    },
    {
      "kind": "rectBuckle",
      "title": "Rectangular buckle",
      "description": "Constant-section rounded rectangular frame. A closed round-wire frame supports an inner short side at least 2.5 times the wire diameter; other variants require four times the section size.",
      "defaults": {
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 28,
        "innerHeight": 20,
        "innerRadius": 3
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "section",
          "label": "截面",
          "labelEn": "Section",
          "type": "select",
          "options": [
            {
              "value": "round",
              "label": "圆线",
              "labelEn": "Round wire"
            },
            {
              "value": "square",
              "label": "圆角方线",
              "labelEn": "Rounded square"
            },
            {
              "value": "chamferedSquare",
              "label": "倒角方线",
              "labelEn": "Chamfered square"
            }
          ]
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionRadius",
          "label": "方线截面 R（圆线忽略）",
          "labelEn": "Square section corner R",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "sectionChamfer",
          "label": "方线截面倒角 C（仅倒角方线）",
          "labelEn": "Square section chamfer C",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "innerRadius",
          "label": "框内 R",
          "labelEn": "Frame inner radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "gapWidth",
          "label": "底部实际缝宽（0 闭合）",
          "labelEn": "Bottom gap (0 = closed)",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "rectBuckle"
      },
      "normalExample": {
        "kind": "rectBuckle",
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 28,
        "innerHeight": 20,
        "innerRadius": 3
      }
    },
    {
      "kind": "sliderBuckle",
      "title": "Slider buckle",
      "description": "The inner height spans the full frame; the fused round bar has an editable vertical offset and no opening. Compact round-wire frames require an inner short side at least 2.5 wire diameters and each window at least one wire diameter high.",
      "defaults": {
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 30,
        "innerHeight": 24,
        "innerRadius": 3,
        "barDiameter": 2.5,
        "barOffset": 0
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "section",
          "label": "截面",
          "labelEn": "Section",
          "type": "select",
          "options": [
            {
              "value": "round",
              "label": "圆线",
              "labelEn": "Round wire"
            },
            {
              "value": "square",
              "label": "圆角方线",
              "labelEn": "Rounded square"
            },
            {
              "value": "chamferedSquare",
              "label": "倒角方线",
              "labelEn": "Chamfered square"
            }
          ]
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionRadius",
          "label": "方线截面 R（圆线忽略）",
          "labelEn": "Square section corner R",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "sectionChamfer",
          "label": "方线截面倒角 C（仅倒角方线）",
          "labelEn": "Square section chamfer C",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "innerRadius",
          "label": "框内 R",
          "labelEn": "Frame inner radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "barDiameter",
          "label": "横杆直径",
          "labelEn": "Bar diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "barOffset",
          "label": "横杆偏移（上正下负）",
          "labelEn": "Bar offset (+up)",
          "type": "number",
          "min": -100,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "sliderBuckle"
      },
      "normalExample": {
        "kind": "sliderBuckle",
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 30,
        "innerHeight": 24,
        "innerRadius": 3,
        "barDiameter": 2.5,
        "barOffset": 0
      }
    },
    {
      "kind": "ovalBuckle",
      "title": "Four-arc oval buckle",
      "description": "四段相切圆弧，不是椭圆或跑道圈；缝在右端正中。",
      "defaults": {
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 28,
        "innerHeight": 16,
        "innerRadius": 5.6
      },
      "fields": [
        {
          "key": "innerWidth",
          "label": "内宽",
          "labelEn": "Inner width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "内高",
          "labelEn": "Inner height",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "section",
          "label": "截面",
          "labelEn": "Section",
          "type": "select",
          "options": [
            {
              "value": "round",
              "label": "圆线",
              "labelEn": "Round wire"
            },
            {
              "value": "square",
              "label": "圆角方线",
              "labelEn": "Rounded square"
            },
            {
              "value": "chamferedSquare",
              "label": "倒角方线",
              "labelEn": "Chamfered square"
            }
          ]
        },
        {
          "key": "sectionSize",
          "label": "线径／方线边长",
          "labelEn": "Wire diameter / square size",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionRadius",
          "label": "方线截面 R（圆线忽略）",
          "labelEn": "Square section corner R",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "sectionChamfer",
          "label": "方线截面倒角 C（仅倒角方线）",
          "labelEn": "Square section chamfer C",
          "type": "number",
          "min": 0,
          "step": 0.1
        },
        {
          "key": "innerRadius",
          "label": "端部内 R",
          "labelEn": "End inner radius",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "gapWidth",
          "label": "右端实际缝宽（0 闭合）",
          "labelEn": "Right gap (0 = closed)",
          "type": "number",
          "min": 0,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "ovalBuckle"
      },
      "normalExample": {
        "kind": "ovalBuckle",
        "section": "round",
        "sectionSize": 3,
        "sectionRadius": 0.3,
        "sectionChamfer": 0.6,
        "gapWidth": 0,
        "innerWidth": 28,
        "innerHeight": 16,
        "innerRadius": 5.6
      }
    },
    {
      "kind": "washer",
      "title": "Flat washer",
      "description": "平面环片，外径 = 内径 + 2 × 径向宽度；无额外倒角。",
      "defaults": {
        "innerDiameter": 10,
        "sectionSize": 3,
        "innerHeight": 1.5
      },
      "fields": [
        {
          "key": "innerDiameter",
          "label": "内径",
          "labelEn": "Inner diameter",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "sectionSize",
          "label": "径向宽度",
          "labelEn": "Radial width",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        },
        {
          "key": "innerHeight",
          "label": "厚度",
          "labelEn": "Thickness",
          "type": "number",
          "min": 0.1,
          "step": 0.1
        }
      ],
      "knownUnsupportedCases": [
        "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
      ],
      "minimalExample": {
        "kind": "washer"
      },
      "normalExample": {
        "kind": "washer",
        "innerDiameter": 10,
        "sectionSize": 3,
        "innerHeight": 1.5
      }
    }
  ],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "快捷模型",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:ac292b8395f9ac25d195fb665836acf5fe65686a601b8b8e1cc3a3e32d1777f3"
}
```

## 工具 referenceExtrude · 选择一个闭合平面线框或单张平面面。直接复用精确圆弧/样条边，不离散成多边形。带孔请提供单张平面面；散边的多个闭环不会自动猜测内外关系。方向为世界 XYZ 向量，距离可正可负。保留来源；导出时选择新实体。不是自动修补或从零反求原件。

```json
{
  "id": "referenceExtrude",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "direction",
      "distance"
    ],
    "properties": {
      "direction": {
        "type": "array",
        "minItems": 3,
        "maxItems": 3,
        "items": {
          "type": "number"
        }
      },
      "distance": {
        "type": "number"
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. 选择一个闭合平面线框或单张平面面。直接复用精确圆弧/样条边，不离散成多边形。带孔请提供单张平面面；散边的多个闭环不会自动猜测内外关系。方向为世界 XYZ 向量，距离可正可负。保留来源；导出时选择新实体。不是自动修补或从零反求原件。",
  "title": "选择一个闭合平面线框或单张平面面。直接复用精确圆弧/样条边，不离散成多边形。带孔请提供单张平面面；散边的多个闭环不会自动猜测内外关系。方向为世界 XYZ 向量，距离可正可负。保留来源；导出时选择新实体。不是自动修补或从零反求原件。",
  "category": "reference",
  "synonyms": [
    "参考轮廓",
    "精确曲线",
    "拉伸",
    "参考轮廓拉伸"
  ],
  "description": "选择一个闭合平面线框或单张平面面。直接复用精确圆弧/样条边，不离散成多边形。带孔请提供单张平面面；散边的多个闭环不会自动猜测内外关系。方向为世界 XYZ 向量，距离可正可负。保留来源；导出时选择新实体。不是自动修补或从零反求原件。",
  "schemaHash": "sha256:04a3ee560cf73a99ce47ba09bd51796494e4c784bb04a30992e96d0fc6470016",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "选择一个闭合平面线框或单张平面面。直接复用精确圆弧/样条边，不离散成多边形。带孔请提供单张平面面；散边的多个闭环不会自动猜测内外关系。方向为世界 XYZ 向量，距离可正可负。保留来源；导出时选择新实体。不是自动修补或从零反求原件。"
  ],
  "minimalExample": {
    "op": "referenceExtrude",
    "params": {
      "direction": [
        0,
        0,
        1
      ],
      "distance": 3
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "referenceExtrude",
    "params": {
      "direction": [
        0,
        0,
        1
      ],
      "distance": 3
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "参考轮廓拉伸",
  "placementPolicy": {
    "mode": "spatial-operation",
    "placementSupported": true,
    "originUsage": "axis-plane-pivot-or-vector",
    "orientationUsage": "declared-transform-or-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:a6479a38c16e33b736f49a73a776c4ba0c57ee7ce9e324f82ba151b6903984af"
}
```

## 工具 referenceLoft · 按顺序选择 2–12 个平面闭合截面对象，每个对象仅一个外环，无内孔。复用精确曲线，支持不同位置/尺寸截面；由内核匹配边对应关系，结果须核对截面与外形。可选直纹。保留来源；失败不修改原工程。不保证任意原件完整重建。

```json
{
  "id": "referenceLoft",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "ruled": {
        "type": "boolean"
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 2,
    "maxItems": 12
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. 按顺序选择 2–12 个平面闭合截面对象，每个对象仅一个外环，无内孔。复用精确曲线，支持不同位置/尺寸截面；由内核匹配边对应关系，结果须核对截面与外形。可选直纹。保留来源；失败不修改原工程。不保证任意原件完整重建。",
  "title": "按顺序选择 2–12 个平面闭合截面对象，每个对象仅一个外环，无内孔。复用精确曲线，支持不同位置/尺寸截面；由内核匹配边对应关系，结果须核对截面与外形。可选直纹。保留来源；失败不修改原工程。不保证任意原件完整重建。",
  "category": "reference",
  "synonyms": [
    "参考截面",
    "精确曲线",
    "放样",
    "参考截面放样"
  ],
  "description": "按顺序选择 2–12 个平面闭合截面对象，每个对象仅一个外环，无内孔。复用精确曲线，支持不同位置/尺寸截面；由内核匹配边对应关系，结果须核对截面与外形。可选直纹。保留来源；失败不修改原工程。不保证任意原件完整重建。",
  "schemaHash": "sha256:1fb197e22fdd15041eca4ca75752cd7b47f34aadbef69b3e6a19ae3caa8a166f",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "按顺序选择 2–12 个平面闭合截面对象，每个对象仅一个外环，无内孔。复用精确曲线，支持不同位置/尺寸截面；由内核匹配边对应关系，结果须核对截面与外形。可选直纹。保留来源；失败不修改原工程。不保证任意原件完整重建。"
  ],
  "minimalExample": {
    "op": "referenceLoft",
    "params": {
      "ruled": false
    },
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "referenceLoft",
    "params": {
      "ruled": false
    },
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "参考截面放样",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:c59d186ac7f19bf515154ef7bfb5b0d0dbe68820c9a21994f7bfc91a1381dd3b"
}
```

## 工具 revolve · Revolve a closed profile

```json
{
  "id": "revolve",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "profile": {
        "type": "string",
        "description": "Closed cross-section",
        "enum": [
          "rectangle",
          "circle",
          "polygon",
          "roundedRectangle",
          "arc"
        ]
      },
      "width": {
        "type": "number",
        "description": "Width (mm)",
        "exclusiveMinimum": 0
      },
      "depth": {
        "type": "number",
        "description": "Depth (mm)",
        "exclusiveMinimum": 0
      },
      "radius": {
        "type": "number",
        "description": "Circle/arc radius (mm)",
        "exclusiveMinimum": 0
      },
      "cornerRadius": {
        "type": "number",
        "description": "Rounded rectangle corner radius; less than half shorter side (mm)",
        "exclusiveMinimum": 0
      },
      "points": {
        "type": "array",
        "minItems": 3,
        "maxItems": 1000,
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "minItems": 2,
          "maxItems": 2
        }
      },
      "startAngle": {
        "type": "number",
        "description": "Arc start (degrees)"
      },
      "endAngle": {
        "type": "number",
        "description": "Arc end (degrees); absolute span > 0 and < 360"
      },
      "closure": {
        "type": "string",
        "description": "Arc closure",
        "enum": [
          "sector",
          "segment"
        ]
      },
      "plane": {
        "type": "string",
        "description": "Global plane",
        "enum": [
          "XY",
          "XZ",
          "YZ"
        ]
      },
      "offset": {
        "type": "number",
        "description": "Horizontal in-plane offset from rotation axis (mm)"
      },
      "angle": {
        "type": "number",
        "description": "Degrees",
        "exclusiveMinimum": 0,
        "maximum": 360
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. XY revolves about global Y; XZ/YZ about global Z. Defaults angle=360,offset=10; avoid crossing rotation axis.",
  "title": "Revolve a closed profile",
  "category": "creation",
  "synonyms": [
    "revolve",
    "旋转成型"
  ],
  "description": "Revolve a closed profile",
  "schemaHash": "sha256:7f54589ff318b3af5cf56fafb396a52ca6bcf2cb9954d0b3d35ba68c1bceb259",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "XY revolves about global Y; XZ/YZ about global Z. Defaults angle=360,offset=10; avoid crossing rotation axis."
  ],
  "minimalExample": {
    "op": "revolve",
    "params": {
      "profile": "rectangle",
      "width": 2,
      "depth": 3,
      "offset": 10,
      "angle": 360
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "revolve",
    "params": {
      "profile": "rectangle",
      "width": 2,
      "depth": 3,
      "offset": 10,
      "angle": 360
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "旋转成型",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:b36cde98a8ed74d144f5bd4a991d3a71a66de8e09b1fcfc13b934022eeb53124"
}
```

## 工具 sewFaces · 选择一个或多个含面的对象。公差控制边缝合，不自动补洞。勾选实体时必须闭合且有效，否则报错；未勾选可得到开放壳。

```json
{
  "id": "sewFaces",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "tolerance": {
        "type": "number",
        "exclusiveMinimum": 0,
        "maximum": 0.5
      },
      "makeSolid": {
        "type": "boolean"
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. 选择一个或多个含面的对象。公差控制边缝合，不自动补洞。勾选实体时必须闭合且有效，否则报错；未勾选可得到开放壳。",
  "title": "选择一个或多个含面的对象。公差控制边缝合，不自动补洞。勾选实体时必须闭合且有效，否则报错；未勾选可得到开放壳。",
  "category": "surface",
  "synonyms": [
    "sewFaces",
    "曲面缝合"
  ],
  "description": "选择一个或多个含面的对象。公差控制边缝合，不自动补洞。勾选实体时必须闭合且有效，否则报错；未勾选可得到开放壳。",
  "schemaHash": "sha256:be48bdb763f0176d0f5b3e913689ed04df282c9122fd0e14c6287a048f30ad8c",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "shell",
    "face (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "选择一个或多个含面的对象。公差控制边缝合，不自动补洞。勾选实体时必须闭合且有效，否则报错；未勾选可得到开放壳。"
  ],
  "minimalExample": {
    "op": "sewFaces",
    "params": {
      "tolerance": 0.01,
      "makeSolid": false
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "sewFaces",
    "params": {
      "tolerance": 0.01,
      "makeSolid": false
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "曲面缝合",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:847b7724222c662478cae272a1febe44f31668a0e8c04b182f267b7c842a2654"
}
```

## 工具 shell · Hollow body removing selected faces

```json
{
  "id": "shell",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "thickness": {
        "type": "number",
        "description": "Signed nonzero wall thickness (mm)",
        "not": {
          "const": 0
        }
      },
      "faceIds": {
        "type": "array",
        "items": {
          "type": "integer",
          "description": "Zero-based topology index",
          "minimum": 0
        },
        "minItems": 1,
        "uniqueItems": true
      }
    },
    "required": [
      "thickness",
      "faceIds"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": true,
    "kind": "face",
    "location": "args.selectionToken",
    "featureAddOnly": true,
    "conflictsWith": [
      "faceId",
      "faceIds",
      "edgeIds",
      "allEdges"
    ],
    "phases": "Validate user params with phase=input and selectionToken, resolve against current snapshot, then validate complete params with phase=resolved."
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Positive thickness produces inward shell. Current UI selected faces may supply IDs.",
  "title": "Hollow body removing selected faces",
  "category": "modification",
  "synonyms": [
    "抽壳",
    "壁厚"
  ],
  "description": "Hollow body removing selected faces",
  "schemaHash": "sha256:647500c8c1545e843f4904d7a7b84dd330a18b45b32101d1a53043eaa0e5ab66",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision.",
    "Resolve topology against the current snapshot; do not reuse indices across revisions."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Positive thickness produces inward shell. Current UI selected faces may supply IDs."
  ],
  "minimalExample": {
    "op": "shell",
    "params": {
      "thickness": 1,
      "faceIds": [
        0
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "shell",
    "params": {
      "thickness": 1,
      "faceIds": [
        0
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "thickness": 0,
        "faceIds": [
          0
        ]
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID",
    "SELECTION_CONFLICT",
    "STALE_REFERENCE",
    "UNSAFE_LEGACY_REFERENCE"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "抽壳",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:8b2761a083986819b68dea4450d3eaad228aaf23c6034b4565f4caef43830ff8"
}
```

## 工具 sketchProfile · Create an editable exact 2D wire or planar face from stable analytic entities

```json
{
  "id": "sketchProfile",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "profileVersion": {
        "type": "integer",
        "const": 1
      },
      "entities": {
        "type": "array",
        "minItems": 1,
        "maxItems": 500,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "type"
          ],
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "type": {
              "type": "string",
              "description": "Analytic entity",
              "enum": [
                "line",
                "arc3",
                "circle",
                "rectangle",
                "roundedRectangle",
                "capsule"
              ]
            },
            "originMm": {
              "type": "array",
              "items": {
                "type": "number"
              },
              "minItems": 2,
              "maxItems": 2,
              "description": "XY coordinate in mm"
            },
            "widthMm": {
              "type": "number",
              "description": "Primitive width or capsule overall length (mm)",
              "exclusiveMinimum": 0
            },
            "heightMm": {
              "type": "number",
              "description": "Primitive height or capsule width (mm)",
              "exclusiveMinimum": 0
            },
            "cornerRadiusMm": {
              "type": "number",
              "description": "Rounded rectangle corner radius (mm)",
              "exclusiveMinimum": 0
            },
            "startMm": {
              "type": "array",
              "items": {
                "type": "number"
              },
              "minItems": 2,
              "maxItems": 2,
              "description": "XY coordinate in mm"
            },
            "endMm": {
              "type": "array",
              "items": {
                "type": "number"
              },
              "minItems": 2,
              "maxItems": 2,
              "description": "XY coordinate in mm"
            },
            "midMm": {
              "type": "array",
              "items": {
                "type": "number"
              },
              "minItems": 2,
              "maxItems": 2,
              "description": "XY coordinate in mm"
            },
            "centerMm": {
              "type": "array",
              "items": {
                "type": "number"
              },
              "minItems": 2,
              "maxItems": 2,
              "description": "XY coordinate in mm"
            },
            "diameterMm": {
              "type": "number",
              "description": "Circle diameter (mm)",
              "exclusiveMinimum": 0
            },
            "construction": {
              "type": "boolean",
              "description": "Construction/reference geometry only"
            },
            "projectionSource": {
              "type": "object",
              "description": "Frozen source B-Rep edge geometry and provenance; never automatically updates from the live source"
            }
          }
        }
      },
      "loops": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "edges"
          ],
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "edges": {
              "type": "array",
              "minItems": 1,
              "maxItems": 500,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "entityId",
                  "reversed"
                ],
                "properties": {
                  "entityId": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64
                  },
                  "reversed": {
                    "type": "boolean",
                    "description": "Reverse analytic edge direction"
                  }
                }
              }
            }
          }
        }
      },
      "chains": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "edges"
          ],
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "edges": {
              "type": "array",
              "minItems": 1,
              "maxItems": 500,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "entityId",
                  "reversed"
                ],
                "properties": {
                  "entityId": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64
                  },
                  "reversed": {
                    "type": "boolean",
                    "description": "Reverse analytic edge direction"
                  }
                }
              }
            }
          }
        }
      },
      "regions": {
        "type": "array",
        "maxItems": 16,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "outerLoopId",
            "holeLoopIds"
          ],
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "outerLoopId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "holeLoopIds": {
              "type": "array",
              "maxItems": 49,
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              }
            }
          }
        }
      },
      "output": {
        "type": "string",
        "description": "Editable geometry",
        "enum": [
          "wire",
          "face"
        ]
      }
    },
    "required": [
      "profileVersion",
      "entities",
      "output"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Single planar sketch. Top-level placement freezes the current insertion frame; later anchor moves do not move this profile. Analytic line, three-point arc and circle remain exact. Rectangle, roundedRectangle and capsule store one parameter definition (originMm,widthMm,heightMm,cornerRadiusMm); stable analytic edges are derived, not separately edited until explicit conversion. Closed face requires explicit ordered loops and up to 16 disjoint regions; open wire uses ordered chains. Unsupported spline editing is rejected.",
  "title": "Create an editable exact 2D wire or planar face from stable analytic entities",
  "category": "reference",
  "synonyms": [
    "sketchProfile",
    "绘制轮廓"
  ],
  "description": "Create an editable exact 2D wire or planar face from stable analytic entities",
  "schemaHash": "sha256:d7c57ca2b1183d63cf45a7c0d967011b5e4fe15796883a9ee78e3957212c61be",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "wire",
    "planar face"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Single planar sketch. Top-level placement freezes the current insertion frame; later anchor moves do not move this profile. Analytic line, three-point arc and circle remain exact. Rectangle, roundedRectangle and capsule store one parameter definition (originMm,widthMm,heightMm,cornerRadiusMm); stable analytic edges are derived, not separately edited until explicit conversion. Closed face requires explicit ordered loops and up to 16 disjoint regions; open wire uses ordered chains. Unsupported spline editing is rejected."
  ],
  "minimalExample": {
    "op": "sketchProfile",
    "params": {
      "profileVersion": 1,
      "entities": [
        {
          "id": "circle-1",
          "type": "circle",
          "centerMm": [
            0,
            0
          ],
          "diameterMm": 20
        }
      ],
      "loops": [
        {
          "id": "outer",
          "edges": [
            {
              "entityId": "circle-1",
              "reversed": false
            }
          ]
        }
      ],
      "regions": [
        {
          "id": "region-1",
          "outerLoopId": "outer",
          "holeLoopIds": []
        }
      ],
      "output": "face"
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "sketchProfile",
    "params": {
      "profileVersion": 1,
      "entities": [
        {
          "id": "circle-1",
          "type": "circle",
          "centerMm": [
            0,
            0
          ],
          "diameterMm": 20
        }
      ],
      "loops": [
        {
          "id": "outer",
          "edges": [
            {
              "entityId": "circle-1",
              "reversed": false
            }
          ]
        }
      ],
      "regions": [
        {
          "id": "region-1",
          "outerLoopId": "outer",
          "holeLoopIds": []
        }
      ],
      "output": "face"
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "profileVersion": 1,
        "entities": [
          {
            "id": "circle-1",
            "type": "circle",
            "centerMm": [
              0,
              0
            ],
            "diameterMm": 20
          }
        ],
        "loops": [
          {
            "id": "outer",
            "edges": [
              {
                "entityId": "circle-1",
                "reversed": false
              }
            ]
          }
        ],
        "regions": [
          {
            "id": "region-1",
            "outerLoopId": "outer",
            "holeLoopIds": []
          }
        ],
        "output": "face",
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "绘制轮廓",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Strict v2 validation applies.",
  "docsHash": "sha256:5aba41da6dad2f8a8e2584fe400879181ca4101017b8d90c7ac5728b9a57acb9"
}
```

## 工具 slot · Cut an exact capsule slot (two semicircles and two straight sides)

```json
{
  "id": "slot",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "length": {
        "type": "number",
        "description": "Overall slot length, including round ends (mm)",
        "exclusiveMinimum": 0
      },
      "width": {
        "type": "number",
        "description": "Slot width (mm)",
        "exclusiveMinimum": 0
      },
      "depth": {
        "type": "number",
        "description": "Cut depth (mm)",
        "exclusiveMinimum": 0
      },
      "x": {
        "type": "number",
        "description": "Cutter start center X (mm)"
      },
      "y": {
        "type": "number",
        "description": "Cutter start center Y (mm)"
      },
      "z": {
        "type": "number",
        "description": "Cutter start center Z (mm)"
      },
      "axis": {
        "type": "string",
        "description": "Global axis",
        "enum": [
          "X",
          "Y",
          "Z"
        ]
      },
      "direction": {
        "type": "number",
        "enum": [
          1,
          -1
        ]
      },
      "angle": {
        "type": "number",
        "description": "Rotation in degrees about positive cut axis"
      }
    },
    "required": [
      "length",
      "width",
      "depth"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. length >= width; equality gives a circular hole. Defaults center=origin,axis=Z,direction=1,angle=0. Unrotated long direction: Z axis -> +X; X axis -> +Y; Y axis -> +Z. Angle always follows the right-hand rule about the positive axis, independent of direction. Depth extends from the start plane along direction * axis. Must remove material. No automatic through depth.",
  "title": "Cut an exact capsule slot (two semicircles and two straight sides)",
  "category": "modification",
  "synonyms": [
    "slot",
    "长圆槽"
  ],
  "description": "Cut an exact capsule slot (two semicircles and two straight sides)",
  "schemaHash": "sha256:401a4760f1ce6c397d18cf3b5eb684c49116d8ad0c692a941980675af4eec9c4",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "length >= width; equality gives a circular hole. Defaults center=origin,axis=Z,direction=1,angle=0. Unrotated long direction: Z axis -> +X; X axis -> +Y; Y axis -> +Z. Angle always follows the right-hand rule about the positive axis, independent of direction. Depth extends from the start plane along direction * axis. Must remove material. No automatic through depth."
  ],
  "minimalExample": {
    "op": "slot",
    "params": {
      "length": 10,
      "width": 3,
      "depth": 5,
      "x": 20,
      "y": 15,
      "z": 4,
      "direction": -1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "slot",
    "params": {
      "length": 10,
      "width": 3,
      "depth": 5,
      "x": 20,
      "y": 15,
      "z": 4,
      "direction": -1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "长圆槽",
  "placementPolicy": {
    "mode": "tool-frame",
    "placementSupported": true,
    "originUsage": "cutter-start-reference",
    "orientationUsage": "cutter-direction-and-cross-section",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:e64f4b42735713779cf6a2dcafb8fce3695e62cb81d761d825b6c9ba9f821c87"
}
```

## 工具 smoothTransition · 平滑过渡 / Smooth shared seams of adjacent faces together

```json
{
  "id": "smoothTransition",
  "version": "1.0.0",
  "inputSchema": {
    "type": "object",
    "properties": {
      "radius": {
        "type": "number",
        "description": "Exact transition radius; no automatic reduction (mm)",
        "exclusiveMinimum": 0
      },
      "faceIds": {
        "type": "array",
        "items": {
          "type": "integer",
          "description": "Zero-based topology index",
          "minimum": 0
        },
        "minItems": 2,
        "maxItems": 128,
        "uniqueItems": true
      }
    },
    "required": [
      "radius",
      "faceIds"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": true,
    "kind": "face",
    "location": "args.selectionToken",
    "featureAddOnly": true,
    "conflictsWith": [
      "faceId",
      "faceIds",
      "edgeIds",
      "allEdges"
    ],
    "phases": "Validate user params with phase=input and selectionToken, resolve against current snapshot, then validate complete params with phase=resolved."
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Select at least two adjacent faces of one solid. Only their shared sharp edges are processed; boundary edges against unselected faces are not implicitly selected. All selected sharp seams are solved together with rolling-ball fillets. Valid solid and sampled normal checks reject remaining selected sharp seams or unexplained new sharp seams. Local blend terminations on unselected faces may remain sharp and are explicitly reported as boundarySharpEdges. getState().bodies[].transitionReport reports processed source edges and remaining sharp edges in the result. Existing unselected sharp edges (including lettering) remain; no whole-product safety certification, G2 guarantee or radius auto-reduction.",
  "title": "平滑过渡 / Smooth shared seams of adjacent faces together",
  "category": "modification",
  "synonyms": [
    "平滑过渡",
    "接缝",
    "利角",
    "blend"
  ],
  "description": "平滑过渡 / Smooth shared seams of adjacent faces together",
  "schemaHash": "sha256:45533fac3558a77e6e7245421d563769e34b7003333e15b3d7c8cac8655863e2",
  "apiCompatibility": [
    "page-v2"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": true,
  "v2Executable": true,
  "contractStatus": "migrated",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision.",
    "Resolve topology against the current snapshot; do not reuse indices across revisions."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Finite JSON values; no numeric strings, unknown fields, or implicit UI selection."
  ],
  "knownUnsupportedCases": [
    "Select at least two adjacent faces of one solid. Only their shared sharp edges are processed; boundary edges against unselected faces are not implicitly selected. All selected sharp seams are solved together with rolling-ball fillets. Valid solid and sampled normal checks reject remaining selected sharp seams or unexplained new sharp seams. Local blend terminations on unselected faces may remain sharp and are explicitly reported as boundarySharpEdges. getState().bodies[].transitionReport reports processed source edges and remaining sharp edges in the result. Existing unselected sharp edges (including lettering) remain; no whole-product safety certification, G2 guarantee or radius auto-reduction."
  ],
  "minimalExample": {
    "op": "smoothTransition",
    "params": {
      "radius": 0.1,
      "faceIds": [
        0,
        1
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "normalExample": {
    "op": "smoothTransition",
    "params": {
      "radius": 0.1,
      "faceIds": [
        0,
        1
      ]
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "strict-parameter-schema"
  },
  "invalidExamples": [
    {
      "params": {
        "radius": 0.1,
        "faceIds": [
          0,
          1
        ],
        "__unknownField": true
      },
      "errorCode": "PARAM_SCHEMA_INVALID",
      "explanation": "Rejected before kernel execution."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID",
    "SELECTION_CONFLICT",
    "STALE_REFERENCE",
    "UNSAFE_LEGACY_REFERENCE"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [
    "tests/operation-registry.test.mjs"
  ],
  "verification": {
    "contract": "covered-by-contract-tests",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "平滑过渡",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Strict v2 validation applies.",
  "docsHash": "sha256:5a5c7ed827e87008fe81661a2abf80fb277eb557b12bd1deee08f844ebee844b"
}
```

## 工具 sphere · Sphere centered at origin

```json
{
  "id": "sphere",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "radius": {
        "type": "number",
        "description": "Radius (mm)",
        "exclusiveMinimum": 0
      }
    },
    "required": [
      "radius"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Sphere centered at origin",
  "title": "Sphere centered at origin",
  "category": "creation",
  "synonyms": [
    "sphere",
    "球体"
  ],
  "description": "Sphere centered at origin",
  "schemaHash": "sha256:e66e4658d381aedaa6d85d69774b71adf82d5be75b8793127eb7a851b6f38cdc",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Sphere centered at origin"
  ],
  "minimalExample": {
    "op": "sphere",
    "params": {
      "radius": 10
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "sphere",
    "params": {
      "radius": 10
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "球体",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "bounds-center",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:815061e1d1d48a3e846bbe762484f722a0bf736eb17b4d3c101d3dc9f1377e0b"
}
```

## 工具 split · Split body by an offset global plane

```json
{
  "id": "split",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "plane": {
        "type": "string",
        "description": "Global plane",
        "enum": [
          "XY",
          "XZ",
          "YZ"
        ]
      },
      "offset": {
        "type": "number",
        "description": "Plane offset (mm)"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Plane must cross interior. Produces compound with both halves.",
  "title": "Split body by an offset global plane",
  "category": "organization",
  "synonyms": [
    "split",
    "分割"
  ],
  "description": "Split body by an offset global plane",
  "schemaHash": "sha256:266f1c12fbe61af6ff49eb7e846c59e20380898f188addec2b66cc2d220028c4",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Plane must cross interior. Produces compound with both halves."
  ],
  "minimalExample": {
    "op": "split",
    "params": {
      "plane": "XY",
      "offset": 1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "split",
    "params": {
      "plane": "XY",
      "offset": 1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "分割",
  "placementPolicy": {
    "mode": "spatial-operation",
    "placementSupported": true,
    "originUsage": "axis-plane-pivot-or-vector",
    "orientationUsage": "declared-transform-or-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:576687ea9810c779fa3d304bb7b4a602dd12e3641367b0f1437d376a7623d81b"
}
```

## 工具 surfaceTrim · 按顺序选两个对象：第一个为待修剪面所在对象，第二个为实体刀具。填写第一对象的面编号；intersect 保留实体内部，cut 保留外部。保留源对象；不是任意曲线修剪或自动补面。

```json
{
  "id": "surfaceTrim",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "faceId"
    ],
    "properties": {
      "faceId": {
        "type": "integer",
        "minimum": 0
      },
      "mode": {
        "type": "string",
        "enum": [
          "intersect",
          "cut"
        ]
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 2,
    "maxItems": 2
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. 按顺序选两个对象：第一个为待修剪面所在对象，第二个为实体刀具。填写第一对象的面编号；intersect 保留实体内部，cut 保留外部。保留源对象；不是任意曲线修剪或自动补面。",
  "title": "按顺序选两个对象：第一个为待修剪面所在对象，第二个为实体刀具。填写第一对象的面编号；intersect 保留实体内部，cut 保留外部。保留源对象；不是任意曲线修剪或自动补面。",
  "category": "surface",
  "synonyms": [
    "surfaceTrim",
    "实体修剪面"
  ],
  "description": "按顺序选两个对象：第一个为待修剪面所在对象，第二个为实体刀具。填写第一对象的面编号；intersect 保留实体内部，cut 保留外部。保留源对象；不是任意曲线修剪或自动补面。",
  "schemaHash": "sha256:45c944dab3a0bd6ada6da472f7f153923a477e083b598a146c0771c408459207",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "shell",
    "face (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": true,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "按顺序选两个对象：第一个为待修剪面所在对象，第二个为实体刀具。填写第一对象的面编号；intersect 保留实体内部，cut 保留外部。保留源对象；不是任意曲线修剪或自动补面。"
  ],
  "minimalExample": {
    "op": "surfaceTrim",
    "params": {
      "faceId": 0,
      "mode": "intersect"
    },
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "surfaceTrim",
    "params": {
      "faceId": 0,
      "mode": "intersect"
    },
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "实体修剪面",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:eb7f825717e49953b16c7b421b8651f7179330c6ef073e3ea966225652cece90"
}
```

## 工具 sweep · Sweep profile along a 3D polyline

```json
{
  "id": "sweep",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "profile": {
        "type": "string",
        "description": "Cross-section",
        "enum": [
          "circle",
          "rectangle",
          "roundedRectangle",
          "arc"
        ]
      },
      "width": {
        "type": "number",
        "description": "Width (mm)",
        "exclusiveMinimum": 0
      },
      "depth": {
        "type": "number",
        "description": "Depth (mm)",
        "exclusiveMinimum": 0
      },
      "radius": {
        "type": "number",
        "description": "Circle/arc radius (mm)",
        "exclusiveMinimum": 0
      },
      "cornerRadius": {
        "type": "number",
        "description": "Rounded rectangle corner radius; less than half shorter side (mm)",
        "exclusiveMinimum": 0
      },
      "points": {
        "type": "array",
        "minItems": 2,
        "maxItems": 100,
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "minItems": 3,
          "maxItems": 3,
          "description": "World coordinate [x,y,z] in mm"
        }
      },
      "startAngle": {
        "type": "number",
        "description": "Arc start (degrees)"
      },
      "endAngle": {
        "type": "number",
        "description": "Arc end (degrees); absolute span > 0 and < 360"
      },
      "closure": {
        "type": "string",
        "description": "Arc closure",
        "enum": [
          "sector",
          "segment"
        ]
      }
    },
    "required": [
      "points"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Use circle/rectangle/roundedRectangle/arc profile. points are the PATH, so polygon profile is not suitable for this API. Consecutive path points must differ. Profile is normal to first segment.",
  "title": "Sweep profile along a 3D polyline",
  "category": "creation",
  "synonyms": [
    "sweep",
    "扫掠"
  ],
  "description": "Sweep profile along a 3D polyline",
  "schemaHash": "sha256:b6fe7522fba69107f3227f252e6988c679e96abba6c0b5677980a56bf51e4d53",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Use circle/rectangle/roundedRectangle/arc profile. points are the PATH, so polygon profile is not suitable for this API. Consecutive path points must differ. Profile is normal to first segment."
  ],
  "minimalExample": {
    "op": "sweep",
    "params": {
      "profile": "circle",
      "radius": 1,
      "points": [
        [
          0,
          0,
          0
        ],
        [
          0,
          0,
          10
        ]
      ]
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "sweep",
    "params": {
      "profile": "circle",
      "radius": 1,
      "points": [
        [
          0,
          0,
          0
        ],
        [
          0,
          0,
          10
        ]
      ]
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "扫掠",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:091535d01c6f72cb152ed98b7b5b914ecdf348f82b7aa0b7afd0ce45756a0dc8"
}
```

## 工具 thickenFace · Normal offset of one face into a new solid

```json
{
  "id": "thickenFace",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "faceId": {
        "type": "integer",
        "minimum": 0
      },
      "thickness": {
        "type": "number"
      }
    },
    "required": [
      "faceId",
      "thickness"
    ],
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Nonzero signed thickness. Replaces source object with the selected face thickness only. Not a whole-object shell operation. Invalid offsets fail. Planar faces require adaptive volume to match source area times absolute thickness (relative consistency allowance 1e-5, absolute floor 1e-7 mm^3); inconsistent trimming or footprint change rejects the operation without commit.",
  "title": "Normal offset of one face into a new solid",
  "category": "surface",
  "synonyms": [
    "thickenFace",
    "选面增厚"
  ],
  "description": "Normal offset of one face into a new solid",
  "schemaHash": "sha256:99c1d00f522e833b1b950c89181d0d6b8c0707aeda78229635cb0d2c05279690",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Nonzero signed thickness. Replaces source object with the selected face thickness only. Not a whole-object shell operation. Invalid offsets fail. Planar faces require adaptive volume to match source area times absolute thickness (relative consistency allowance 1e-5, absolute floor 1e-7 mm^3); inconsistent trimming or footprint change rejects the operation without commit."
  ],
  "minimalExample": {
    "op": "thickenFace",
    "params": {
      "faceId": 0,
      "thickness": 1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "thickenFace",
    "params": {
      "faceId": 0,
      "thickness": 1
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "选面增厚",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:48c6b6781121ac183ad90606ba8e6b8e5ce5c5f8a70e0ef3f59a03ee69a339e2"
}
```

## 工具 torus · Torus around Z axis

```json
{
  "id": "torus",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "majorRadius": {
        "type": "number",
        "description": "Major radius (mm)",
        "exclusiveMinimum": 0
      },
      "minorRadius": {
        "type": "number",
        "description": "Tube radius (mm)",
        "exclusiveMinimum": 0
      }
    },
    "required": [
      "majorRadius",
      "minorRadius"
    ],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. majorRadius > minorRadius",
  "title": "Torus around Z axis",
  "category": "creation",
  "synonyms": [
    "torus",
    "圆环"
  ],
  "description": "Torus around Z axis",
  "schemaHash": "sha256:00d8c6d92061ae6b7b8d8b597fada83b6c1451a9a52cd3f72758eb481f803c2b",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "majorRadius > minorRadius"
  ],
  "minimalExample": {
    "op": "torus",
    "params": {
      "majorRadius": 10,
      "minorRadius": 2
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "torus",
    "params": {
      "majorRadius": 10,
      "minorRadius": 2
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "圆环",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "bounds-center",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:c596ae84130f2b2fc8d25d78453509e2a94f9853f2500475a8fd9a154c265cdb"
}
```

## 工具 transform · Scale, rotate X/Y/Z about origin, then translate

```json
{
  "id": "transform",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "positionMode": {
        "type": "string",
        "description": "relative offset or absolute bounding-box center after rotation/scaling",
        "enum": [
          "relative",
          "absolute"
        ]
      },
      "x": {
        "type": "number",
        "description": "X translation (mm)"
      },
      "y": {
        "type": "number",
        "description": "Y translation (mm)"
      },
      "z": {
        "type": "number",
        "description": "Z translation (mm)"
      },
      "rx": {
        "type": "number",
        "description": "X rotation (degrees)"
      },
      "ry": {
        "type": "number",
        "description": "Y rotation (degrees)"
      },
      "rz": {
        "type": "number",
        "description": "Z rotation (degrees)"
      },
      "scale": {
        "type": "number",
        "description": "Uniform dimensionless scale",
        "exclusiveMinimum": 0
      },
      "mode": {
        "type": "string",
        "description": "Explicit spatial mode",
        "enum": [
          "translate",
          "toPoint",
          "rotate",
          "scale",
          "align"
        ]
      },
      "delta": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "targetPoint": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "orientation": {
        "type": "string",
        "description": "Preserve or align to work frame",
        "enum": [
          "preserve",
          "align-frame"
        ]
      },
      "pivot": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "axisVector": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "angleDeg": {
        "type": "number",
        "description": "Signed rotation angle (degrees)"
      },
      "sourcePoint": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "sourceAxis": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "sourceUp": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "targetAxis": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "targetUp": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "minItems": 3,
        "maxItems": 3,
        "description": "World coordinate [x,y,z] in mm"
      },
      "axisRelation": {
        "type": "string",
        "description": "Same or opposite axis direction",
        "enum": [
          "same",
          "opposite"
        ]
      },
      "gapMm": {
        "type": "number",
        "description": "Signed gap along target axis (mm)"
      },
      "twistAngleDeg": {
        "type": "number",
        "description": "Explicit in-plane twist angle (degrees)"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 1,
    "maxItems": 1
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Defaults relative translations/angles=0,scale=1. Absolute mode requires XYZ and places final bounding-box center there. Rotation and scale are about world origin. Replaces original.",
  "title": "Scale, rotate X/Y/Z about origin, then translate",
  "category": "organization",
  "synonyms": [
    "transform",
    "移动",
    "旋转"
  ],
  "description": "Scale, rotate X/Y/Z about origin, then translate",
  "schemaHash": "sha256:979f834ea28e4d8267138b449923bf1abc5bcebc12f60636ae0732590580bb29",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Defaults relative translations/angles=0,scale=1. Absolute mode requires XYZ and places final bounding-box center there. Rotation and scale are about world origin. Replaces original."
  ],
  "minimalExample": {
    "op": "transform",
    "params": {
      "x": 10
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "transform",
    "params": {
      "x": 10
    },
    "refs": [
      "<current-bodyId-1>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "移动 / 旋转",
  "placementPolicy": {
    "mode": "spatial-operation",
    "placementSupported": true,
    "originUsage": "axis-plane-pivot-or-vector",
    "orientationUsage": "declared-transform-or-direction",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:8e65a666143eea5ea7271d5c662db9cf69df39623715ff6d7cfd9f3964bdd1ef"
}
```

## 工具 union · Fuse bodies

```json
{
  "id": "union",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "properties": {
      "keepTools": {
        "type": "boolean",
        "description": "Keep original tools"
      }
    },
    "required": [],
    "additionalProperties": false,
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 2
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. refs[0] is the target. Optional keepTools preserves refs[1..] as separate original bodies.",
  "title": "Fuse bodies",
  "category": "modification",
  "synonyms": [
    "union",
    "合并"
  ],
  "description": "Fuse bodies",
  "schemaHash": "sha256:2cce87066fa44a2be8c54844a040c7a0b343ec8ec387996660764b9c86cc9ca0",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use current referenced bodies in the same document instance and revision."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": true,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "refs[0] is the target. Optional keepTools preserves refs[1..] as separate original bodies."
  ],
  "minimalExample": {
    "op": "union",
    "params": {},
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "union",
    "params": {},
    "refs": [
      "<current-bodyId-1>",
      "<current-bodyId-2>"
    ],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "合并",
  "placementPolicy": {
    "mode": "not-applicable",
    "placementSupported": false,
    "notApplicableReason": "Operation acts on existing topology without relocating it",
    "originUsage": "target-topology-unchanged",
    "orientationUsage": "none",
    "legacyCoordinates": "world",
    "newCoordinates": "not-applicable",
    "sourceAnchorRequired": false,
    "defaultInsertionAnchor": null,
    "historyBinding": "legacy",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Placement is not enabled for this operation. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:62c6f346c09eb30e2abce4bc01230f3499317bc505614aefe1fd344ec85feb9b"
}
```

## 工具 vectorProfile · Create independent planar faces or solids from closed vector regions

```json
{
  "id": "vectorProfile",
  "version": "legacy-1",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "regions",
      "output"
    ],
    "properties": {
      "regions": {
        "type": "array",
        "minItems": 1,
        "maxItems": 150,
        "items": {
          "type": "object",
          "required": [
            "outer"
          ],
          "properties": {
            "outer": {
              "type": "array",
              "minItems": 3,
              "maxItems": 2000,
              "items": {
                "type": "array",
                "items": {
                  "type": "number"
                },
                "minItems": 2,
                "maxItems": 2
              }
            },
            "holes": {
              "type": "array",
              "items": {
                "type": "array",
                "minItems": 3,
                "maxItems": 2000,
                "items": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  },
                  "minItems": 2,
                  "maxItems": 2
                }
              }
            }
          }
        }
      },
      "source": {
        "type": "object"
      },
      "name": {
        "type": "string"
      },
      "sizeMm": {
        "type": "array",
        "items": {
          "type": "number"
        }
      },
      "areaMm2": {
        "type": "number"
      },
      "output": {
        "type": "string",
        "description": "Output geometry",
        "enum": [
          "face",
          "solid"
        ]
      },
      "plane": {
        "type": "string",
        "description": "Global plane",
        "enum": [
          "XY",
          "XZ",
          "YZ"
        ]
      },
      "scale": {
        "type": "number",
        "description": "Contour scale (mm)",
        "exclusiveMinimum": 0
      },
      "angle": {
        "type": "number",
        "description": "In-plane angle"
      },
      "height": {
        "type": "number",
        "description": "Nonzero signed extrusion height for solid (mm)"
      },
      "x": {
        "type": "number",
        "description": "Contour center world X (mm)"
      },
      "y": {
        "type": "number",
        "description": "Contour center world Y (mm)"
      },
      "z": {
        "type": "number",
        "description": "Contour center world Z (mm)"
      }
    },
    "$schema": "https://json-schema.org/draft/2020-12/schema"
  },
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "defaults": {},
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. No selected body needed. Closed regions and holes only; normalize imported bounds center to origin before position. XY normal +Z, XZ normal -Y, YZ normal +X. Curves are approximated at source import tolerance. Face output has zero solids; change output to solid and height to extrude later.",
  "title": "Create independent planar faces or solids from closed vector regions",
  "category": "creation",
  "synonyms": [
    "vectorProfile",
    "导入路径"
  ],
  "description": "Create independent planar faces or solids from closed vector regions",
  "schemaHash": "sha256:9b5b3a71a4dd6a9f9b2eea49a8f67668ece3bf182177a103cfc32a746b8ab9b4",
  "apiCompatibility": [
    "page-advisory"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "shell",
    "face (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Current documentInstanceId in-memory receipts only; no cross-reload guarantee.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "No selected body needed. Closed regions and holes only; normalize imported bounds center to origin before position. XY normal +Z, XZ normal -Y, YZ normal +X. Curves are approximated at source import tolerance. Face output has zero solids; change output to solid and height to extrude later."
  ],
  "minimalExample": {
    "op": "vectorProfile",
    "params": {
      "regions": [
        {
          "outer": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        }
      ],
      "output": "solid",
      "height": 2
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "normalExample": {
    "op": "vectorProfile",
    "params": {
      "regions": [
        {
          "outer": [
            [
              -1,
              -1
            ],
            [
              1,
              -1
            ],
            [
              0,
              1
            ]
          ]
        }
      ],
      "output": "solid",
      "height": 2
    },
    "refs": [],
    "referenceInstructions": "Resolve body IDs from getState(). Topology indices are snapshot-local; use queryGeometry().",
    "validation": "advisory-schema-only; kernel prerequisites are not certified by this example"
  },
  "invalidExamples": [],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "getState",
    "getTool",
    "queryGeometry",
    "execute"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "label": "导入路径",
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Prefer run steps with method:add and args:{op,params,refs,name?,placement?}; run fills version/schemaHash from this catalog. Explicit placement version 1 is enabled; read api.references. Schema is advisory; kernel prerequisites and result verification still apply.",
  "docsHash": "sha256:1736a5f53f3d8e4f09f68eae184c46078ccba868a3597e49ec11c5224b3c20e6"
}
```

## 工具 template.uEndHolePlate · 半圆冠双端孔 U 板

```json
{
  "id": "template.uEndHolePlate",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "半圆冠双端孔 U 板",
  "category": "template",
  "synonyms": [
    "uEndHolePlate",
    "半圆冠双端孔 U 板",
    "Arched U plate with two end holes"
  ],
  "description": "半圆冠与两条等宽直腿连成一块平板，直腿末端各有一个贯穿孔；内外冠同心，孔沿厚度方向贯穿。适合源图确认的单片 U 件，不含另一装配件、螺纹或截面圆杆。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "半圆冠双端孔 U 板",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "One flat U plate with concentric semicircular crowns, equal-width straight legs and one through-hole at each end. No second assembly component, thread or round-wire section.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "uEndHolePlate"
      },
      "outerWidth": {
        "type": "number",
        "default": 22,
        "description": "Outer width"
      },
      "innerWidth": {
        "type": "number",
        "default": 10,
        "description": "Inner width"
      },
      "totalHeight": {
        "type": "number",
        "default": 31.7,
        "description": "Total height"
      },
      "thickness": {
        "type": "number",
        "default": 3,
        "description": "Plate thickness"
      },
      "holeDiameter": {
        "type": "number",
        "default": 3.3,
        "description": "End-hole diameter"
      },
      "holeInset": {
        "type": "number",
        "default": 2.7,
        "description": "Hole center inset from leg end"
      }
    }
  },
  "schemaHash": "sha256:edcf1879de3a33d5bbe2df10b353ae1238c755a58d164f004e33d8ae36b2cf91",
  "defaults": {
    "outerWidth": 22,
    "innerWidth": 10,
    "totalHeight": 31.7,
    "thickness": 3,
    "holeDiameter": 3.3,
    "holeInset": 2.7
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽",
      "labelEn": "Outer width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "totalHeight",
      "label": "外总高",
      "labelEn": "Total height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "板厚",
      "labelEn": "Plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "holeDiameter",
      "label": "两端通孔直径",
      "labelEn": "End-hole diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "holeInset",
      "label": "孔心距直腿端面",
      "labelEn": "Hole center inset from leg end",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "uEndHolePlate"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "uEndHolePlate",
      "outerWidth": 22,
      "innerWidth": 10,
      "totalHeight": 31.7,
      "thickness": 3,
      "holeDiameter": 3.3,
      "holeInset": 2.7
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:b5593566e05a0a4cf56e5d5785425a53d5c0833293c9370fe9afa769355ccfa9"
}
```

## 工具 template.ellipseSectionRing · 椭圆截面圆环

```json
{
  "id": "template.ellipseSectionRing",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "椭圆截面圆环",
  "category": "template",
  "synonyms": [
    "ellipseSectionRing",
    "椭圆截面圆环",
    "Circular ring with elliptical section"
  ],
  "description": "正面环带宽和侧面深度独立输入，沿圆形中心线扫掠椭圆截面；截面形状是可编辑候选，须按源图验证。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "椭圆截面圆环",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Circular ring swept from an elliptical section with independent front band width and side depth. Section shape is an editable candidate to verify against the source.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "ellipseSectionRing"
      },
      "innerDiameter": {
        "type": "number",
        "default": 37.4,
        "description": "Inner front diameter"
      },
      "sectionWidth": {
        "type": "number",
        "default": 4.1,
        "description": "Front band width"
      },
      "sectionDepth": {
        "type": "number",
        "default": 5,
        "description": "Side depth"
      }
    }
  },
  "schemaHash": "sha256:3d0b1d31f7aefd9865f5b85bbd8e9ed8ef2697254f5b9cc1f31aa81c91a09643",
  "defaults": {
    "innerDiameter": 37.4,
    "sectionWidth": 4.1,
    "sectionDepth": 5
  },
  "fields": [
    {
      "key": "innerDiameter",
      "label": "正面内径",
      "labelEn": "Inner front diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionWidth",
      "label": "正面料宽",
      "labelEn": "Front band width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionDepth",
      "label": "侧面总深度",
      "labelEn": "Side depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ellipseSectionRing"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ellipseSectionRing",
      "innerDiameter": 37.4,
      "sectionWidth": 4.1,
      "sectionDepth": 5
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:32cf5c883f9bba48f4441f24a1b33a4e0750b59d566c7f161037233a084b3871"
}
```

## 工具 template.arcBandPlate · 双孔弧形带板

```json
{
  "id": "template.arcBandPlate",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "双孔弧形带板",
  "category": "template",
  "synonyms": [
    "arcBandPlate",
    "双孔弧形带板",
    "Two-hole annular band plate"
  ],
  "description": "同心圆弧带板，角度、厚度、两端孔距与沉孔独立输入；用于分体环段，螺纹和装配件须另建。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "双孔弧形带板",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Annular band segment with editable sweep, plate thickness, symmetric end-hole inset and optional counterbores. Threads and mating parts are separate.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "arcBandPlate"
      },
      "outerRadius": {
        "type": "number",
        "default": 20,
        "description": "Outer radius"
      },
      "innerRadius": {
        "type": "number",
        "default": 15,
        "description": "Inner radius"
      },
      "centerAngle": {
        "type": "number",
        "default": 270,
        "description": "Arc center angle"
      },
      "spanAngle": {
        "type": "number",
        "default": 111.2807337553,
        "description": "Arc sweep angle"
      },
      "thickness": {
        "type": "number",
        "default": 5,
        "description": "Plate thickness"
      },
      "holeInsetAngle": {
        "type": "number",
        "default": 8.4521160504,
        "description": "Hole inset from each end"
      },
      "holeDiameter": {
        "type": "number",
        "default": 2.3,
        "description": "Through-hole diameter"
      },
      "recessDiameter": {
        "type": "number",
        "default": 3.3,
        "description": "Top recess diameter"
      },
      "recessDepth": {
        "type": "number",
        "default": 0,
        "description": "Top recess depth"
      }
    }
  },
  "schemaHash": "sha256:e830ea706fffdb7ebc9a3a4e9cbe29a974db49c6eb5203d6516eacb5a25ba3b7",
  "defaults": {
    "outerRadius": 20,
    "innerRadius": 15,
    "centerAngle": 270,
    "spanAngle": 111.2807337553,
    "thickness": 5,
    "holeInsetAngle": 8.4521160504,
    "holeDiameter": 2.3,
    "recessDiameter": 3.3,
    "recessDepth": 0
  },
  "fields": [
    {
      "key": "outerRadius",
      "label": "外弧半径",
      "labelEn": "Outer radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "内弧半径",
      "labelEn": "Inner radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "centerAngle",
      "label": "弧中心角（°）",
      "labelEn": "Arc center angle",
      "type": "number",
      "min": -360,
      "step": 1
    },
    {
      "key": "spanAngle",
      "label": "弧跨度（°）",
      "labelEn": "Arc sweep angle",
      "type": "number",
      "min": 1,
      "step": 1
    },
    {
      "key": "thickness",
      "label": "板厚",
      "labelEn": "Plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "holeInsetAngle",
      "label": "两端孔退让角（°）",
      "labelEn": "Hole inset from each end",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "holeDiameter",
      "label": "通孔直径",
      "labelEn": "Through-hole diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "recessDiameter",
      "label": "上表面沉孔直径",
      "labelEn": "Top recess diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "recessDepth",
      "label": "上表面沉孔深度",
      "labelEn": "Top recess depth",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "arcBandPlate"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "arcBandPlate",
      "outerRadius": 20,
      "innerRadius": 15,
      "centerAngle": 270,
      "spanAngle": 111.2807337553,
      "thickness": 5,
      "holeInsetAngle": 8.4521160504,
      "holeDiameter": 2.3,
      "recessDiameter": 3.3,
      "recessDepth": 0
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:2fdde197f9f1ac600b1bb4c8739bc7939899707a1d600ee7e3a558929fcd288a"
}
```

## 工具 template.gableOpenFrame · 斜肩开口框

```json
{
  "id": "template.gableOpenFrame",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "斜肩开口框",
  "category": "template",
  "synonyms": [
    "gableOpenFrame",
    "斜肩开口框",
    "Open gable frame"
  ],
  "description": "两只直腿与屋顶形斜肩组成开口框，端部按指定 R 做两段圆角与短平底。内外宽、内外肩高、内外峰高、板厚分别输入。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "斜肩开口框",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Open gable frame with straight legs, sloped shoulders and rounded open ends. Independent inner/outer widths, shoulder and peak heights, depth and end radius.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "gableOpenFrame"
      },
      "outerWidth": {
        "type": "number",
        "default": 25,
        "description": "Outer width"
      },
      "innerWidth": {
        "type": "number",
        "default": 20,
        "description": "Inner width"
      },
      "outerPeakHeight": {
        "type": "number",
        "default": 16,
        "description": "Outer peak height"
      },
      "outerShoulderHeight": {
        "type": "number",
        "default": 12.4,
        "description": "Outer shoulder height"
      },
      "innerPeakHeight": {
        "type": "number",
        "default": 13.5,
        "description": "Inner peak height"
      },
      "innerShoulderHeight": {
        "type": "number",
        "default": 10.5,
        "description": "Inner shoulder height"
      },
      "thickness": {
        "type": "number",
        "default": 4,
        "description": "Plate depth"
      },
      "endRadius": {
        "type": "number",
        "default": 1,
        "description": "Leg end radius"
      }
    }
  },
  "schemaHash": "sha256:1565c4c48254166298ad3b200b2149c53efc3d159869acdfcd5e30b854dca721",
  "defaults": {
    "outerWidth": 25,
    "innerWidth": 20,
    "outerPeakHeight": 16,
    "outerShoulderHeight": 12.4,
    "innerPeakHeight": 13.5,
    "innerShoulderHeight": 10.5,
    "thickness": 4,
    "endRadius": 1
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽",
      "labelEn": "Outer width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerPeakHeight",
      "label": "外峰高",
      "labelEn": "Outer peak height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerShoulderHeight",
      "label": "外肩高",
      "labelEn": "Outer shoulder height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerPeakHeight",
      "label": "内峰高",
      "labelEn": "Inner peak height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerShoulderHeight",
      "label": "内肩高",
      "labelEn": "Inner shoulder height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "板厚",
      "labelEn": "Plate depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "endRadius",
      "label": "脚端 R",
      "labelEn": "Leg end radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "gableOpenFrame"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "gableOpenFrame",
      "outerWidth": 25,
      "innerWidth": 20,
      "outerPeakHeight": 16,
      "outerShoulderHeight": 12.4,
      "innerPeakHeight": 13.5,
      "innerShoulderHeight": 10.5,
      "thickness": 4,
      "endRadius": 1
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:77b3edf88509125905c5e5d689cdcdb1549d042564290d589497726a464772db"
}
```

## 工具 template.ellipseSectionRectFrame · 椭圆截面圆角方框

```json
{
  "id": "template.ellipseSectionRectFrame",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "椭圆截面圆角方框",
  "category": "template",
  "synonyms": [
    "ellipseSectionRectFrame",
    "椭圆截面圆角方框",
    "Rounded rectangle with elliptical section"
  ],
  "description": "以独立正面料宽和侧面深度构造椭圆截面，沿圆角矩形中心线扫掠；内 R 为平面内孔圆角，不自动等于侧面 R。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "椭圆截面圆角方框",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Sweep an elliptical cross-section around a rounded rectangular centerline. Front band width and side depth are independent; the inner planar radius is separate from section shape.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "ellipseSectionRectFrame"
      },
      "innerWidth": {
        "type": "number",
        "default": 25,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 19,
        "description": "Inner height"
      },
      "innerRadius": {
        "type": "number",
        "default": 2.5,
        "description": "Inner planar radius"
      },
      "sectionWidth": {
        "type": "number",
        "default": 5.5,
        "description": "Front band width"
      },
      "sectionDepth": {
        "type": "number",
        "default": 6,
        "description": "Side depth"
      }
    }
  },
  "schemaHash": "sha256:24949e5fb813da995a3f71559079fcc1a9190dfed543adf04d4140e2befbe91a",
  "defaults": {
    "innerWidth": 25,
    "innerHeight": 19,
    "innerRadius": 2.5,
    "sectionWidth": 5.5,
    "sectionDepth": 6
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "平面内 R",
      "labelEn": "Inner planar radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionWidth",
      "label": "正面料宽",
      "labelEn": "Front band width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionDepth",
      "label": "侧面深度",
      "labelEn": "Side depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ellipseSectionRectFrame"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ellipseSectionRectFrame",
      "innerWidth": 25,
      "innerHeight": 19,
      "innerRadius": 2.5,
      "sectionWidth": 5.5,
      "sectionDepth": 6
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:59487b009ae299629d7917b484f092e4b86af4f7c264094db4bb68d6ccc8326a"
}
```

## 工具 template.dFlatFrame · 独立底角 R 平板 D 框

```json
{
  "id": "template.dFlatFrame",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "独立底角 R 平板 D 框",
  "category": "template",
  "synonyms": [
    "dFlatFrame",
    "独立底角 R 平板 D 框",
    "Flat D frame with independent bottom radii"
  ],
  "description": "半圆冠、直腿与独立内外底角 R 的平板 D 框；可按实际宽度切开底部中央。厚度为平板厚度，不代替圆线截面。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "独立底角 R 平板 D 框",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Flat D frame with semicircular crown, straight legs, independent inner/outer bottom radii and optional measured bottom gap. Thickness is a flat plate depth, not a round-wire section.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "dFlatFrame"
      },
      "outerWidth": {
        "type": "number",
        "default": 28,
        "description": "Outer width"
      },
      "outerHeight": {
        "type": "number",
        "default": 25,
        "description": "Outer height"
      },
      "innerWidth": {
        "type": "number",
        "default": 20,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 17,
        "description": "Inner height"
      },
      "outerBottomRadius": {
        "type": "number",
        "default": 3.5,
        "description": "Outer bottom radius"
      },
      "innerBottomRadius": {
        "type": "number",
        "default": 2,
        "description": "Inner bottom radius"
      },
      "thickness": {
        "type": "number",
        "default": 4,
        "description": "Flat plate thickness"
      },
      "gapWidth": {
        "type": "number",
        "default": 0,
        "description": "Bottom gap (0 = closed)"
      }
    }
  },
  "schemaHash": "sha256:81a899846c39ba787b0174975500350728b24836f23cc1c4adfdfaeb94e1ac86",
  "defaults": {
    "outerWidth": 28,
    "outerHeight": 25,
    "innerWidth": 20,
    "innerHeight": 17,
    "outerBottomRadius": 3.5,
    "innerBottomRadius": 2,
    "thickness": 4,
    "gapWidth": 0
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽",
      "labelEn": "Outer width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerHeight",
      "label": "外高",
      "labelEn": "Outer height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerBottomRadius",
      "label": "底外 R",
      "labelEn": "Outer bottom radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "innerBottomRadius",
      "label": "底内 R",
      "labelEn": "Inner bottom radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "平板厚度",
      "labelEn": "Flat plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "gapWidth",
      "label": "底部实际缝宽（0 闭合）",
      "labelEn": "Bottom gap (0 = closed)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "dFlatFrame"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "dFlatFrame",
      "outerWidth": 28,
      "outerHeight": 25,
      "innerWidth": 20,
      "innerHeight": 17,
      "outerBottomRadius": 3.5,
      "innerBottomRadius": 2,
      "thickness": 4,
      "gapWidth": 0
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:56641222f5d9f9947fa2df3a3d23bb40f7026bc7814c77137f695ca5f52a938a"
}
```

## 工具 template.archedTwinWindowPlate · 圆弧拱弯平板双窗扣

```json
{
  "id": "template.archedTwinWindowPlate",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "圆弧拱弯平板双窗扣",
  "category": "template",
  "synonyms": [
    "archedTwinWindowPlate",
    "圆弧拱弯平板双窗扣",
    "Cylindrically arched twin-window plate"
  ],
  "description": "圆角双窗平面轮廓沿 Y 方向投影裁切同轴圆筒薄壁，形成侧视圆弧拱弯。适用于薄条一体双窗；径向板厚、外弧半径独立输入。圆线框及独立圆杆须用其它工具。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "圆弧拱弯平板双窗扣",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Intersect a rounded twin-window footprint with a coaxial cylindrical wall to create an arched plate. Set outer bend radius and radial thickness independently. Projected strip construction without source-specific edge treatment; round-wire frames need another tool.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "archedTwinWindowPlate"
      },
      "outerWidth": {
        "type": "number",
        "default": 32.9,
        "description": "Outer width"
      },
      "outerHeight": {
        "type": "number",
        "default": 25.5,
        "description": "Outer height"
      },
      "outerRadius": {
        "type": "number",
        "default": 3,
        "description": "Outer planar radius"
      },
      "windowWidth": {
        "type": "number",
        "default": 25.4,
        "description": "Window width"
      },
      "totalInnerHeight": {
        "type": "number",
        "default": 18.5,
        "description": "Total inner height"
      },
      "windowRadius": {
        "type": "number",
        "default": 0.5,
        "description": "Window planar radius"
      },
      "barWidth": {
        "type": "number",
        "default": 3.5,
        "description": "Center bar width"
      },
      "bendRadius": {
        "type": "number",
        "default": 43.90964782342324,
        "description": "Outer bend radius"
      },
      "radialThickness": {
        "type": "number",
        "default": 2.3,
        "description": "Radial thickness"
      }
    }
  },
  "schemaHash": "sha256:726ebe97a743251282d155561fd6e3920731fdf0a6dc0389f3324f0485c80da0",
  "defaults": {
    "outerWidth": 32.9,
    "outerHeight": 25.5,
    "outerRadius": 3,
    "windowWidth": 25.4,
    "totalInnerHeight": 18.5,
    "windowRadius": 0.5,
    "barWidth": 3.5,
    "bendRadius": 43.90964782342324,
    "radialThickness": 2.3
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽",
      "labelEn": "Outer width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerHeight",
      "label": "外高",
      "labelEn": "Outer height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerRadius",
      "label": "外轮廓平面 R",
      "labelEn": "Outer planar radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "windowWidth",
      "label": "每孔净宽",
      "labelEn": "Window width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "totalInnerHeight",
      "label": "双孔与中条总高",
      "labelEn": "Total inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowRadius",
      "label": "孔角平面 R",
      "labelEn": "Window planar radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "barWidth",
      "label": "中条宽",
      "labelEn": "Center bar width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bendRadius",
      "label": "外侧拱弧 R",
      "labelEn": "Outer bend radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "radialThickness",
      "label": "径向板厚",
      "labelEn": "Radial thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "archedTwinWindowPlate"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "archedTwinWindowPlate",
      "outerWidth": 32.9,
      "outerHeight": 25.5,
      "outerRadius": 3,
      "windowWidth": 25.4,
      "totalInnerHeight": 18.5,
      "windowRadius": 0.5,
      "barWidth": 3.5,
      "bendRadius": 43.90964782342324,
      "radialThickness": 2.3
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:c8baa4fcfa8bc11c24bad699d74fba25800cc04a855368325950a599d6d5f8dc"
}
```

## 工具 template.bowedTwinWindowPlate · 鼓侧边平板双窗扣

```json
{
  "id": "template.bowedTwinWindowPlate",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "鼓侧边平板双窗扣",
  "category": "template",
  "synonyms": [
    "bowedTwinWindowPlate",
    "鼓侧边平板双窗扣",
    "Bowed-side twin-window plate"
  ],
  "description": "上下直边、两侧大圆弧鼓边与四角小 R 相切；两个跑道形窗孔及中横条一体成板，可选前后边缘倒圆。左右、上下镜像参数模型，源图有微小非对称时只能近似。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "鼓侧边平板双窗扣",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "A flat plate with straight top/bottom, tangent bowed sides and four small corner arcs, plus two symmetric capsule windows. Optional edge fillet. Symmetric parameter model only.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "bowedTwinWindowPlate"
      },
      "outerHeight": {
        "type": "number",
        "default": 24.5,
        "description": "Outer height"
      },
      "topStraightWidth": {
        "type": "number",
        "default": 30.2527,
        "description": "Top/bottom straight length"
      },
      "sideRadius": {
        "type": "number",
        "default": 35.688467,
        "description": "Bowed side radius"
      },
      "cornerRadius": {
        "type": "number",
        "default": 6,
        "description": "Corner radius"
      },
      "windowWidth": {
        "type": "number",
        "default": 32,
        "description": "Window width"
      },
      "windowHeight": {
        "type": "number",
        "default": 6.55,
        "description": "Window height"
      },
      "windowSpacing": {
        "type": "number",
        "default": 10.35,
        "description": "Window center spacing"
      },
      "thickness": {
        "type": "number",
        "default": 3.7,
        "description": "Thickness"
      },
      "edgeRadius": {
        "type": "number",
        "default": 0.8,
        "description": "Front/back edge radius"
      }
    }
  },
  "schemaHash": "sha256:c1792aa35a137151ab07d6e2d34d89ddb1b127fb163fc83507ba517ee5e4e8b0",
  "defaults": {
    "outerHeight": 24.5,
    "topStraightWidth": 30.2527,
    "sideRadius": 35.688467,
    "cornerRadius": 6,
    "windowWidth": 32,
    "windowHeight": 6.55,
    "windowSpacing": 10.35,
    "thickness": 3.7,
    "edgeRadius": 0.8
  },
  "fields": [
    {
      "key": "outerHeight",
      "label": "外高",
      "labelEn": "Outer height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "topStraightWidth",
      "label": "上/下直段长度",
      "labelEn": "Top/bottom straight length",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sideRadius",
      "label": "侧边鼓弧 R",
      "labelEn": "Bowed side radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "cornerRadius",
      "label": "四角 R",
      "labelEn": "Corner radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowWidth",
      "label": "每孔净宽",
      "labelEn": "Window width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowHeight",
      "label": "每孔净高",
      "labelEn": "Window height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowSpacing",
      "label": "两孔中心距",
      "labelEn": "Window center spacing",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "板厚",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "edgeRadius",
      "label": "前后边缘 R",
      "labelEn": "Front/back edge radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "bowedTwinWindowPlate"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "bowedTwinWindowPlate",
      "outerHeight": 24.5,
      "topStraightWidth": 30.2527,
      "sideRadius": 35.688467,
      "cornerRadius": 6,
      "windowWidth": 32,
      "windowHeight": 6.55,
      "windowSpacing": 10.35,
      "thickness": 3.7,
      "edgeRadius": 0.8
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:ebe25aa7fbc2090897979c04379c201e849dafef678324eed70cd16df283fd8b"
}
```

## 工具 template.flatFrame · 独立内外圆角平面框

```json
{
  "id": "template.flatFrame",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "独立内外圆角平面框",
  "category": "template",
  "synonyms": [
    "flatFrame",
    "独立内外圆角平面框",
    "Flat frame with independent corner radii"
  ],
  "description": "内外轮廓分别定义，框宽与厚度独立；圆角可等于短边一半形成跑道环。参数模板，不是原 IGS 完整复刻。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "独立内外圆角平面框",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Independent inner/outer outlines and thickness. Half-short-side radii allow capsule frames. A parametric tool, not a complete reconstruction of an IGS part.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "flatFrame"
      },
      "outerWidth": {
        "type": "number",
        "default": 40,
        "description": "Outer width"
      },
      "outerHeight": {
        "type": "number",
        "default": 28,
        "description": "Outer height"
      },
      "innerWidth": {
        "type": "number",
        "default": 28,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 16,
        "description": "Inner height"
      },
      "outerRadius": {
        "type": "number",
        "default": 5,
        "description": "Outer corner radius"
      },
      "innerRadius": {
        "type": "number",
        "default": 3,
        "description": "Inner corner radius"
      },
      "thickness": {
        "type": "number",
        "default": 3,
        "description": "Thickness"
      }
    }
  },
  "schemaHash": "sha256:a6c589be1f3b119f3e8a9eb98362b5f040128ca8ce4394651ba83bdbc645c1b9",
  "defaults": {
    "outerWidth": 40,
    "outerHeight": 28,
    "innerWidth": 28,
    "innerHeight": 16,
    "outerRadius": 5,
    "innerRadius": 3,
    "thickness": 3
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽",
      "labelEn": "Outer width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerHeight",
      "label": "外高",
      "labelEn": "Outer height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerRadius",
      "label": "外轮廓 R",
      "labelEn": "Outer corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "内轮廓 R",
      "labelEn": "Inner corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "厚度",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "flatFrame"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "flatFrame",
      "outerWidth": 40,
      "outerHeight": 28,
      "innerWidth": 28,
      "innerHeight": 16,
      "outerRadius": 5,
      "innerRadius": 3,
      "thickness": 3
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:c864e29bef696ba0ed8b8ebfd44674e3e23f6c73a88debdcc279e189d98470be"
}
```

## 工具 template.roundedFlatFrame · 圆边独立 R 平面框

```json
{
  "id": "template.roundedFlatFrame",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "圆边独立 R 平面框",
  "category": "template",
  "synonyms": [
    "roundedFlatFrame",
    "圆边独立 R 平面框",
    "Rounded frame with independent radii"
  ],
  "description": "独立内外圆角的闭合平面框，再以指定 R 一次倒圆所有尖边。圆边 R 必须显式给出；若内核无法完成则整步失败，不自动缩小。R 接近半厚可作外观候选，不保证精确半圆截面。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "圆边独立 R 平面框",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "A flat frame with independent inner and outer corner radii, then one exact fillet of every sharp edge. The specified edge radius fails atomically if unsolvable. Near half-thickness can approximate a round section but is not certified as a semicircle.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "roundedFlatFrame"
      },
      "outerWidth": {
        "type": "number",
        "default": 40,
        "description": "Outer width"
      },
      "outerHeight": {
        "type": "number",
        "default": 28,
        "description": "Outer height"
      },
      "innerWidth": {
        "type": "number",
        "default": 30,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 18,
        "description": "Inner height"
      },
      "outerRadius": {
        "type": "number",
        "default": 5,
        "description": "Outer corner radius"
      },
      "innerRadius": {
        "type": "number",
        "default": 2,
        "description": "Inner corner radius"
      },
      "thickness": {
        "type": "number",
        "default": 4,
        "description": "Thickness"
      },
      "edgeRadius": {
        "type": "number",
        "default": 1.5,
        "description": "All-edge fillet radius"
      }
    }
  },
  "schemaHash": "sha256:1715129c7ae378b725f09e0429c798460ba5083d2eecec8f64cf7055927f4415",
  "defaults": {
    "outerWidth": 40,
    "outerHeight": 28,
    "innerWidth": 30,
    "innerHeight": 18,
    "outerRadius": 5,
    "innerRadius": 2,
    "thickness": 4,
    "edgeRadius": 1.5
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽",
      "labelEn": "Outer width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerHeight",
      "label": "外高",
      "labelEn": "Outer height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerRadius",
      "label": "外轮廓 R",
      "labelEn": "Outer corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "内轮廓 R",
      "labelEn": "Inner corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "厚度",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "edgeRadius",
      "label": "整件圆边 R",
      "labelEn": "All-edge fillet radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "roundedFlatFrame"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "roundedFlatFrame",
      "outerWidth": 40,
      "outerHeight": 28,
      "innerWidth": 30,
      "innerHeight": 18,
      "outerRadius": 5,
      "innerRadius": 2,
      "thickness": 4,
      "edgeRadius": 1.5
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:4d96d256cfe558ad909100afcbb726a3f058ba8e44dbb44249e2d581cb8ae2cd"
}
```

## 工具 template.twinWindowPlate · 平板双窗扣

```json
{
  "id": "template.twinWindowPlate",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "平板双窗扣",
  "category": "template",
  "synonyms": [
    "twinWindowPlate",
    "平板双窗扣",
    "Flat twin-window buckle"
  ],
  "description": "独立外 R 和孔 R 的平板双窗，中间是板体一部分；整件前后尖边按指定 R 倒圆。两个孔等宽等高且上下对称，不含圆杆、偏置孔或侧向拱弯。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "平板双窗扣",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "A flat plate with two equal symmetric rounded windows and an integral center bridge. Independent outline, window and front/back edge radii. No round bar, offset windows or side arch.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "twinWindowPlate"
      },
      "outerWidth": {
        "type": "number",
        "default": 44.8,
        "description": "Outer width"
      },
      "outerHeight": {
        "type": "number",
        "default": 26.6,
        "description": "Outer height"
      },
      "outerRadius": {
        "type": "number",
        "default": 3.5,
        "description": "Outer planar radius"
      },
      "windowWidth": {
        "type": "number",
        "default": 37.8,
        "description": "Window clear width"
      },
      "totalInnerHeight": {
        "type": "number",
        "default": 19.6,
        "description": "Total inner height"
      },
      "windowRadius": {
        "type": "number",
        "default": 2,
        "description": "Window planar radius"
      },
      "barWidth": {
        "type": "number",
        "default": 3.5,
        "description": "Center bridge width"
      },
      "thickness": {
        "type": "number",
        "default": 3.5,
        "description": "Plate thickness"
      },
      "edgeRadius": {
        "type": "number",
        "default": 0.5,
        "description": "Front/back edge radius"
      }
    }
  },
  "schemaHash": "sha256:040be496b12d70a3893764bb4a657f6f8422288db4b7173c404cce2cad13f1a1",
  "defaults": {
    "outerWidth": 44.8,
    "outerHeight": 26.6,
    "outerRadius": 3.5,
    "windowWidth": 37.8,
    "totalInnerHeight": 19.6,
    "windowRadius": 2,
    "barWidth": 3.5,
    "thickness": 3.5,
    "edgeRadius": 0.5
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽",
      "labelEn": "Outer width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerHeight",
      "label": "外高",
      "labelEn": "Outer height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerRadius",
      "label": "外平面 R",
      "labelEn": "Outer planar radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "windowWidth",
      "label": "每孔净宽",
      "labelEn": "Window clear width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "totalInnerHeight",
      "label": "双孔与横条总内高",
      "labelEn": "Total inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowRadius",
      "label": "孔内平面 R",
      "labelEn": "Window planar radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "barWidth",
      "label": "中横条正面宽",
      "labelEn": "Center bridge width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "整板厚度",
      "labelEn": "Plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "edgeRadius",
      "label": "前后边缘截面 R",
      "labelEn": "Front/back edge radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "twinWindowPlate"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "twinWindowPlate",
      "outerWidth": 44.8,
      "outerHeight": 26.6,
      "outerRadius": 3.5,
      "windowWidth": 37.8,
      "totalInnerHeight": 19.6,
      "windowRadius": 2,
      "barWidth": 3.5,
      "thickness": 3.5,
      "edgeRadius": 0.5
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:d54340c99f00e6f8a7990dd3815774727092349b0853b3f6c2c998259b123270"
}
```

## 工具 template.mountingPlate · 双孔圆角安装板

```json
{
  "id": "template.mountingPlate",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "双孔圆角安装板",
  "category": "template",
  "synonyms": [
    "mountingPlate",
    "双孔圆角安装板",
    "Two-hole rounded mounting plate"
  ],
  "description": "孔沿 X 对称，中心距单独定义；孔为贯穿光孔，不含螺纹、沉头或沉孔。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "双孔圆角安装板",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Two symmetric X-axis holes with independent center spacing. Plain through holes only; no threads, countersinks or counterbores.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "mountingPlate"
      },
      "width": {
        "type": "number",
        "default": 40,
        "description": "Plate width X"
      },
      "depth": {
        "type": "number",
        "default": 16,
        "description": "Plate depth Y"
      },
      "thickness": {
        "type": "number",
        "default": 3,
        "description": "Thickness"
      },
      "cornerRadius": {
        "type": "number",
        "default": 3,
        "description": "Outer corner radius"
      },
      "holeDiameter": {
        "type": "number",
        "default": 4,
        "description": "Hole diameter"
      },
      "holeSpacing": {
        "type": "number",
        "default": 24,
        "description": "Hole center spacing"
      }
    }
  },
  "schemaHash": "sha256:4ad5da2e952135dc4a111e2d3d74560651f6b791679f8e6de6ce882bc892ed87",
  "defaults": {
    "width": 40,
    "depth": 16,
    "thickness": 3,
    "cornerRadius": 3,
    "holeDiameter": 4,
    "holeSpacing": 24
  },
  "fields": [
    {
      "key": "width",
      "label": "板宽 X",
      "labelEn": "Plate width X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "depth",
      "label": "板深 Y",
      "labelEn": "Plate depth Y",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "厚度",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "cornerRadius",
      "label": "外角 R",
      "labelEn": "Outer corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "holeDiameter",
      "label": "孔径",
      "labelEn": "Hole diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "holeSpacing",
      "label": "两孔中心距",
      "labelEn": "Hole center spacing",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "mountingPlate"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "mountingPlate",
      "width": 40,
      "depth": 16,
      "thickness": 3,
      "cornerRadius": 3,
      "holeDiameter": 4,
      "holeSpacing": 24
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:d79521c2bcfd2bdfb4e7e0535e06e821d22d8d1fb796b0c60a13c5c8154b04af"
}
```

## 工具 template.fourHolePlate · 四孔安装板

```json
{
  "id": "template.fourHolePlate",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "四孔安装板",
  "category": "template",
  "synonyms": [
    "fourHolePlate",
    "四孔安装板",
    "Four-hole mounting plate"
  ],
  "description": "矩形板四角各一个贯穿光孔，孔中心到左右及前后边的距离分别可调；可选外角 R。不含螺纹或沉孔。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "四孔安装板",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Rectangular plate with four through holes. Set X/Y edge insets and optional outer corner radius; no threads or counterbores.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "fourHolePlate"
      },
      "width": {
        "type": "number",
        "default": 50,
        "description": "Plate width X"
      },
      "depth": {
        "type": "number",
        "default": 30,
        "description": "Plate depth Y"
      },
      "thickness": {
        "type": "number",
        "default": 3,
        "description": "Thickness"
      },
      "cornerRadius": {
        "type": "number",
        "default": 0,
        "description": "Outer corner radius"
      },
      "holeDiameter": {
        "type": "number",
        "default": 4,
        "description": "Hole diameter"
      },
      "insetX": {
        "type": "number",
        "default": 5,
        "description": "Hole inset X"
      },
      "insetY": {
        "type": "number",
        "default": 5,
        "description": "Hole inset Y"
      }
    }
  },
  "schemaHash": "sha256:77d89a0632a9d40127fd9fc9a3f65e3cab353ae346939405b077f3ba99712ed5",
  "defaults": {
    "width": 50,
    "depth": 30,
    "thickness": 3,
    "cornerRadius": 0,
    "holeDiameter": 4,
    "insetX": 5,
    "insetY": 5
  },
  "fields": [
    {
      "key": "width",
      "label": "板宽 X",
      "labelEn": "Plate width X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "depth",
      "label": "板深 Y",
      "labelEn": "Plate depth Y",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "厚度",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "cornerRadius",
      "label": "外角 R",
      "labelEn": "Outer corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "holeDiameter",
      "label": "孔径",
      "labelEn": "Hole diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "insetX",
      "label": "左右孔心边距",
      "labelEn": "Hole inset X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "insetY",
      "label": "前后孔心边距",
      "labelEn": "Hole inset Y",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "fourHolePlate"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "fourHolePlate",
      "width": 50,
      "depth": 30,
      "thickness": 3,
      "cornerRadius": 0,
      "holeDiameter": 4,
      "insetX": 5,
      "insetY": 5
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:af584c0444c02b8e727762da101caf564c7abca2274ff48423a78e89cd380bf2"
}
```

## 工具 template.bossPlate · 双空心柱安装板

```json
{
  "id": "template.bossPlate",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "双空心柱安装板",
  "category": "template",
  "synonyms": [
    "bossPlate",
    "双空心柱安装板",
    "Two hollow-boss mounting plate"
  ],
  "description": "圆角板上两根对称空心圆柱凸台，孔贯穿凸台与板。参数化通用实体，不代表螺纹、沉孔或原产品复刻。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "双空心柱安装板",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "A rounded plate with two symmetric hollow cylindrical bosses; each bore passes through both boss and plate. Generic parametric geometry, not a threaded, counterbored, or source-product reconstruction.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "bossPlate"
      },
      "width": {
        "type": "number",
        "default": 40,
        "description": "Plate width X"
      },
      "depth": {
        "type": "number",
        "default": 16,
        "description": "Plate depth Y"
      },
      "thickness": {
        "type": "number",
        "default": 3,
        "description": "Plate thickness"
      },
      "cornerRadius": {
        "type": "number",
        "default": 3,
        "description": "Plate corner radius"
      },
      "bossSpacing": {
        "type": "number",
        "default": 24,
        "description": "Boss center spacing"
      },
      "bossOuterDiameter": {
        "type": "number",
        "default": 8,
        "description": "Boss outer diameter"
      },
      "boreDiameter": {
        "type": "number",
        "default": 4,
        "description": "Through-bore diameter"
      },
      "bossHeight": {
        "type": "number",
        "default": 6,
        "description": "Boss height (below plate)"
      }
    }
  },
  "schemaHash": "sha256:ba6dfc00399719920fd18433ac7fc9ea5e76adecfe6df9c4f05e8ba6ee1dedc5",
  "defaults": {
    "width": 40,
    "depth": 16,
    "thickness": 3,
    "cornerRadius": 3,
    "bossSpacing": 24,
    "bossOuterDiameter": 8,
    "boreDiameter": 4,
    "bossHeight": 6
  },
  "fields": [
    {
      "key": "width",
      "label": "板宽 X",
      "labelEn": "Plate width X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "depth",
      "label": "板深 Y",
      "labelEn": "Plate depth Y",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "板厚",
      "labelEn": "Plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "cornerRadius",
      "label": "板角 R",
      "labelEn": "Plate corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "bossSpacing",
      "label": "凸台中心距",
      "labelEn": "Boss center spacing",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossOuterDiameter",
      "label": "凸台外径",
      "labelEn": "Boss outer diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "boreDiameter",
      "label": "通孔直径",
      "labelEn": "Through-bore diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossHeight",
      "label": "凸台高度（板下）",
      "labelEn": "Boss height (below plate)",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "bossPlate"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "bossPlate",
      "width": 40,
      "depth": 16,
      "thickness": 3,
      "cornerRadius": 3,
      "bossSpacing": 24,
      "bossOuterDiameter": 8,
      "boreDiameter": 4,
      "bossHeight": 6
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:490f2e9cf741dcab91db60ac0c5072626a3df8aea828fec9468fd33fd7a87f92"
}
```

## 工具 template.flangedBushing · 法兰轴套

```json
{
  "id": "template.flangedBushing",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "法兰轴套",
  "category": "template",
  "synonyms": [
    "flangedBushing",
    "法兰轴套",
    "Flanged bushing"
  ],
  "description": "同轴法兰与圆筒轴套，直孔贯穿全长。通用参数化实体，不含螺纹或原产品特征复刻。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "法兰轴套",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "A coaxial flange and cylindrical bushing with a straight bore through the full length. Generic parametric geometry, with no threads or source-product feature reconstruction.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "flangedBushing"
      },
      "bodyDiameter": {
        "type": "number",
        "default": 12,
        "description": "Bushing body diameter"
      },
      "flangeDiameter": {
        "type": "number",
        "default": 20,
        "description": "Flange diameter"
      },
      "boreDiameter": {
        "type": "number",
        "default": 6,
        "description": "Through-bore diameter"
      },
      "bodyHeight": {
        "type": "number",
        "default": 10,
        "description": "Body height"
      },
      "flangeThickness": {
        "type": "number",
        "default": 3,
        "description": "Flange thickness"
      }
    }
  },
  "schemaHash": "sha256:d3b527b2e8a84b428a623e8e2a7b694808f63949e4b9a39b96f07b14af62fcc9",
  "defaults": {
    "bodyDiameter": 12,
    "flangeDiameter": 20,
    "boreDiameter": 6,
    "bodyHeight": 10,
    "flangeThickness": 3
  },
  "fields": [
    {
      "key": "bodyDiameter",
      "label": "轴套外径",
      "labelEn": "Bushing body diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "flangeDiameter",
      "label": "法兰外径",
      "labelEn": "Flange diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "boreDiameter",
      "label": "通孔直径",
      "labelEn": "Through-bore diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bodyHeight",
      "label": "筒体高度",
      "labelEn": "Body height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "flangeThickness",
      "label": "法兰厚度",
      "labelEn": "Flange thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "flangedBushing"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "flangedBushing",
      "bodyDiameter": 12,
      "flangeDiameter": 20,
      "boreDiameter": 6,
      "bodyHeight": 10,
      "flangeThickness": 3
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:3adf1f03fc823bccd5a857e0225c4e84392063920d2cc77c9dbf5bee9914fba6"
}
```

## 工具 template.openArcRing · 大开口 C 环

```json
{
  "id": "template.openArcRing",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "大开口 C 环",
  "category": "template",
  "synonyms": [
    "openArcRing",
    "大开口 C 环",
    "Wide-gap C ring"
  ],
  "description": "恒截面圆弧环，开口角度可调，适合开口环、钩环和未闭合圆框的基础毛坯；不包含端头球、铰链或变截面。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "大开口 C 环",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Constant-section circular arc with an adjustable opening angle for C rings, hook rings and open circular frames. End balls, hinges and variable sections are excluded.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "openArcRing"
      },
      "section": {
        "type": "string",
        "default": "round",
        "description": "Section",
        "enum": [
          "round",
          "square",
          "chamferedSquare"
        ]
      },
      "innerDiameter": {
        "type": "number",
        "default": 30,
        "description": "Inner diameter"
      },
      "sectionSize": {
        "type": "number",
        "default": 4,
        "description": "Wire diameter / square size"
      },
      "sectionRadius": {
        "type": "number",
        "default": 0.4,
        "description": "Square section corner R"
      },
      "sectionChamfer": {
        "type": "number",
        "default": 0.6,
        "description": "Square section chamfer C"
      },
      "openingAngle": {
        "type": "number",
        "default": 70,
        "description": "Opening angle (degrees)"
      }
    }
  },
  "schemaHash": "sha256:fd9e7eae0a0571cc1fe30148fe3ecc5958bcdcef7e9efcebdbe3bcc52939cb1f",
  "defaults": {
    "section": "round",
    "innerDiameter": 30,
    "sectionSize": 4,
    "sectionRadius": 0.4,
    "sectionChamfer": 0.6,
    "openingAngle": 70
  },
  "fields": [
    {
      "key": "innerDiameter",
      "label": "内径",
      "labelEn": "Inner diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "section",
      "label": "截面",
      "labelEn": "Section",
      "type": "select",
      "options": [
        {
          "value": "round",
          "label": "圆线",
          "labelEn": "Round wire"
        },
        {
          "value": "square",
          "label": "圆角方线",
          "labelEn": "Rounded square"
        },
        {
          "value": "chamferedSquare",
          "label": "倒角方线",
          "labelEn": "Chamfered square"
        }
      ]
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "sectionChamfer",
      "label": "方线截面倒角 C（仅倒角方线）",
      "labelEn": "Square section chamfer C",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "openingAngle",
      "label": "开口角度（°）",
      "labelEn": "Opening angle (degrees)",
      "type": "number",
      "min": 5,
      "step": 1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "openArcRing"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "openArcRing",
      "section": "round",
      "innerDiameter": 30,
      "sectionSize": 4,
      "sectionRadius": 0.4,
      "sectionChamfer": 0.6,
      "openingAngle": 70
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:c57513aeba0919a45006e3a9ecd32689ec3a72e6965968a7b496161f8743a0df"
}
```

## 工具 template.roundedBossTray · 圆角双柱薄壁壳

```json
{
  "id": "template.roundedBossTray",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "圆角双柱薄壁壳",
  "category": "template",
  "synonyms": [
    "roundedBossTray",
    "圆角双柱薄壁壳",
    "Rounded tray with two hollow bosses"
  ],
  "description": "圆角矩形薄壁壳，顶部敞口，内底带两根空心柱。外圆角、壁厚、底厚和柱尺寸均可调；直壁无拔模，不包含卡扣、文字或表面花纹。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "圆角双柱薄壁壳",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Open rounded-rectangle tray with two hollow bosses on the inner floor. Outer corner radius, wall/floor thickness and boss dimensions are editable. Straight walls only; no draft, clips, lettering or texture.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "roundedBossTray"
      },
      "outerWidth": {
        "type": "number",
        "default": 60,
        "description": "Outer width X"
      },
      "outerDepth": {
        "type": "number",
        "default": 38,
        "description": "Outer depth Y"
      },
      "height": {
        "type": "number",
        "default": 12,
        "description": "Total height"
      },
      "cornerRadius": {
        "type": "number",
        "default": 6,
        "description": "Outer corner radius"
      },
      "wallThickness": {
        "type": "number",
        "default": 2,
        "description": "Wall thickness"
      },
      "floorThickness": {
        "type": "number",
        "default": 2,
        "description": "Floor thickness"
      },
      "bossSpacing": {
        "type": "number",
        "default": 30,
        "description": "Boss center spacing X"
      },
      "bossOuterDiameter": {
        "type": "number",
        "default": 7,
        "description": "Boss outer diameter"
      },
      "boreDiameter": {
        "type": "number",
        "default": 3,
        "description": "Through-bore diameter"
      },
      "bossHeight": {
        "type": "number",
        "default": 7,
        "description": "Boss height above inner floor"
      }
    }
  },
  "schemaHash": "sha256:18cdf0d2cc4dca5a95a8e120ccdb57184d5372dc60b8cea2999b40769ded8656",
  "defaults": {
    "outerWidth": 60,
    "outerDepth": 38,
    "height": 12,
    "cornerRadius": 6,
    "wallThickness": 2,
    "floorThickness": 2,
    "bossSpacing": 30,
    "bossOuterDiameter": 7,
    "boreDiameter": 3,
    "bossHeight": 7
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽 X",
      "labelEn": "Outer width X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerDepth",
      "label": "外深 Y",
      "labelEn": "Outer depth Y",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "height",
      "label": "壳体总高",
      "labelEn": "Total height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "cornerRadius",
      "label": "外轮廓圆角 R",
      "labelEn": "Outer corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "wallThickness",
      "label": "侧壁厚",
      "labelEn": "Wall thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "floorThickness",
      "label": "底板厚",
      "labelEn": "Floor thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossSpacing",
      "label": "两柱中心距 X",
      "labelEn": "Boss center spacing X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossOuterDiameter",
      "label": "柱外径",
      "labelEn": "Boss outer diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "boreDiameter",
      "label": "贯穿孔径",
      "labelEn": "Through-bore diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossHeight",
      "label": "内底面以上柱高",
      "labelEn": "Boss height above inner floor",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "roundedBossTray"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "roundedBossTray",
      "outerWidth": 60,
      "outerDepth": 38,
      "height": 12,
      "cornerRadius": 6,
      "wallThickness": 2,
      "floorThickness": 2,
      "bossSpacing": 30,
      "bossOuterDiameter": 7,
      "boreDiameter": 3,
      "bossHeight": 7
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:583405c5044d9265df6fa6030b2054f40df87650259e84d9a68514178aa1dca1"
}
```

## 工具 template.roundBadge · 双柱圆牌底座

```json
{
  "id": "template.roundBadge",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "双柱圆牌底座",
  "category": "template",
  "synonyms": [
    "roundBadge",
    "双柱圆牌底座",
    "Round badge base with two posts"
  ],
  "description": "圆形牌面、正面环形凸边和背面两根安装柱组成一个实体。可选空心柱；不包含品牌图案、齿纹、拱面或生产尺寸。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "双柱圆牌底座",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "One solid combining a round badge plate, raised front rim and two rear mounting posts. Posts may be hollow. Brand artwork, knurling, doming and production dimensions are excluded.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "roundBadge"
      },
      "diameter": {
        "type": "number",
        "default": 40,
        "description": "Badge diameter"
      },
      "thickness": {
        "type": "number",
        "default": 2,
        "description": "Plate thickness"
      },
      "rimWidth": {
        "type": "number",
        "default": 2,
        "description": "Front rim width"
      },
      "rimHeight": {
        "type": "number",
        "default": 0.8,
        "description": "Front rim height"
      },
      "postSpacing": {
        "type": "number",
        "default": 18,
        "description": "Rear post spacing X"
      },
      "postDiameter": {
        "type": "number",
        "default": 4,
        "description": "Rear post diameter"
      },
      "postHeight": {
        "type": "number",
        "default": 4,
        "description": "Rear post height"
      },
      "postBoreDiameter": {
        "type": "number",
        "default": 0,
        "description": "Post bore diameter (0 = solid)"
      }
    }
  },
  "schemaHash": "sha256:5dc09d8ceef886d0a0609f63127835d3751f0d85faeb9416af088e06bde93925",
  "defaults": {
    "diameter": 40,
    "thickness": 2,
    "rimWidth": 2,
    "rimHeight": 0.8,
    "postSpacing": 18,
    "postDiameter": 4,
    "postHeight": 4,
    "postBoreDiameter": 0
  },
  "fields": [
    {
      "key": "diameter",
      "label": "牌面直径",
      "labelEn": "Badge diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "牌面厚度",
      "labelEn": "Plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "rimWidth",
      "label": "正面环边宽",
      "labelEn": "Front rim width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "rimHeight",
      "label": "正面环边高度",
      "labelEn": "Front rim height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "postSpacing",
      "label": "背柱中心距 X",
      "labelEn": "Rear post spacing X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "postDiameter",
      "label": "背柱直径",
      "labelEn": "Rear post diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "postHeight",
      "label": "背柱高度",
      "labelEn": "Rear post height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "postBoreDiameter",
      "label": "背柱孔径（0 为实心）",
      "labelEn": "Post bore diameter (0 = solid)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "roundBadge"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "roundBadge",
      "diameter": 40,
      "thickness": 2,
      "rimWidth": 2,
      "rimHeight": 0.8,
      "postSpacing": 18,
      "postDiameter": 4,
      "postHeight": 4,
      "postBoreDiameter": 0
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:b3e5c33963b3565f178c45b76a4177ef87ccb2b7ad4031975d58706733f14ac6"
}
```

## 工具 template.thinWallTray · 双空心柱薄壁壳

```json
{
  "id": "template.thinWallTray",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "双空心柱薄壁壳",
  "category": "template",
  "synonyms": [
    "thinWallTray",
    "双空心柱薄壁壳",
    "Open tray with two hollow bosses"
  ],
  "description": "单一熔接实体，XY 居中、底面 Z=0、顶部敞口。内腔净宽=外宽−2×壁厚，净深=外深−2×壁厚，净高=总高−底厚。两柱沿 X 对称，柱高从内底面起算，孔贯穿柱和底板。仅直壁、直角、无拔模/圆角/螺纹；不是装配体。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "双空心柱薄壁壳",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "One fused solid, centered in XY, bottom at Z=0, open top. Clear cavity width/depth = outer width/depth minus twice wall thickness; clear height = height minus floor thickness. Two X-symmetric bosses rise from the inner floor; bores pass through bosses and floor. Straight walls/corners only; no draft, fillets, threads or assembly relationships.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "thinWallTray"
      },
      "outerWidth": {
        "type": "number",
        "default": 60,
        "description": "Outer width X"
      },
      "outerDepth": {
        "type": "number",
        "default": 36,
        "description": "Outer depth Y"
      },
      "height": {
        "type": "number",
        "default": 14,
        "description": "Total height"
      },
      "wallThickness": {
        "type": "number",
        "default": 2,
        "description": "Wall thickness"
      },
      "floorThickness": {
        "type": "number",
        "default": 2,
        "description": "Floor thickness"
      },
      "bossSpacing": {
        "type": "number",
        "default": 30,
        "description": "Boss center spacing X"
      },
      "bossOuterDiameter": {
        "type": "number",
        "default": 8,
        "description": "Boss outer diameter"
      },
      "boreDiameter": {
        "type": "number",
        "default": 3,
        "description": "Through-bore diameter"
      },
      "bossHeight": {
        "type": "number",
        "default": 8,
        "description": "Boss height above inner floor"
      }
    }
  },
  "schemaHash": "sha256:dfedc0667b3c24f9b146ff25bdf4b8f5479611af9a805bc7cd123e68689bd1a2",
  "defaults": {
    "outerWidth": 60,
    "outerDepth": 36,
    "height": 14,
    "wallThickness": 2,
    "floorThickness": 2,
    "bossSpacing": 30,
    "bossOuterDiameter": 8,
    "boreDiameter": 3,
    "bossHeight": 8
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽 X",
      "labelEn": "Outer width X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerDepth",
      "label": "外深 Y",
      "labelEn": "Outer depth Y",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "height",
      "label": "壳体总高",
      "labelEn": "Total height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "wallThickness",
      "label": "侧壁厚",
      "labelEn": "Wall thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "floorThickness",
      "label": "底板厚",
      "labelEn": "Floor thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossSpacing",
      "label": "两柱中心距 X",
      "labelEn": "Boss center spacing X",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossOuterDiameter",
      "label": "柱外径",
      "labelEn": "Boss outer diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "boreDiameter",
      "label": "贯穿孔径",
      "labelEn": "Through-bore diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bossHeight",
      "label": "内底面以上柱高",
      "labelEn": "Boss height above inner floor",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "thinWallTray"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "thinWallTray",
      "outerWidth": 60,
      "outerDepth": 36,
      "height": 14,
      "wallThickness": 2,
      "floorThickness": 2,
      "bossSpacing": 30,
      "bossOuterDiameter": 8,
      "boreDiameter": 3,
      "bossHeight": 8
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:35ac7174fb2e63ec6058474030cf6fb3616e1df7019420d3ba839a7c2c88e3ff"
}
```

## 工具 template.tube · 圆筒（C件默认）

```json
{
  "id": "template.tube",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "圆筒（C件默认）",
  "category": "template",
  "synonyms": [
    "tube",
    "圆筒（C件默认）",
    "Tube (C-part default)"
  ],
  "description": "同轴圆筒，外径 13.4、内径 12.4、高度 3 为用户 C 件默认值。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "圆筒（C件默认）",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Coaxial tube; defaults 13.4 outer diameter, 12.4 inner diameter and 3 height for the user C-part.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "tube"
      },
      "outerDiameter": {
        "type": "number",
        "default": 13.4,
        "description": "Outer diameter"
      },
      "innerDiameter": {
        "type": "number",
        "default": 12.4,
        "description": "Inner diameter"
      },
      "height": {
        "type": "number",
        "default": 3,
        "description": "Height"
      }
    }
  },
  "schemaHash": "sha256:47132b24d0e50031562073f7400455aa94633c0f2a1236eef38156f07444fb1f",
  "defaults": {
    "outerDiameter": 13.4,
    "innerDiameter": 12.4,
    "height": 3
  },
  "fields": [
    {
      "key": "outerDiameter",
      "label": "外径",
      "labelEn": "Outer diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerDiameter",
      "label": "内径",
      "labelEn": "Inner diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "height",
      "label": "高度",
      "labelEn": "Height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "tube"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "tube",
      "outerDiameter": 13.4,
      "innerDiameter": 12.4,
      "height": 3
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:1d1e0885418da8b5ecd59b6605d20a159e482dc74c34260f97cdf9b68d02b42b"
}
```

## 工具 template.counterboreTool · 沉孔／沉头孔刀具

```json
{
  "id": "template.counterboreTool",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "沉孔／沉头孔刀具",
  "category": "template",
  "synonyms": [
    "counterboreTool",
    "沉孔／沉头孔刀具",
    "Counterbore / countersink tool"
  ],
  "description": "这是刀具实体：入口在 Z=0，沿 +Z；移动定位到工件表面，必要时旋转 180°，先选主体再选刀具相减。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "沉孔／沉头孔刀具",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Tool solid: entry at Z=0, extending along +Z. Position at the workpiece surface, rotate 180 degrees if needed, then select the body first and subtract the tool.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "counterboreTool"
      },
      "holeDiameter": {
        "type": "number",
        "default": 4,
        "description": "Hole diameter"
      },
      "depth": {
        "type": "number",
        "default": 8,
        "description": "Total depth"
      },
      "headDiameter": {
        "type": "number",
        "default": 8,
        "description": "Head diameter"
      },
      "headDepth": {
        "type": "number",
        "default": 2,
        "description": "Head depth"
      },
      "style": {
        "type": "string",
        "default": "bore",
        "description": "Style",
        "enum": [
          "bore",
          "sink"
        ]
      }
    }
  },
  "schemaHash": "sha256:d8433c98173d51022b5ecfba0f9762a461cf58c48299c93f08d12b8280be60cf",
  "defaults": {
    "holeDiameter": 4,
    "depth": 8,
    "headDiameter": 8,
    "headDepth": 2,
    "style": "bore"
  },
  "fields": [
    {
      "key": "holeDiameter",
      "label": "孔直径",
      "labelEn": "Hole diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "depth",
      "label": "总深",
      "labelEn": "Total depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "headDiameter",
      "label": "头径",
      "labelEn": "Head diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "headDepth",
      "label": "头深",
      "labelEn": "Head depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "style",
      "label": "类型",
      "labelEn": "Style",
      "type": "select",
      "options": [
        {
          "value": "bore",
          "label": "沉孔",
          "labelEn": "Counterbore"
        },
        {
          "value": "sink",
          "label": "沉头孔",
          "labelEn": "Countersink"
        }
      ]
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "counterboreTool"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "counterboreTool",
      "holeDiameter": 4,
      "depth": 8,
      "headDiameter": 8,
      "headDepth": 2,
      "style": "bore"
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:83fcacad73774a9ff2f3a7bfe3d921afe752fa12d5c99107c3d7a4ed9438f8d9"
}
```

## 工具 template.ring · 圆圈

```json
{
  "id": "template.ring",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "圆圈",
  "category": "template",
  "synonyms": [
    "ring",
    "圆圈",
    "Ring"
  ],
  "description": "同心圆恒截面单圈；开缝为底部正中平行平切。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "圆圈",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "同心圆恒截面单圈；开缝为底部正中平行平切。",
    "properties": {
      "kind": {
        "type": "string",
        "const": "ring"
      },
      "section": {
        "type": "string",
        "default": "round",
        "description": "Section",
        "enum": [
          "round",
          "square",
          "chamferedSquare"
        ]
      },
      "sectionSize": {
        "type": "number",
        "default": 3,
        "description": "Wire diameter / square size"
      },
      "sectionRadius": {
        "type": "number",
        "default": 0.3,
        "description": "Square section corner R"
      },
      "sectionChamfer": {
        "type": "number",
        "default": 0.6,
        "description": "Square section chamfer C"
      },
      "gapWidth": {
        "type": "number",
        "default": 0,
        "description": "Bottom gap (0 = closed)"
      },
      "innerDiameter": {
        "type": "number",
        "default": 24,
        "description": "Inner diameter"
      }
    }
  },
  "schemaHash": "sha256:2ceab3f6495b3bf74eb40bef7e4fa6c073567e3911684f82409b920ef0fff522",
  "defaults": {
    "section": "round",
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerDiameter": 24
  },
  "fields": [
    {
      "key": "innerDiameter",
      "label": "内径",
      "labelEn": "Inner diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "section",
      "label": "截面",
      "labelEn": "Section",
      "type": "select",
      "options": [
        {
          "value": "round",
          "label": "圆线",
          "labelEn": "Round wire"
        },
        {
          "value": "square",
          "label": "圆角方线",
          "labelEn": "Rounded square"
        },
        {
          "value": "chamferedSquare",
          "label": "倒角方线",
          "labelEn": "Chamfered square"
        }
      ]
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "sectionChamfer",
      "label": "方线截面倒角 C（仅倒角方线）",
      "labelEn": "Square section chamfer C",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "gapWidth",
      "label": "底部实际缝宽（0 闭合）",
      "labelEn": "Bottom gap (0 = closed)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ring"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ring",
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerDiameter": 24
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:67d976f457f04bf004374008189e27c88e8485256c59e59f3541ba377c119879"
}
```

## 工具 template.ringBar · 圆环内接横杆

```json
{
  "id": "template.ringBar",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "圆环内接横杆",
  "category": "template",
  "synonyms": [
    "ringBar",
    "圆环内接横杆",
    "Ring with fixed crossbar"
  ],
  "description": "同心圆恒截面框与一根沿 X 的圆杆融合为单一实体。横杆可沿 Y 及厚度 Z 微调；不包含活动杆、铰链或精确接头过渡。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "圆环内接横杆",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "A constant-section circular frame fused to one round X-axis crossbar. The bar has editable Y and depth Z offsets. Moving bars, hinges and exact joint transitions are excluded.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "ringBar"
      },
      "section": {
        "type": "string",
        "default": "round",
        "description": "Section",
        "enum": [
          "round",
          "square",
          "chamferedSquare"
        ]
      },
      "innerDiameter": {
        "type": "number",
        "default": 20,
        "description": "Ring inner diameter"
      },
      "sectionSize": {
        "type": "number",
        "default": 3,
        "description": "Wire diameter / square size"
      },
      "sectionRadius": {
        "type": "number",
        "default": 0.3,
        "description": "Square section corner R"
      },
      "sectionChamfer": {
        "type": "number",
        "default": 0.6,
        "description": "Square section chamfer C"
      },
      "barDiameter": {
        "type": "number",
        "default": 2,
        "description": "Bar diameter"
      },
      "barOffset": {
        "type": "number",
        "default": 0,
        "description": "Bar Y offset"
      },
      "barDepthOffset": {
        "type": "number",
        "default": 0,
        "description": "Bar Z depth offset"
      }
    }
  },
  "schemaHash": "sha256:fe9453c63f7c389dd88318f342a21c484406ed7e1d54ed53d2be69ce7b139669",
  "defaults": {
    "section": "round",
    "innerDiameter": 20,
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "barDiameter": 2,
    "barOffset": 0,
    "barDepthOffset": 0
  },
  "fields": [
    {
      "key": "innerDiameter",
      "label": "环内径",
      "labelEn": "Ring inner diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "section",
      "label": "截面",
      "labelEn": "Section",
      "type": "select",
      "options": [
        {
          "value": "round",
          "label": "圆线",
          "labelEn": "Round wire"
        },
        {
          "value": "square",
          "label": "圆角方线",
          "labelEn": "Rounded square"
        },
        {
          "value": "chamferedSquare",
          "label": "倒角方线",
          "labelEn": "Chamfered square"
        }
      ]
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "sectionChamfer",
      "label": "方线截面倒角 C（仅倒角方线）",
      "labelEn": "Square section chamfer C",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "barDiameter",
      "label": "横杆直径",
      "labelEn": "Bar diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "barOffset",
      "label": "横杆 Y 偏移",
      "labelEn": "Bar Y offset",
      "type": "number",
      "min": -100,
      "step": 0.1
    },
    {
      "key": "barDepthOffset",
      "label": "横杆 Z 错层",
      "labelEn": "Bar Z depth offset",
      "type": "number",
      "min": -100,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ringBar"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ringBar",
      "section": "round",
      "innerDiameter": 20,
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "barDiameter": 2,
      "barOffset": 0,
      "barDepthOffset": 0
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:37f9c9ab239a46ca34dc723a59b30a1630286b31a1544ed3f5faca8aac8065ce"
}
```

## 工具 template.ellipseBar · 椭圆圈固定横杆

```json
{
  "id": "template.ellipseBar",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "椭圆圈固定横杆",
  "category": "template",
  "synonyms": [
    "ellipseBar",
    "椭圆圈固定横杆",
    "Elliptical ring with fixed bar"
  ],
  "description": "从内真椭圆外偏线扫掠圆线，再融合居中固定圆杆。圆线外包围须精确回读；接头过渡与源样条仍须对照。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "椭圆圈固定横杆",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Offset a true inner ellipse for a round-wire sweep and fuse one centered fixed round bar. Read back exact bounds; source spline and joint continuity still require comparison.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "ellipseBar"
      },
      "innerWidth": {
        "type": "number",
        "default": 35,
        "description": "Inner ellipse major diameter"
      },
      "innerHeight": {
        "type": "number",
        "default": 25,
        "description": "Inner ellipse minor diameter"
      },
      "sectionSize": {
        "type": "number",
        "default": 5,
        "description": "Wire diameter / square size"
      },
      "barDiameter": {
        "type": "number",
        "default": 5,
        "description": "Bar diameter"
      },
      "barDepthOffset": {
        "type": "number",
        "default": 0,
        "description": "Bar Z depth offset"
      }
    }
  },
  "schemaHash": "sha256:bbae47f98797114053862a99d585d47efd134d29f78d8a75fa31b4572466abd0",
  "defaults": {
    "innerWidth": 35,
    "innerHeight": 25,
    "sectionSize": 5,
    "barDiameter": 5,
    "barDepthOffset": 0
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内椭圆长径",
      "labelEn": "Inner ellipse major diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内椭圆短径",
      "labelEn": "Inner ellipse minor diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "barDiameter",
      "label": "横杆直径",
      "labelEn": "Bar diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "barDepthOffset",
      "label": "横杆 Z 错层",
      "labelEn": "Bar Z depth offset",
      "type": "number",
      "min": -100,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ellipseBar"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ellipseBar",
      "innerWidth": 35,
      "innerHeight": 25,
      "sectionSize": 5,
      "barDiameter": 5,
      "barDepthOffset": 0
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:f43d620ebb2587ffe4b75813f23acc3b176c5edbb30dc510c8aa5ed5deb2c04d"
}
```

## 工具 template.ellipseOpenWire · 内真椭圆开缝圆线圈

```json
{
  "id": "template.ellipseOpenWire",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "内真椭圆开缝圆线圈",
  "category": "template",
  "synonyms": [
    "ellipseOpenWire",
    "内真椭圆开缝圆线圈",
    "Open round-wire ellipse from inner outline"
  ],
  "description": "以内孔真椭圆外偏半线径扫掠圆线；底部正中用平行平面切出真实缝宽。外轮廓真椭圆的图纸不可使用本工具。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "内真椭圆开缝圆线圈",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Sweep round wire along a half-wire outward offset of a true inner ellipse, then cut a bottom-center parallel flat gap. Source drawings with a true outer ellipse need another tool.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "ellipseOpenWire"
      },
      "innerWidth": {
        "type": "number",
        "default": 15,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 20,
        "description": "Inner height"
      },
      "sectionSize": {
        "type": "number",
        "default": 3.5,
        "description": "Wire diameter / square size"
      },
      "gapWidth": {
        "type": "number",
        "default": 0.2,
        "description": "Bottom-center parallel gap width"
      }
    }
  },
  "schemaHash": "sha256:7f860ae884b91285bbd5df3211901159c35bf9a8fc7b694351f9a70f49f450de",
  "defaults": {
    "innerWidth": 15,
    "innerHeight": 20,
    "sectionSize": 3.5,
    "gapWidth": 0.2
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "gapWidth",
      "label": "底中实际平切缝宽",
      "labelEn": "Bottom-center parallel gap width",
      "type": "number",
      "min": 0.01,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ellipseOpenWire"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ellipseOpenWire",
      "innerWidth": 15,
      "innerHeight": 20,
      "sectionSize": 3.5,
      "gapWidth": 0.2
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:1aeb749455d77a317f5e93020dd5a513139f1c50bc5bba519bc45c9c1921e0c7"
}
```

## 工具 template.profileLoop · 圆角扁方截面直段长圈

```json
{
  "id": "template.profileLoop",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "圆角扁方截面直段长圈",
  "category": "template",
  "synonyms": [
    "profileLoop",
    "圆角扁方截面直段长圈",
    "Capsule loop with rounded rectangular section"
  ],
  "description": "两端半圆、上下直段的闭合长圈；正面料宽、侧面厚度和截面 R 独立。R 可等于截面短边一半，形成两圆端加直段的截面。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "圆角扁方截面直段长圈",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Closed capsule loop with semicircular ends and straight runs. Front width, side depth and section radius are independent; a half-short-side radius forms an exact stadium section.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "profileLoop"
      },
      "innerWidth": {
        "type": "number",
        "default": 35.2,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 14.6,
        "description": "Inner height"
      },
      "sectionWidth": {
        "type": "number",
        "default": 5.5,
        "description": "Front section width"
      },
      "sectionDepth": {
        "type": "number",
        "default": 6,
        "description": "Side section depth"
      },
      "sectionRadius": {
        "type": "number",
        "default": 2.5,
        "description": "Square section corner R"
      }
    }
  },
  "schemaHash": "sha256:7255952b663b7d7bf9175c42aa9080a66c9cd9c57b2776e4d74ee8377c304ef7",
  "defaults": {
    "innerWidth": 35.2,
    "innerHeight": 14.6,
    "sectionWidth": 5.5,
    "sectionDepth": 6,
    "sectionRadius": 2.5
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionWidth",
      "label": "正面料宽",
      "labelEn": "Front section width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionDepth",
      "label": "侧面厚度",
      "labelEn": "Side section depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "profileLoop"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "profileLoop",
      "innerWidth": 35.2,
      "innerHeight": 14.6,
      "sectionWidth": 5.5,
      "sectionDepth": 6,
      "sectionRadius": 2.5
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:1437f56f13732b665f7684613742b12140a27693771e922680067edfa5021317"
}
```

## 工具 template.capsuleWire · 圆线直段长圈

```json
{
  "id": "template.capsuleWire",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "圆线直段长圈",
  "category": "template",
  "synonyms": [
    "capsuleWire",
    "圆线直段长圈",
    "Round-wire capsule loop"
  ],
  "description": "闭合圆线长圈：两端精确半圆、上下直段，内宽高与圆线直径独立输入。未标缝宽时不猜接缝。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "圆线直段长圈",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Closed round-wire capsule loop with exact semicircular ends and straight runs. Set inner width, inner height and wire diameter; an unmarked seam is not guessed.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "capsuleWire"
      },
      "innerWidth": {
        "type": "number",
        "default": 34.9,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 13.9,
        "description": "Inner height"
      },
      "sectionSize": {
        "type": "number",
        "default": 6.1,
        "description": "Wire diameter / square size"
      }
    }
  },
  "schemaHash": "sha256:8bbcb0d1a8b6e25623cb6c35bb7fbae24d0d1d1f2c4c859dccb6246f0be4412b",
  "defaults": {
    "innerWidth": 34.9,
    "innerHeight": 13.9,
    "sectionSize": 6.1
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "capsuleWire"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "capsuleWire",
      "innerWidth": 34.9,
      "innerHeight": 13.9,
      "sectionSize": 6.1
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:1a419c2fce0711c4b13f82f3f4ab9f47fbb51c2a7a55ba2104aa71c3a03b0514"
}
```

## 工具 template.dBuckle · D 扣

```json
{
  "id": "template.dBuckle",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "D 扣",
  "category": "template",
  "synonyms": [
    "dBuckle",
    "D 扣",
    "D buckle"
  ],
  "description": "半圆冠、两直腿、底部圆弯；内高量到下横杠上沿。圆线、圆角方线或倒角方线截面。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "D 扣",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "半圆冠、两直腿、底部圆弯；内高量到下横杠上沿。圆线、圆角方线或倒角方线截面。",
    "properties": {
      "kind": {
        "type": "string",
        "const": "dBuckle"
      },
      "section": {
        "type": "string",
        "default": "round",
        "description": "Section",
        "enum": [
          "round",
          "square",
          "chamferedSquare"
        ]
      },
      "sectionSize": {
        "type": "number",
        "default": 3,
        "description": "Wire diameter / square size"
      },
      "sectionRadius": {
        "type": "number",
        "default": 0.3,
        "description": "Square section corner R"
      },
      "sectionChamfer": {
        "type": "number",
        "default": 0.6,
        "description": "Square section chamfer C"
      },
      "gapWidth": {
        "type": "number",
        "default": 0,
        "description": "Bottom gap (0 = closed)"
      },
      "innerWidth": {
        "type": "number",
        "default": 24,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 19,
        "description": "Inner height"
      },
      "innerRadius": {
        "type": "number",
        "default": 2,
        "description": "Bottom inner radius"
      }
    }
  },
  "schemaHash": "sha256:53b4704be8d47e37f268903ca6ccc64fd736ea6653f862b81bdb571725052558",
  "defaults": {
    "section": "round",
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerWidth": 24,
    "innerHeight": 19,
    "innerRadius": 2
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "section",
      "label": "截面",
      "labelEn": "Section",
      "type": "select",
      "options": [
        {
          "value": "round",
          "label": "圆线",
          "labelEn": "Round wire"
        },
        {
          "value": "square",
          "label": "圆角方线",
          "labelEn": "Rounded square"
        },
        {
          "value": "chamferedSquare",
          "label": "倒角方线",
          "labelEn": "Chamfered square"
        }
      ]
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "sectionChamfer",
      "label": "方线截面倒角 C（仅倒角方线）",
      "labelEn": "Square section chamfer C",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "底内 R",
      "labelEn": "Bottom inner radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "gapWidth",
      "label": "底部实际缝宽（0 闭合）",
      "labelEn": "Bottom gap (0 = closed)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "dBuckle"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "dBuckle",
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 24,
      "innerHeight": 19,
      "innerRadius": 2
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:5e8f422622482aa6545893422c328d63a8d27b778abfa4c9eeab1d8fc430b11d"
}
```

## 工具 template.dBarBuckle · 独立圆横杆 D 扣

```json
{
  "id": "template.dBarBuckle",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "独立圆横杆 D 扣",
  "category": "template",
  "synonyms": [
    "dBarBuckle",
    "独立圆横杆 D 扣",
    "D buckle with round bar"
  ],
  "description": "圆角方线 U 主体与固定圆杆融合；杆底与脚底齐平。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "独立圆横杆 D 扣",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "圆角方线 U 主体与固定圆杆融合；杆底与脚底齐平。",
    "properties": {
      "kind": {
        "type": "string",
        "const": "dBarBuckle"
      },
      "section": {
        "type": "string",
        "default": "square",
        "description": "section"
      },
      "sectionSize": {
        "type": "number",
        "default": 6,
        "description": "Wire diameter / square size"
      },
      "sectionRadius": {
        "type": "number",
        "default": 0.6,
        "description": "Square section corner R"
      },
      "sectionChamfer": {
        "type": "number",
        "default": 0.6,
        "description": "sectionChamfer"
      },
      "gapWidth": {
        "type": "number",
        "default": 0,
        "description": "gapWidth"
      },
      "innerWidth": {
        "type": "number",
        "default": 32,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 24,
        "description": "Inner height"
      },
      "barDiameter": {
        "type": "number",
        "default": 4.5,
        "description": "Bar diameter"
      }
    }
  },
  "schemaHash": "sha256:d34dc010471b3b4da89308376612b4ca0ff1c9396bd3e86f1d8be17b6cdc0b19",
  "defaults": {
    "section": "square",
    "sectionSize": 6,
    "sectionRadius": 0.6,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerWidth": 32,
    "innerHeight": 24,
    "barDiameter": 4.5
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "barDiameter",
      "label": "固定横杆直径",
      "labelEn": "Bar diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "dBarBuckle"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "dBarBuckle",
      "section": "square",
      "sectionSize": 6,
      "sectionRadius": 0.6,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 32,
      "innerHeight": 24,
      "barDiameter": 4.5
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:2b06f909051140a76c658893bb5ecb2e6d5d84c5a37e8ed8f24f9b57806825bf"
}
```

## 工具 template.rectBuckle · 方扣

```json
{
  "id": "template.rectBuckle",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "方扣",
  "category": "template",
  "synonyms": [
    "rectBuckle",
    "方扣",
    "Rectangular buckle"
  ],
  "description": "恒截面圆角矩形框；闭合圆线可用内短边≥2.5 倍线径的紧凑框，其余至少 4 倍截面尺寸。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "方扣",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "Constant-section rounded rectangular frame. A closed round-wire frame supports an inner short side at least 2.5 times the wire diameter; other variants require four times the section size.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "rectBuckle"
      },
      "section": {
        "type": "string",
        "default": "round",
        "description": "Section",
        "enum": [
          "round",
          "square",
          "chamferedSquare"
        ]
      },
      "sectionSize": {
        "type": "number",
        "default": 3,
        "description": "Wire diameter / square size"
      },
      "sectionRadius": {
        "type": "number",
        "default": 0.3,
        "description": "Square section corner R"
      },
      "sectionChamfer": {
        "type": "number",
        "default": 0.6,
        "description": "Square section chamfer C"
      },
      "gapWidth": {
        "type": "number",
        "default": 0,
        "description": "Bottom gap (0 = closed)"
      },
      "innerWidth": {
        "type": "number",
        "default": 28,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 20,
        "description": "Inner height"
      },
      "innerRadius": {
        "type": "number",
        "default": 3,
        "description": "Frame inner radius"
      }
    }
  },
  "schemaHash": "sha256:1ada5c25825ae2ab47af04edd42a021cbf04544c138a70f67e831ad27d2071f3",
  "defaults": {
    "section": "round",
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerWidth": 28,
    "innerHeight": 20,
    "innerRadius": 3
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "section",
      "label": "截面",
      "labelEn": "Section",
      "type": "select",
      "options": [
        {
          "value": "round",
          "label": "圆线",
          "labelEn": "Round wire"
        },
        {
          "value": "square",
          "label": "圆角方线",
          "labelEn": "Rounded square"
        },
        {
          "value": "chamferedSquare",
          "label": "倒角方线",
          "labelEn": "Chamfered square"
        }
      ]
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "sectionChamfer",
      "label": "方线截面倒角 C（仅倒角方线）",
      "labelEn": "Square section chamfer C",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "框内 R",
      "labelEn": "Frame inner radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "gapWidth",
      "label": "底部实际缝宽（0 闭合）",
      "labelEn": "Bottom gap (0 = closed)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "rectBuckle"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "rectBuckle",
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 28,
      "innerHeight": 20,
      "innerRadius": 3
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:a332f1683c8d08f2b2c731ad8dfde57dbfcc2595c1a76f08007c7d002f0d2d9b"
}
```

## 工具 template.sliderBuckle · 日字扣

```json
{
  "id": "template.sliderBuckle",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "日字扣",
  "category": "template",
  "synonyms": [
    "sliderBuckle",
    "日字扣",
    "Slider buckle"
  ],
  "description": "外框整体内高；固定圆杆偏移上正下负，不支持开缝。闭合圆线框可用内短边≥2.5倍线径的紧凑双窗，且每侧孔高至少为线径。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "日字扣",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "The inner height spans the full frame; the fused round bar has an editable vertical offset and no opening. Compact round-wire frames require an inner short side at least 2.5 wire diameters and each window at least one wire diameter high.",
    "properties": {
      "kind": {
        "type": "string",
        "const": "sliderBuckle"
      },
      "section": {
        "type": "string",
        "default": "round",
        "description": "Section",
        "enum": [
          "round",
          "square",
          "chamferedSquare"
        ]
      },
      "sectionSize": {
        "type": "number",
        "default": 3,
        "description": "Wire diameter / square size"
      },
      "sectionRadius": {
        "type": "number",
        "default": 0.3,
        "description": "Square section corner R"
      },
      "sectionChamfer": {
        "type": "number",
        "default": 0.6,
        "description": "Square section chamfer C"
      },
      "gapWidth": {
        "type": "number",
        "default": 0,
        "description": "gapWidth"
      },
      "innerWidth": {
        "type": "number",
        "default": 30,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 24,
        "description": "Inner height"
      },
      "innerRadius": {
        "type": "number",
        "default": 3,
        "description": "Frame inner radius"
      },
      "barDiameter": {
        "type": "number",
        "default": 2.5,
        "description": "Bar diameter"
      },
      "barOffset": {
        "type": "number",
        "default": 0,
        "description": "Bar offset (+up)"
      }
    }
  },
  "schemaHash": "sha256:85986d5c55c3dfb1949b5c4c808ef77d07ae29fa7e13d173591c517f990566d3",
  "defaults": {
    "section": "round",
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerWidth": 30,
    "innerHeight": 24,
    "innerRadius": 3,
    "barDiameter": 2.5,
    "barOffset": 0
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "section",
      "label": "截面",
      "labelEn": "Section",
      "type": "select",
      "options": [
        {
          "value": "round",
          "label": "圆线",
          "labelEn": "Round wire"
        },
        {
          "value": "square",
          "label": "圆角方线",
          "labelEn": "Rounded square"
        },
        {
          "value": "chamferedSquare",
          "label": "倒角方线",
          "labelEn": "Chamfered square"
        }
      ]
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "sectionChamfer",
      "label": "方线截面倒角 C（仅倒角方线）",
      "labelEn": "Square section chamfer C",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "框内 R",
      "labelEn": "Frame inner radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "barDiameter",
      "label": "横杆直径",
      "labelEn": "Bar diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "barOffset",
      "label": "横杆偏移（上正下负）",
      "labelEn": "Bar offset (+up)",
      "type": "number",
      "min": -100,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "sliderBuckle"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "sliderBuckle",
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 30,
      "innerHeight": 24,
      "innerRadius": 3,
      "barDiameter": 2.5,
      "barOffset": 0
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:715d669164a82206f99c83b2fadb5f6c7e1480844cc762eec2571282a3860eb5"
}
```

## 工具 template.ovalBuckle · 四圆弧旦扣

```json
{
  "id": "template.ovalBuckle",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "四圆弧旦扣",
  "category": "template",
  "synonyms": [
    "ovalBuckle",
    "四圆弧旦扣",
    "Four-arc oval buckle"
  ],
  "description": "四段相切圆弧，不是椭圆或跑道圈；缝在右端正中。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "四圆弧旦扣",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "四段相切圆弧，不是椭圆或跑道圈；缝在右端正中。",
    "properties": {
      "kind": {
        "type": "string",
        "const": "ovalBuckle"
      },
      "section": {
        "type": "string",
        "default": "round",
        "description": "Section",
        "enum": [
          "round",
          "square",
          "chamferedSquare"
        ]
      },
      "sectionSize": {
        "type": "number",
        "default": 3,
        "description": "Wire diameter / square size"
      },
      "sectionRadius": {
        "type": "number",
        "default": 0.3,
        "description": "Square section corner R"
      },
      "sectionChamfer": {
        "type": "number",
        "default": 0.6,
        "description": "Square section chamfer C"
      },
      "gapWidth": {
        "type": "number",
        "default": 0,
        "description": "Right gap (0 = closed)"
      },
      "innerWidth": {
        "type": "number",
        "default": 28,
        "description": "Inner width"
      },
      "innerHeight": {
        "type": "number",
        "default": 16,
        "description": "Inner height"
      },
      "innerRadius": {
        "type": "number",
        "default": 5.6,
        "description": "End inner radius"
      }
    }
  },
  "schemaHash": "sha256:fdd884fe8375003f5f2d624f6f6f0c3b22494eb883bc40256f8c5e1195c861e2",
  "defaults": {
    "section": "round",
    "sectionSize": 3,
    "sectionRadius": 0.3,
    "sectionChamfer": 0.6,
    "gapWidth": 0,
    "innerWidth": 28,
    "innerHeight": 16,
    "innerRadius": 5.6
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "section",
      "label": "截面",
      "labelEn": "Section",
      "type": "select",
      "options": [
        {
          "value": "round",
          "label": "圆线",
          "labelEn": "Round wire"
        },
        {
          "value": "square",
          "label": "圆角方线",
          "labelEn": "Rounded square"
        },
        {
          "value": "chamferedSquare",
          "label": "倒角方线",
          "labelEn": "Chamfered square"
        }
      ]
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "sectionChamfer",
      "label": "方线截面倒角 C（仅倒角方线）",
      "labelEn": "Square section chamfer C",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "端部内 R",
      "labelEn": "End inner radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "gapWidth",
      "label": "右端实际缝宽（0 闭合）",
      "labelEn": "Right gap (0 = closed)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ovalBuckle"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "ovalBuckle",
      "section": "round",
      "sectionSize": 3,
      "sectionRadius": 0.3,
      "sectionChamfer": 0.6,
      "gapWidth": 0,
      "innerWidth": 28,
      "innerHeight": 16,
      "innerRadius": 5.6
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:53848f68a226e1aa5287062c98a5c5ec149639b66c04ae725f0473d4cef512fb"
}
```

## 工具 template.washer · 平垫圈

```json
{
  "id": "template.washer",
  "version": "legacy-1",
  "refsSchema": {
    "type": "array",
    "items": {
      "type": "string",
      "minLength": 1,
      "maxLength": 150
    },
    "uniqueItems": true,
    "minItems": 0,
    "maxItems": 0
  },
  "selectionTokenSupport": {
    "supported": false
  },
  "editRule": "Patch merges into prior params; complete merged params are validated; generic field deletion is unsupported.",
  "units": {
    "length": "mm",
    "angle": "degrees",
    "volume": "mm^3",
    "scale": "dimensionless"
  },
  "coordinateConvention": "faceId, faceIds and edgeIds are zero-based indices of the CURRENT referenced body. body.faceCount/edgeCount define the range. Use current selectedTopology (when available) to identify user-picked face/edge/point. queryGeometry or measure returns exact BRep face type and measures. Counts alone do not identify spatial meaning. Do not guess face orientation. Rebuild may renumber topology; do not reuse IDs across revisions without reinspection. Unified logo accepts one exact planar or supported curved face; faceHole and faceExtrude require planar faces. Template-specific parameters and defaults come from getTool({id:\"quickModel\"}), not arbitrary geometry code.",
  "title": "平垫圈",
  "category": "template",
  "synonyms": [
    "washer",
    "平垫圈",
    "Flat washer"
  ],
  "description": "平面环片，外径 = 内径 + 2 × 径向宽度；无额外倒角。",
  "apiCompatibility": [
    "legacy"
  ],
  "implementationStatus": "implemented",
  "availability": "requires_browser",
  "unavailableReason": null,
  "strictContract": false,
  "v2Executable": false,
  "contractStatus": "advisory",
  "outputSchema": {
    "type": "object",
    "description": "Operation runs through the shared command result envelope; see api.execute-v2. Shape geometry and history remain authoritative in the browser.",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "committed",
          "no_change",
          "failed",
          "unknown"
        ]
      }
    }
  },
  "preconditions": [
    "Use explicit empty refs for independent creation."
  ],
  "postconditions": [
    "A successful modeling operation commits one undoable history transaction; invalid geometry must not commit."
  ],
  "resultShapeTypes": [
    "solid",
    "compound (operation-dependent)"
  ],
  "consumesInputs": false,
  "preservesInputs": false,
  "createsResults": true,
  "sideEffects": [
    "Updates active document history and derived view on commit."
  ],
  "permissions": [
    "Authorized local modeling session; no external upload."
  ],
  "undoBehavior": "One successful feature operation is one undo step. Legacy refresh is separately documented.",
  "idempotency": "Legacy calls do not guarantee idempotency.",
  "limits": [
    "Schema advisory only; existing operation/kernel restrictions apply."
  ],
  "knownUnsupportedCases": [
    "Template-specific geometric relations are enforced by the existing kernel; the advisory schema is not a guarantee of a successful solid."
  ],
  "invalidExamples": [
    {
      "params": {
        "kind": "tube",
        "__unknownField": true
      },
      "errorCode": "NOT_A_STRICT_V2_OPERATION",
      "explanation": "v2 rejects the operation until migration; this is not a claim of legacy runtime enforcement."
    }
  ],
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED",
    "SCHEMA_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "GEOMETRY_INVALID"
  ],
  "recoveryActions": [
    "CORRECT_PARAMETERS",
    "READ_STATE_AND_REPLAN",
    "READ_TOOL_CONTRACT",
    "NONE"
  ],
  "relatedTools": [
    "quickModel",
    "measure",
    "feature.edit"
  ],
  "recipes": [],
  "testIds": [],
  "verification": {
    "contract": "not_migrated",
    "kernel": "See test run report; card generation is not proof of kernel execution."
  },
  "operationId": "quickModel",
  "label": "平垫圈",
  "inputSchema": {
    "type": "object",
    "required": [
      "kind"
    ],
    "additionalProperties": false,
    "description": "平面环片，外径 = 内径 + 2 × 径向宽度；无额外倒角。",
    "properties": {
      "kind": {
        "type": "string",
        "const": "washer"
      },
      "innerDiameter": {
        "type": "number",
        "default": 10,
        "description": "Inner diameter"
      },
      "sectionSize": {
        "type": "number",
        "default": 3,
        "description": "Radial width"
      },
      "innerHeight": {
        "type": "number",
        "default": 1.5,
        "description": "Thickness"
      }
    }
  },
  "schemaHash": "sha256:7dc1a95b72b9fe017bb067866b58395a4f663e61b02ca1b6c4eb79b43d766cb3",
  "defaults": {
    "innerDiameter": 10,
    "sectionSize": 3,
    "innerHeight": 1.5
  },
  "fields": [
    {
      "key": "innerDiameter",
      "label": "内径",
      "labelEn": "Inner diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionSize",
      "label": "径向宽度",
      "labelEn": "Radial width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "厚度",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ],
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": true
  },
  "runtimeAvailability": "requires_ready_page",
  "usage": "Discovery card only. Use run method:add with op:quickModel and params.kind from minimalExample. Do not pass template IDs or this subset schemaHash to execute. run reads the parent operation version/hash.",
  "minimalExample": {
    "op": "quickModel",
    "params": {
      "kind": "washer"
    },
    "refs": []
  },
  "normalExample": {
    "op": "quickModel",
    "params": {
      "kind": "washer",
      "innerDiameter": 10,
      "sectionSize": 3,
      "innerHeight": 1.5
    },
    "refs": []
  },
  "docs": "api.workflow",
  "docsHash": "sha256:ef6acd98ff8313027ce6e32997e99dde2c8a74b0fff5b594b0ad32db815ed6f1"
}
```

## 工具 copySelection · copySelection

```json
{
  "id": "copySelection",
  "title": "copySelection",
  "category": "page-method",
  "version": "1.9.0",
  "description": "copySelection({context,bodyIds}); 1–200个当前实体。",
  "synonyms": [
    "copySelection",
    "复制",
    "实体",
    "剪贴板"
  ],
  "inputContract": "copySelection({context,bodyIds}); 1–200个当前实体。",
  "outputContract": "status=read；仅页面内存，跨工程失效；getState().view.clipboard 读状态。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "docsHash": "sha256:ec82827475b984527c73ff8ee25dd799e6b9d57564b4c9f46b149bef931caa83"
}
```

## 工具 pasteSelection · pasteSelection

```json
{
  "id": "pasteSelection",
  "title": "pasteSelection",
  "category": "page-method",
  "version": "1.9.0",
  "description": "pasteSelection({context,idempotencyKey}); 先 copySelection。",
  "synonyms": [
    "pasteSelection",
    "黏贴",
    "粘贴",
    "参考锚点"
  ],
  "inputContract": "pasteSelection({context,idempotencyKey}); 先 copySelection。",
  "outputContract": "status=committed、createdBodyIds、当前 context；整体底面中心对齐锚点、保留相对位置；同一运行实例最多128回执，重复同请求不会重复黏贴。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "docsHash": "sha256:582553d283995b47363aa3e0d7f3db1ff9beaa8a87bd4be8ed47ae689147bc37"
}
```

## 工具 createRequestContext · createRequestContext

```json
{
  "id": "createRequestContext",
  "title": "createRequestContext",
  "category": "page-method",
  "version": "1.9.0",
  "description": "createRequestContext(context?); omit to read the current context.",
  "synonyms": [
    "createRequestContext",
    "上下文",
    "版本",
    "转换"
  ],
  "inputContract": "createRequestContext(context?); omit to read the current context.",
  "outputContract": "sessionId/documentId/documentInstanceId/expectedRevision；不修复陈旧状态。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "REVISION_CONFLICT"
  ],
  "docs": "api.reliability",
  "docsHash": "sha256:316a2d941c4b97bcec38a5fd5629140452dfc8641faaa49f29a17aed4bf63a26"
}
```

## 工具 getUILayout · getUILayout

```json
{
  "id": "getUILayout",
  "title": "getUILayout",
  "category": "page-method",
  "version": "1.9.0",
  "description": "getUILayout()",
  "synonyms": [
    "getUILayout",
    "界面",
    "布局",
    "配置",
    "选项卡"
  ],
  "inputContract": "getUILayout()",
  "outputContract": "当前版本化 tabs/groups/controls/header/panels 配置。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [],
  "docs": "api.workspace",
  "docsHash": "sha256:755a89094070d4d98353cd66522f51c5766eb91a02232483f7220eb323ef19e1"
}
```

## 工具 setRenderQuality · setRenderQuality

```json
{
  "id": "setRenderQuality",
  "title": "setRenderQuality",
  "category": "page-method",
  "version": "1.9.0",
  "description": "setRenderQuality({context,quality:\"draft\"|\"standard\"|\"fine\"|\"ultra\"})",
  "synonyms": [
    "setRenderQuality",
    "显示",
    "精度",
    "网格",
    "曲面",
    "公差"
  ],
  "inputContract": "setRenderQuality({context,quality:\"draft\"|\"standard\"|\"fine\"|\"ultra\"})",
  "outputContract": "status=applied、context、renderQuality、display；只重新网格化。详见 api.workspace。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "CAPABILITY_UNAVAILABLE",
    "DISPLAY_FAILED"
  ],
  "docs": "api.workspace",
  "docsHash": "sha256:057a17c94a13bbbbff4f4438c23f8454868d5b97f7b7ba180c619f73fe81f163"
}
```

## 工具 invoke · invoke

```json
{
  "id": "invoke",
  "title": "invoke",
  "category": "page-method",
  "version": "1.9.0",
  "description": "invoke({method,args}); public method name or files.*.",
  "synonyms": [
    "invoke",
    "统一",
    "错误",
    "调用"
  ],
  "inputContract": "invoke({method,args}); public method name or files.*.",
  "outputContract": "返回原方法结果；抛错转换为结构化失败。详见 api.reliability。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID"
  ],
  "docs": "api.reliability",
  "docsHash": "sha256:ec40f35f3fc7ec6d604fd69b304ffc19cdc1875b9b12272e2a8a28d8ac641b58"
}
```

## 工具 submit · submit

```json
{
  "id": "submit",
  "title": "submit",
  "category": "page-method",
  "version": "1.9.0",
  "description": "submit({jobId,method,args}); method=run/execute/queryGeometry/measure/measureRelation/inspectProfile/prepareProfileEdit/projectProfile/inspectFit/inspectThickness/inspectDraft/setView/setRenderQuality/files.save/files.export/files.import.",
  "synonyms": [
    "submit",
    "异步",
    "任务",
    "超时",
    "后台",
    "回执"
  ],
  "inputContract": "submit({jobId,method,args}); method=run/execute/queryGeometry/measure/measureRelation/inspectProfile/prepareProfileEdit/projectProfile/inspectFit/inspectThickness/inspectDraft/setView/setRenderQuality/files.save/files.export/files.import.",
  "outputContract": "立即返回 jobId/status；参数中保留原 context 和幂等键；详见 api.reliability。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "RESOURCE_LIMIT",
    "IDEMPOTENCY_KEY_REUSED"
  ],
  "docs": "api.reliability",
  "docsHash": "sha256:fdc47f7244205ab56afb9a9422d1b6e2d08276e3cf4be37dd1847bb70672dba4"
}
```

## 工具 getJob · getJob

```json
{
  "id": "getJob",
  "title": "getJob",
  "category": "page-method",
  "version": "1.9.0",
  "description": "getJob({jobId})",
  "synonyms": [
    "getJob",
    "任务",
    "状态",
    "轮询",
    "结果"
  ],
  "inputContract": "getJob({jobId})",
  "outputContract": "任务 status/progress/phase/elapsedMs/result；result 保留原提交回执。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "JOB_NOT_FOUND"
  ],
  "docs": "api.reliability",
  "docsHash": "sha256:bc70e63c5fa09c6c9476cd882d1c88c870d4f4e1163d015dcd9459e7c1aeae78"
}
```

## 工具 cancelJob · cancelJob

```json
{
  "id": "cancelJob",
  "title": "cancelJob",
  "category": "page-method",
  "version": "1.9.0",
  "description": "cancelJob({jobId})",
  "synonyms": [
    "cancelJob",
    "任务",
    "取消"
  ],
  "inputContract": "cancelJob({jobId})",
  "outputContract": "cancelled 布尔；运行中拒绝取消且继续可查原回执。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "JOB_NOT_FOUND"
  ],
  "docs": "api.reliability",
  "docsHash": "sha256:a2b85cb3c8fa5cb2d238188c0fdb8c85451f0781a6d905e7d80e934a8fbeba36"
}
```

## 工具 connect · connect

```json
{
  "id": "connect",
  "title": "connect",
  "category": "page-method",
  "version": "1.9.0",
  "description": "connect({queries?:string[],toolIds?:string[],limit?:1..10,includeContracts?:boolean,knownCatalogHash?,knownDocsHash?,knownHashes?}={}); up to 4 queries or 20 unique known tool IDs. toolIds includes contracts automatically. Read-only; works while the kernel starts.",
  "synonyms": [
    "connect",
    "连接",
    "发现",
    "工具",
    "缓存"
  ],
  "inputContract": "connect({queries?:string[],toolIds?:string[],limit?:1..10,includeContracts?:boolean,knownCatalogHash?,knownDocsHash?,knownHashes?}={}); up to 4 queries or 20 unique known tool IDs. toolIds includes contracts automatically. Read-only; works while the kernel starts.",
  "outputContract": "当前 context/requestContext、canExecute/blockers/nextAction、版本与迁移说明、实体引用和工具契约。ready 仅为内核状态；canExecute 才计入 busy/preview。详见 api.workflow。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID"
  ],
  "docs": "api.discovery",
  "docsHash": "sha256:a1b535a81670b84d77d2c6227bc33ae70bfc16afc2080acdbe0c942faed9cec3"
}
```

## 工具 info · info

```json
{
  "id": "info",
  "title": "info",
  "category": "page-method",
  "version": "1.9.0",
  "description": "info() 无参数。",
  "synonyms": [
    "info",
    "页面信息",
    "构建",
    "就绪"
  ],
  "inputContract": "info() 无参数。",
  "outputContract": "构建/API 版本、in-page transport、当前 context、URL、display、就绪状态和能力。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [],
  "docsHash": "sha256:218888a747bd5b8a23c77ae411113bba3e830d871a4efa822c293f132dfbb977"
}
```

## 工具 getState · getState

```json
{
  "id": "getState",
  "title": "getState",
  "category": "page-method",
  "version": "1.9.0",
  "description": "getState({sessionId?,include?}={}); include 可选 summary/features/bodies/selection/capabilities/references。",
  "synonyms": [
    "getState",
    "工程状态",
    "特征",
    "实体",
    "参数",
    "基准"
  ],
  "inputContract": "getState({sessionId?,include?}={}); include 可选 summary/features/bodies/selection/capabilities/references。",
  "outputContract": "当前 context、referenceSystem、parameters、parameterValues、view 和 display；不会默认返回导入源字节。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "INSTANCE_MISMATCH"
  ],
  "docsHash": "sha256:c3e0bf0d13dae59e40e54545945d15efa0fab1ca2a311c69c28999d937b6bc3c"
}
```

## 工具 searchTools · searchTools

```json
{
  "id": "searchTools",
  "title": "searchTools",
  "category": "page-method",
  "version": "1.9.0",
  "description": "searchTools({query,category?,limit?,cursor?}); query 字符串必需，limit 1..50；中英文按相关度排序，空查询分页列出目录。",
  "synonyms": [
    "searchTools",
    "搜索",
    "工具",
    "中文",
    "目录"
  ],
  "inputContract": "searchTools({query,category?,limit?,cursor?}); query 字符串必需，limit 1..50；中英文按相关度排序，空查询分页列出目录。",
  "outputContract": "工具摘要、label/docsHash、score/matchedTerms、total、nextCursor、catalogHash；结果是候选能力，不是已验证的执行计划。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID"
  ],
  "docs": "api.discovery",
  "docsHash": "sha256:56bf842637d929ea5ebadb376766861b6eb2f0593161e470a6c10cd403445792"
}
```

## 工具 getTools · getTools

```json
{
  "id": "getTools",
  "title": "getTools",
  "category": "page-method",
  "version": "1.9.0",
  "description": "getTools({ids:string[],knownHashes?:{[id]:docsHash},expectedCatalogHash?}); 1..20 unique IDs. Only pass knownHashes for complete cards actually cached by the caller.",
  "synonyms": [
    "getTools",
    "批量",
    "工具卡",
    "缓存",
    "契约"
  ],
  "inputContract": "getTools({ids:string[],knownHashes?:{[id]:docsHash},expectedCatalogHash?}); 1..20 unique IDs. Only pass knownHashes for complete cards actually cached by the caller.",
  "outputContract": "逐项 read/not_modified/error；read.card 是完整契约，单个未知 ID 不丢失其他结果。目录漂移返回 CATALOG_CHANGED。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "CATALOG_CHANGED"
  ],
  "docs": "api.discovery",
  "docsHash": "sha256:100188973836d9b50b617ec0269266137244adeee83e21d2fd9d24cf43990926"
}
```

## 工具 getTool · getTool

```json
{
  "id": "getTool",
  "title": "getTool",
  "category": "page-method",
  "version": "1.9.0",
  "description": "getTool({id,version?}); id 为当前登记的操作、页面方法或 files.*。",
  "synonyms": [
    "getTool",
    "工具卡",
    "参数",
    "schema",
    "契约"
  ],
  "inputContract": "getTool({id,version?}); id 为当前登记的操作、页面方法或 files.*。",
  "outputContract": "完整工具卡、版本和 docsHash。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "UNKNOWN_OPERATION",
    "OPERATION_VERSION_UNSUPPORTED"
  ],
  "docsHash": "sha256:fb22e35e102a1897a949107a2fff6791ae9e6946e7168a75cb292a5e124ad187"
}
```

## 工具 readDocs · readDocs

```json
{
  "id": "readDocs",
  "title": "readDocs",
  "category": "page-method",
  "version": "1.9.0",
  "description": "readDocs({docId,version?,cursor?,limitChars?,knownHash?}); 只接受登记的文档 ID。knownHash 仅用于已完整缓存的文档。",
  "synonyms": [
    "readDocs",
    "读取",
    "文档",
    "配方",
    "白名单"
  ],
  "inputContract": "readDocs({docId,version?,cursor?,limitChars?,knownHash?}); 只接受登记的文档 ID。knownHash 仅用于已完整缓存的文档。",
  "outputContract": "限定长度的说明文本、版本、哈希和分页游标；匹配 knownHash 时 status=not_modified，不重复传文本。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "May throw a coded contract error; use api.invoke for a structured error envelope.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "OPERATION_VERSION_UNSUPPORTED"
  ],
  "docsHash": "sha256:821444372b2170e3e0c693efcf6e56fba717c800c700824ef053ec9c9b229d21"
}
```

## 工具 queryGeometry · queryGeometry

```json
{
  "id": "queryGeometry",
  "title": "queryGeometry",
  "category": "page-method",
  "version": "1.9.0",
  "description": "queryGeometry({context,bodyId,kind:\"face\"|\"edge\",filter,requireUnique?,limit?,cursor?})。",
  "synonyms": [
    "queryGeometry",
    "几何查询",
    "面",
    "边",
    "选择令牌"
  ],
  "inputContract": "queryGeometry({context,bodyId,kind:\"face\"|\"edge\",filter,requireUnique?,limit?,cursor?})。",
  "outputContract": "精确 B-Rep 候选项、歧义信息、快照绑定的 selectionToken 与当前 context。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "CommandService structured result; inspect status and commitState.",
  "errorCodes": [
    "INSTANCE_MISMATCH",
    "REVISION_CONFLICT",
    "STALE_REFERENCE",
    "NO_MATCH",
    "AMBIGUOUS_SELECTION"
  ],
  "docsHash": "sha256:9dcd9af399c3f911179f534d420d2cde92333f76c4299a1ebb8d801b82f538fd"
}
```

## 工具 queryReferences · queryReferences

```json
{
  "id": "queryReferences",
  "title": "queryReferences",
  "category": "page-method",
  "version": "1.9.0",
  "description": "queryReferences({context,bodyIds:[],kind:\"point\"|\"axis\"|\"frame\",filter?:{types?:[\"cad-vertex\",\"edge-midpoint\",\"circle-center\",\"edge-nearest\",\"trimmed-face-point\",...],near?:{point:[x,y,z],radiusMm}},limit?,offset?,requireUnique?})。",
  "synonyms": [
    "queryReferences",
    "参考点",
    "工作基准",
    "几何吸附"
  ],
  "inputContract": "queryReferences({context,bodyIds:[],kind:\"point\"|\"axis\"|\"frame\",filter?:{types?:[\"cad-vertex\",\"edge-midpoint\",\"circle-center\",\"edge-nearest\",\"trimmed-face-point\",...],near?:{point:[x,y,z],radiusMm}},limit?,offset?,requireUnique?})。",
  "outputContract": "当前工程的 B-Rep 或明确派生候选、referenceId、来源指纹、歧义及分页；最近点必须传 near，不写模型。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "REVISION_CONFLICT",
    "STALE_REFERENCE",
    "AMBIGUOUS_REFERENCE"
  ],
  "docsHash": "sha256:25c8f2045d3f4fbb9292781a8045d47b9ed930b4e8d46b71f468c2bd23c9d34e"
}
```

## 工具 resolvePlacement · resolvePlacement

```json
{
  "id": "resolvePlacement",
  "title": "resolvePlacement",
  "category": "page-method",
  "version": "1.9.0",
  "description": "resolvePlacement({context,op,params,refs,placement})；当前支持 C/T 以及已登记的轴和平面操作。",
  "synonyms": [
    "resolvePlacement",
    "定位解析",
    "工作基准",
    "快照"
  ],
  "inputContract": "resolvePlacement({context,op,params,refs,placement})；当前支持 C/T 以及已登记的轴和平面操作。",
  "outputContract": "持久化 frameSnapshot、来源点、世界位置，placementValidated=true、geometryValidated=false；不写模型。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "REVISION_CONFLICT",
    "FRAME_INVALID",
    "PLACEMENT_NOT_APPLICABLE"
  ],
  "docsHash": "sha256:899f06f2ddcef6ae867ccbb7a373218d4263d73376b61769fc60d5e3b4077e0d"
}
```

## 工具 execute · execute

```json
{
  "id": "execute",
  "title": "execute",
  "category": "page-method",
  "version": "1.9.0",
  "description": "execute({context,idempotencyKey,action,args}); action 来自当前命令合同。",
  "synonyms": [
    "execute",
    "建模",
    "编辑",
    "撤销",
    "参数",
    "命令"
  ],
  "inputContract": "execute({context,idempotencyKey,action,args}); action 来自当前命令合同。",
  "outputContract": "CommandService 的 committed/no_change/failed/unknown、revision 和实际创建 ID。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "CommandService structured result; inspect status and commitState.",
  "errorCodes": [
    "INSTANCE_MISMATCH",
    "REVISION_CONFLICT",
    "PARAM_SCHEMA_INVALID",
    "GEOMETRY_INVALID"
  ],
  "docsHash": "sha256:01548c717a93506848a14b0ec6eee2f8c5ddfd2265060c4aa3cb4642d6622471"
}
```

## 工具 measure · measure

```json
{
  "id": "measure",
  "title": "measure",
  "category": "page-method",
  "version": "1.9.0",
  "description": "measure({context,bodyId,kind?:\"body\"|\"face\"|\"edge\",topologyId?}) 或 measure({context,points:[[x,y,z],[x,y,z]]}); 面/边需非负整数 topologyId。",
  "synonyms": [
    "measure",
    "测量",
    "实测",
    "体积",
    "包围尺寸",
    "半径"
  ],
  "inputContract": "measure({context,bodyId,kind?:\"body\"|\"face\"|\"edge\",topologyId?}) 或 measure({context,points:[[x,y,z],[x,y,z]]}); 面/边需非负整数 topologyId。",
  "outputContract": "status=read、source=exact-brep、单位、当前 context 和内核实测结果。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "STALE_REFERENCE",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docsHash": "sha256:1ca0af0ae5ade92b77606e6b9f1226f858ea2a5efc77745bef121ecff6781616"
}
```

## 工具 measureRelation · measureRelation

```json
{
  "id": "measureRelation",
  "title": "measureRelation",
  "category": "page-method",
  "version": "1.9.0",
  "description": "measureRelation({context,mode:\"shortest\"|\"centerDistance\"|\"axisAlignment\"|\"pointFace\"|\"parallelFaces\",first?,second?,face?,pointWorld?})；引用形式 {bodyId,kind:\"body\"|\"edge\"|\"face\",topologyId?}。",
  "synonyms": [
    "measureRelation",
    "几何关系测量",
    "圆心距",
    "轴夹角",
    "点到面",
    "有限对象最短距离",
    "平行面"
  ],
  "inputContract": "measureRelation({context,mode:\"shortest\"|\"centerDistance\"|\"axisAlignment\"|\"pointFace\"|\"parallelFaces\",first?,second?,face?,pointWorld?})；引用形式 {bodyId,kind:\"body\"|\"edge\"|\"face\",topologyId?}。",
  "outputContract": "分别返回有限 B-Rep 最短距离和见证点、两圆心距/轴夹角/同轴偏差、点到裁剪面的距离或平行面法向距离；只读。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "STALE_REFERENCE",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docsHash": "sha256:eb8c77646cb9cedbfaba2c2e10b66332b2b7eddea7965b2d17bfc3dc96ca172d"
}
```

## 工具 inspectPrintability · inspectPrintability

```json
{
  "id": "inspectPrintability",
  "title": "inspectPrintability",
  "category": "page-method",
  "version": "1.9.0",
  "description": "inspectPrintability({context,bodyId,angleLimitDeg?:45}); angleLimitDeg 在 0 与 90 度之间。",
  "synonyms": [
    "inspectPrintability",
    "成型检查",
    "DfAM",
    "悬垂方向",
    "支撑面积"
  ],
  "inputContract": "inspectPrintability({context,bodyId,angleLimitDeg?:45}); angleLimitDeg 在 0 与 90 度之间。",
  "outputContract": "status=read、当前 context、精确 B-Rep 元数据及显示网格的六方向悬垂面积和支撑柱体粗估；不判定工艺合格。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "STALE_REFERENCE",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docs": "api.printability",
  "docsHash": "sha256:fb648d816ecd91611331eb10308eebd4324ac3f0828bd8cfe8b98be98d999d22"
}
```

## 工具 inspectProfile · inspectProfile

```json
{
  "id": "inspectProfile",
  "title": "inspectProfile",
  "category": "page-method",
  "version": "1.9.0",
  "description": "inspectProfile({context,bodyId})；bodyId 指向当前 sketchProfile 解析来源，不接收过期 ID。",
  "synonyms": [
    "inspectProfile",
    "轮廓检查",
    "断线",
    "间隙",
    "重线",
    "自交"
  ],
  "inputContract": "inspectProfile({context,bodyId})；bodyId 指向当前 sketchProfile 解析来源，不接收过期 ID。",
  "outputContract": "status=read、当前 context、每项 issueId/实体引用/位置/间隙 mm 与可修复方式；不修改 revision。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "STALE_REFERENCE",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docsHash": "sha256:e15e53a73f71871156c1e159084a3932d5f1bf09ba35584356068f729409e1ac"
}
```

## 工具 prepareProfileEdit · prepareProfileEdit

```json
{
  "id": "prepareProfileEdit",
  "title": "prepareProfileEdit",
  "category": "page-method",
  "version": "1.9.0",
  "description": "prepareProfileEdit({context,bodyId,mode:\"intersections\"|\"trim\"|\"extend\"|\"trimCircle\"|\"fillet\",entityId,targetId,endpoint?,candidateId?,startCandidateId?,endCandidateId?,keepSide?,radiusMm?,arcId?,output?})",
  "synonyms": [
    "prepareProfileEdit",
    "解析轮廓修剪",
    "延伸",
    "二维圆角",
    "交点候选"
  ],
  "inputContract": "prepareProfileEdit({context,bodyId,mode:\"intersections\"|\"trim\"|\"extend\"|\"trimCircle\"|\"fillet\",entityId,targetId,endpoint?,candidateId?,startCandidateId?,endCandidateId?,keepSide?,radiusMm?,arcId?,output?})",
  "outputContract": "只读返回候选及经过校验的完整 profile 参数。缺少交点选择时 selectionRequired=true；不自动选择。确认后经 feature.edit 提交 profile，一次历史事务；人工草稿锁继续适用。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "docsHash": "sha256:483a06b10169dcf7d79c2cf529f12c81164a255ec969cca9fe102b2cf3c3800d"
}
```

## 工具 projectProfile · projectProfile

```json
{
  "id": "projectProfile",
  "title": "projectProfile",
  "category": "page-method",
  "version": "1.9.0",
  "description": "projectProfile({context,bodyId,edgeIds:[当前边索引],frame?:{origin,quaternion}})；或用 pointWorld:[x,y,z] 投影明确坐标点。",
  "synonyms": [
    "projectProfile",
    "投影几何",
    "到轮廓平面",
    "引用源边",
    "圆心"
  ],
  "inputContract": "projectProfile({context,bodyId,edgeIds:[当前边索引],frame?:{origin,quaternion}})；或用 pointWorld:[x,y,z] 投影明确坐标点。",
  "outputContract": "返回局部解析直线/平行平面圆及圆弧和来源几何快照；不自动关联源体。斜投圆退回 UNSUPPORTED_CURVE_PROJECTION，不制造椭圆替身；只读。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "STALE_REFERENCE",
    "REVISION_CONFLICT",
    "UNSUPPORTED_CURVE_PROJECTION",
    "DEGENERATE_PROJECTION"
  ],
  "docsHash": "sha256:bf69f16a9a6f7388eb2dd2fa25d058f1615a79c1e992fde818b68902dca730f4"
}
```

## 工具 inspectFit · inspectFit

```json
{
  "id": "inspectFit",
  "title": "inspectFit",
  "category": "page-method",
  "version": "1.9.0",
  "description": "inspectFit({context,bodyAId,bodyBId,toleranceMm?:0.00001,volumeThresholdMm3?:0.000001})；选择两个当前单一封闭实体。",
  "synonyms": [
    "inspectFit",
    "干涉",
    "间隙",
    "接触",
    "配合检查",
    "两实体"
  ],
  "inputContract": "inspectFit({context,bodyAId,bodyBId,toleranceMm?:0.00001,volumeThresholdMm3?:0.000001})；选择两个当前单一封闭实体。",
  "outputContract": "status=read、overlap/contactWithinTolerance/separated、公共体积或精确最短距离与见证点、当前 context；只读，不自动判断工艺合格。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "STALE_REFERENCE",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docsHash": "sha256:457c5ab6285c047fb09cdb7d7f1b7a8f03f964606463ef21121b0a6aed7dc69c"
}
```

## 工具 inspectThickness · inspectThickness

```json
{
  "id": "inspectThickness",
  "title": "inspectThickness",
  "category": "page-method",
  "version": "1.9.0",
  "description": "inspectThickness({context,bodyId,mode:\"ray\",point:[x,y,z],direction:[dx,dy,dz]})；或 mode:\"faces\",faceAId,faceBId,point；两面须平行且射线穿过连续材料。",
  "synonyms": [
    "inspectThickness",
    "指定位置壁厚",
    "连续材料",
    "平行壁面"
  ],
  "inputContract": "inspectThickness({context,bodyId,mode:\"ray\",point:[x,y,z],direction:[dx,dy,dz]})；或 mode:\"faces\",faceAId,faceBId,point；两面须平行且射线穿过连续材料。",
  "outputContract": "返回第一段连续材料的进入、离开点与精确厚度 mm；不是全件最小壁厚证明。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "STALE_REFERENCE",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docsHash": "sha256:3cf06544aed0ef20a30badf5eada8c6881010101de0a96891f67aee6a54e4889"
}
```

## 工具 inspectDraft · inspectDraft

```json
{
  "id": "inspectDraft",
  "title": "inspectDraft",
  "category": "page-method",
  "version": "1.9.0",
  "description": "inspectDraft({context,bodyId,pullDirection:[0,0,1],thresholdDeg:2})；用户决定阈值。",
  "synonyms": [
    "inspectDraft",
    "拔模检查",
    "拉出方向",
    "平面倾角"
  ],
  "inputContract": "inspectDraft({context,bodyId,pullDirection:[0,0,1],thresholdDeg:2})；用户决定阈值。",
  "outputContract": "返回每个解析平面的精确有符号倾角与封口面分类；非平面返回 unsupported。负倾角不等于已证明倒扣。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "STALE_REFERENCE",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docsHash": "sha256:a6e2435dd5706900410e70e4ea98abc04b663124afdc8e03ce3b3b724167a857"
}
```

## 工具 fitProfile · fitProfile

```json
{
  "id": "fitProfile",
  "title": "fitProfile",
  "category": "page-method",
  "version": "1.9.0",
  "description": "fitProfile({context,kind:\"circle\"|\"line\",plane?:\"XY\"|\"XZ\"|\"YZ\",points:[[u,v],...],maxResidualMm?}); 3–1000 点。",
  "synonyms": [
    "fitProfile",
    "计算拟合",
    "圆",
    "直线",
    "截面点",
    "残差"
  ],
  "inputContract": "fitProfile({context,kind:\"circle\"|\"line\",plane?:\"XY\"|\"XZ\"|\"YZ\",points:[[u,v],...],maxResidualMm?}); 3–1000 点。",
  "outputContract": "status=read、圆心/半径或直线方向、最大/RMS 残差、当前 context；不生成几何。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "PARAM_RANGE_INVALID",
    "FIT_DEGENERATE",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docs": "api.profile-fitting",
  "docsHash": "sha256:84d15c2ccb73bb9eb968585178c58de8803ee61e0007fcaab130d3b8f0c8d309"
}
```

## 工具 traceTwinWindow · traceTwinWindow

```json
{
  "id": "traceTwinWindow",
  "title": "traceTwinWindow",
  "category": "page-method",
  "version": "1.9.0",
  "description": "traceTwinWindow({context,outerLeft,outerRight,innerLeft,innerRight,barTopY,barBottomY,simplifyToleranceMm?:0..0.2}); 四条上到下 XY 采样曲线，每条3–2000点。",
  "synonyms": [
    "traceTwinWindow",
    "DWG",
    "样条",
    "双窗扣",
    "闭合轮廓",
    "横条"
  ],
  "inputContract": "traceTwinWindow({context,outerLeft,outerRight,innerLeft,innerRight,barTopY,barBottomY,simplifyToleranceMm?:0..0.2}); 四条上到下 XY 采样曲线，每条3–2000点。",
  "outputContract": "status=read、居中的 vectorProfile regions、源包围盒/尺寸、简化前后点数和采样点最大偏差；不建模。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docs": "api.dwg-spline-twin-window",
  "docsHash": "sha256:58e1856d1154511c6bbb65e01ee9b88c528e872286d9cba5440d9dfedf9d7112"
}
```

## 工具 executeText · executeText

```json
{
  "id": "executeText",
  "title": "executeText",
  "category": "page-method",
  "version": "1.9.0",
  "description": "executeText({context,idempotencyKey,text,dryRun?}); 每行 add <op> key=value 或 measure <bodyId|$last>。",
  "synonyms": [
    "executeText",
    "纯文本命令",
    "输入",
    "端口",
    "建模"
  ],
  "inputContract": "executeText({context,idempotencyKey,text,dryRun?}); 每行 add <op> key=value 或 measure <bodyId|$last>。",
  "outputContract": "dryRun 返回编译步骤；执行返回 api.run 的逐步回执、当前工程状态与显示状态。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "RESOURCE_LIMIT",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE",
    "IDEMPOTENCY_KEY_REUSED"
  ],
  "docs": "api.text-command",
  "docsHash": "sha256:e44458ac05537d07946ef1d2b2c47c180178aed92b11aa3b1041c677c1116d5f"
}
```

## 工具 setDisplayPreferences · setDisplayPreferences

```json
{
  "id": "setDisplayPreferences",
  "title": "setDisplayPreferences",
  "category": "page-method",
  "version": "1.9.0",
  "description": "setDisplayPreferences({context,values}); values 为部分配置，字段及范围见 api.display-preferences。",
  "synonyms": [
    "setDisplayPreferences",
    "全局设置",
    "灯光",
    "光源",
    "颜色",
    "材质",
    "环境反射",
    "Cookie"
  ],
  "inputContract": "setDisplayPreferences({context,values}); values 为部分配置，字段及范围见 api.display-preferences。",
  "outputContract": "status=applied, values, persisted, storage=cookie；不修改几何、工程修订或撤销记录。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "INSTANCE_MISMATCH",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docs": "api.display-preferences",
  "docsHash": "sha256:d4c4df356f12278dbc47d12ad6c063c7011d7480b1eb2f42cb2fd9b2710263a1"
}
```

## 工具 getLogoConverter · getLogoConverter

```json
{
  "id": "getLogoConverter",
  "title": "getLogoConverter",
  "category": "page-method",
  "version": "1.9.0",
  "description": "getLogoConverter()；读取当前浏览器 localStorage 的配置。",
  "synonyms": [
    "getLogoConverter",
    "LOGO",
    "PDF",
    "转换配置",
    "URL"
  ],
  "inputContract": "getLogoConverter()；读取当前浏览器 localStorage 的配置。",
  "outputContract": "configured、url、key、hasKey；Key 对同源页面脚本可读。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "docsHash": "sha256:b61ceb943982f2d96d86d9a2438847ed2783233e1a40d305791454a428f38c9f"
}
```

## 工具 setLogoConverter · setLogoConverter

```json
{
  "id": "setLogoConverter",
  "title": "setLogoConverter",
  "category": "page-method",
  "version": "1.9.0",
  "description": "setLogoConverter({context,url,key?})；URL 必须含 userid，空 key 保留原值。",
  "synonyms": [
    "setLogoConverter",
    "LOGO",
    "PDF",
    "转换",
    "URL",
    "Key"
  ],
  "inputContract": "setLogoConverter({context,url,key?})；URL 必须含 userid，空 key 保留原值。",
  "outputContract": "status=applied、配置状态；URL/Key 保存在当前浏览器 localStorage，不进入工程。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "docsHash": "sha256:f02a8b4d5bbb24ac4ca0e5b04dca4b059ac50fe1bd0332825b653b41879406af"
}
```

## 工具 convertLogoPdf · convertLogoPdf

```json
{
  "id": "convertLogoPdf",
  "title": "convertLogoPdf",
  "category": "page-method",
  "version": "1.9.0",
  "description": "convertLogoPdf({context,name,data,targetWidthMm?})；data 为 PDF Uint8Array/ArrayBuffer/Blob，最多 20 MiB。",
  "synonyms": [
    "convertLogoPdf",
    "PDF",
    "LOGO",
    "转",
    "SVG",
    "闭合轮廓"
  ],
  "inputContract": "convertLogoPdf({context,name,data,targetWidthMm?})；data 为 PDF Uint8Array/ArrayBuffer/Blob，最多 20 MiB。",
  "outputContract": "待人工复核的 logo.regions、尺寸和 PDF SHA-256；再以 source.reviewed=true 预览或建模。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "docsHash": "sha256:4676890f990f6553e95b3748407992fb3c189e3fec89dbba2d79330c7afddb2e"
}
```

## 工具 setView · setView

```json
{
  "id": "setView",
  "title": "setView",
  "category": "page-method",
  "version": "1.9.0",
  "description": "setView({context,direction?,projection?,fit?,selectedIds?,section?,display?,grid?,snap?,gizmo?,selectionMode?,camera?,language?,temporaryDisplay?}); 详见 api.views；panels={left:boolean,right:boolean}，anchorVisible 为布尔值；section={axis:\"X\"|\"Y\"|\"Z\",position:number,enabled:boolean}。",
  "synonyms": [
    "setView",
    "视图",
    "俯视",
    "侧视",
    "轴测",
    "适配",
    "剖切",
    "显隐"
  ],
  "inputContract": "setView({context,direction?,projection?,fit?,selectedIds?,section?,display?,grid?,snap?,gizmo?,selectionMode?,camera?,language?,temporaryDisplay?}); 详见 api.views；panels={left:boolean,right:boolean}，anchorVisible 为布尔值；section={axis:\"X\"|\"Y\"|\"Z\",position:number,enabled:boolean}。",
  "outputContract": "status=read、当前 context、display；section 仅为显示裁剪，不是精确切割。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "STALE_REFERENCE",
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE"
  ],
  "docs": "api.views",
  "docsHash": "sha256:be161123814ecdc4567bea9788fbb313e89e862747803ac4c4e3d27818ca17c2"
}
```

## 工具 redraw · redraw

```json
{
  "id": "redraw",
  "title": "redraw",
  "category": "page-method",
  "version": "1.9.0",
  "description": "redraw({context}); 不接受额外字段。",
  "synonyms": [
    "redraw",
    "重绘",
    "刷新",
    "画面",
    "渲染"
  ],
  "inputContract": "redraw({context}); 不接受额外字段。",
  "outputContract": "status=read、当前 context 和 display；不重载页面或增加建模 revision。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE",
    "DISPLAY_FAILED"
  ],
  "docs": "api.views",
  "docsHash": "sha256:e23bdf1c24ee540ce98fc8f430ff73ac077b8e5341277235d69fbcf4f6e6a604"
}
```

## 工具 capture · capture

```json
{
  "id": "capture",
  "title": "capture",
  "category": "page-method",
  "version": "1.9.0",
  "description": "capture({context}); 不接受额外字段。",
  "synonyms": [
    "capture",
    "截图",
    "图像",
    "PNG",
    "当前画面"
  ],
  "inputContract": "capture({context}); 不接受额外字段。",
  "outputContract": "status=read、mime=image/png、真实 dataUrl、当前 context 和匹配渲染帧的 display。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "Guarded page method returns {status:\"failed\",commitState:\"not_committed\",error:{code,message},context} on failure.",
  "errorCodes": [
    "REVISION_CONFLICT",
    "CAPABILITY_UNAVAILABLE",
    "DISPLAY_FAILED"
  ],
  "docs": "api.views",
  "docsHash": "sha256:60ba812030aefc2bcf645f2b4c4a302341e508a560f51b05074cf696cac720e3"
}
```

## 工具 run · run

```json
{
  "id": "run",
  "title": "run",
  "category": "page-method",
  "version": "1.9.0",
  "description": "run({context,idempotencyKey,steps}); see readDocs({docId:\"api.run\"}).",
  "synonyms": [
    "run",
    "批量",
    "AI",
    "JSON",
    "指令",
    "无CLI"
  ],
  "inputContract": "run({context,idempotencyKey,steps}); see readDocs({docId:\"api.run\"}).",
  "outputContract": "completed/partial/failed/unknown、逐步回执、progress/recovery、elapsedMs、回执时的 context/requestContext/summary/display；atomic=false。后续操作前核对实时状态。",
  "implementationStatus": "implemented",
  "contractStatus": "page-method",
  "runtimeAvailability": "requires_page",
  "errorModel": "completed/partial/failed/unknown; atomic=false; inspect per-step results and displayMatchesContext. Earlier committed steps remain on failure.",
  "errorCodes": [
    "PARAM_SCHEMA_INVALID",
    "RESOURCE_LIMIT",
    "INSTANCE_MISMATCH",
    "REVISION_CONFLICT",
    "IDEMPOTENCY_KEY_REUSED",
    "STALE_REFERENCE"
  ],
  "docsHash": "sha256:63f7bf389b8bed78fc8fcb3b249d2714fda0f675570993f8b04ff364f892d1bd"
}
```

## 工具 document.rename · 工程改名

```json
{
  "id": "document.rename",
  "title": "工程改名",
  "description": "修改工程名称，保留几何。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"document.rename\",args}); 修改工程名称，保留几何。",
  "fields": [
    "name"
  ],
  "minimalExample": {
    "action": "document.rename",
    "args": {
      "name": "圆环设计"
    }
  },
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:b8c86527c8d84ae6e5f0168f6379eb092c62fb76c92a2f3465037f04f33cf366"
}
```

## 工具 feature.rename · 特征改名 实体名称

```json
{
  "id": "feature.rename",
  "title": "特征改名 实体名称",
  "description": "修改历史步骤及同 ID 实体名称，导入件也可使用。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"feature.rename\",args}); 修改历史步骤及同 ID 实体名称，导入件也可使用。",
  "fields": [
    "featureId",
    "name"
  ],
  "minimalExample": {
    "action": "feature.rename",
    "args": {
      "featureId": "<featureId>",
      "name": "主体"
    }
  },
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:2f67a45c4bae97015dbe86e0bf61aac24ed67a25de1eece5cc9d6d52b5cc066c"
}
```

## 工具 body.visibility · 显示 隐藏实体

```json
{
  "id": "body.visibility",
  "title": "显示 隐藏实体",
  "description": "显隐指定当前实体，不删除几何。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"body.visibility\",args}); 显隐指定当前实体，不删除几何。",
  "fields": [
    "bodyIds",
    "visible"
  ],
  "minimalExample": {
    "action": "body.visibility",
    "args": {
      "bodyIds": [
        "<bodyId>"
      ],
      "visible": false
    }
  },
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:83187d20fa4d3fdf737a36d412b8e9d1b7ab8d18eae12d568f8d88d2a1c0ec44"
}
```

## 工具 body.appearance · 实体原色 颜色 金属 材质

```json
{
  "id": "body.appearance",
  "title": "实体原色 颜色 金属 材质",
  "description": "color 为 #RRGGBB 或 null 恢复默认；finish 为材质键或 null 跟随工程。仅改 color 不改变金属设置；需显示原色时同时设 finish:design。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"body.appearance\",args}); color 为 #RRGGBB 或 null 恢复默认；finish 为材质键或 null 跟随工程。仅改 color 不改变金属设置；需显示原色时同时设 finish:design。",
  "fields": [
    "bodyIds",
    "color",
    "finish"
  ],
  "allowedFinishes": [
    "design",
    "light-gold",
    "nickel",
    "24k-gold",
    "gunmetal",
    "matt-nickel",
    "matt-light-gold",
    "matt-24k-gold",
    "matt-gunmetal",
    "antique-brass",
    "antique-silver"
  ],
  "minimalExample": {
    "action": "body.appearance",
    "args": {
      "bodyIds": [
        "<bodyId>"
      ],
      "color": "#e87939",
      "finish": "design"
    }
  },
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:932718b59837e7ad6d739e593f54f01c46bdc6ad7b450dd9e3ddabcbce722a6c"
}
```

## 工具 document.appearance · 工程渲染 金属色

```json
{
  "id": "document.appearance",
  "title": "工程渲染 金属色",
  "description": "设置当前工程材质覆盖，null 跟随全局默认，仅影响未单独指定材质的实体。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"document.appearance\",args}); 设置当前工程材质覆盖，null 跟随全局默认，仅影响未单独指定材质的实体。",
  "fields": [
    "finish"
  ],
  "allowedFinishes": [
    "design",
    "light-gold",
    "nickel",
    "24k-gold",
    "gunmetal",
    "matt-nickel",
    "matt-light-gold",
    "matt-24k-gold",
    "matt-gunmetal",
    "antique-brass",
    "antique-silver"
  ],
  "minimalExample": {
    "action": "document.appearance",
    "args": {
      "finish": "nickel"
    }
  },
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:8d819422876e072da4d27eb773868274316c9fcf729bdc477f1674f593f0eb0e"
}
```

## 工具 body.explode · 组合拆散 多实体分解

```json
{
  "id": "body.explode",
  "title": "组合拆散 多实体分解",
  "description": "将含 2–500 个封闭体的组合拆成独立实体；一个撤销步骤。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"body.explode\",args}); 将含 2–500 个封闭体的组合拆成独立实体；一个撤销步骤。",
  "fields": [
    "bodyId"
  ],
  "minimalExample": {
    "action": "body.explode",
    "args": {
      "bodyId": "<bodyId>"
    }
  },
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:17d0d38989d224661add0119b16f86a9fbab0b1e1c7992960a4e80a2b144cbad"
}
```

## 工具 reference.setWorkFrame · 设置参考锚点（工作基准）

```json
{
  "id": "reference.setWorkFrame",
  "title": "设置参考锚点（工作基准）",
  "description": "args:{origin:[x,y,z],quaternion:[x,y,z,w],sourceLabel?}；修改唯一可见插入锚点，不修改固定世界坐标；单位四元数，锁定时拒绝。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"reference.setWorkFrame\",args}); args:{origin:[x,y,z],quaternion:[x,y,z,w],sourceLabel?}；修改唯一可见插入锚点，不修改固定世界坐标；单位四元数，锁定时拒绝。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.references",
  "docsHash": "sha256:8f023801251193772cc3fd9bf02217fe65e6f0c9cac1a81ede3fab5b1ac4cfe3"
}
```

## 工具 reference.resetWorkFrame · 重置参考锚点（工作基准）

```json
{
  "id": "reference.resetWorkFrame",
  "title": "重置参考锚点（工作基准）",
  "description": "args:{scope:\"position\"|\"orientation\"|\"all\"}；只重置指定部分。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"reference.resetWorkFrame\",args}); args:{scope:\"position\"|\"orientation\"|\"all\"}；只重置指定部分。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.references",
  "docsHash": "sha256:8a829b8d839ff879254be7fa44ece62dc50d3b5af0c48957194f08048f534ca7"
}
```

## 工具 reference.setLocked · 锁定参考锚点（工作基准）

```json
{
  "id": "reference.setLocked",
  "title": "锁定参考锚点（工作基准）",
  "description": "args:{locked:boolean}；可撤销的元数据操作。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"reference.setLocked\",args}); args:{locked:boolean}；可撤销的元数据操作。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.references",
  "docsHash": "sha256:f589b321565bd0b2dbd7ea02913bb6c9c96f9e68118589e384022f60f7f54a10"
}
```

## 工具 reference.saveFrame · 保存具名基准

```json
{
  "id": "reference.saveFrame",
  "title": "保存具名基准",
  "description": "args:{name,frame:{origin,quaternion},frameId?,expectedFrameVersion?}；更新需版本匹配。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"reference.saveFrame\",args}); args:{name,frame:{origin,quaternion},frameId?,expectedFrameVersion?}；更新需版本匹配。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.references",
  "docsHash": "sha256:902538fbe5cd860babb0476e5fbbad6a33f7dba028f14f23cdf499e97ecb8c1b"
}
```

## 工具 reference.activateFrame · 激活具名基准

```json
{
  "id": "reference.activateFrame",
  "title": "激活具名基准",
  "description": "args:{frameId,expectedFrameVersion}；复制快照到当前工作基准。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"reference.activateFrame\",args}); args:{frameId,expectedFrameVersion}；复制快照到当前工作基准。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.references",
  "docsHash": "sha256:2291542ce5fff38bd7f1a3793afb3b1ea40743ec437be5623192b04166fbd260"
}
```

## 工具 reference.renameFrame · 重命名具名基准

```json
{
  "id": "reference.renameFrame",
  "title": "重命名具名基准",
  "description": "args:{frameId,expectedFrameVersion,name}。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"reference.renameFrame\",args}); args:{frameId,expectedFrameVersion,name}。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.references",
  "docsHash": "sha256:334449217ab81f83eb4dea6e6d4f025dfa4ac57481ca9b8d56802da6161575ff"
}
```

## 工具 reference.deleteFrame · 删除具名基准

```json
{
  "id": "reference.deleteFrame",
  "title": "删除具名基准",
  "description": "args:{frameId,expectedFrameVersion}；已冻结特征不受影响。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"reference.deleteFrame\",args}); args:{frameId,expectedFrameVersion}；已冻结特征不受影响。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.references",
  "docsHash": "sha256:3b9eef825bf976f8de55a48016b79576efc549c602cc9ceb3cec06276493a06e"
}
```

## 工具 reference.setBodyAnchor · 对象锚点

```json
{
  "id": "reference.setBodyAnchor",
  "title": "对象锚点",
  "description": "args:{bodyId,name,referenceId,quaternion,anchorId?,expectedAnchorVersion?}；referenceId 来自当前 queryReferences 精确点，绑定 B-Rep 指纹。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"reference.setBodyAnchor\",args}); args:{bodyId,name,referenceId,quaternion,anchorId?,expectedAnchorVersion?}；referenceId 来自当前 queryReferences 精确点，绑定 B-Rep 指纹。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.references",
  "docsHash": "sha256:05368338ee1e937e0a1c0ab360ea9897ddf00f57bcb373a24e3a7d50baa4e2a6"
}
```

## 工具 reference.deleteBodyAnchor · 删除对象锚点

```json
{
  "id": "reference.deleteBodyAnchor",
  "title": "删除对象锚点",
  "description": "args:{bodyId,anchorId,expectedAnchorVersion}；仅删除元数据。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"reference.deleteBodyAnchor\",args}); args:{bodyId,anchorId,expectedAnchorVersion}；仅删除元数据。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.references",
  "docsHash": "sha256:c0c8c3b776cc2540051083e75215996688982850b0c842ba750c0edb148f4d01"
}
```

## 工具 feature.add · 新增几何

```json
{
  "id": "feature.add",
  "title": "新增几何",
  "description": "args:{op,opVersion,schemaHash,params,refs,name?,placement?}；先 getTool 读取操作卡，按 placementPolicy 判断定位。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"feature.add\",args}); args:{op,opVersion,schemaHash,params,refs,name?,placement?}；先 getTool 读取操作卡，按 placementPolicy 判断定位。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:5b7f68ea8b625fa156b873efd0f1f6fb9a6030dc1338847c6584812f3a418205"
}
```

## 工具 feature.edit · 修改参数

```json
{
  "id": "feature.edit",
  "title": "修改参数",
  "description": "args:{featureId,opVersion,schemaHash,params,name?,placement?}；params 为补丁，placement 提供时完整替换。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"feature.edit\",args}); args:{featureId,opVersion,schemaHash,params,name?,placement?}；params 为补丁，placement 提供时完整替换。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:15b2991b5509ffcbf705a21ec3ddf34ddb65ddfb029d4de5cffcfd68de522f95"
}
```

## 工具 feature.remove · 删除实体

```json
{
  "id": "feature.remove",
  "title": "删除实体",
  "description": "args:{bodyIds}，不可使用历史已替换 ID。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"feature.remove\",args}); args:{bodyIds}，不可使用历史已替换 ID。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:54d3b5f55b75d19ee7a66cb29969efc618230adcfd48158a5a0b629e3185393b"
}
```

## 工具 history.undo · 撤销

```json
{
  "id": "history.undo",
  "title": "撤销",
  "description": "args:{}；撤销一个已提交步骤。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"history.undo\",args}); args:{}；撤销一个已提交步骤。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:fc4a5427ac0b2202ab2514ce615cffb88b8b31636b1f2e679020f4600919666f"
}
```

## 工具 history.redo · 重做

```json
{
  "id": "history.redo",
  "title": "重做",
  "description": "args:{}；重做一个步骤。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"history.redo\",args}); args:{}；重做一个步骤。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:9112f5691f39a21e19c0ab3e9635cf7cc863288b30ff6160ad1b0c6a1eff734a"
}
```

## 工具 document.refresh · 重建工程

```json
{
  "id": "document.refresh",
  "title": "重建工程",
  "description": "args:{}；重建当前历史。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"document.refresh\",args}); args:{}；重建当前历史。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:f5769baec23523effc981cc70511c594818b06d98e0ddf9d5488b9390205215a"
}
```

## 工具 preview.start · 预览模型或文件插入

```json
{
  "id": "preview.start",
  "title": "预览模型或文件插入",
  "description": "普通特征 args 同 feature.add；文件插入 args:{fileImport:{resourceId,placement}}。回执含 previewId/generation/baseRevision。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"preview.start\",args}); 普通特征 args 同 feature.add；文件插入 args:{fileImport:{resourceId,placement}}。回执含 previewId/generation/baseRevision。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:11cda1cf36628aa1db684ea56e9d13d1ca11bbd58e528ffa04b0802d89f8d272"
}
```

## 工具 preview.update · 更新预览

```json
{
  "id": "preview.update",
  "title": "更新预览",
  "description": "args:{previewId,expectedGeneration,patch:{params?,placement?}}；文件预览仅可更新 placement。旧代次拒绝，不修改工程 revision。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"preview.update\",args}); args:{previewId,expectedGeneration,patch:{params?,placement?}}；文件预览仅可更新 placement。旧代次拒绝，不修改工程 revision。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:96ee4d6f2cd9f6a6ae226836820d71970da4551d9ffd22515d48077b96156710"
}
```

## 工具 preview.commit · 应用预览

```json
{
  "id": "preview.commit",
  "title": "应用预览",
  "description": "新版 args:{previewId,expectedGeneration}；仅旧版 UI 预览允许 args:{}。提交为一个撤销步骤。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"preview.commit\",args}); 新版 args:{previewId,expectedGeneration}；仅旧版 UI 预览允许 args:{}。提交为一个撤销步骤。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:2842fa7a0c744b76b582f6efceec0037d161061a879a49bee27451b3aaa128a1"
}
```

## 工具 preview.cancel · 取消预览

```json
{
  "id": "preview.cancel",
  "title": "取消预览",
  "description": "新版 args:{previewId,expectedGeneration}；仅旧版 UI 预览允许 args:{}。取消不增加 revision。",
  "category": "command",
  "version": "1.9.0",
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "runtimeAvailability": "requires_ready_page",
  "inputContract": "execute({context,idempotencyKey,action:\"preview.cancel\",args}); 新版 args:{previewId,expectedGeneration}；仅旧版 UI 预览允许 args:{}。取消不增加 revision。",
  "outputContract": "检查 status/revisionAfter/warnings；读回 getState。参考元数据不重建几何。",
  "docs": "api.editor",
  "docsHash": "sha256:b64c1d94b1162309e48a91e2d4ff57bbe25690030ca7a41e8a397eac1dc88882"
}
```

## 工具 document.parameters · 命名参数与尺寸联动

```json
{
  "id": "document.parameters",
  "title": "命名参数与尺寸联动",
  "category": "document",
  "version": "1.9.0",
  "description": "通过 execute 的 document.parameters 动作合并命名定义和特征数值路径绑定，原子重建并形成一个撤销步骤。",
  "synonyms": [
    "参数",
    "尺寸",
    "联动",
    "expression",
    "length",
    "binding"
  ],
  "implementationStatus": "implemented",
  "contractStatus": "page-command",
  "strictContract": false,
  "runtimeAvailability": "requires_ready_page",
  "inputSchema": {
    "type": "object",
    "required": [
      "context",
      "idempotencyKey",
      "action",
      "args"
    ],
    "properties": {
      "context": {
        "description": "Current sessionId, documentId, documentInstanceId and expectedRevision."
      },
      "idempotencyKey": {
        "type": "string"
      },
      "action": {
        "const": "document.parameters"
      },
      "args": {
        "type": "object",
        "required": [
          "parameters"
        ],
        "properties": {
          "parameters": {
            "description": "Name -> {value:number|string,unit:\"mm\"|\"scalar\"}; merged with current definitions."
          },
          "bindings": {
            "description": "Feature ID -> numeric params dot path -> expression; merged with existing bindings."
          }
        }
      }
    }
  },
  "outputContract": "Committed revision plus getState().parameters/parameterValues; a failed expression leaves the previous model intact.",
  "minimalExample": {
    "action": "document.parameters",
    "args": {
      "parameters": {
        "length": {
          "value": 63,
          "unit": "mm"
        }
      }
    }
  },
  "errorCodes": [
    "PARAM_CYCLE",
    "PARAM_UNDEFINED",
    "PARAM_UNIT_MISMATCH",
    "PARAM_PATH_INVALID",
    "PARAMETER_BOUND",
    "UNSAFE_LEGACY_REFERENCE",
    "REVISION_CONFLICT"
  ],
  "knownUnsupportedCases": [
    "No angular/area expression binding in this milestone.",
    "Indexed face/edge references downstream of a changed feature are rejected when stability cannot be proven."
  ],
  "docs": "api.named-parameters",
  "docsHash": "sha256:126ac03542abbc3de71c1738e2e1c61e586a5fc5ca7d07c589d020fd40684820"
}
```

## 工具 files.capabilities · files.capabilities

```json
{
  "id": "files.capabilities",
  "title": "files.capabilities",
  "category": "file",
  "version": "1.9.0",
  "label": "文件能力",
  "synonyms": [
    "文件能力",
    "capabilities"
  ],
  "description": "capabilities(); no arguments.",
  "inputContract": "capabilities(); no arguments.",
  "outputContract": "Browser limits, supported formats and in-page transport.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:8e81e9ac288b80b3d69b6c81476a49de56eaf3599e7ed3d5eda083f3e34fa30a"
}
```

## 工具 files.register · files.register

```json
{
  "id": "files.register",
  "title": "files.register",
  "category": "file",
  "version": "1.9.0",
  "label": "登记文件资源",
  "synonyms": [
    "登记文件资源",
    "register"
  ],
  "description": "register({name,data,mime?}); data is File, Blob, ArrayBuffer or Uint8Array; name is a safe basename.",
  "inputContract": "register({name,data,mime?}); data is File, Blob, ArrayBuffer or Uint8Array; name is a safe basename.",
  "outputContract": "status=registered; resourceId, name, MIME, byte length, SHA-256 and expiry.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:d39f4264d7977e7623c35dc211d98bb3042c08d5c3374a8657c2be92ac71f194"
}
```

## 工具 files.new · files.new

```json
{
  "id": "files.new",
  "title": "files.new",
  "category": "file",
  "version": "1.9.0",
  "label": "新建工程",
  "synonyms": [
    "新建工程",
    "new"
  ],
  "description": "new({context}); complete current context; dirty replacement is always rejected by page API.",
  "inputContract": "new({context}); complete current context; dirty replacement is always rejected by page API.",
  "outputContract": "New document identity and instance on commit.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:edd76b99433fbe570adcda219f04c20137321cf5bdddabb6bae81b1d4a580b41"
}
```

## 工具 files.open · files.open

```json
{
  "id": "files.open",
  "title": "files.open",
  "category": "file",
  "version": "1.9.0",
  "label": "打开工程",
  "synonyms": [
    "打开工程",
    "open"
  ],
  "description": "open({context,resourceId}); registered .webcad/.json resource; dirty replacement is rejected.",
  "inputContract": "open({context,resourceId}); registered .webcad/.json resource; dirty replacement is rejected.",
  "outputContract": "Rebuilt document with new documentInstanceId.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:69ec3b2f2f99b8606661dbf37bb4274f5b2fbc49dce1aa57a376bfce466fe627"
}
```

## 工具 files.import · files.import

```json
{
  "id": "files.import",
  "title": "files.import",
  "category": "file",
  "version": "1.9.0",
  "label": "导入",
  "synonyms": [
    "导入",
    "import"
  ],
  "description": "import({context,resourceId,placement?,idempotencyKey?}); registered STEP/STP/BREP/BRP resource. When placement is present, idempotencyKey is required; run batch injects its own step key.",
  "inputContract": "import({context,resourceId,placement?,idempotencyKey?}); registered STEP/STP/BREP/BRP resource. When placement is present, idempotencyKey is required; run batch injects its own step key.",
  "outputContract": "Imported source-backed feature in current project; omitted placement retains legacy source coordinates.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "placementPolicy": {
    "mode": "creation-frame",
    "placementSupported": true,
    "originUsage": "new-object-insertion",
    "orientationUsage": "new-object-orientation",
    "legacyCoordinates": "world",
    "newCoordinates": "frame-local",
    "sourceAnchorRequired": true,
    "defaultInsertionAnchor": "model-origin",
    "historyBinding": "snapshot",
    "previewSupported": "registered-file-only"
  },
  "caveats": [
    "IGES requires unavailable local conversion in the static build."
  ],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:78f02eb5e82ce739ff4c61327130fae7f6ad4e1555d54d0ff8ff6483d222dd41"
}
```

## 工具 files.save · files.save

```json
{
  "id": "files.save",
  "title": "files.save",
  "category": "file",
  "version": "1.9.0",
  "label": "保存工程",
  "synonyms": [
    "保存工程",
    "save"
  ],
  "description": "save({context,name?}); complete current context.",
  "inputContract": "save({context,name?}); complete current context.",
  "outputContract": "status=generated native project resource with exact source snapshot; not a disk save.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:9a301e2373ffcc2bebecc61434be2fb3285cb226034d5301b0578282cf8c178b"
}
```

## 工具 files.export · files.export

```json
{
  "id": "files.export",
  "title": "files.export",
  "category": "file",
  "version": "1.9.0",
  "label": "导出文件",
  "synonyms": [
    "导出文件",
    "export"
  ],
  "description": "export({context,format,ids?,name?}); format step/stl/brep/png.",
  "inputContract": "export({context,format,ids?,name?}); format step/stl/brep/png.",
  "outputContract": "status=generated output resource with exact source snapshot.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:f24c9627d4caf0822d74ea9b9ebac489ceee51fe035de894e36a2b2c26029430"
}
```

## 工具 files.read · files.read

```json
{
  "id": "files.read",
  "title": "files.read",
  "category": "file",
  "version": "1.9.0",
  "label": "读取文件字节",
  "synonyms": [
    "读取文件字节",
    "read"
  ],
  "description": "read({resourceId,as?}); as is blob (default) or bytes.",
  "inputContract": "read({resourceId,as?}); as is blob (default) or bytes.",
  "outputContract": "Actual Blob or Uint8Array; host JSON boundaries may need bounded transfer.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:1c14b3c669782f3f5955a03494a25575151c185c68ac591e942218cc27d8c147"
}
```

## 工具 files.download · files.download

```json
{
  "id": "files.download",
  "title": "files.download",
  "category": "file",
  "version": "1.9.0",
  "label": "下载文件",
  "synonyms": [
    "下载文件",
    "download"
  ],
  "description": "download({resourceId}); generated output only.",
  "inputContract": "download({resourceId}); generated output only.",
  "outputContract": "status=download_initiated; disk completion cannot be claimed.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:2625392fcaf6da199be1ae9a67e5b6546db8ccdb854cecc076d4f8bbe1d293df"
}
```

## 工具 files.write · files.write

```json
{
  "id": "files.write",
  "title": "files.write",
  "category": "file",
  "version": "1.9.0",
  "label": "写入文件",
  "synonyms": [
    "写入文件",
    "write"
  ],
  "description": "write({resourceId,handle}); previously authorized FileSystemFileHandle.",
  "inputContract": "write({resourceId,handle}); previously authorized FileSystemFileHandle.",
  "outputContract": "status=write_verified after close and size/SHA-256 readback; snapshot confirmation is separate.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:19b7485076382f4c7ba91db756f379fa144cf47401f647f3085b44364f8c3d60"
}
```

## 工具 files.release · files.release

```json
{
  "id": "files.release",
  "title": "files.release",
  "category": "file",
  "version": "1.9.0",
  "label": "释放文件资源",
  "synonyms": [
    "释放文件资源",
    "release"
  ],
  "description": "release({resourceId}); current page resource ID.",
  "inputContract": "release({resourceId}); current page resource ID.",
  "outputContract": "Page resource released; an already started download URL is revoked by its timer.",
  "units": {
    "length": "mm",
    "angle": "degrees"
  },
  "implementationStatus": "page-adapter",
  "contractStatus": "browser-file-adapter",
  "runtimeAvailability": "requires_ready_page",
  "limits": {
    "maxBytes": 20971520,
    "maxResources": 32,
    "maxTotalBytes": 67108864,
    "ttlSeconds": 1800
  },
  "caveats": [],
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE",
    "REVISION_CONFLICT",
    "INSTANCE_MISMATCH",
    "UNSAVED_REPLACEMENT",
    "HASH_MISMATCH",
    "SIZE_LIMIT",
    "RESOURCE_LIMIT",
    "RESOURCE_EXPIRED",
    "PERMISSION_REQUIRED"
  ],
  "docsHash": "sha256:f50ab03a059d1136ac61abaa5643b1c82350a5de8d970409c06e6040eb0cf3d2"
}
```

## 工具 import.iges · IGES/IGS 导入

```json
{
  "id": "import.iges",
  "title": "IGES/IGS 导入",
  "description": "当前静态版不含原本的本机 IGES 转换。可先在现有 CAD 工具中离线转 STEP。",
  "category": "unavailable",
  "version": "1.9.0",
  "implementationStatus": "unavailable",
  "contractStatus": "unavailable",
  "runtimeAvailability": "unavailable",
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE"
  ],
  "docsHash": "sha256:c3dee91da3db6bfce04a7de39aa729273e8704fa43b3a9ee79a651c1d6d0f7cb"
}
```

## 工具 import.vector-server · SVG/DWG/DXF/PDF/AI 服务端矢量转换

```json
{
  "id": "import.vector-server",
  "title": "SVG/DWG/DXF/PDF/AI 服务端矢量转换",
  "description": "当前静态版不含原本的本机矢量转换服务；浏览器已有的直接输入能力以运行时界面为准。",
  "category": "unavailable",
  "version": "1.9.0",
  "implementationStatus": "unavailable",
  "contractStatus": "unavailable",
  "runtimeAvailability": "unavailable",
  "errorCodes": [
    "CAPABILITY_UNAVAILABLE"
  ],
  "docsHash": "sha256:daf0c896fe9115e68bbf69956cdeb3e2d8a7ccd546e4ca9b05533ee61df8d30a"
}
```
