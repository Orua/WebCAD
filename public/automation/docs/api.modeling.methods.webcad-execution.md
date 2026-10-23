# api.modeling.methods.webcad-execution

# 将建模计划落到当前WebCAD

text-to-cad编辑Python并重建保存文件；WebCAD经window.webcad.api操作页面当前文档。不要要求安装cadgen、另开Viewer、MCP或终端服务。宿主提供了什么授权脚本通道必须现场确认；网页有API不代表宿主能调用它。没有通道明确说明，不回退JSON面板。

connect({queries:[本次能力]})或connect({toolIds:[已选ID]})获得当前状态、完整卡和requestContext。检查canExecute/blockers，不只看ready。首次遵循onboarding.knowledge在宿主落盘、按大小/SHA256验证有限知识包；按来源URL和catalog/docs哈希缓存。缓存不能放工程ID、bodyId或面边编号。

先选方法再拿工具卡；版本与参数以当前页面为准。模板卡template.tube等是具体结构视图，执行使用卡中minimalExample的op:quickModel及params.kind，不能把template ID当op，也不能把子卡schemaHash当父操作schemaHash。api.run的add适配器填当前操作版本/哈希。

几何调用结构：api.run({context:新鲜requestContext,idempotencyKey:本次唯一键,steps:[{id,method:'add',args:{op,params,refs,name?,placement?}}]})。独立创建显式refs:[]；后续用当前回执的{$ref:'part.createdBodyIds.0'}。显式world/model-origin是测试约定；用户工程按确认的工作锚点/快照定位。长等待、人工编辑或REVISION_CONFLICT后重读状态。

批次完成不等于每个设计要求通过。检查逐步status、progress、partial/unknown和实际几何。unknown先读getBatchReceipt/原job与状态，不重做已成功部件。幂等键是确认同一请求的手段，不是继续执行或绕过失败的开关。

普通创建/加工/变换/模板按当前执行策略走本地WASM。复杂圆角等只有页面实际Services配置/能力和确定分流规则满足才走服务器；不能凭慢就改内核，服务器成功后还须页面接受结果。具体以当前getServicesRouting回读为准；本库不复制分流算法。

