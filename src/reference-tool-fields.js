export const referenceNames = {
  planeSection: '提取真实截面', faceBoundary: '提取面边界',
  extractFaces: '提取指定面', extractShell:'提取壳',
  sewFaces: '曲面缝合', surfaceTrim: '实体修剪面',
};
export const referenceFields = {
  planeSection: [['plane','截面平面','XY',['XY','XZ','YZ']],['offset','平面坐标',0]],
  faceBoundary: [['boundary','提取范围','all',['all','outer']]],
  extractFaces: [['faceIds','面编号 JSON（留空使用当前选面）','[]','json']],
  extractShell: [['shellIndex','壳序号（从 0 开始）',0,'integer']],
  sewFaces: [['tolerance','缝合公差 mm',0.01,'positive'],['makeSolid','要求闭合实体',false,'boolean']],
  surfaceTrim: [['faceId','第一个对象的面编号',0],['mode','保留部分','intersect',['intersect','cut']]],
};
export const referenceNotes = {
  planeSection:'选择一个源对象，提取与指定平面的真实交线，保留原对象。XY 的坐标为 Z，XZ 为 Y，YZ 为 X。结果是精确线框，不是实体。',
  faceBoundary:'先选中一张面。all 提取包括内孔在内的全部边界；outer 明确只提取外环，不带孔。保留源模型，生成精确线框。单闭环可接参考轮廓拉伸/放样；带孔拉伸应使用完整平面面，不能把忽略内孔的外环当成原件。',
  extractFaces:'先在一个实体上选择一个或多个面。faceIds 是该实体当前拓扑快照中的零起始面编号，必须非空、整数、互不重复且在范围内。单面返回保留孔环的面副本；多面返回由面副本组成的复合体。保留原对象，不缝合、不补洞、不生成实体。',
  extractShell:'先选中包含多个壳的对象。shellIndex 是当前对象壳拓扑顺序中的零起始索引，必须是范围内整数。提取选中壳的副本并保留原对象，不自动填成实体；闭壳可单独交给曲面缝合并要求生成实体。',
  sewFaces:'选择一个或多个含面的对象。公差控制边缝合，不自动补洞。勾选实体时必须闭合且有效，否则报错；未勾选可得到开放壳。',
  surfaceTrim:'按顺序选两个对象：第一个为待修剪面所在对象，第二个为实体刀具。填写第一对象的面编号；intersect 保留实体内部，cut 保留外部。保留源对象；不是任意曲线修剪或自动补面。',
};
export const referenceOperations = {
  planeSection:{description:referenceNotes.planeSection,refs:1,paramsSchema:{type:'object',additionalProperties:false,properties:{plane:{type:'string',enum:['XY','XZ','YZ']},offset:{type:'number'}}}},
  faceBoundary:{description:referenceNotes.faceBoundary,refs:1,paramsSchema:{type:'object',additionalProperties:false,required:['faceId'],properties:{faceId:{type:'integer',minimum:0},boundary:{type:'string',enum:['all','outer']}}}},
  extractFaces:{description:referenceNotes.extractFaces,refs:1,paramsSchema:{type:'object',additionalProperties:false,required:['faceIds'],properties:{faceIds:{type:'array',minItems:1,uniqueItems:true,items:{type:'integer',minimum:0}}}}},
  extractShell:{description:referenceNotes.extractShell,refs:1,paramsSchema:{type:'object',additionalProperties:false,required:['shellIndex'],properties:{shellIndex:{type:'integer',minimum:0}}}},
  sewFaces:{description:referenceNotes.sewFaces,refs:'>=1',paramsSchema:{type:'object',additionalProperties:false,properties:{tolerance:{type:'number',exclusiveMinimum:0,maximum:0.5},makeSolid:{type:'boolean'}}}},
  surfaceTrim:{description:referenceNotes.surfaceTrim,refs:2,paramsSchema:{type:'object',additionalProperties:false,required:['faceId'],properties:{faceId:{type:'integer',minimum:0},mode:{type:'string',enum:['intersect','cut']}}}},
};
