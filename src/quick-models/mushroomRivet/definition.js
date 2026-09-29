const numberField=(key,label,labelEn,min=.01)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});
const booleanField=(key,label,labelEn)=>({key,label,labelEn,type:'boolean'});

export default Object.freeze({
  label:'单面蘑菇撞钉',labelEn:'Single-sided mushroom rivet',defaultInsertionAnchor:'model-origin',
  description:'参数化的两件式单面蘑菇撞钉：球面盖带空心套筒，配浅腰圆角钉脚和底盘。支持同轴装配或分开展示；孔深与开孔方向可调，不包含 LOGO、文字和装饰纹。',
  descriptionEn:'A parameterized two-piece mushroom rivet with a spherical cap, hollow socket, rounded waisted post and base flange. Supports assembled or exploded display, with a blind post bore depth and direction.',
  defaults:{
    capDiameterMm:10,capRiseMm:5,capEdgeRadiusMm:.5,collarOuterDiameterMm:3.5,collarInnerDiameterMm:2.9,collarLengthMm:2.3,
    postOuterDiameterMm:2.8,postInnerDiameterMm:2.5,postLengthMm:9,tipRoundRadiusMm:.5,
    waistRadiusMm:3.130814708,waistDepthMm:.26154265,waistCenterFromTipMm:2.03741855,waistBlendRadiusMm:.5,
    flangeDiameterMm:8,flangeThicknessMm:.3,shoulderHeightMm:1,postBoreDepthMm:5,boreFromFlange:true,explodedOffsetMm:12,
  },
  fields:[
    numberField('capDiameterMm','面盖总直径','Cap overall diameter'),numberField('capRiseMm','面盖拱高','Cap rise'),numberField('capEdgeRadiusMm','面盖背缘圆角','Cap rear edge radius'),
    numberField('collarOuterDiameterMm','面盖套筒外径','Socket outer diameter'),numberField('collarInnerDiameterMm','面盖套筒内径','Socket inner diameter'),numberField('collarLengthMm','面盖套筒长度','Socket length'),
    numberField('postOuterDiameterMm','钉脚杆外径','Post shaft diameter'),numberField('postInnerDiameterMm','钉脚孔径','Post bore diameter'),numberField('postLengthMm','钉脚总长','Post total length'),numberField('tipRoundRadiusMm','钉脚尖端圆角','Post tip round radius'),
    numberField('waistRadiusMm','浅腰主圆半径','Waist main radius'),numberField('waistDepthMm','浅腰深度','Waist depth'),numberField('waistCenterFromTipMm','浅腰中心距尖端','Waist center from tip'),numberField('waistBlendRadiusMm','浅腰相切圆角','Waist blend radius'),
    numberField('flangeDiameterMm','底盘直径','Base flange diameter'),numberField('flangeThicknessMm','底盘厚度','Base flange thickness'),numberField('shoulderHeightMm','根肩高度及圆角半径','Shoulder height and radius'),
    numberField('postBoreDepthMm','钉脚盲孔深度（0=无孔）','Post blind bore depth (0=none)',0),booleanField('boreFromFlange','从底盘面开孔','Bore from flange face'),
    numberField('explodedOffsetMm','分开展示中心距（0=装配）','Exploded center offset (0=assembled)',0),
  ],
});
