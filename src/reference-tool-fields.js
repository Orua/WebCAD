export const referenceNames = {
  planeSection: '提取真实截面', faceBoundary: '提取面边界',
  sewFaces: '曲面缝合', surfaceTrim: '实体修剪面',
};
export const referenceFields = {
  planeSection: [['plane','截面平面','XY',['XY','XZ','YZ']],['offset','平面坐标',0]],
  faceBoundary: [['boundary','提取范围','all',['all','outer']]],
  sewFaces: [['tolerance','缝合公差 mm',0.01,'positive'],['makeSolid','要求闭合实体',false,'boolean']],
  surfaceTrim: [['faceId','第一个对象的面编号',0],['mode','保留部分','intersect',['intersect','cut']]],
};
export const referenceNotes = {
  planeSection:'选择一个源对象，提取与指定平面的真实交线，保留原对象。XY 的坐标为 Z，XZ 为 Y，YZ 为 X。结果是精确线框，不是实体。',
  faceBoundary:'先选中一张面。all 提取包括内孔在内的全部边界；outer 明确只提取外环，不带孔。保留源模型，生成精确线框。单闭环可接参考轮廓拉伸/放样；带孔拉伸应使用完整平面面，不能把忽略内孔的外环当成原件。',
  sewFaces:'选择一个或多个含面的对象。公差控制边缝合，不自动补洞。勾选实体时必须闭合且有效，否则报错；未勾选可得到开放壳。',
  surfaceTrim:'按顺序选两个对象：第一个为待修剪面所在对象，第二个为实体刀具。填写第一对象的面编号；intersect 保留实体内部，cut 保留外部。保留源对象；不是任意曲线修剪或自动补面。',
};
export const referenceOperations = {
  planeSection:{description:referenceNotes.planeSection,refs:1,paramsSchema:{type:'object',additionalProperties:false,properties:{plane:{type:'string',enum:['XY','XZ','YZ']},offset:{type:'number'}}}},
  faceBoundary:{description:referenceNotes.faceBoundary,refs:1,paramsSchema:{type:'object',additionalProperties:false,required:['faceId'],properties:{faceId:{type:'integer',minimum:0},boundary:{type:'string',enum:['all','outer']}}}},
  sewFaces:{description:referenceNotes.sewFaces,refs:'>=1',paramsSchema:{type:'object',additionalProperties:false,properties:{tolerance:{type:'number',exclusiveMinimum:0,maximum:0.5},makeSolid:{type:'boolean'}}}},
  surfaceTrim:{description:referenceNotes.surfaceTrim,refs:2,paramsSchema:{type:'object',additionalProperties:false,required:['faceId'],properties:{faceId:{type:'integer',minimum:0},mode:{type:'string',enum:['intersect','cut']}}}},
};
