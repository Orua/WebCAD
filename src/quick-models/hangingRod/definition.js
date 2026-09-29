const numberField=(key,label,labelEn,min=.1)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});

export default Object.freeze({
  label:'圆杆吊环（吊杆）',labelEn:'Rod with hanging eye',defaultInsertionAnchor:'model-origin',
  description:'常规吊杆：水平圆杆两端做圆角，上方居中融合一个Z深度由根部向顶部收窄的椭圆截面U形吊环。杆长、杆径、端部圆角、吊环内宽、根部深度、根部圆角和净高均可调；不包含文字、花纹或多个吊环。',
  descriptionEn:'A horizontal rounded rod joined to an elliptical-section U eye that narrows in Z depth from root to top.',
  defaults:{barLengthMm:35,barDiameterMm:5,endFilletMm:.8,loopInnerWidthMm:7,loopWireDiameterMm:2,loopClearHeightMm:6,loopRootDepthMm:2.5,rootBlendRadiusMm:1},
  fields:[
    numberField('barLengthMm','圆杆总长','Rod length'),
    numberField('barDiameterMm','圆杆直径','Rod diameter'),
    numberField('endFilletMm','端部圆角 R','End fillet radius',0),
    numberField('loopInnerWidthMm','吊环内宽','Eye inner width'),
    numberField('loopWireDiameterMm','吊环线径','Eye wire diameter'),
    numberField('loopClearHeightMm','杆顶至内圈最高点','Clear height above rod'),
    numberField('loopRootDepthMm','吊环根部Z深度','Eye root Z depth'),
    numberField('rootBlendRadiusMm','根部交接圆角 R','Root junction blend radius',0),
  ],
});
