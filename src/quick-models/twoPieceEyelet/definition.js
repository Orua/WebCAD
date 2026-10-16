const numberField=(key,label,labelEn,min=.01)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});

export default Object.freeze({
  label:'双件鸡眼',labelEn:'Two-piece eyelet',defaultInsertionAnchor:'model-origin',
  description:'参数化铜皮鸡眼，A长脚件在上、B底片在下，默认同轴相向，两侧外观面朝外，内侧套管相向。平面或弧面共用一个工具；弧面为精确圆弧旋转，板厚按轴向保持。轴向分开距离0为静态套接，正值拉开；横向距离0保持同轴。翻边内外弯按薄壁截面生成，不模拟压铆变形、LOGO或压字。装配朝向参考PG15211，具体尺寸自行输入。',
  descriptionEn:'A parameterized two-piece thin-wall eyelet with exact revolved flange bends. Part A has a long shank and Part B is its mating ring. Supports static coaxial fit or exploded display; riveting deformation, logos and lettering are not modeled.',
  defaults:{
    aFlangeDiameterMm:18,aBoreDiameterMm:11,aTubeOuterDiameterMm:11.5,aTubeLengthMm:5.8,aFlangeDepthMm:1.2,aBendRadiusMm:.8,
    bFlangeDiameterMm:18,bBoreDiameterMm:11.8,bTubeOuterDiameterMm:12.3,bOverallDepthMm:2,bFlangeDepthMm:1.2,bBendRadiusMm:.8,
    explodedOffsetMm:0,assemblyGapMm:0,faceStyle:'flat',faceRiseMm:.5,
  },
  fields:[
    numberField('aFlangeDiameterMm','A长脚件法兰外径','Part A flange diameter'),
    numberField('aBoreDiameterMm','A长脚件孔径','Part A bore diameter'),
    numberField('aTubeOuterDiameterMm','A长脚件筒外径','Part A tube outer diameter'),
    numberField('aTubeLengthMm','A长脚件伸脚长','Part A tube length'),
    numberField('aFlangeDepthMm','A长脚件法兰轴向深度','Part A flange axial depth'),
    numberField('aBendRadiusMm','A长脚件翻边外弯半径','Part A flange bend outer radius'),
    numberField('bFlangeDiameterMm','B底片法兰外径','Part B flange diameter'),
    numberField('bBoreDiameterMm','B底片孔径','Part B bore diameter'),
    numberField('bTubeOuterDiameterMm','B底片短脚外径','Part B short tube outer diameter'),
    numberField('bOverallDepthMm','B底片总深','Part B overall depth'),
    numberField('bFlangeDepthMm','B底片法兰轴向深度','Part B flange axial depth'),
    numberField('bBendRadiusMm','B底片翻边外弯半径','Part B flange bend outer radius'),
    {key:'faceStyle',label:'鸡眼面',labelEn:'Face style',type:'select',options:[{value:'flat',label:'平面',labelEn:'Flat'},{value:'curved',label:'弧面',labelEn:'Curved'}]},
    numberField('faceRiseMm','弧面拱高（平面时忽略）','Face rise (ignored for flat)',0),
    numberField('assemblyGapMm','轴向分开距离','Additional axial separation',0),
    numberField('explodedOffsetMm','横向分开距离（0=同轴）','Lateral offset (0=coaxial)',0),
  ],
});
