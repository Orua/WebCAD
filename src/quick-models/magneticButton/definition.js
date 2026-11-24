const toggle = (key, label) => ({key, label, type:'boolean'});
const mm = (key, label, min = 0.01) => ({key, label, type:'number', min, step:0.01, unit:'mm'});

export default {
  label:'磁钮', labelEn:'Magnetic snap', defaultInsertionAnchor:'bottom-center',
  description:'素面双折脚磁钮。勾选需要的公件、母件和底片。盘径联动凸头、凹窝及折脚横截面；盘厚、脚长等按输入毫米值生成。脚距及底片外径填 0 时随盘径缩放。',
  defaults:{
    male:true, female:true, malePlate:true, femalePlate:true, diameter:20,
    maleThickness:1, femaleThickness:4.3, studHeight:2.04, socketDepth:2.2,
    legLength:9, legPitch:0, plateDiameter:0, plateThickness:0.45,
  },
  fields:[
    toggle('male','磁钮公件'), toggle('female','磁钮母件'),
    toggle('malePlate','公钮双槽底片'), toggle('femalePlate','母钮双槽底片'),
    mm('diameter','磁钮外径'), mm('maleThickness','公件盘厚'), mm('femaleThickness','母件盘厚'),
    mm('studHeight','公件凸头高度'), mm('socketDepth','母件凹窝深度'), mm('legLength','折脚长度'),
    mm('legPitch','双脚中心距（0 自动）',0), mm('plateDiameter','底片外径（0 自动）',0),
    mm('plateThickness','底片厚度'),
  ],
};
