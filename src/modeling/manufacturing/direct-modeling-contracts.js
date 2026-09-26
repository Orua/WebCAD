// Shared public cards, strict schemas and UI fields. Geometry remains in the Worker.
const vector3={type:'array',minItems:3,maxItems:3,items:{type:'number'}};
const signedDistance={type:'number',not:{const:0},description:'Signed exact normal distance in mm; positive follows the outward/oriented normal.'};
const schema=(properties,required)=>({type:'object',additionalProperties:false,properties,required});

export const directModelingNames={offsetSolid:'实体偏置',offsetSurface:'偏置面',draftByPlane:'平面拔模'};
export const directModelingNotes={
  offsetSolid:'选一个封闭实体，对全部边界面作等距偏置。正值向外，负值向内；交角保留尖角，圆接生成圆角过渡。替换来源。首版仅解析平面、圆柱、圆台、球面和环面；尖锥退化点、样条面、曲率半径塌陷、局部自交和分裂结果拒绝，不自动减小距离或放宽公差。结果检查有效性、面积、体积及解析局部曲率域；复杂多面不保证任意全局自交均能诊断。不是按比例缩放，也不是抽壳。',
  offsetSurface:'显式选择当前对象的一张面，沿该面的有向法线作等距偏置，生成独立面并保留整个来源。正负控制方向；平面保持边界面积，曲面半径和面积会改变。首版仅解析平面、圆柱、圆台、球面和环面，并检查解析局部曲率域；尖锥退化点和样条面不支持。不生成厚度，不推拉实体，不缝合多面或自动延伸相邻面。',
  draftByPlane:'选择一个封闭实体的当前平面、圆柱或圆锥面，指定固定中性平面、拉出方向和有符号角度。中性面法线须平行或反平行拉出方向。直壁正角在拉出方向一侧减料，负角加料；圆锥面指定目标锥角而非累加原角，材料变化须回读。保留中性平面交线。相切链中需要联动的面必须全部显式列入 faceIds，否则整步拒绝。替换来源；不受六面棱柱限制，但不支持改变拓扑的拔模、样条面或自动判断脱模方向。',
};
export const directModelingOperations={
  offsetSolid:{description:'Exact signed offset of all boundary faces of one solid',refs:1,paramsSchema:schema({distanceMm:signedDistance,join:{type:'string',enum:['intersection','round']}},['distanceMm','join']),notes:directModelingNotes.offsetSolid},
  offsetSurface:{description:'Create one exact normal-offset face while preserving its source body',refs:1,paramsSchema:schema({faceId:{type:'integer',minimum:0},distanceMm:signedDistance},['faceId','distanceMm']),notes:directModelingNotes.offsetSurface},
  draftByPlane:{description:'Draft explicitly selected analytic faces about an explicit neutral plane',refs:1,paramsSchema:schema({faceIds:{type:'array',minItems:1,maxItems:200,uniqueItems:true,items:{type:'integer',minimum:0}},neutralPoint:{...vector3,description:'World XYZ point on the fixed neutral plane (mm)'},neutralNormal:{...vector3,description:'Nonzero world plane normal, parallel to pullDirection'},pullDirection:{...vector3,description:'Nonzero explicit world pull direction'},angleDeg:{type:'number',exclusiveMinimum:-45,exclusiveMaximum:45,not:{const:0}}},['faceIds','neutralPoint','neutralNormal','pullDirection','angleDeg']),notes:directModelingNotes.draftByPlane},
};
export const directModelingStrictDefinitions=Object.fromEntries(Object.entries(directModelingOperations).map(([id,definition])=>[id,{paramsSchema:definition.paramsSchema,defaults:{},preservesInputs:id==='offsetSurface',topology:id!=='offsetSolid'}]));
// Numeric face indices below are placeholders. Resolve the current source's
// exact faces before executing; these values do not identify a spatial side.
export const directModelingExamples={
  offsetSolid:{distanceMm:1,join:'intersection'},
  offsetSurface:{faceId:0,distanceMm:1},
  draftByPlane:{faceIds:[0],neutralPoint:[0,0,0],neutralNormal:[0,0,1],pullDirection:[0,0,1],angleDeg:2},
};
export const directModelingFields={
  offsetSolid:[['distanceMm','偏置距离 mm（有符号）',1,'nonzero'],['join','边角连接','intersection',['intersection','round']]],
  offsetSurface:[['distanceMm','法向偏置 mm（有符号）',1,'nonzero']],
  draftByPlane:[['neutralPoint','中性平面世界点 XYZ','[0,0,0]','json'],['neutralNormal','中性平面法线 XYZ','[0,0,1]','json'],['pullDirection','拉出方向 XYZ','[0,0,1]','json'],['angleDeg','拔模角度 °（有符号）',2,'nonzero']],
};
