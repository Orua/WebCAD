const numberField=(key,label,labelEn,min=.1)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});

export default Object.freeze({
  label:'扁线双层匙圈',labelEn:'Flat split key ring',defaultInsertionAnchor:'model-origin',
  description:'圆角矩形扁线由两段平面圆弧层和一段局部跨层过渡连续构成。内外径控制环带，侧向总厚由两层各半厚及层间隙组成。圈数只支持大于1且小于2；跨层角可调，须位于两端错开的扇区。截面四角R0.5；不包含端头专属轮廓、钥匙链附件或花纹。',
  descriptionEn:'A rounded rectangular strip uses two planar circular layers joined by a local transition. Inner/outer diameters define the band; total side depth is split evenly between the layers plus the gap. Turns are limited to >1 and <2; the transition angle must fit within the open tip sector. Four section corners are R0.5; product-specific tip outlines, attachments and patterns are not included.',
  defaults:{innerDiameterMm:25,outerDiameterMm:33,totalDepthMm:3,turns:1.9,layerGapMm:.01,sectionCornerRadiusMm:.5,transitionAngleDeg:36,leftHanded:false},
  fields:[
    numberField('innerDiameterMm','内径','Inner diameter'),
    numberField('outerDiameterMm','外径','Outer diameter'),
    numberField('totalDepthMm','侧向总厚','Total side depth'),
    {key:'turns',label:'绕卷圈数',labelEn:'Turns',type:'number',min:1.01,max:2,step:.05},
    numberField('layerGapMm','相邻层间隙','Layer gap',0),
    numberField('sectionCornerRadiusMm','截面圆角','Section corner radius'),
    {key:'transitionAngleDeg',label:'跨层角',labelEn:'Transition angle',type:'number',min:0.1,max:180,step:1,unit:'degrees'},
    {key:'leftHanded',label:'左旋',labelEn:'Left handed',type:'boolean'},
  ],
});

