# 网格打印检查

路线printability，来源是整库方法的WebCAD改写，非新增产品能力。完整判断过程见[方法正文](../methods/process-aware-modeling.md)。

先确定输入源、单位/基准、实际几何角色、要保持的结构和输出用途，再根据正文选择分支。catalog.json列当前可用工具；外部检索、切片、打印、展开、机器人等能力有明确边界，不编造页面工具或参数。

工具卡和文档只证明调用契约；实际任务必须按正文检查独立结果。正常与边界推理例见[整库例题](../examples/whole-library-cases.md)；真实几何执行范围见tests/results.json，未运行的功能不标通过。
