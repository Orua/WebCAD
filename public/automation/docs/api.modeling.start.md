# api.modeling.start

# 建模指导按需入口
下载完成不等于把知识送入模型上下文。新建/复刻/修改模型时，首次读 api.modeling.guide 建立构造、基准、特征顺序和验收计划；简单检查或导出直接读匹配工作流。
按 agent-routing.json 的 modeling.* 路线选择 readFirst；docs 是备用方法，不是必读清单。先明确几何与分支，再按 branches[].tools 读取所选少量完整卡；工具参数和能力始终以当前页面契约为准。正常建模不要自动加载诊断表。
失败或结果异常时先读 api.modeling.problems.diagnosis，按现象选择只读诊断工具；unknown 先对账原回执，禁止换键盲重做。
宿主 helper: route(query,{scope:'modeling'}) 返回候选路线（无正文/工具卡）；readLocal({docIds:[readFirst],maxChars:8000}) 只取所选全文。也可在当前页 readDocs({docId:readFirst}) 按 nextCursor 读完。
方法与工作流按需加载；超过预算的完整项显式 omitted/CHAR_BUDGET，缩小选择后重读，不能截断工具参数。示例尺寸/编号不是当前工程状态。
