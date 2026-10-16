import source from './chain-source.js';
import {sewFaces} from '../surface-repair.js';
import {validMaterialSolid} from '../modeling/profiles/material-validation.js';
import {dispose,numericParams} from './installation-geometry.js';
const n=(key,label,min=.01,max=500)=>({key,label,type:'number',min,max,step:.1,unit:'mm'});
const common=[n('outerWidthMm','外宽 W'),n('outerLengthMm','外长 L'),n('wireDiameterMm','线径 d'),n('gapMm','接缝宽 g',0)];
export const chainDefinitions={
 oChain:{label:'O字链',labelEn:'O chain link',description:'来源 OZL.stp：平面椭圆内孔、圆线截面、底部接缝。W/L 为外轮廓尺寸，线径独立；g=0 为闭环。底面 Z=0，长轴 Y。',defaults:{outerWidthMm:7.2,outerLengthMm:9.2,wireDiameterMm:1.6,gapMm:.2},fields:common},
 twistedChain:{label:'扭链',labelEn:'Twisted chain link',description:'来源 NL.stp：椭圆链环呈对角高低起伏，保持来源的扭转曲面。W/L/线径独立调整，不是平面圈整体旋转；接缝位于 -Y 端，g=0 闭合。底面 Z=0。',defaults:{outerWidthMm:11,outerLengthMm:15,wireDiameterMm:3,gapMm:0},fields:common},
 groundChain:{label:'磨链',labelEn:'Ground curb chain link',description:'来源 ML.stp/NL.stp：扭链上下平磨并保留圆线侧面、底部接缝。磨后总厚控制两侧平面间距；磨边R为固定半径圆角，0 保留锐边。不是把扭链压扁。底面 Z=0。',defaults:{outerWidthMm:11,outerLengthMm:15,wireDiameterMm:3,gapMm:.1,groundThicknessMm:4.4,grindRadiusMm:.1},fields:[...common,n('groundThicknessMm','磨后总厚 T'),n('grindRadiusMm','磨边 R',0)]},
};
function sourceSurface(net,p,cad){
 const oc=cad.getOC(),held=[],hold=x=>(held.push(x),x),nu=net.poles.length,nv=net.poles[0].length;
 try{
  const poles=hold(new oc.NCollection_Array2_gp_Pnt(1,nu,1,nv)),weights=hold(new oc.NCollection_Array2_double(1,nu,1,nv)),sx=(p.outerWidthMm-p.wireDiameterMm)/8,sy=(p.outerLengthMm-p.wireDiameterMm)/12,sr=p.wireDiameterMm/3;
  for(let u=0;u<nu;u++)for(let v=0;v<nv;v++){
   const center=net.poles[0][v].map((x,i)=>(x+net.poles[nu-1][v][i])/2),q=net.poles[u][v],point=hold(new oc.gp_Pnt(center[0]*sx+(q[0]-center[0])*sr,center[1]*sy+(q[1]-center[1])*sr,q[2]*sr));poles.SetValue(u+1,v+1,point);weights.SetValue(u+1,v+1,net.weights[u][v]);
  }
  const array=(values,type)=>{const a=hold(new oc[type](1,values.length));values.forEach((v,i)=>a.SetValue(i+1,v));return a;};
  const surface=hold(new oc.Geom_BSplineSurface(poles,weights,array(net.uKnots,'NCollection_Array1_double'),array(net.vKnots,'NCollection_Array1_double'),array(net.uMults,'NCollection_Array1_int'),array(net.vMults,'NCollection_Array1_int'),net.uDegree,net.vDegree,false,false));
  const maker=hold(new oc.BRepBuilderAPI_MakeFace(surface,1e-7));if(!maker.IsDone())throw Error('来源扭链曲面创建失败');return cad.cast(maker.Face());
 }finally{held.reverse().forEach(dispose);}
}
export function buildChain(params,cad){
 const def=chainDefinitions[params.kind],p=numericParams(params,def,def.label),fail=m=>{throw Error(def.label+'：'+m);};
 const {outerWidthMm:w,outerLengthMm:l,wireDiameterMm:d,gapMm:g}=p;
 if(!(w>2*d&&l>=w&&d>0&&g>=0&&g<d&&w<=500&&l<=500))fail('须满足 外长≥外宽>2×线径>0，0≤接缝<线径，尺寸≤500 mm');
 const held=[],hold=x=>(held.push(x),x);let shape;
 try{
  if(params.kind==='oChain'){
   const iw=w-2*d,il=l-2*d;
   const edge=hold(iw===il?cad.makeCircle(iw/2):cad.makeEllipse(il/2,iw/2,[0,0,0],[0,0,1],[0,1,0])),wire=hold(cad.assembleWire([edge])),path=hold(wire.offset2D(d/2));
   const plane=hold(new cad.Plane([0,(l-d)/2,0],[0,1,0],[1,0,0])),drawing=hold(cad.drawCircle(d/2)),profile=hold(drawing.sketchOnPlane(plane));shape=cad.genericSweep(profile.wire,path,{frenet:false,transitionMode:'right'});
  }else{
   const faces=source.nets.map(net=>hold(sourceSurface(net,p,cad)));shape=sewFaces({faces,tolerance:1e-6,makeSolid:true},cad);
  }
  if(params.kind==='groundChain'){
   const t=p.groundThicknessMm,r=p.grindRadiusMm;if(!(t>d*.7&&t<source.sourceOuterSizeMm[2]*d/3&&r>=0&&r<d/4))fail('磨后总厚须大于0.7×线径且小于扭链原厚；0≤磨边R<线径/4');
   const clip=hold(cad.makeBox([-w,-l,-t/2],[w,l,t/2])),old=shape;shape=old.intersect(clip);dispose(old);
   if(r){const old=shape;shape=old.fillet(edge=>{const bb=edge.boundingBox;try{const [min,max]=bb.bounds;return Math.abs(max[2]-min[2])<1e-5&&Math.abs(Math.abs(min[2])-t/2)<1e-5?r:null;}finally{dispose(bb);}});dispose(old);}
  }
  if(g){const cutter=hold(cad.makeBox([-g/2,-l,-l],[g/2,0,l])),old=shape;shape=old.cut(cutter);dispose(old);}
  validMaterialSolid(shape,cad,def.label);const bb=shape.boundingBox;let z;try{z=bb.bounds[0][2];}finally{dispose(bb);}// A trimmed B-spline support box can still include the unground surface.
  // Ground planes define the real bottom; never place from that support box.
  if(params.kind==='groundChain')z=-p.groundThicknessMm/2;
  const result=shape.translate(0,0,-z);shape=null;return result;
 }finally{dispose(shape);held.reverse().forEach(dispose);}
}
