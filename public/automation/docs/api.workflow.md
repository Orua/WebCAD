# api.workflow

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
