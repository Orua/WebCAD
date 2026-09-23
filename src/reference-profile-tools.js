// Public cards and UI fields for exact reference-driven reconstruction operations.
export const referenceProfileNames = {
  referenceExtrude: '参考轮廓拉伸',
  referenceLoft: '参考截面放样',
};
export const referenceProfileFields = {
  referenceExtrude: [['direction','世界方向 XYZ','[0,0,1]','json'], ['distance','拉伸距离 mm',3,'nonzero']],
  referenceLoft: [['ruled','直纹过渡',false,'boolean']],
};
export const referenceProfileNotes = {
  referenceExtrude: '选择一个闭合平面线框或单张平面面。直接复用精确圆弧/样条边，不离散成多边形。带孔请提供单张平面面；散边的多个闭环不会自动猜测内外关系。方向为世界 XYZ 向量，距离可正可负。保留来源；导出时选择新实体。不是自动修补或从零反求原件。',
  referenceLoft: '按顺序选择 2–12 个平面闭合截面对象，每个对象仅一个外环，无内孔。复用精确曲线，支持不同位置/尺寸截面；由内核匹配边对应关系，结果须核对截面与外形。可选直纹。保留来源；失败不修改原工程。不保证任意原件完整重建。',
};
export const referenceProfileOperations = {
  referenceExtrude: {
    description: referenceProfileNotes.referenceExtrude, refs: 1,
    paramsSchema: {type:'object',additionalProperties:false,required:['direction','distance'],properties:{
      direction:{type:'array',minItems:3,maxItems:3,items:{type:'number'}}, distance:{type:'number'},
    }},
  },
  referenceLoft: {
    description: referenceProfileNotes.referenceLoft, refs: '>=2',
    paramsSchema: {type:'object',additionalProperties:false,properties:{ruled:{type:'boolean'}}},
  },
};
