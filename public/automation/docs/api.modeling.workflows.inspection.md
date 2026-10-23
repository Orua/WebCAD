# api.modeling.workflows.inspection

# 检查、保存与导出

工作流inspection · 长度mm、角度degrees。示例尺寸只用于测试。

目的：根据所需证据和输出格式分别检查。

所需输入：源尺寸/坐标、目标部件、单位、用户指定的结构与要保持的部分；缺失会改变结果时先问清，不能借模板默认。前置状态：当前页面可执行、目标body及revision已知；改形后重查面边，选择集不能代替refs。

方案选择：测尺寸选measure，关系选measureRelation，显式设计断言选inspectDesign；STEP精确BRep与STL网格分别导出，工程保存files.save。

容易走错：导出格式不由关键词导出单独决定；未指定格式先补充。生成资源不等于落盘；导回与保存检查按任务需要执行。

如何验收：精确来源、单位、当前revision、实际字节格式和哈希；没宿主落盘能力明确报告；不把当前显示网格称精确STEP。

失败后：先查第一个失败步骤、raw error和已提交内容，再按[诊断表](api.modeling.problems.diagnosis)查证。只修正有证据的原因，不静默换尺寸/孔数/材料。批次非事务，原结果unknown先对账。

工具分支见 agent-routing.json 中对应 modeling.* 路线的 branches。先选择符合来源与几何的分支，再按工具 ID 通过 readLocal({toolIds:[...]}) 或当前页面 getTools 读取完整卡；不要运行旧独立库的加载脚本。例题只解释推理，不构成当前模型已通过的证据。

