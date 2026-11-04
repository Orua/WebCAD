# 板件与固定截面

技能solid-section · 0.2.0 · 长度mm、角度degrees。示例尺寸只用于测试。

目的：等截面沿直线延伸，优先直接控制轮廓和厚度。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：普通矩形用box；圆片用cylinder；解析闭合轮廓先sketchProfile再profileExtrude；只有图像则先确认比例/轮廓来源。

容易走错：不要从box切掉所有东西来拟合已有准确轮廓；轮廓带孔必须保留内环；拉伸方向和基准由源图决定。

如何验收：长宽/外形/厚度、孔环与单实体；开轮廓、自交或零厚度先inspectProfile定位，不加厚或闭合掩盖错误。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](../problems/diagnosis.md)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支来自catalog.json。先定分支，再通过scripts/load.mjs --route solid-section --branch 分支ID --tools读取当前完整卡。卡片是参数依据，正文负责判断何时用。正常与边界推理例见[例题](../examples/reasoned-cases.md)，实际执行状态见tests/results.json。
