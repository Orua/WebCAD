# 柱件、轴套与旋转体

技能axisymmetric · 0.2.0 · 长度mm、角度degrees。示例尺寸只用于测试。

目的：以同一轴为基准表达直径、台阶、轴向尺寸与内腔。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：单段实心直柱用cylinder；同轴直圆筒用template.tube；完整台阶截面用profileRevolve。横孔、偏心凸台作为后续加工。

容易走错：不能把钉头/倒锥/盲孔遗漏后称铆钉完成；内外径约束先核对；分体件不因共轴而融合。

如何验收：轴线、外/内径、端面位置、通孔/盲孔；尺寸错先查半径和直径、Z方向和原点。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](../problems/diagnosis.md)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支来自catalog.json。先定分支，再通过scripts/load.mjs --route axisymmetric --branch 分支ID --tools读取当前完整卡。卡片是参数依据，正文负责判断何时用。正常与边界推理例见[例题](../examples/reasoned-cases.md)，实际执行状态见tests/results.json。
