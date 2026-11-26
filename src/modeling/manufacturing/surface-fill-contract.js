const xyz = {type:'array', items:{type:'number', minimum:-10000, maximum:10000}, minItems:3, maxItems:3};
const refIndex = {type:'integer', minimum:0, maximum:15};
const topologyId = {type:'integer', minimum:0};
const object = (properties, required = Object.keys(properties)) => ({
  type:'object', additionalProperties:false, properties, required,
});
const kind = (value, properties = {}) => object({kind:{const:value}, ...properties});
const edgeRef = {refIndex, edgeId:topologyId};
const point = {oneOf:[xyz, object({...edgeRef, nearMm:{
  ...xyz, description:'World-space pick near one exact endpoint of the specified edge',
}})]};
const list = (items, minItems, maxItems) => ({type:'array', items, minItems, maxItems});
const position = kind('G0', edgeRef);
const supported = level => kind(level, {...edgeRef, supportFaceId:topologyId});

export const surfaceFillOperation = {
  description:'约束填充曲面 / Fill a closed boundary with a smooth constrained surface',
  refs:{min:0, max:16},
  paramsSchema:object({
    boundary:{oneOf:[
      kind('points', {curve:{enum:['smooth','segments']}, points:list(point,3,24)}),
      kind('edges', {edges:list({oneOf:[position,supported('G1'),supported('G2')]},1,24)}),
    ]},
    points:list(point,0,32),
    guideEdges:list(object(edgeRef),0,8),
    toleranceMm:{type:'number', minimum:0.001, maximum:0.05, default:0.01},
    output:{oneOf:[
      kind('surface'),
      kind('thickened',{thicknessMm:{type:'number', minimum:-20, maximum:20, not:{const:0}}}),
    ]},
  }, ['boundary','output']),
  notes:'使用世界坐标毫米，或通过 refs 中的当前精确对象定位边、邻面和边端点。依序输入边界点可生成周期插值曲线或折线；模型边必须组成唯一闭环。内点及导向边控制起伏。G1/G2 需要由选定邻面拥有该边。公差约束位置误差；切向与曲率分别由内核报告。可输出真实样条面或给定法向厚度的有效实体。使用现有缝合转实体将填充面与完整封闭外壳组合。源几何保留。',
};

export const surfaceFillExample = {
  boundary:{kind:'points',curve:'smooth',points:[[-11,-4,0],[-6,-9,0],[6,-8,0],[12,1,0],[5,9,0],[-8,6,0]]},
  points:[[0,0,2.4]], output:{kind:'thickened',thicknessMm:-1.2},
};

export const surfaceFillErrors = [
  'SURFACE_FILL_REFERENCE','SURFACE_FILL_BOUNDARY','SURFACE_FILL_SUPPORT',
  'SURFACE_FILL_SOLVER','SURFACE_FILL_TOLERANCE','SURFACE_FILL_THICKNESS',
];
