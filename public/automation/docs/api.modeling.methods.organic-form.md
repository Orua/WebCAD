# api.modeling.methods.organic-form

# 有机体块、局部雕刻与渐缩弯体

先做一个容易辨认的小样，冻结尺寸、主方向、两个关键轮廓和要保持的位置。验收先看正、侧和三分之四视图，再读有效实体数、包围盒与局部测量。

- 不对称体块或凹果窝：用 subdBody 的封闭四边控制笼先定宽扁与凹凸。push/inflate 沿法向增减，move 配 deltaMm 按明确方向拖动控制点，smooth 小步平均。需要保住相邻体块时，在该笔填写 protectVertexIds（原始控制笼顶点序号）。看 brushReport 的 affectedControlPoints、protectedInRange 和警告；实际移动后才能判定笔刷生效。钉住控制点并不锁定拟合曲面。面预算含额外一层收敛检查。
- 连续弯曲、沿程变粗细：用 curveSweep 的 spine、widthLaw 与 depthLaw。新特征默认绝对滚转。全椭圆截面保持标架对应，避免截面被重新对接造成折颈。固定一个角度后改变站数，截面不应随站数越扭越多。检查 loftReport.ratio 与多视角连续外轮廓，实测后再提高采样。
- 实体加局部体积：先确认工具确实与对应表面相交。连续两次使用 bumpSet 时按回执换用当前实体 ID。指定接缝修顺半径后，查看圆角回执、材料增加和单一实体证据。union 返回覆盖丢失时保留全部源件，不能以总体积或渲染效果替代覆盖。
- 编辑带支撑的局部曲面网格：meshReliefEdit 使用当前网格哈希、明确投影方向、实际表面种子与保护区。可编辑的是可投影为单值高度的局部，保持三角拓扑。整体任意三维变形要另外确认当前环境的可执行工具。

## 连续体块先行，而不是贴块后修接缝

额头、眉峰、颧部等需要连续高光的区域，先在同一个控制笼或同一片连续拟合曲面上建立主坡度，再添加小特征。union 只连接材料，不保证接缝的切向或曲率连续；BRep 有效、一个 solid、体积增加都不是光顺验收。用固定光照的正面、侧面和斜面比较轮廓与高光，没看图时只能写“数值通过，视觉未验证”。

|表示/工具|适用范围|不要误认|
|---|---|---|
|subdBody|封闭四边笼的整体体量、局部拖拽与凹凸|笔刷作用于原始控制笼，不是在最终细分面上雕刻；protectVertexIds 只固定列出的控制点，不锁定拟合曲面|
|curveSweep spine / guidedLoft|沿程可控截面、弯曲渐缩体和连续块面|更多站点不自动改善造型；新配方显式 rollMode:absolute，旧 incremental 的滚转逐站累计|
|fittedSurface|点阵控制的单片曲面|输出是面，不是可直接布尔的封闭实体；按当前卡完成加厚/封闭再测量|
|meshReliefEdit / relief|当前契约支持的局部高度场|不能用单值投影表达下切、背面或任意三维拓扑|

渐消凹纹的刀具定位、截面尺寸与局部验收见[沿线渐浅凹纹](api.modeling.methods.fading-recess)。单面世界折线的沿面法向等深槽见[单面沿面法向投影刻槽](api.modeling.methods.projected-groove)。

## 从大形到渐消细节

1. connect/route 选择本路线，getTools 只取所选分支的完整卡；核对参数、当前 context、表示与 canExecute，不调用隐藏几何入口。
2. 在独立小样固定尺寸和视角，用少量宽范围 move/push/smooth 形成连续主块。核对 affectedControlPoints 和 maxDisplacementMm；未命中时调整控制笼/半径，而不是盲目增加强度。
3. 次级凹凸先在同一连续表示上减小笔刷位移。smooth 径向衰减只在半径边界渐消，不是沿线深度规律。沿线渐消凹纹用 curveSweep 的 spine 与 widthLaw/depthLaw 生成刀具，再 cut 到目标实体；不能把“减小宽度”当作“减小深度”。路径内部须保持正深度；只有端点可以为 0，并由点收尾闭合。用 kind:region 的局部体积确认深端比浅端多切除材料。单面世界折线的沿面法向槽用 projectedGroove，可用 depthLaw 做实际切入量的沿线变化（不是完整截面高度）；不是任意曲面、跨面或草图投影；也不要用浮起的细管冒充凹纹；平面等深槽才用 slot。
4. 一次多凸点可用 bumpSet 的 bumps 数组，只做一次当前接缝修顺。增量再做一批时，当前已雕刻结果是一个新操作数，历史接缝不保证等同一次批量；失败先保留已成功实体，用新 ID 和当前卡复现差异，不把重复并集当作连续曲面塑形。
5. 必须接成一体的 union 用 requireConnected:true。可在高风险局部连接增加 verifyMaterial:true：本地逐输入做 source-minus-result 精确差集，检查 booleanReport.materialCoverage 的每件 missingVolumeMm3 与 toleranceMm3；它在接缝修顺之前运行，会增加每输入一次布尔成本，Services 暂不支持。默认的体积与外包围范围只是必要检查，不能证明内包围范围内的材料没有丢失；覆盖验证也不证明光顺或没有多余材料。
6. 每个稳定阶段保存外部配方（原始笼、笔刷数组、截面/规律和逻辑引用）与原生工程。按 api.guide.files 完成 save → read → 宿主写入 → SHA256/大小确认，在独立文档 reopen 后复测实体数、包围盒与体积。.webcad 保存最终几何，不保证保留可重建的笔刷/历史；没有落盘回执不能宣称已保存。
7. 超时或 unknown 先查原作业与当前 revision，不重复提交。明确失败则保留最后稳定阶段及诊断，只缩小实验范围来定位；不能偷偷降低几何标准、丢弃失败细节或自动扩大公差。内核失效后先恢复健康实例，再从已确认保存点继续。

