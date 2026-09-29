const numberField=(key,label,labelEn,min=.1)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});
export default Object.freeze({
  label:'扣针（环头扁针）',labelEn:'Loop-head buckle tongue',defaultInsertionAnchor:'model-origin',
  description:'独立扣针：沿X的轴孔环头、沿+Y的圆头扁针。长度从轴心至针尖；不与扣身融合。用于已确认环头扁针的近似形状，不包含冲压弯曲、滚花、LOGO或装配活动验证。',
  descriptionEn:'Separate tongue: X-axis pivot loop and a rounded flat strip along +Y. Length is pivot-center to tip. Approximate loop-head flat tongue only; no stamping bends, knurling, artwork or assembly motion validation.',
  defaults:{lengthMm:22,widthMm:3,thicknessMm:1.2,pivotDiameterMm:2,clearanceMm:.15},
  fields:[numberField('lengthMm','轴心到针尖','Pivot to tip'),numberField('widthMm','针宽 X','Tongue width X'),numberField('thicknessMm','针厚 Z','Tongue thickness Z'),numberField('pivotDiameterMm','配合轴直径','Mating pivot diameter'),numberField('clearanceMm','轴孔直径间隙','Diametral clearance',0)],
});
