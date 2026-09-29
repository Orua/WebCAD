const numberField=(key,label,labelEn,min=.1)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});

export default Object.freeze({
  label:'圆线拱桥（可选双底孔）',labelEn:'Round U bridge with optional end holes',defaultInsertionAnchor:'model-origin',
  description:'常规 U 形拱桥：圆截面直腿与精确半圆连续成型，两端可开同轴底孔。外宽、外高、线径和底孔尺寸可调；不包含螺纹牙型、底片、装饰或异形截面。',
  descriptionEn:'A regular round-section U bridge with straight legs, an exact semicircular crown, and optional coaxial holes in both end faces.',
  defaults:{outerWidthMm:11.3,outerHeightMm:7.5,sectionDiameterMm:3.3,holeDiameterMm:2,holeDepthMm:3},
  fields:[
    numberField('outerWidthMm','外宽','Outer width'),
    numberField('outerHeightMm','外高','Outer height'),
    numberField('sectionDiameterMm','桥身直径','Section diameter'),
    numberField('holeDiameterMm','两端底孔直径','End-hole diameter',0),
    numberField('holeDepthMm','两端底孔深度','End-hole depth',0),
  ],
});
