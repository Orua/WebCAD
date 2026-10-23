# api.modeling.problems.diagnosis

# 遇到问题先查什么，再选什么工具

先找第一个失败步骤和原始错误、revision及已提交内容。以下是诊断选择，不是让Agent自动轮流试一遍。每个真实候选共享一次基线加一次有机制依据的替代；没有新证据不重算。

|现象或错误|先验证的原因|查询/处理工具|依据充分后可做|必须停止的情况|
|---|---|---|---|---|
|PARAM_SCHEMA_INVALID / PARAM_RANGE_INVALID|单位、半径/直径、字段、必填、范围|getTool/getTools，来源标注|修正错误参数，只重做失败部分|关键尺寸未确认，不能用模板默认代替|
|CAPABILITY_UNAVAILABLE / UNKNOWN_OPERATION|实际页版本、对象是mesh还是BRep、执行许可|getTool/connect/getServicesRouting|选已支持且同几何意义路线|没有等价支持；不安装第二引擎绕过|
|REVISION_CONFLICT / STALE_REFERENCE|用户编辑/改形/重载导致旧引用|getState/queryGeometry/queryReferences|按当前几何重新识别目标|仍有歧义；不能沿用原数字面边|
|AMBIGUOUS_SELECTION / SELECTION_COUNT_CHANGED|过滤太宽、孔上下口、同R外角|queryGeometry，中心/法向/长度/邻接|缩小几何条件或明确多选与expectedCount|无法区分用户所指目标|
|孔或槽没有出现|刀具不相交、方向错、深度错、加工模式错|measure/queryGeometry/inspectDesign|修正有证据的定位/贯穿范围|无法确认材料位置或用户要求|
|布尔失败/零厚度/多实体|共面/相切、交集为空、刀具过大|measure/inspectFit，当前轮廓和材料点|等价轮廓构造、合理刀具范围或有依赖分段|改变尺寸、加支撑、删孔才“成功”|
|圆角/倒角失败|旧边、缝边、局部余量不足、相邻小面|queryGeometry/probeBlendRadius，当前工具卡|重选边/改等价操作顺序；固定R仍保持|只有减R/漏边/变C才可算时需设计决定|
|扫掠失败/扭转|截面法向、路径连续、弯曲自交|inspectProfile/queryReferences，截面与路径|修正源平面/方向或真正断点|只靠加采样点或改截面凑形|
|放样失败/起伏|截面顺序、缠绕、法向、连通|inspectProfile；必要时局部截面诊断|修正对应关系；局部成功不能放行整体|无来源允许改变曲面连续性|
|尺寸/位置不对|mm与其他单位、直径当半径、原点/锚点语义|measure/queryReferences/当前params|按已确认基准重定位|不能确定应修改哪一项|
|超时/断线/unknown|任务可能已经提交|getBatchReceipt/getJob/getState|对账原任务，明确未执行才续接|状态未知时不换key重发|
|画面裂缝或黑边|可能圆柱缝边/显示网格问题|queryGeometry/measure/capture或显示视角|区分真实开口与显示缝|不能为隐藏缝旋转有约束零件|
|导出生成但找不到文件|仅生成资源，宿主未取字节或落盘|files.read，宿主写入回执|读实际字节并写到用户路径，校验大小/哈希|无宿主权限就如实交付资源|

失败操作不提交不等于整批回滚。通过progress只处理剩余步骤；history.undo只在能证明最后操作属于本任务且无人插入编辑时使用。重新打开的最终形体可能没有历史，不能承诺恢复不存在的配方。保留用户未指定结构、当前可用工程和最小失败记录。

