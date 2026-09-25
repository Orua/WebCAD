export const advancedNames = { autoRound:"整件圆边", smoothTransition: "平滑过渡", curveSweep: '曲线扫掠', advancedLoft: '高级放样', curvedLogo: '曲面 LOGO', fittedSurface: '拟合曲面', thickenFace:'选面增厚' };
export const advancedFields = {
  autoRound:[['radius','圆边半径',0.1,'positive']],
  smoothTransition:[['radius','过渡半径',0.1,'positive']],
  curveSweep: [['pathType','路径类型','arc',['arc','spline','segments']],['points','单段路径点','10,0,0\n7.0710678118654755,7.0710678118654755,0\n0,10,0','points3'],['segments','连续线弧段 JSON','[{"type":"line","points":[[0,0,0],[5,0,0]]},{"type":"arc","points":[[5,0,0],[7,2,0],[5,4,0]]}]','json'],['section','截面类型','round',['round','chamferedSquare','ellipse']],['radius','圆截面半径',1,'positive'],['sectionSize','倒角方线边长',2,'positive'],['sectionChamfer','倒角切入量',0.5,'positive'],['sectionWidth','椭圆正面料宽',2.9,'positive'],['sectionDepth','椭圆侧深',4.3,'positive'],['closed','分段路径闭合',false,'boolean'],['tolerance','样条公差',0.01,'positive']],
  advancedLoft: [['sections','截面 JSON','[{"z":0,"points":[[0,0],[10,0],[10,10],[0,10]]},{"z":10,"points":[[0,0],[8,0],[8,8],[0,8]]},{"z":20,"points":[[0,0],[6,0],[6,6],[0,6]]}]','json'],['ruled','直纹放样',false,'boolean'],['output','输出类型','solid',['solid','shell']]],
  curvedLogo: [['pointX','点击点 X（全局）',''],['pointY','点击点 Y（全局）',''],['pointZ','点击点 Z（全局）',''],['depth','加工深度',0.3,'positive'],['scale','LOGO 比例',1,'positive'],['angle','LOGO 旋转角',0],['offsetX','局部 X 偏移',0],['offsetY','局部 Y 偏移',0],['mirrorX','水平镜像',false,'boolean']]
  ,fittedSurface: [['points','曲面网格 JSON','[[[0,0,0],[1,0,0],[2,0,0]],[[0,1,0],[1,1,0.2],[2,1,0]],[[0,2,0],[1,2,0],[2,2,0]]]','json'],['tolerance','拟合公差',0.01,'positive']]
  ,thickenFace:[['thickness','法向厚度（正向或负向）',1,'nonzero']]
};
export const advancedNotes = {
  autoRound:'选一个实体，自动检测全部尖锐边，包括孔和文字边，统一倒圆。已相切接缝会跳过。半径过大或某条边无法处理时整步拒绝，不默默跳过。完成后在属性或建模历史中修改半径，可更圆或退回；0.1 mm 为示例。',
  smoothTransition:'按 Ctrl 选择相交的多个面，将这些面之间的尖锐接缝联动倒圆；交汇处也一起求解。选择整个外壳的面可处理外缘，文字面须另选。半径过大、自交或目标接缝仍尖锐时拒绝。与未选面的结束边界仍可能锐利，将单独报告。完成后可在属性修改原步骤半径，不重复叠加加工。默认 0.1 mm 是示例；预览后确认。',
  curveSweep:'圆弧恰好三个 XYZ 点；样条为 3–30 点的公差内逼近。segments 为 2–64 段连续直线/三点圆弧，前段末点须与后段起点相同；闭环须选 closed。round 使用半径；chamferedSquare 使用边长和倒角切入量；ellipse 独立输入正面料宽与侧深。非圆截面路径须同处 XY 平面。单位 mm。',
  advancedLoft:'2–12 个 XY 多边形截面，每项包含 z 与 points。z 递增、相同点数及绕序，并保持对应起点；取消直纹可生成平滑过渡。shell 是未封口曲面壳，不是实体。',
  fittedSurface:'输入 3–12 行 × 3–12 列 XYZ 点阵，相邻行列对应相邻位置。只拟合一张面，非任意散点自动重建；公差 0.00001–0.5 mm。生成后可选面增厚。',
  curvedLogo:'先选择单一封闭实体的一张曲面并点击中心（显示网格点在 0.1 mm 内吸附到精确面）。轮廓正交投影，再沿局部法向等深凹刻；不跨面、接缝，不允许穿壁，不支持凸字或拔模。',
  thickenFace:'将所选的一张面沿法向增厚成独立实体；正负控制方向。会替换原对象，仅保留选中面的增厚结果。偏移自交或过厚可能失败。平面另校验结果体积与面积×厚度一致；源面边界不一致或偏移改变轮廓时拒绝提交，不自动放宽公差。'
};
