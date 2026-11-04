# 部件定位与组合

技能placement · 0.2.0 · 长度mm、角度degrees。示例尺寸只用于测试。

目的：保持功能基准、零件身份和明确连接关系。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：独立部件先按锚点/plane/axis定位，用transform或planAlignment；需连续材料且真实相交时union；分体安装保留独立体。

容易走错：不能用包围盒中心代替轴心/接触基准；绝对定位和相对偏移区分；不假称具备原生joint或运动学。

如何验收：轴/面方向、间隙/干涉、数量和连通；对齐失败读queryReferences，不换一个近似面。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](../problems/diagnosis.md)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支来自catalog.json。先定分支，再通过scripts/load.mjs --route placement --branch 分支ID --tools读取当前完整卡。卡片是参数依据，正文负责判断何时用。正常与边界推理例见[例题](../examples/reasoned-cases.md)，实际执行状态见tests/results.json。
