# 修改已有模型与恢复

技能editing · 0.2.0 · 长度mm、角度degrees。示例尺寸只用于测试。

目的：先判断原特征是否仍可编辑，明确修改项和不变量。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：读取getState/getHistory；有真实可编辑特征时feature.edit，纯最终形体则选择受支持的新增加工。未知结果先getBatchReceipt/原任务对账。

容易走错：不能默认重开工程仍有配方与undo；不能清空重建用户未指定结构；依赖下游拓扑的特征需刷新选择。

如何验收：前后外形/孔位/数量/外观不变量；失败保留最后提交态。history.undo只用于可确认的本任务末位操作。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](../problems/diagnosis.md)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支来自catalog.json。先定分支，再通过scripts/load.mjs --route editing --branch 分支ID --tools读取当前完整卡。卡片是参数依据，正文负责判断何时用。正常与边界推理例见[例题](../examples/reasoned-cases.md)，实际执行状态见tests/results.json。
