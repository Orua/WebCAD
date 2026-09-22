export const advancedNames = { curveSweep: '曲线扫掠', advancedLoft: '高级放样', curvedLogo: '曲面 LOGO', fittedSurface: '拟合曲面', thickenFace:'选面增厚' };
export const advancedFields = {
  curveSweep: [['pathType','路径类型','arc',['arc','spline']],['points','路径点','10,0,0\n7.0710678118654755,7.0710678118654755,0\n0,10,0','points3'],['radius','圆截面半径',1,'positive'],['tolerance','样条公差',0.01,'positive']],
  advancedLoft: [['sections','截面 JSON','[{"z":0,"points":[[0,0],[10,0],[10,10],[0,10]]},{"z":10,"points":[[0,0],[8,0],[8,8],[0,8]]},{"z":20,"points":[[0,0],[6,0],[6,6],[0,6]]}]','json'],['ruled','直纹放样',false,'boolean'],['output','输出类型','solid',['solid','shell']]],
  curvedLogo: [['pointX','点击点 X（全局）',''],['pointY','点击点 Y（全局）',''],['pointZ','点击点 Z（全局）',''],['depth','加工深度',0.3,'positive'],['scale','LOGO 比例',1,'positive'],['angle','LOGO 旋转角',0],['offsetX','局部 X 偏移',0],['offsetY','局部 Y 偏移',0],['mirrorX','水平镜像',false,'boolean']]
  ,fittedSurface: [['points','曲面网格 JSON','[[[0,0,0],[1,0,0],[2,0,0]],[[0,1,0],[1,1,0.2],[2,1,0]],[[0,2,0],[1,2,0],[2,2,0]]]','json'],['tolerance','拟合公差',0.01,'positive']]
  ,thickenFace:[['thickness','法向厚度（正向或负向）',1,'nonzero']]
};
export const advancedNotes = {
  curveSweep:'圆弧恰好三个 XYZ 点；样条为 3–30 点的公差内逼近，不保证严格穿点。圆截面，单位 mm。',
  advancedLoft:'2–12 个 XY 多边形截面，每项包含 z 与 points。z 递增、相同点数及绕序，并保持对应起点；取消直纹可生成平滑过渡。shell 是未封口曲面壳，不是实体。',
  fittedSurface:'输入 3–12 行 × 3–12 列 XYZ 点阵，相邻行列对应相邻位置。只拟合一张面，非任意散点自动重建；公差 0.00001–0.5 mm。生成后可选面增厚。',
  curvedLogo:'先选择单一封闭实体的一张曲面并点击中心（显示网格点在 0.1 mm 内吸附到精确面）。轮廓正交投影，再沿局部法向等深凹刻；不跨面、接缝，不允许穿壁，不支持凸字或拔模。',
  thickenFace:'将所选的一张面沿法向增厚成独立实体；正负控制方向。会替换原对象，仅保留选中面的增厚结果。偏移自交或过厚可能失败。'
};
