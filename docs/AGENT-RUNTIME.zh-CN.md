# WebCAD 与宿主 Agent 配合

WebCAD 维护 CAD 适配器、方法契约和有限数值规划器；Agent 保留通用认证、任务、MCP、会话、账本和附件传输。工作台从当前 iframe 的 window.webcad.agent.createHostAdapter 创建适配器，不保存第二份 protocol.js。

## 连接与版本

1. 读取当前页面 connect 的 context/requestContext、buildId、pageApiVersion、catalogHash、docsHash、agentProtocol 和 agentSoftware。
2. 宿主按准入的页面根地址下载 automation/remote-agent.json。清单 build/catalog/docs/contract 必须与握手一致，逐文件核对长度与 SHA256；缓存按页面根、构建和知识哈希分开。
3. 有限软件包为 host-adapter.mjs、runtime-contract.json、layout-planner.py。后者以 .py.txt 作为静态下载资源，避免 IIS 将其当服务器脚本。Agent 在私有缓存中保存 .py；它仅接受声明的数值布局，不执行模型给出的代码、命令、URL 或路径。
4. 新工具的准入与 MCP 分类读已验证 runtime-contract；旧后端常量只服务旧页面。协议主版本不兼容明确阻断。版本改变暂停新写入，先核对原回执，再重新 prepare；工程和未知作业不得刷新、替换或重放。

## 原生状态同步（goldenluck.webcad.state/1）

页面仍是工程权威。宿主只保存有界只读投影，协议见 `contracts/native-state-sync.json`。精确同源（含端口）、实际窗口、路径和通道均验证后可使用 direct；其他情况继续使用已有的认证 postMessage bridge。必须收到 subscribed 回执后才显示同步已确认；订阅先于首次摘要读取，退出和文档切换释放旧订阅。

`getState` 的 `stateSeq` 在页面实例内递增，覆盖几何修订之外的选择、拓扑引用、工作坐标系、预览和忙碌变化。空闲事件订阅不读取完整状态。`sinceRevision` 的 unchanged 只表示几何修订未变，仍返回 stateSeq；需要选择时应读取相应投影。旧页面没有 stateSeq 时按兼容模式处理，不宣称有序同步。

宿主在用户发送时冻结 context、摘要、轻量实体、选择及参考信息，随消息和原幂等键一起发送；同一请求重试不换选中对象。coverage 只列实际存在的字段，缺少 bodies 不等于零实体。仅在后端声明支持该协议时携带新字段。512 KiB 上限之外改为按需精确查询，不携带 BRep、网格或历史快照。

命令终态先持久化原回执，可选状态镜像失败仅标记待补齐，不阻塞成功回执或重放命令。模型工具不再为每个已完成写入额外请求 snapshot 元数据。工程执行、导出字节、落盘与送达仍分别判断。

已有绑定临时离线时仍允许分析；首次无页面可建立 dialogueOnly 对话，其 binding/context 为 null、CAD scopes 为空。实时 CAD 读写要求显式连接页面后重新校验契约和权限；自动恢复不把无绑定对话或主动接管转换为写权限。终态先恢复输入，附件展示与工程暂存随后进行。

## 保存和恢复

宿主恢复记录只保存会话、任务、发送幂等键、已确认事件游标、工程身份与附件摘要，不保存授权票据和源文件。助手页面重新加载时先查询原任务；同一仍存活的页面绑定可以继续观察，不同工程实例不能安装旧结果。原任务仍活动时保留停止入口；发送响应丢失不会自动重放建模指令。附件续传同时核对名称、字节数和SHA-256，同名不同内容必须重新核对。

Services健康响应包含调度线程与存储状态。暂时存储异常会使健康降级，并保留原队列；终态落库重试只重复保存回执，不重复内核计算。停止后拒绝新请求，待调度线程退出再释放存储。损坏的层缓存先隔离并明确报错，已完成有效产物可以替换损坏项；此机制不授权新的重型试算。

宿主Bridge响应的`X-WebCAD-Host-Build`是实际加载的Web程序集SHA-256，可与候选程序比对。它只证明宿主程序身份，不能代替页面提交、附件持久化或用户工程恢复回执。

CAD 工作台附件登记、IIS 输入转发、Agent 文件接收和导出回传使用页面同一分类型容量：STEP/STP/BREP/BRP/STL 128 MiB、Float64 mesh 384 MiB、v4 webcad 512 MiB；每次最多5项，CAD任务附件合计512 MiB。普通聊天/浏览器及图像、PDF、矢量附件保留20 MiB。IIS较大的传输上限不放宽JSON命令、内容校验或Services来源/结果预算。Agent按已绑定任务的purpose=webcad决定容量，不接受上传者自行选择任务用途。登记、模型导入、生成、服务端写入和工程写入确认保持独立回执。

files.save 读取最后提交的工程，不等待几何 Worker。未完成计算、预览、UI 草稿不写入这个快照。v4 用独立编码 Worker，保留原完整资产；其它版本按原容器编码。写入确认仍检查文件 SHA256、大小和工程修订，旧快照不能清除新修订的 dirty。

内核错误先读取 getState。recoverKernel({context,stopRunning:false}) 只恢复未就绪内核；原计算仍运行时拒绝强行停止。经用户要求受控停止才用 stopRunning:true。恢复重建最后提交配方，保留几何和撤销历史，递增 revision 并清掉旧拓扑选择。恢复失败也能保存。恢复不是重新执行此前 Agent 命令。

webcad_connect 的 recover:true 请求宿主恢复连接。已认证 SSE 仍在线时维持原 lease，解决后台定时器被节流造成的假离线；关闭、释放及 epoch 改变不能由旧流复活。原回执按 commandId/pageJobId 核对。

任务专属 MCP 未准备好允许一次 app-server 内部重载，发生在模型回合和任何 CAD 命令之前；失败报告实际工具列表，不显示为已执行。模型服务繁忙、MCP 启动失败、页面离线、内核未就绪和计算中的状态分别处理。

已选择本地执行的计算到 localTimeoutMs 时仅提醒，继续原任务。它不证明运算太复杂，也不能推荐没有相应能力的 Services。本地初始化保留保护时限；远端仍使用原作业、继续/停止决定以及 Native 硬保护。

## 固定对象与钻石布局

group 建立复合体，减少对象树和选择管理，保留每个独立实体；它不减少三角面或曲面数量。union 是布尔融合，会改变接触件的实体结构，分离钻石也可能没有性能收益。不要为了少显示几个对象融合钻石、镶位和环体或丢弃来源。检查源件的对象数、实体数和历史长度，再决定分组；冻结检查点的能力和容量按现有 compiled checkpoint 规则核对，不能据此宣称一键冻结已经实现。

宿主布局调用为 webcad_docs({method:"planLayout",args:{layout}})，先读 api.agent-runtime。当前有限规划器支持明确测量的解析圆环面；不从照片或未知 STEP 猜曲面，不替代几何验收。输入：

    {
      "kind": "torus-surface",
      "sourceBinding": {"documentId": "实际工程ID", "revision": 8, "geometryFingerprint": "实际来源指纹"},
      "majorRadiusMm": 30, "minorRadiusMm": 5,
      "stoneDiameterMm": 2, "clearanceMm": 0.2, "embedDepthMm": 0.25,
      "centerMm": [3,4,5], "xAxis": [1,0,0], "normal": [0,0,1],
      "rows": [{"angleDeg":-60},{"angleDeg":0},{"angleDeg":60}]
    }

数值仅为参数格式示例，不能用于替代用户源尺寸。最多64行/2000位置，可明确 count 与 phaseDeg。按弦长间距计算数量，返回世界坐标、法向、local+Z 对齐四元数、最小中心距、spacingPass 和来源绑定。spacingPass=false 不得直接提交；中心距核对不能替代石体/镶位干涉检查。

插入前重读 sourceBinding 和完整 copy/transform/placement 卡，选择石体本地锚点与朝向；规划器四元数不自动覆盖石体的来源轴系。使用 feature.addMany 等有界批量减少重复重建，固定部分和正在调整部分分开；原配方、数量、尺寸和源孔保留。每批核对实际 bounds/渲染和必要测量，失败只继续尚未执行的步骤。


## 稳定性恢复与回执归档（2026-10-18）

错误和等待窗口的关闭、继续、停止按钮在 Agent 交互锁期间可用。files.save 可绕过几何排队保存最后已提交工程，不证明正在计算的结果已提交。附件上传和回执上报不再占用几何执行队列；失败保留原命令，retryReports 重新传输已有产物，不重跑几何。

Page jobs 的完整终态结果最多100个、CommandService 的完整回执最多1000个、batch 的完整回执最多100个；超过后保留页面生命周期内的紧凑摘要、原 status、archived:true 和原请求指纹。未知结果不淘汰；相同ID/内容返回原结果，ID变更内容拒绝。归档省略重型结果，不表示可以重跑；工程刷新后这些内存身份不持久，须查询原Agent任务和当前工程。摘要数量随本页写入增长，未把持久远程账本宣称为已实现。

网格布尔先把全部操作数平移到共同局部原点再转换 Float32，返回 localOrigin/maxQuantizationErrorMm/quantizationBudgetMm；转换误差超过0.0005mm明确拒绝，不让远离世界原点的小零件静默坍缩。该预算仅针对输入量化，不是完整几何精度保证。
