# api.modeling.workflows.cut-features

# 开孔、挖槽与布尔去料

工作流cut-features · 长度mm、角度degrees。示例尺寸只用于测试。

目的：根据孔型、入口、方向、底型和去料范围选方法。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：普通单孔用hole；重复同规格孔用multiHole；通孔/沉头/沉孔/斜底等按holeWizard卡；任意刀具明确target第一、tools其后再cut。

容易走错：通孔应跨越目标材料，盲孔要明确定义深度与底部。刀具不能误伤其他部件；半径=直径/2；沉头和沉孔不能用普通孔替代。

如何验收：孔径、中心、数量与贯穿/盲底；queryGeometry多圆边要核对层位及完整圆周；没孔先查相交和方向，不凭committed放行。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。

