# api.modeling.methods.projected-groove

# 单面沿面法向投影刻槽：第一刀范围与验收

## 先确认能做什么

projectedGroove 把一条世界坐标折线吸附到当前实体的**一张面**上，再切一条槽宽恒定、沿**局部面法向**向内切入的等深槽。刀具截面在投影路径上居中，depthMm 是实际法向切入量，完整椭圆高度为 2×depthMm。这不是平面 slot 沿单一方向挤出，也不是 logo 的闭合区域等深凹刻。

当前只覆盖这一刀：

- 必须给出当前 body 的 faceId，以及 2–64 个已靠近该面的世界点（吸附限 0.1 mm）。
- 只跟随这一张修剪面。路径离开该面、投影落到非周期边界之外，或相邻点的面法向变化超过约 60°，都会被拒绝；请沿路径加密点，不要一次跨过可见半周或另一张面。
- 折线在三维中按弦线插值后再吸附回面，因此两点不会自动走长弧或测地线；弯面、柱面圆弧请自己给出足够密的点。
- 槽宽和切深这一刀是常数，没有 widthLaw/depthLaw，也不能跨面连续。
- 封闭轮廓凹刻仍用 logo；平面胶囊槽仍用 slot；沿线渐浅凹纹仍用 curveSweep spine 再 cut。

成功后在当前实体读 projectedGrooveReport：method 为 surface-normal-spine，source 为 exact-brep-face-projection，并给出 faceGeomType、stationCount、penetrationMm 和起止点。不要把报告或体积减少当成视觉验收。

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

配合半径 10 mm、高 20 mm、沿 +Z 的圆柱，路径在 z=10 的柱面上约 ±20°。切深 0.8 mm 沿柱面法向指向轴，中点附近材料应出现在 r≈9.2–10 一带；弦线中点内侧（约 x=7.7）不应被这条浅槽切到。用只读 measure({kind:"region",minMm,maxMm}) 比较柱面中点附近与弦线内侧的交集体积。总体积减少只证明某处切掉了材料。没有看图时写 NOT_REVIEWED。

