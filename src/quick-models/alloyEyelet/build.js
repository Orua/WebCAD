import {dispose,numericParams} from '../installation-geometry.js';
import {validMaterialSolid} from '../../modeling/profiles/material-validation.js';

function flange(cad,r,b,t,c,rise){
 const p=(x,z)=>[x,0,z],edges=[],line=(a,b)=>edges.push(cad.makeLine(p(...a),p(...b)));
 let wire,face;
 try{
  const start=[b+c,0],end=[r-c,0];
  if(rise>0)edges.push(cad.makeThreePointArc(p(...start),p((b+r)/2,-rise),p(...end)));else line(start,end);
  const pts=c>0?[end,[r,c],[r,t-c],[r-c,t],[b+c,t],[b,t-c],[b,c],start]:[end,[r,t],[b,t],start];
  for(let i=1;i<pts.length;i++)line(pts[i-1],pts[i]);
  wire=cad.assembleWire(edges);face=cad.makeFace(wire);return cad.revolution(face,[0,0,0],[0,0,1],360);
 }finally{dispose(face);dispose(wire);edges.forEach(dispose);}
}

export function build(params,cad,_options,{definitions}){
 const p=numericParams(params,definitions.alloyEyelet,'合金鸡眼'),fail=m=>{throw Error('合金鸡眼：'+m);};
 const r=p.outerDiameterMm/2,b=p.boreDiameterMm/2,c=p.edgeChamferMm,rise=p.faceStyle==='curved'?p.faceRiseMm:0;
 if(!['flat','curved'].includes(p.faceStyle))fail('鸡眼面必须为平面或弧面');
 if(!(r>b&&b>0&&p.aFaceThicknessMm>0&&p.bFaceThicknessMm>0))fail('外径须大于孔径，面厚须为正');
 if(Object.entries(p).some(([k,v])=>k!=='kind'&&typeof v==='number'&&v<0))fail('尺寸不能为负');
 if(!(2*c<Math.min(p.aFaceThicknessMm,p.bFaceThicknessMm,r-b)))fail('倒角过大，须小于面厚及面环宽度的一半');
 if(rise>0&&!(rise<(r-b-2*c)/2))fail('弧面拱高须小于有效面环宽度的一半');
 const specs=[{t:p.aFaceThicknessMm,ro:p.aNeckOuterDiameterMm/2,ri:p.aNeckInnerDiameterMm/2,l:p.aNeckLengthMm},{t:p.bFaceThicknessMm,ro:p.bNeckOuterDiameterMm/2,ri:p.bNeckInnerDiameterMm/2,l:p.bNeckLengthMm}];
 for(const s of specs)if(!(s.ro>s.ri&&s.ri>=b&&s.ro<r-c))fail('套管须有正壁厚，内径不小于通孔，外径须在面框内');
 if(specs[0].l>0&&specs[1].l>0&&!(specs[0].ri>specs[1].ro))fail('B套管外径须小于A套管内径');
 if(p.materialGapMm<Math.max(specs[0].l,specs[1].l)+.01)fail('内侧净距须至少比最长套管多0.01mm，避免顶入另一面框');
 const held=[],hold=x=>{held.push(x);return x;};let result;
 try{
  const parts=specs.map(s=>{
   let part=hold(flange(cad,r,b,s.t,c,rise));
   if(s.l>0){const outer=hold(cad.makeCylinder(s.ro,s.l,[0,0,s.t])),inner=hold(cad.makeCylinder(s.ri,s.l,[0,0,s.t])),neck=hold(outer.cut(inner));part=hold(part.fuse(neck));}
   validMaterialSolid(part,cad,'合金鸡眼');return part;
  });
  const rotated=hold(parts[0].rotate(180,[0,0,0],[1,0,0]));
  const a=hold(rotated.translate([0,0,rise+p.aFaceThicknessMm+p.bFaceThicknessMm+p.materialGapMm]));
  const bPart=hold(parts[1].translate([0,0,rise]));
  result=cad.makeCompound([a,bPart]);const complete=result;result=null;return complete;
 }finally{dispose(result);held.reverse().forEach(dispose);}
}
