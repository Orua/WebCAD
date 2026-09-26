import {buildCoil,buildThread} from '../modeling/manufacturing/helical-tools.js';
const dispose=x=>{try{x?.delete?.();}catch{}};
const positive=(n,label)=>{if(!Number.isFinite(n)||n<=0)throw new Error(`${label}须大于零`);return n;};
export const METRIC_PITCH=Object.freeze({M1:.25,'M1.2':.25,'M1.6':.35,M2:.4,'M2.5':.45,M3:.5,M4:.7,M5:.8,M6:1,M8:1.25,M10:1.5,M12:1.75});
export function metricThreadSpec(size){const key=typeof size==='number'?`M${size}`:size;if(!Object.hasOwn(METRIC_PITCH,key))throw new Error('请选择支持的 M1–M12 粗牙规格');return {size:key,diameterMm:Number(key.slice(1)),pitchMm:METRIC_PITCH[key]};}
const number=(key,label,min=.01)=>({key,label,type:'number',min,step:.01});
const select=(key,label,items)=>({key,label,type:'select',options:items.map(([value,label])=>({value,label}))});
export const hardwareDefinitions={
 spring:{label:'弹簧',labelEn:'Spring',description:'圆线沿精确螺旋路径扫掠。螺距大于线径；半径是中心线半径。',defaults:{radiusMm:6,wireDiameterMm:1.2,pitchMm:3,turns:4,leftHanded:false},fields:[number('radiusMm','中心线半径'),number('wireDiameterMm','线径'),number('pitchMm','螺距'),number('turns','圈数'),{key:'leftHanded',label:'左旋',type:'boolean'}]},
 screw:{label:'螺丝',labelEn:'Screw',description:'头在参考位置下端，牙杆朝本地 +Z。沉头外缘固定直升位 0.20 mm。M 使用常用粗牙螺距，真实 V 型牙槽；不含配合公差。',defaults:{headType:'flat',headWidthMm:6,headThicknessMm:2,threadSize:'M3',threadLengthMm:8,drive:'cross'},fields:[select('headType','头型',[['flat','平头螺丝'],['countersunk','沉头螺丝']]),number('headWidthMm','头宽（直径）'),number('headThicknessMm','头厚'),select('threadSize','螺牙 M 规格',Object.keys(METRIC_PITCH).map(v=>[v,v])),number('threadLengthMm','螺牙长度'),select('drive','螺丝槽型',[['cross','十字'],['slotted','一字'],['star','梅花'],['hex','内六角']])]},
 threadedSleeve:{label:'丝筒',labelEn:'Threaded sleeve',description:'底面在参考位置，面端朝本地 -Z；从下方面端向上攻牙。牙径采用支持的名义 M 粗牙直径，不含配合公差。',defaults:{bottomDiameterMm:8,faceDiameterMm:6,threadDiameterMm:3,totalHeightMm:8,threadDepthMm:6},fields:[number('bottomDiameterMm','底直径（上端）'),number('faceDiameterMm','面直径（下端）'),number('threadDiameterMm','螺牙直径'),number('totalHeightMm','总高'),number('threadDepthMm','螺牙深度')]},
 domedPin:{label:'半圆钉',labelEn:'Domed pin',description:'平底、光滑凸面；直径和高度独立设置，可以调整拱高，不限于半球。',defaults:{diameterMm:6,heightMm:2},fields:[number('diameterMm','直径'),number('heightMm','高度')]},
};
function solid(shape,oc,cad){let check;const pieces=shape.solids;try{check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);if(pieces.length!==1||!check.IsValid()||!(cad.measureVolume(shape)>1e-9))throw new Error('快捷模型未形成单一有效实体');return shape;}finally{pieces.forEach(dispose);dispose(check);}}
function frustum(cad,r0,r1,height,z=0){const face=cad.makePolygon([[0,0,z],[r0,0,z],[r1,0,z+height],[0,0,z+height]]);try{return cad.revolution(face,[0,0,0],[0,0,1],360);}finally{dispose(face);}}
function threadFace(shape,oc,radius){const faces=shape.faces;try{const matches=[];faces.forEach((f,i)=>{if(f.geomType!=='CYLINDRE')return;let a,c;try{a=new oc.BRepAdaptor_Surface(f.wrapped,true);c=a.Cylinder();if(Math.abs(c.Radius()-radius)<1e-7)matches.push(i);}finally{dispose(c);dispose(a);}});if(matches.length!==1)throw new Error('无法唯一识别模板的螺纹圆柱面');return matches[0];}finally{faces.forEach(dispose);}}
function starProfile(cad,diameter){
 const polar=(r,a)=>[r*Math.cos(a),r*Math.sin(a)],add=(a,b)=>a.map((v,i)=>v+b[i]);
 const lc=.24*diameter,vc=.34*diameter,lr=.1*diameter,dist=Math.hypot(lc-vc*Math.cos(Math.PI/6),vc*Math.sin(Math.PI/6)),vr=dist-lr;
 const junction=(angle,valley)=>{const c=polar(lc,angle),v=polar(vc,valley);return add(c,v.map((n,i)=>(n-c[i])*lr/dist));};
 const start=junction(0,-Math.PI/6);let drawing=cad.draw(start);
 for(let i=0;i<6;i++){const angle=i*Math.PI/3,next=angle+Math.PI/3,valley=angle+Math.PI/6;
  drawing=drawing.threePointsArcTo(junction(angle,valley),polar(lc+lr,angle));
  drawing=drawing.threePointsArcTo(junction(next,valley),polar(vc-vr,valley));
 }
 return drawing.close().sketchOnPlane('XY');
}
function driveCutter(cad,drive,headWidth,depth){
 const l=headWidth*.65,w=headWidth*.16;
 if(drive==='star'){const s=starProfile(cad,headWidth);try{return s.extrude(depth);}finally{dispose(s);}}
 let points;
 if(drive==='hex'){const r=headWidth*.27;points=Array.from({length:6},(_,i)=>[r*Math.cos(i*Math.PI/3),r*Math.sin(i*Math.PI/3),0]);}
 else if(drive==='cross'){const a=l/2,b=w/2;points=[[-b,-a],[b,-a],[b,-b],[a,-b],[a,b],[b,b],[b,a],[-b,a],[-b,b],[-a,b],[-a,-b],[-b,-b]].map(([x,y])=>[x,y,0]);}
 else if(drive==='slotted')points=[[-l/2,-w/2,0],[l/2,-w/2,0],[l/2,w/2,0],[-l/2,w/2,0]];
 else throw new Error('未知螺丝槽型');
 let drawing=cad.draw(points[0].slice(0,2));for(const p of points.slice(1))drawing=drawing.lineTo(p.slice(0,2));const sketch=drawing.close().sketchOnPlane('XY');
 try{return sketch.extrude(depth);}finally{dispose(sketch);}
}
export function buildHardwareModel(kind,input,cad,oc=cad.getOC()){
 const d=hardwareDefinitions[kind];if(!d)throw new Error('未知五金快捷模型');
 if(Object.keys(input).some(k=>k!=='kind'&&!Object.hasOwn(d.defaults,k)))throw new Error('快捷模型参数存在未知字段');
 const p={...d.defaults,...input};let result,source,shaft,head,threaded,cutter,other,face,wire;let edges=[];
 try{
  if(kind==='spring'){result=buildCoil(p,oc,cad);return solid(result,oc,cad);}
  if(kind==='domedPin'){
   const r=positive(p.diameterMm,'直径')/2,h=positive(p.heightMm,'高度'),k=.5522847498307936;
   edges=[cad.makeBezierCurve([[r,0,0],[r,0,k*h],[k*r,0,h],[0,0,h]]),cad.makeLine([0,0,h],[0,0,0]),cad.makeLine([0,0,0],[r,0,0])];
   wire=cad.assembleWire(edges);face=cad.makeFace(wire);result=cad.revolution(face,[0,0,0],[0,0,1],360);return solid(result,oc,cad);
  }
  if(kind==='screw'){
   const {diameterMm,pitchMm,size}=metricThreadSpec(p.threadSize),width=positive(p.headWidthMm,'头宽'),thick=positive(p.headThicknessMm,'头厚'),length=positive(p.threadLengthMm,'螺牙长度');
   if(width<=diameterMm||length/pitchMm>100)throw new Error('头宽须大于螺牙直径，螺牙长度最多 100 圈');
   if(!['flat','countersunk'].includes(p.headType))throw new Error('未知螺丝头型');
   if(p.headType==='countersunk'&&thick<=.2)throw new Error('沉头头厚须大于固定直升位 0.20 mm');
   if(p.headType==='flat')head=cad.makeCylinder(width/2,thick);
   else{source=cad.makeCylinder(width/2,.2);other=frustum(cad,width/2,diameterMm/2,thick-.2,.2);head=source.fuse(other);dispose(source);source=null;dispose(other);other=null;}
   shaft=cad.makeCylinder(diameterMm/2,length,[0,0,thick]);threaded=buildThread(shaft,{faceId:threadFace(shaft,oc,diameterMm/2),kind:'external',pitchMm,depthMm:.6*pitchMm,lengthMm:length},oc,cad);
   source=head.fuse(threaded);cutter=driveCutter(cad,p.drive,width,Math.min(thick*.35,.8));result=source.cut(cutter);
   result.threadReport={...threaded.threadReport,nominalMetricSize:size};return solid(result,oc,cad);
  }
  if(kind==='threadedSleeve'){
   const b=positive(p.bottomDiameterMm,'底直径'),f=positive(p.faceDiameterMm,'面直径'),h=positive(p.totalHeightMm,'总高'),depth=positive(p.threadDepthMm,'螺牙深度'),{diameterMm,pitchMm,size}=metricThreadSpec(p.threadDiameterMm);
   if(depth>h||depth/pitchMm>100||Math.min(b,f)<=diameterMm+.01)throw new Error('牙深不能超过总高或 100 圈，两端直径须大于牙径');
   head=frustum(cad,f/2,b/2,h,-h);const tooth=.54*pitchMm;
   cutter=cad.makeCylinder(diameterMm/2-tooth,depth,[0,0,-h]);source=head.cut(cutter);
   result=buildThread(source,{faceId:threadFace(source,oc,diameterMm/2-tooth),kind:'internal',pitchMm,depthMm:tooth,lengthMm:depth},oc,cad);
   result.threadReport={...result.threadReport,nominalMetricSize:size,insertionDirection:'local-negative-Z',tappingDirection:'local-positive-Z'};return solid(result,oc,cad);
  }
 }catch(error){dispose(result);throw error;}finally{[source,shaft,head,threaded,cutter,other,face,wire,...edges].forEach(dispose);}
}
