# api.product-source

陌生图的结构简表与本地路由（宿主helper，不是页面建模命令）
首次下载知识包后，await client.planSource(brief,{includeKnowledge:true,maxChars:32000}) 可在一次校验的静态快照中同时取族和完整所需卡，省去再读一次磁盘与解析。默认includeKnowledge:false只返回路由；预算1000..64000，knowledge.items明确read/omitted/error，不能将省略卡当已读。brief仅保存在调用方；路由结果不缓存源图、货号或当前ID，不修改工程。
brief:{schemaVersion:1,typeId:官方正整数,familyId?:明确结构族id,scope:'part'|'assembly',targetPartIds?:['B'],source:{kind:'dwg'|'photo',reference:'源文件hash/图框/视图等',version:'resolved'|'unresolved',geometry:'complete'|'partial'|'unreadable',units:'mm'|'cm'|'m'|'in'|'unresolved'},parts:[{id:'A',role:'main'|'moving'|'fastener'|'backplate'|'purchased'|'decoration',reference:'零件证据',section:'resolved'|'unresolved'}],unknowns:['缺少孔深']}
最多32个零件、32个未知项，id唯一且targetPartIds必须存在；单件scope必须明确目标。空parts允许先筛选，但返回待补项。photos即使标complete也不能证明工程尺寸。
返回status:'needs_evidence'|'needs_family'|'planning_ready'、canPlan、blockers、candidateFamilies和选中docIds/toolIds。未明确族不自动选模板。源版本未定、几何残缺、照片、单位未确认、目标件截面缺失、未知项均保留阻碍；单件任务只要求目标件截面，参照配件仍返回。planning_ready只表示调用方简表满足规划门槛，sourceEvidenceVerified:false，不代表3D或装配验收；此helper不执行CAD，也不拦截绕过它的页面run。
source.units为提交几何和尺寸的单位；缺失或unresolved保持待核，cm/m/in返回转换要求。原单位和实际转换依据须记在source.reference，转换后才能提交units:mm；不得把字段改成mm代替真正换算。路由不会修改源图或代做单位转换。
TypeID为本地系统分类线索，不当结构真值。明确familyId可跨品类选择已核结构，返回categoryHintOverridden:true；候选列表仍按官方TypeID提供。杂类不训练统一模板；同类存在多个稳定族时逐族选。A/B/C字母不能代替零件职责；主件、活动件、底片、外购件分清后，再加载选中的完整卡，依据原尺寸做feature计划。尺寸、剖面、轴孔配合与开闭/出货状态应在规划时附来源；Logo最后。
目录由结构抽样经验形成，非模型权重训练、非完整产品验证。原始业务图纸与照片留在本地，不随公共知识包下载。
