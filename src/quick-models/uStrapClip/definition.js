const n=(key,label,labelEn,min=0)=>({key,label,labelEn,type:'number',min,step:.1,unit:'mm'});
export default Object.freeze({
  label:'U形带夹',labelEn:'U-shaped strap clip',defaultInsertionAnchor:'model-origin',
  description:'沿X等宽的恒壁厚开口U夹，前后片可不同高，内外弯角为精确相切圆弧；内弯R=内净距/2时为半圆底。底面Z=0，开口朝+Z，后片在+Y。可加后片普通通孔0/1/2个，2孔沿X布置。不是四边封闭的帽套；不含牙槽、前面饰面、片端三维圆角和弹性变形。孔中心须处于后片直段。',
  descriptionEn:'Constant-wall open U clip of uniform X width, independent front/back heights and exact tangent bend arcs. An inner radius equal to half the gap makes a semicircular bottom. Bottom Z=0, opening +Z, back wall +Y. Optional 0/1/2 plain back-wall through holes; two holes lie on X. Not a closed cap. No threads, decorations, end blends or elastic deformation. Holes must fit entirely within the straight back wall.',
  defaults:{widthMm:20,innerGapMm:3,wallThicknessMm:1.3,frontHeightMm:7,backHeightMm:5,innerBendRadiusMm:.2,holeCount:2,holeDiameterMm:2,holePitchMm:14,holeHeightMm:3},
  fields:[n('widthMm','夹宽','Clip width',.01),n('innerGapMm','内净距','Inner gap',.01),n('wallThicknessMm','壁厚','Wall thickness',.01),n('frontHeightMm','前片总高','Front overall height',.01),n('backHeightMm','后片总高','Back overall height',.01),n('innerBendRadiusMm','内弯R','Inner bend radius'),{key:'holeCount',label:'后孔数（0/1/2）',labelEn:'Back hole count (0/1/2)',type:'number',min:0,max:2,step:1,unit:'1'},n('holeDiameterMm','后片普通通孔径','Plain back through-hole diameter',.01),n('holePitchMm','双孔中心距','Two-hole pitch'),n('holeHeightMm','孔心距底面','Hole center height from bottom')],
});
