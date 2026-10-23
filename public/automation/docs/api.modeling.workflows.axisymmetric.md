# api.modeling.workflows.axisymmetric

# 柱件、轴套与旋转体

工作流axisymmetric · 长度mm、角度degrees。示例尺寸只用于测试。

目的：以同一轴为基准表达直径、台阶、轴向尺寸与内腔。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：单段实心直柱用cylinder；同轴直圆筒用template.tube；完整台阶截面用profileRevolve。横孔、偏心凸台作为后续加工。

容易走错：不能把钉头/倒锥/盲孔遗漏后称铆钉完成；内外径约束先核对；分体件不因共轴而融合。

如何验收：轴线、外/内径、端面位置、通孔/盲孔；尺寸错先查半径和直径、Z方向和原点。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。

