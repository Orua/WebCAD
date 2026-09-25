# recipes.multi-boss

批量圆柱凸台：先 getState() 取得当前上下文和真实 bodyId，getTool({id:"multiBoss"}) 读取严格 v2 卡。UI 路径“加工 → 孔与槽 → 批量圆柱凸台”。在 40×20×3 mm 板顶加两个凸台：feature.add 的 refs:[实际 bodyId]、params:{radius:2,height:3,axis:"Z",direction:1,points:[[10,10,3],[30,10,3]]}。每个 XYZ 是世界坐标的凸台底面中心，圆柱沿指定轴和符号方向长出。最多 64 个；每个都必须与当前主体融合为一个实体且增加材料，否则整步不提交。成功后读回 revision/body/feature，测量精确体积；示例理论值 2400+2×π×2²×3 mm³。历史修改用 feature.edit 传 radius/height/axis/direction 或完整 points 数组。工具只生成实心圆柱；通孔另用 multiHole，圆角另用 fillet/autoRound，不猜轴心或表面。
