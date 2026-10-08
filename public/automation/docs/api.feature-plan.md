# api.feature-plan

快速多特征事务
execute action feature.addMany 的 args 为 {features:[{key,op,opVersion,schemaHash,params,refs,name?,placement?}]}，1–64项。或在run里用 method:addMany，args:{features:[{key,op,params,refs,placement?}]}，由当前工具卡补版本/哈希。refs中的当前bodyId字符串引用现存对象；{feature:"earlierKey"}引用本事务前序特征。成功返回featurePlan:{atomic:true,featureIds,featureCount}，整个计划一次重建、一次revision和一个撤销步骤，保留每项参数历史。run整体仍atomic:false；addMany这个单独步骤失败时全部不提交。
先完成来源/尺寸/空间结构判断再批量提交。支持的操作：box, cylinder, sphere, cone, torus, extrude, revolve, sweep, loft, quickModel, vectorProfile, arcProfile, sketchProfile, curveSweep, advancedLoft, transform, copy, mirror, linearPattern, circularPattern, union, cut, intersect, group, fillet, chamfer, hole, multiHole, multiPocket, multiBoss。只使用完整工具卡中明确的参数，独立创建尽量显式world frame，所有定位使用事务开始的参考锚点快照，不在中间自动移动锚点。圆角/倒角仅allEdges:true；面/边编号、选择token、Logo、导入、检查、文件和不在清单内的操作另行执行。需要当前面/边时把计划分段，提交后查询新拓扑。不得把不适用模板或假设尺寸塞进事务。失败返回实际featureId及featureKey，先定位该项再修订，不重复盲试。
几何提交后可用{$ref:"build.featurePlan.featureIds.finalKey"}检查或导出；仅最终仍存在的bodyId可做后续操作。检查关键材料/尺寸及displayMatchesContext，一次通过即交付。速度统计必须注明WASM启动、计划编写/读图、计算/网格、检查、导出与传输是否计入；单事务速度不代表整件已经正确。
