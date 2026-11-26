const xyz={type:'array',items:{type:'number',minimum:-10000,maximum:10000},minItems:3,maxItems:3};
const mode=(kind,properties={},required=[])=>({type:'object',additionalProperties:false,
  properties:{kind:{const:kind},...properties},required:['kind',...required]});

export const surfaceSculptOperation={
  description:'局部曲面变形 / Local soft deformation of an existing STEP face',refs:1,
  paramsSchema:{type:'object',additionalProperties:false,required:['faceId','scope','direction','amountMm','influenceMm'],properties:{
    faceId:{type:'integer',minimum:0,description:'Zero-based ID of the current exact B-spline face'},
    scope:{oneOf:[mode('point',{pointMm:xyz},['pointMm']),mode('region',{
      pointsMm:{type:'array',items:xyz,minItems:3,maxItems:32,description:'Ordered vertices picked on the same face; the loop closes automatically'}
    },['pointsMm'])]},
    direction:{oneOf:[mode('normal'),mode('angled',{
      tiltDeg:{type:'number',minimum:0,maximum:90,description:'Tilt away from the outward face normal'},
      azimuthDeg:{type:'number',minimum:-360,maximum:360,description:'Azimuth from the U tangent towards normal cross U'}
    },['tiltDeg','azimuthDeg']),mode('vector',{vector:xyz},['vector'])]},
    amountMm:{type:'number',minimum:-20,maximum:20,not:{const:0},description:'Signed displacement along the resolved direction in mm'},
    influenceMm:{type:'number',minimum:0.15,maximum:60,description:'Distance from the point, or decay width outside the selected region, in mm'}
  }},
  notes:'编辑一个有效实体或一张独立面上的非周期 B 样条。点或有序闭合区域以当前实体的世界坐标毫米输入，投影到精确选面。沿法线、带倾角与方位角或显式世界向量推压，位移在影响范围内向外平滑衰减。面外轮廓、所有内环、共边及邻面锁定。使用孤立样条控制点局部形变，保留真曲面与 STEP 导出。解析面、周期面、共享同一曲面支撑的多个面和超出容量的范围会明确拒绝。'
};
export const surfaceSculptExample={faceId:0,scope:{kind:'point',pointMm:[12,5,3]},
  direction:{kind:'angled',tiltDeg:30,azimuthDeg:0},amountMm:0.8,influenceMm:4};
export const surfaceSculptErrors=['SCULPT_UNSUPPORTED_FACE','SCULPT_OUTSIDE_FACE','SCULPT_INVALID_REGION',
  'SCULPT_CAPACITY','SCULPT_BOUNDARY_CHANGED','SCULPT_FOLD','SCULPT_DISPLACEMENT_UNMET'];
