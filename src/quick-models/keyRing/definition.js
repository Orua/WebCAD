const numberField=(key,label,labelEn,min=.1)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});

export default Object.freeze({
  label:'扁线双层匙圈',labelEn:'Flat split key ring',defaultInsertionAnchor:'model-origin',
  description:'只需内径、外径与总厚度。双层扁线、跨层过渡、层间隙和截面 R 角自动拟合，两端采用圆弧收口并带边缘 R 角。旧工程的显式绕卷参数仍可重建；不包含附件或花纹。',
  descriptionEn:'Three dimensions: inner diameter, outer diameter and total thickness. Winding, layer gap, transition and section R are fitted automatically; both tips have circular outlines with rounded edges. Legacy explicit winding recipes remain supported.',
  defaults:{innerDiameterMm:25,outerDiameterMm:33,totalDepthMm:3,autoFit:true,roundedTips:true,turns:1.9,layerGapMm:.01,sectionCornerRadiusMm:.5,transitionAngleDeg:36,leftHanded:false},
  fields:[
    numberField('innerDiameterMm','内径','Inner diameter'),
    numberField('outerDiameterMm','外径','Outer diameter'),
    numberField('totalDepthMm','总厚度','Total thickness'),
  ],
});

