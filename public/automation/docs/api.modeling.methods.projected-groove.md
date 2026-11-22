# api.modeling.methods.projected-groove

# 沿面法向投影刻槽：范围与验收

## 先确认能做什么

projectedGroove 把一条世界坐标折线吸附到当前实体的**一张面**上，或吸附到明确给出的若干相邻面上（faceIds，1–8 个），也可省略面号、按路径点就近推断相邻面链，再沿**各面局部法向**向内切槽。widthMm 或 widthLaw 给出的是完整槽宽，不是半宽，也不是 depthLaw 的切入量单位。depthMm 或 depthLaw 给出的是实际法向切入量，不是 curveSweep 椭圆的完整截面高度；刀具截面在投影路径上居中，完整椭圆高度为 2×切入量。这不是平面 slot 沿单一方向挤出，也不是 logo 的闭合区域等深凹刻，也不是测地线或平面草图自动投影。

当前范围：

- 可给出当前 body 的 faceId，或 faceIds（1–8 个面号），也可两者都省略。都必须给出 2–64 个已靠近目标面的世界点（吸附限 0.1 mm）。省略面号时，每个点吸附到 0.1 mm 内最近的当前面，并在成功后于 projectedGrooveReport.faceIdsInferred / faceIds 回读推断结果。
- 单面时只跟随这一张修剪面。列出或就近推断出多张面时，只有共享拓扑边的相邻面才能换面；跨越点先在共享边上做 32 段粗采样，再对采样局部极小区间做有界数值细化，减小三维折线长度；不再直接取粗网格点，但不保证复杂共享边上的全局极小值，也不是测地线。就近推断不会自动寻路，也不会在折线未靠近的面上搜索路线。换面后每一张面用各自的法向刀具分别下切，尖角处不做混圆。若一点同时靠近多张面，优先沿上一张面延续；否则拒绝并请改给 faceIds。
- 路径离开所列面、投影落到非周期开放边界之外、同一面上相邻点的面法向变化超过约 60°，或两段落在不相邻的面上，都会被拒绝；请沿路径加密点，并在 faceIds 中给出实际经过的相邻面。
- 折线在三维中按弦线插值后再吸附回当前段所在面，因此两点不会自动走长弧；弯面、柱面圆弧请自己给出足够密的点。
- 可用 depthLaw（数字或 spline.samples）让切入量沿路径变化。路径内部必须始终为正；只有端点可以为 0，并以该路径点做点收尾（projectedGrooveReport.zeroEndDepth / tipPoints）。不要把 curveSweep 的 depthLaw 数值原样搬过来：那边 1.6 通常只对应约 0.8 的切入量。
- 可用 widthLaw（数字或 spline.samples）让完整槽宽沿同一条已投影路径变化。它与 widthMm 同一单位，不是半宽。路径内部必须始终为正；只有端点可以为 0，并以该路径点做点收尾（projectedGrooveReport.zeroEndWidth / tipPoints）。widthLaw 与 depthLaw 可同时使用，但单位不同，减小宽度不等于减小切入量。任一规律在中途为 0 都会被拒绝。
- 已知限制：有理 B 样条面（例如椭球面片）上的零深度点收尾仍可能触发布尔不相交或无效结果；失败会拒绝提交并保留原实体，不代表所有自由曲面点收尾均已支持。
- 封闭轮廓凹刻仍用 logo；平面胶囊槽仍用 slot；不沿目标面法向的空间折线渐浅凹纹仍用 curveSweep spine 再 cut。

可选 pattern 模式（1.75.19）：当需要沿变径弯曲表面等距错列重复开放轮廓时，pointsMm 是靠近真实面的行引导线，pattern.points2dMm 是以毫米计的 [横向,顺流向] 开放轮廓。提供 spacingMm、1–3 个不同的 rowOffsetsMm 和显式 maxCount（1–48）；phaseFractions 逐行提供，默认 0/0.5/0。每行偏移后独立再投影、按自适应投影折线的数值弧长排布；所有轮廓顶点和自适应中点再落到同一真实 trimmed BRep 面。法向与残差回读使用同一个真实投影解的 UV，避免对同一点反复全局求解而切换到错误曲面分支。刀具在该投影轮廓上再采样8–64站，实际站点回读 details[].cutterPathMm；这不是逐段严格相同的有棱折线槽。maxProjectionMm 默认2且不超过5；layoutToleranceMm 默认0.03，是接受段的采样弓高容差，不是全局曲面拟合误差保证。

pattern 首版必须给恒定 widthMm/depthMm，不与 widthLaw/depthLaw 混用；只支持一张trimmed面，触及面边界/接缝、过大残差/法向转折、采样或实例预算超限会拒绝，不静默删轮廓。先在局部曲率变化片区验证，不直接生成几百份。它从原实体皮层凹刻，不增加悬浮片，不等于凸鳞曲面贴合、测地线绕面、自动融合或制造验收。成功后的 method 为 surface-projected-staggered-pattern，回读 rows[].lengthMm/phaseFraction/centers[].arcLengthMm、details[].path/normals、maxFootprintResidualMm、volumeIntegration 和 verifiedCutSampleCount。弧长是每行独立数值折线长度，不宣称精确测地等距；每个轮廓的两臂/中段有真实区域材料切除抽样，不能把全体积变小当作整片贴合证明。UI视觉另行验收。

成功后在当前实体读 projectedGrooveReport：method 为 surface-normal-spine，source 为 exact-brep-face-projection，并给出 faceIds、faceIdsInferred、crossingCount、faceGeomType、stationCount、startWidthMm、endWidthMm、startPenetrationMm、endPenetrationMm 和起止点。不要把报告或体积减少当成视觉验收。

## 小样

下面只是 feature.add 的 params 示意，不是完整 execute 请求。先 queryGeometry 确认柱面 faceId，再从当前 getTool({id:"projectedGroove"}) 读 schema 与提交方式，不复用旧实体 ID。

```json
{
  "faceId": 0,
  "pointsMm": [[9.397,3.420,10],[10,0,10],[9.397,-3.420,10]],
  "widthMm": 2,
  "depthMm": 0.8
}
```

配合半径 10 mm、高 20 mm、沿 +Z 的圆柱，路径在 z=10 的柱面上约 ±20°。切深 0.8 mm 沿柱面法向指向轴，中点附近材料应出现在 r≈9.2–10 一带；弦线中点内侧（约 x=7.7）不应被这条浅槽切到。用只读 measure({kind:"region",minMm,maxMm}) 比较柱面中点附近与弦线内侧的交集体积。总体积减少只证明某处切掉了材料。

沿面渐浅时改用 depthLaw，数值仍是切入量。例如 depthLaw 为 {"kind":"spline","samples":[[0,0.8],[1,0.2]]} 会在路径起点切入约 0.8 mm、终点约 0.2 mm。核对 projectedGrooveReport.startPenetrationMm 与 endPenetrationMm，并用同样的区域体积比较深浅两端。

沿面变槽宽时改用 widthLaw，数值是完整槽宽。例如 widthLaw 为 {"kind":"spline","samples":[[0,4],[1,1]]} 会在路径起点切出约 4 mm 宽、终点约 1 mm 宽的槽。核对 startWidthMm 与 endWidthMm，并用偏离中线的区域体积确认宽端切到、窄端未切到的肩部，不要只用总体积。

若要在立方体顶面走到侧面，可列出这两张相邻面的 faceIds，也可省略面号、让路径点就近推断；路径点可只给顶面上一点和侧面上一点。内核会在共享边上插入最短折线跨越点，而不会沿空间弦线切开角内，也不会在未靠近的面上自动寻路。用 kind:"region" 分别检查顶面、侧面路径附近以及角内对角区域。没有看图时写 NOT_REVIEWED。

