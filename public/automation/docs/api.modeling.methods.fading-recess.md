# api.modeling.methods.fading-recess

# 沿线渐浅凹纹：需求、刀具与能力边界

## 先确认能做什么

现有路线是 curveSweep 的 spine 变截面实体刀具，再 cut 目标实体；不是自动曲面投影，也不做下切表面跟随。depthLaw/widthLaw 在路径内部必须始终为正；只有脊线端点可以为 0，内核会在该路径点做点收尾（loftReport.zeroEndDepth / tipPoints），而不是生成退化椭圆。沿面法向槽（含 depthLaw 切入量变化、widthLaw 完整槽宽变化，以及在共享边上延续到相邻面的 faceIds）请改读 projectedGroove 与[沿面法向投影刻槽](api.modeling.methods.projected-groove)。projectedGroove 的 depthLaw 不是本路线椭圆全高；不要把这里的 1.6/0.2 原样搬过去。不要从命中本路线或端点为 0 推断已经支持测地线或草图投影刻槽。平面等深槽改读 slot 卡。

## 深度不是宽度，也不是刀具中心高度

widthLaw/depthLaw 都必须始终为正。椭圆的 depthLaw 是完整截面尺寸，不是实际切入目标表面的深度；中心线位于平面上且深度方向垂直该面时，切入量才约为半轴 depthLaw/2。中心线偏移、曲面法向和 roll 都会改变实际切深。只缩 widthLaw 不等于渐浅，刀具浮在表面之上也不会得到凹纹。

先在独立平板小样上固定坐标、法向和尺寸。下面仅是 curveSweep 的 params 小样，不是完整 execute 请求；从当前 getTools 卡读取 context、refs 和提交方式，不复用旧实体 ID。先将工作坐标与此小样坐标对齐，避免当前插入框架额外平移/旋转。完整卡片按需逐张读取，curveSweep 卡可能超过默认 32000 字符预算；离线读取须检查 omitted 状态并使用足够预算（单卡上限 64000），不能拿摘要当作完整契约。

```json
{
  "pathType": "spine",
  "spine": {"kind": "polyline", "pointsMm": [[2,3,8],[18,3,8]]},
  "stations": {"count": 8},
  "widthLaw": 1,
  "depthLaw": {"kind": "spline", "samples": [[0,1.6],[1,0.2]]},
  "rollMode": "absolute",
  "section": "ellipse"
}
```

配合范围为 [0,0,0] 到 [20,6,8] mm 的平板，小样刀具中心线在顶面 z=8，深端理论切入约 0.8 mm，浅端约 0.1 mm；不是 1.6/0.2 mm。若要把浅端收到真正的零深度，把 depthLaw 终点改为 0 即可，并核对 loftReport.zeroEndDepth.end 与 tipPoints.end。路径内部仍须保持正深度。先确认刀具相交，再 cut；沿当前回执重新取得目标实体 ID 和 revision。

## 局部证据与恢复

- 总体积减少只证明某处切掉了材料，不能证明沿线渐浅。优先用只读 measure({kind:"region",minMm,maxMm}) 测量深端和浅端同等大小的轴对齐区域：比较交集体积，深端应更少；source 为 exact-brep-aabb-intersection。这不改 revision，也不回填实体整体体积。不要用唯一工作实体做 destructive intersect；若仍用 intersect，只能在独立诊断副本上进行，测量空结果前先确认是否还有实体。
- 路径内部出现 0 或负数会被拒绝，保留原件并只改中途规律，不要反复重试相同参数。若已请求端点为 0，却与 round 等端帽冲突，先去掉冲突的 cap 或改回正深度。刀具无交集时检查中心线、截面方向与单位，不用增大宽度掩盖深度/定位错误。
- 实体有效、体积减少不等于视觉合格。用一致光照和视角检查端部封口、痕迹连续性与高光；没有看图时写 NOT_REVIEWED，不能宣称视觉验收通过。

整体体块与控制笼工作流见[有机雕刻](api.modeling.methods.organic-form)。

