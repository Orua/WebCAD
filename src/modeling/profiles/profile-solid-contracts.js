const operation = { type: 'string', enum: ['newBody', 'join', 'cut', 'intersect'], default: 'newBody', description: 'New body, or explicit material operation on the last target ref' };
const point = description => ({ type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' }, description });
const schema = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties: { operation, ...properties }, required });
const materialNotes = '精确 Face/Wire 来源与路径保留，join/cut/intersect 仅替换最后引用的明确单实体目标。只接受有效正体积单实体，无材料变化的加料/切除或分裂结果失败，失败不改来源。固定来源世界位置，不再次应用工作基准。';

export const profileSolidLabels = { profileRevolve: '轮廓旋转', profileSweep: '轮廓扫掠', profileLoft: '轮廓放样' };
export const profileSolidExamples = {
  profileRevolve: { operation: 'newBody', axisPoint: [0, 0, 0], axisDirection: [0, 1, 0], angleDeg: 360 },
  profileSweep: { operation: 'newBody', transitionMode: 'transformed', frenet: false },
  profileLoft: { operation: 'newBody', ruled: false },
};
export const profileSolidFields = {
  profileRevolve: [['operation', '结果', 'newBody', ['newBody', 'join', 'cut', 'intersect']], ['axisPoint', '轴上一点（世界 XYZ mm）', '[0,0,0]', 'json'], ['axisDirection', '轴方向（世界 XYZ）', '[0,1,0]', 'json'], ['angleDeg', '旋转角度 °', 360, 'positive']],
  profileSweep: [['operation', '结果', 'newBody', ['newBody', 'join', 'cut', 'intersect']], ['transitionMode', '路径拐角过渡', 'transformed', ['transformed', 'right', 'round']], ['frenet', '沿 Frenet 曲率标架', false, 'boolean']],
  profileLoft: [['operation', '结果', 'newBody', ['newBody', 'join', 'cut', 'intersect']], ['ruled', '直纹过渡', false, 'boolean']],
};

// min/max are unconditional API bounds; operation-specific counts are authoritative.
export const profileSolidRefCounts = {
  profileRevolve: { min: 1, max: 2, newBody: { min: 1, max: 1 }, modification: { min: 2, max: 2 }, sourceCount: 1 },
  profileSweep: { min: 2, max: 3, newBody: { min: 2, max: 2 }, modification: { min: 3, max: 3 }, sourceCount: 2 },
  profileLoft: { min: 2, max: 13, newBody: { min: 2, max: 12 }, modification: { min: 3, max: 13 }, sourceCount: '2–12' },
};
export const profileSolidOperations = {
  profileRevolve: {
    description: 'Rotate a saved exact planar section around an explicit world axis, with new-body, additive, subtractive or intersection result', refs: '>=1', refsMin: 1, refsMax: 2,
    paramsSchema: schema({ axisPoint: point('Fixed world point on the axis, mm'), axisDirection: point('Nonzero world axis direction; normalized by the kernel'), angleDeg: { type: 'number', exclusiveMinimum: 0, maximum: 360, description: 'Positive sweep angle in degrees, following axis direction by the right-hand rule' } }, ['axisPoint', 'axisDirection', 'angleDeg']),
    notes: `refs[0] 是一个闭合平面截面；加料/切除/交集另附 refs[1] 目标。轴须位于截面平面内；原生平面 Face 的内孔按原几何旋转。开轮廓、多区域、非平面或自交结果拒绝。${materialNotes}`,
  },
  profileSweep: {
    description: 'Sweep a saved exact section along a saved exact open path, with explicit material result', refs: '>=2', refsMin: 2, refsMax: 3,
    paramsSchema: schema({ transitionMode: { type: 'string', enum: ['transformed', 'right', 'round'], default: 'transformed' }, frenet: { type: 'boolean', default: false } }),
    notes: `refs[0] 截面，refs[1] 单一连续开放精确 Wire/Edge（或纯边 Compound）；加工模式另附 refs[2] 目标。路径方向由保存 Wire 的顺序决定；截面必须已在路径起点平面并垂直其起点切线，不自动居中/定位。首版无内孔截面、无闭合路径、无分叉，不提供变截面、导轨、扭转或自动减小半径。曲线保留为精确圆弧/样条，非离散折线。${materialNotes}`,
  },
  profileLoft: {
    description: 'Loft 2–12 saved exact sections in explicit order, with new-body or material-operation result', refs: '>=2', refsMin: 2, refsMax: 13,
    paramsSchema: schema({ ruled: { type: 'boolean', default: false } }),
    notes: `refs 按截面顺序排列 2–12 个闭合单外环平面对象；加工模式最后另附目标。复用 referenceLoft 的精确构造，不重新输入数值圆/矩形；相比 referenceLoft 新增加料、切除与交集。无内孔、导轨、端点相切/曲率连续条件或手工边对应，复杂不同拓扑必须检查结果。${materialNotes}`,
  },
};
