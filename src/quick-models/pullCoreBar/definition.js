const numberField=(key,label,labelEn,min=.1)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});
export default Object.freeze({
  label:'拉心扣活动芯（双卷眼横芯）',labelEn:'Open-eye buckle crossbar',defaultInsertionAnchor:'model-origin',
  description:'独立活动芯：沿X横跨、两端为Y轴开放卷眼，中间扁带由独立内外相切圆弧接入卷眼。适合常规拉心扣芯；不与外框融合。',
  descriptionEn:'Separate crossbar with two open Y-axis rolled eyes and independently tangent inner/outer transitions into the center strip. For regular pull buckles; it remains separate from the frame.',
  defaults:{eyePitchMm:45.5,eyeInnerDiameterMm:5.5,widthMm:3.2,eyeWallMm:1.7,barThicknessMm:1.5,barCenterHeightMm:2,outerTransitionRadiusMm:28.3,innerTransitionRadiusMm:30,tailLengthMm:5,tailAngleDeg:0},
  fields:[
    numberField('eyePitchMm','两眼轴心距 X','Eye center pitch X'),
    numberField('eyeInnerDiameterMm','卷眼内径','Eye inner diameter'),
    numberField('widthMm','横芯宽度 Y','Crossbar width Y'),
    numberField('eyeWallMm','卷眼及尾舌厚','Eye and tail wall'),
    numberField('barThicknessMm','中央扁带厚 Z','Center strip thickness Z'),
    numberField('barCenterHeightMm','扁带中心高度 Z','Strip center height Z',-50),
    numberField('outerTransitionRadiusMm','外过渡半径','Outer transition radius'),
    numberField('innerTransitionRadiusMm','内过渡半径','Inner transition radius'),
    numberField('tailLengthMm','卷眼尾舌长度','Rolled-eye tail length'),
    {key:'tailAngleDeg',label:'尾舌上扬角',labelEn:'Tail angle',type:'number',min:0,max:60,step:.5,unit:'deg'},
  ],
});
