# 升级说明 1.67.0 — R角 / 圆润工具修复（Round9）

## 行为变化
- 圆角不再「假成功」：所选边必须全部变圆、整件范围不得留锐边、面数和体积变化合理，否则整体失败、不提交部分结果。铣削回退只在直线平面边、无真实拐角、对边圆角不重叠时使用，并且总是处理全部目标边。
- 没有锐边（球、环、已全圆角）返回 NO_CHANGE「无需修改」。
- 失败时报告 `maxFeasibleRadiusMm`（实际试算并通过验收的最大半径，0.01 mm 网格），默认不应用；`radiusFallback:'maxFeasible'` 才应用。
- 选择语义统一：边→这些边；单面→完整边界（平面或曲面）；多面＋sharedFaces→公共边；`allEdges`→全部锐边；fillet 的 edgeIds＋faceIds→并集。
- 圆润 round：新增 `allEdges`、支持曲面；界面只选实体＝整件；默认半径约为原来的 2～3 倍。
- 平滑过渡接受 1 个面；自动打磨默认 `expand:'none'`，需要扩网时报 SCOPE_EXPANSION_REQUIRED 并列出建议边。
- 回执统一：processedEdgeIds / failedEdgeIds / remainingSharpEdgeIds / radiusPerEdge / attempts / maxFeasibleRadiusMm。

## 兼容性
- 旧工程中依赖「铣削补角刀部分成功」的圆角特征，重建时会如实失败（原模型保留），需改小半径（可参考 maxFeasibleRadiusMm）。
- round 自动半径变大，旧工程里未写 radiusMm 的 round 特征重建后半径会变；需要原尺寸请在特征里写明 radiusMm。
