# api.source-curves

readVector 对当前不能直接建模的 SPLINE 返回 unsupported[].sourceSpline，保留次数、控制点/节点/权重/周期性，或独立拟合点、拟合公差、端切向和源 handle；representation 区分 nurbs-parameters、fit-points、incomplete-spline。geometryCreated=false：保留参数不等于实现原始 NURBS 构造；fit-points 不能证明原始样条。DXF 源组码及 DWG 解码器实际提供的字段分别保留，不把不同源图元闭合插值成一条曲线。reliefReport.curveConversion（分层在 layers[]）记录实际使用的清理后点列/拟合边数、采样偏差、精确线圆弧面积、环孔数与核验类型；偏差参考 supplied-polyline-after-explicit-cleanup，sourceSplineDeviation=unknown，不是对源样条的全域误差界。报告最多保留16个环详情，truncated/ringCount明确表示摘要。采样偏差超过显式 curveToleranceMm 或面积改变量超过公差面积预算时拒绝转换；这也不替代源图尖角与区域用途的核对。完整原样条实体入口尚未开放。
