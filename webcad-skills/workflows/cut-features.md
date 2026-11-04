# 开孔、挖槽与布尔去料

技能cut-features · 0.2.0 · 长度mm、角度degrees。示例尺寸只用于测试。

目的：根据孔型、入口、方向、底型和去料范围选方法。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：普通单孔用hole；重复同规格孔用multiHole；通孔/沉头/沉孔/斜底等按holeWizard卡；任意刀具明确target第一、tools其后再cut。

容易走错：通孔应跨越目标材料，盲孔要明确定义深度与底部。刀具不能误伤其他部件；半径=直径/2；沉头和沉孔不能用普通孔替代。

如何验收：孔径、中心、数量与贯穿/盲底；queryGeometry多圆边要核对层位及完整圆周；没孔先查相交和方向，不凭committed放行。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](../problems/diagnosis.md)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支来自catalog.json。先定分支，再通过scripts/load.mjs --route cut-features --branch 分支ID --tools读取当前完整卡。卡片是参数依据，正文负责判断何时用。正常与边界推理例见[例题](../examples/reasoned-cases.md)，实际执行状态见tests/results.json。
