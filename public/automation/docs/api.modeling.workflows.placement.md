# api.modeling.workflows.placement

# 部件定位与组合

工作流placement · 长度mm、角度degrees。示例尺寸只用于测试。

目的：保持功能基准、零件身份和明确连接关系。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：独立部件先按锚点/plane/axis定位，用transform或planAlignment；需连续材料且真实相交时union；分体安装保留独立体。

容易走错：不能用包围盒中心代替轴心/接触基准；绝对定位和相对偏移区分；不假称具备原生joint或运动学。

如何验收：轴/面方向、间隙/干涉、数量和连通；对齐失败读queryReferences，不换一个近似面。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。

