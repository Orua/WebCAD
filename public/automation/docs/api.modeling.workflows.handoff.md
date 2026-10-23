# api.modeling.workflows.handoff

# 切片制造等外部交接

路线handoff，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](api.modeling.methods.external-handoff)。

先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。agent-routing.json中对应modeling.*路线的branches列工具候选；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。

工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](api.modeling.examples.whole-library-cases)；真实几何执行范围见独立库的历史测试记录（不随运行知识分发，不代表本次任务验收），未运行的功能不标通过。

