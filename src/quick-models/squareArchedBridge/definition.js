const mm=(key,label,labelEn,min=0)=>({key,label,labelEn,type:'number',unit:'mm',min,max:500,step:.1});
export default Object.freeze({
  label:'方线拱桥',labelEn:'Square-section U bridge',defaultInsertionAnchor:'model-origin',
  description:'平顶方线 U 形桥身，内外宽高、前后厚度、内外转角及棱边 R 独立可调；可选两端底孔。结构参考 PG15272、PG15227，默认采用 PG15272 主体包络。底孔为光孔，不生成螺纹、螺丝或底片；不复刻源件微拱顶面。XY 为正面，开口朝 -Y，底端 Y=0，厚度沿 Z 居中。',
  descriptionEn:'Flat-top rectangular-section U bridge with independent inner/outer size, depth, corner and edge radii, and optional paired blind end bores. Structural references PG15272/PG15227; plain bores only, no threads, screws, backing plate or subtle source crown.',
  defaults:{outerWidthMm:35.5,outerHeightMm:11.5,innerWidthMm:25.5,innerHeightMm:8,depthMm:5,outerRadiusMm:2,innerRadiusMm:1.5,edgeRadiusMm:1,holeDiameterMm:2.5,holeDepthMm:5},
  fields:[mm('outerWidthMm','外宽','Outer width',.1),mm('outerHeightMm','外高','Outer height',.1),mm('innerWidthMm','内宽','Inner width',.1),mm('innerHeightMm','内高','Inner height',.1),mm('depthMm','前后厚度','Depth',.1),mm('outerRadiusMm','外转角 R','Outer corner R'),mm('innerRadiusMm','内转角 R','Inner corner R'),mm('edgeRadiusMm','棱边 R','Edge R'),mm('holeDiameterMm','两端底孔直径','End bore diameter'),mm('holeDepthMm','两端底孔深度','End bore depth')],
});
