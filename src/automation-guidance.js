// One connection policy for runtime docs and generated entrypoints.
export const CONNECTION_POLICY = 'AI 应通过宿主已授权的页面脚本通道在后台调用 window.webcad.api。不要为查工具或执行建模打开 JSON 调试面板、填输入框或点击执行按钮。没有可用脚本通道时，明确报告通道不可用；不要自动退回界面操作。';

export const CONNECTION_GUIDE = `${CONNECTION_POLICY}

先确认宿主实际提供的能力。只读 DOM evaluate 不能据此推断公开 API 不可调用，也不能用于绕过宿主限制。
对于当前提供 cua_repl 的 Codex Chrome/IAB 开发环境：按该工具当前文档绑定用户指定标签页（不要刷新已有工程），检查 tab.capabilities.list()；若列出 cdp，读取 (await tab.capabilities.get('cdp')).documentation()。只有该通道确实提供并允许当前任务时，才用其 send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}) 调用页面公开 API。检查 exceptionDetails 与 result，不把命令已发送当作执行成功。其他宿主使用其明确提供的等价脚本接口，不猜测 CDP 方法或自行安装桥接服务。

首次表达式可一次返回状态、候选完整卡和批次说明：
JSON.stringify((()=>{const api=window.webcad.api;return {connection:api.connect({queries:['本次需要的能力'],limit:2,includeContracts:true}),run:api.readDocs({docId:'api.run'})};})())

connect 的 queries 是最多4个短字符串；searchTools 使用单个 query 字符串，两者不能混用。includeContracts=true 时完整卡已在 connection.contracts.items[].card，不要重复 getTool。需要补卡时用 getTools({ids:[实际ID]}) 一次取回；已知 ID 不必搜索。查询拓扑等补充说明可在同次表达式中按 docId 读取。不要为了发现工具构造 api.run 请求：这些只读方法直接调用，无需上下文或幂等键。

拿到契约后使用 api.run({context:connection.requestContext,idempotencyKey:唯一键,steps})。CDP expression 中异步调用应包成 (async()=>JSON.stringify(await window.webcad.api.run(请求对象)))()，配合 awaitPromise:true；不要直接使用顶层 await。修改前确认状态仍新鲜，依赖前步结果用 $ref；按需读取回执，不裁掉错误或必要约束。核对 committed 与当前渲染 revision。只执行用户要求的工作；保存/导出并非普通建模的自动收尾步骤。

先核对页面是否有 api.connect；不存在说明打开的是旧版，不能套用新版文档或偷偷刷新未保存工程。新版公开面只有 window.webcad.api，不沿用旧 action/execute/ready/viewport。握手返回 canExecute/blockers；ready 仅指内核初始化完成，忙碌或预览中仍不能执行。已知能力 ID 可用 connect({toolIds:['advancedLoft','transform'],includeContracts:true})，一次拿到实时上下文和完整卡。模板按名称检索，读 template.* 的单模板卡；按卡里的 minimalExample 用 op:quickModel 执行，不把 template.* 当几何操作 ID。

静态文档可直接按页面 base URL 读取 automation/quickstart.md、automation/tools/<id>.json、automation/docs/<docId>.md。HTTP 读取 JSON 必须按 UTF-8 解码，避免中文乱码。manifest/index 为程序索引输入，不要将全目录或全库打印进模型上下文。缓存只包含静态契约，不能代替实时工程状态。`;

export const MODELING_WORKFLOW = `先连接当前页面，而不是读取另一个工作目录的源码或旧手册。页面 buildId/pageApiVersion/catalogHash/docsHash 决定当前契约；本地知识包只作匹配哈希的缓存。只有诊断真实实现缺陷时才查源码。

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

删除只针对用户指定范围。用 getState 的当前 body IDs，execute action:feature.remove args:{bodyIds:[...]}；不能把“删除这个模型”无条件解释成清空所有项目。`;
