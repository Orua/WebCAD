export const xyz={type:'array',items:{type:'number',minimum:-10000,maximum:10000},minItems:3,maxItems:3};
export const index={type:'integer',minimum:0};
const refIndex={...index,maximum:15};
export const list=(items,minItems,maxItems)=>({type:'array',items,minItems,maxItems});
export const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
export const edge=object({refIndex,edgeId:index});
export const face=object({refIndex,faceId:index});
const point={oneOf:[xyz,object({...edge.properties,nearMm:xyz})]};
const tolerance={type:'number',minimum:0.001,maximum:0.05,default:0.01};
const seam=object({...edge.properties,faceId:index,continuity:{enum:['G0','G1','G2']}});
const refLimits={min:1,max:16};

export const freeformOperations={
  spatialSpline:{
    description:'空间样条曲线 / Interpolate ordered 3D points or fit them to tolerance',
    refs:{min:0,max:16},
    paramsSchema:object({points:list(point,2,64),closed:{type:'boolean'},method:{enum:['interpolate','fit']},toleranceMm:tolerance},['points','closed','method']),
    notes:'世界 XYZ 毫米，有序点可为坐标或当前精确边的端点。闭合插值至少三个不同的点，自动闭合。公差拟合用开放样条。结果是一条独立精确边，供填充、曲线网格和扫掠引用。',
  },
  networkSurface:{
    description:'双向曲线网格曲面 / B-spline surface constrained by two crossing families of exact curves',
    refs:refLimits,
    paramsSchema:object({uEdges:list(edge,2,6),vEdges:list(edge,2,6),toleranceMm:tolerance},['uEdges','vEdges']),
    notes:'两组边各按横向位置排序。每对纵横曲线要有唯一交点，首尾交点应在边的两端。通过两组曲线插值和交点修正生成真样条面，回读两组边的采样偏差。首版使用两端分开的开放边，并输出独立曲面。',
  },
  projectCurveOnFace:{
    description:'曲线投影与分面 / Directional projection onto a selected exact face',
    refs:refLimits,
    paramsSchema:object({target:face,curves:list(edge,1,8),direction:xyz,reach:{enum:['forward','both']},
      output:{enum:['curves','faces']}},['target','curves','direction','reach','output']),
    notes:'选单张精确目标面及来源边，使用世界方向向量投影。forward 从边出发沿正向，both 向双侧投影。曲线模式输出实际交线；分面模式输出独立的精确面片集合并核对覆盖面积。保留来源。',
  },
  surfaceBridge:{
    description:'双边光顺过渡面 / Bridge two separate supported edges with positional, tangent or curvature constraints',
    refs:refLimits,
    paramsSchema:object({a:seam,b:seam,pairing:{enum:['direct','reverse']},
      tension:{type:'number',minimum:0.25,maximum:1.5,default:0.6},toleranceMm:tolerance},['a','b','pairing']),
    notes:'在两条分开的开放边之间新建曲面，每条边选择所属的邻面和连续性。direct 连接同参数方向的两端，reverse 交叉指定对应端。张力控制两端接入侧曲线的尺度。对最后生成的面核对接缝偏差、法向和曲率。',
  },
  replaceSurfacePatch:{
    description:'局部换面并缝回实体 / Replace selected solid faces with exact compatible patches',
    refs:{min:2,max:16},
    paramsSchema:object({removeFaceIds:list(index,1,12),patches:list(face,1,12),toleranceMm:tolerance},['removeFaceIds','patches']),
    notes:'refs 第一项为单一原实体，removeFaceIds 取该实体的当前面编号。替换面选自其余来源。先验证原面片与替换面片的自由边界（含内孔）相配，再与保留的面缝回唯一有效闭合实体。保留源实体。',
  },
};

export const freeformNames={
  spatialSpline:'空间样条曲线',networkSurface:'双向曲线网格曲面',
  projectCurveOnFace:'曲线投影与分面',surfaceBridge:'双边光顺过渡面',replaceSurfacePatch:'局部换面',
};
export const freeformExamples={
  spatialSpline:{points:[[0,0,0],[7,2,3],[15,5,1]],closed:false,method:'interpolate'},
  networkSurface:{uEdges:[{refIndex:0,edgeId:0},{refIndex:0,edgeId:1}],vEdges:[{refIndex:0,edgeId:2},{refIndex:0,edgeId:3}]},
  projectCurveOnFace:{target:{refIndex:0,faceId:0},curves:[{refIndex:0,edgeId:0}],direction:[0,0,-1],reach:'both',output:'curves'},
  surfaceBridge:{a:{refIndex:0,edgeId:0,faceId:0,continuity:'G1'},b:{refIndex:0,edgeId:1,faceId:1,continuity:'G2'},pairing:'reverse'},
  replaceSurfacePatch:{removeFaceIds:[0],patches:[{refIndex:1,faceId:0}]},
};
export const freeformResultTypes={
  spatialSpline:['edge'],networkSurface:['face'],projectCurveOnFace:['wire','face'],
  surfaceBridge:['face'],replaceSurfacePatch:['solid'],
};
export const freeformIds=Object.freeze(Object.keys(freeformOperations));
export const freeformErrors={
  spatialSpline:['FREEFORM_REFERENCE','FREEFORM_CURVE','FREEFORM_TOLERANCE'],
  networkSurface:['FREEFORM_REFERENCE','FREEFORM_NETWORK','FREEFORM_TOLERANCE'],
  projectCurveOnFace:['FREEFORM_REFERENCE','FREEFORM_PROJECTION'],
  surfaceBridge:['FREEFORM_REFERENCE','FREEFORM_BRIDGE','SURFACE_FILL_BOUNDARY','SURFACE_FILL_SOLVER','SURFACE_FILL_TOLERANCE'],
  replaceSurfacePatch:['FREEFORM_REFERENCE','FREEFORM_REPLACE','FREEFORM_TOLERANCE'],
};

export const analysisKeys=['context','mode','bodyId','edgeId','faceIds','direction','grid','thresholdMm',
  'samples','zebraDirection','stripes','showInView'];
