# api.modeling.workflows.finishing

# 圆角与倒角

工作流finishing · 长度mm、角度degrees。示例尺寸只用于测试。

目的：先确认R圆角还是C倒角，以及哪些当前边应改变。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：读当前queryGeometry，按位置/邻面筛选目标；固定R用fillet.radius数值，C用chamfer.distance；如需不同倒角模式另读卡。

容易走错：allEdges仅在用户明确要求所有边时使用；不要把固定R变自动范围，也不要以C代R。二维轮廓内构造等价R可减少3D拓扑问题，但必须保留设计。

如何验收：核对选边范围、原孔和关键尺寸。失败查缝边、小面和局部空间，再考虑等价顺序；不得自动减R或漏边。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。

