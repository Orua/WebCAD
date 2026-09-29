const numberField=(key,label,labelEn,min=.01)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});

export default Object.freeze({
  label:'双件鸡眼',labelEn:'Two-piece eyelet',defaultInsertionAnchor:'model-origin',
  description:'参数化两件式薄壁鸡眼，法兰外翻边和内侧圆弯按薄壁截面精确旋转生成。A件为长脚，B件为配套短脚；支持同轴静态套合或分开展示，不模拟压铆变形、LOGO和压字。',
  descriptionEn:'A parameterized two-piece thin-wall eyelet with exact revolved flange bends. Part A has a long shank and Part B is its mating ring. Supports static coaxial fit or exploded display; riveting deformation, logos and lettering are not modeled.',
  defaults:{
    aFlangeDiameterMm:18,aBoreDiameterMm:11,aTubeOuterDiameterMm:11.5,aTubeLengthMm:5.8,aFlangeDepthMm:1.2,aBendRadiusMm:.8,
    bFlangeDiameterMm:18,bBoreDiameterMm:11.8,bTubeOuterDiameterMm:12.3,bOverallDepthMm:2,bFlangeDepthMm:1.2,bBendRadiusMm:.8,
    explodedOffsetMm:24,
  },
  fields:[
    numberField('aFlangeDiameterMm','A件法兰外径','Part A flange diameter'),
    numberField('aBoreDiameterMm','A件孔径','Part A bore diameter'),
    numberField('aTubeOuterDiameterMm','A件筒外径','Part A tube outer diameter'),
    numberField('aTubeLengthMm','A件伸脚长','Part A tube length'),
    numberField('aFlangeDepthMm','A件法兰轴向深度','Part A flange axial depth'),
    numberField('aBendRadiusMm','A件翻边外弯半径','Part A flange bend outer radius'),
    numberField('bFlangeDiameterMm','B件法兰外径','Part B flange diameter'),
    numberField('bBoreDiameterMm','B件孔径','Part B bore diameter'),
    numberField('bTubeOuterDiameterMm','B件短脚外径','Part B short tube outer diameter'),
    numberField('bOverallDepthMm','B件总深','Part B overall depth'),
    numberField('bFlangeDepthMm','B件法兰轴向深度','Part B flange axial depth'),
    numberField('bBendRadiusMm','B件翻边外弯半径','Part B flange bend outer radius'),
    numberField('explodedOffsetMm','分开展示中心距（0=同轴）','Exploded center offset (0=coaxial)',0),
  ],
});
