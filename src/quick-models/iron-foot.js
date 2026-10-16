import {numericParams,prism,dispose} from './installation-geometry.js';
import {validMaterialSolid} from '../modeling/profiles/material-validation.js';
const n=(key,label,min=.01,max=500)=>({key,label,type:'number',min,max,step:.1,unit:'mm'});
export const ironFootDefinition={label:'铁脚仔',labelEn:'Bridge iron foot',description:'来源 V01/V02/V03：顶片双安装孔，两端下折脚、圆弧脚端，可选单脚或双脚轴孔。顶面 Z=0，脚朝 -Z，桥长沿 Y、片宽沿 X；总高含顶片。V02 的收脚由侧边收角和脚端R控制。折角保持来源的直角，不自动加弯R。',defaults:{lengthMm:23.5,widthMm:5.5,heightMm:12,thicknessMm:.5,topHoleDiameterMm:2.3,topHolePitchMm:18,endRadiusMm:2.75,taperAngleDeg:0,footHoleDiameterMm:2.5,footHoleHeightMm:2.75,footHoles:'back'},fields:[n('lengthMm','桥长 L'),n('widthMm','片宽 W'),n('heightMm','总高 H'),n('thicknessMm','片厚 t'),n('topHoleDiameterMm','顶孔直径',0),n('topHolePitchMm','顶孔中心距',0),n('endRadiusMm','脚端 R'),{key:'taperAngleDeg',label:'脚侧边收角',type:'number',min:0,max:15,step:.1,unit:'deg'},n('footHoleDiameterMm','脚孔直径',0),n('footHoleHeightMm','脚孔心距脚底'),{key:'footHoles',label:'脚孔位置',type:'select',options:[{value:'none',label:'无'},{value:'front',label:'前脚（-Y）'},{value:'back',label:'后脚（+Y）'},{value:'both',label:'两脚'}]}]};
export function buildIronFoot(params,cad){
 const p=numericParams(params,ironFootDefinition,'铁脚仔'),{lengthMm:l,widthMm:w,heightMm:h,thicknessMm:t,endRadiusMm:r,taperAngleDeg:a,topHoleDiameterMm:td,topHolePitchMm:pitch,footHoleDiameterMm:fd,footHoleHeightMm:fh,footHoles:mode}=p;
 const fail=m=>{throw Error('铁脚仔：'+m);},angle=a*Math.PI/180,k=Math.tan(angle),q=w/2-k*(h-r-t)-r/Math.cos(angle);
 if(!(l>2*t&&w>0&&h>r+t&&t>0&&r>0&&a>=0&&a<=15&&q>=-1e-7&&Math.max(l,w,h)<=500))fail('尺寸、脚端R或收角不能形成有效脚片');
 if(!['none','front','back','both'].includes(mode)||td<0||fd<0)fail('孔位或孔径无效');
 if(td&&!(td<w&&pitch>td&&pitch+td<l-2*t))fail('顶孔须互不相交且完整落在顶片内');
 const holeZ=h-fh,halfAtHole=w/2-k*(holeZ-t);
 if(mode!=='none'&&fd&&!(fh>fd/2&&holeZ-fd/2>t&&fd/2<halfAtHole&&fd<2*r&&fh>=r))fail('脚孔须完整位于脚片和圆弧端内');
 const held=[],hold=x=>(held.push(x),x);let shape;
 try{
  shape=cad.makeBox([-w/2,-l/2,-t],[w/2,l/2,0]);
  for(const y of [-l/2,l/2-t]){
   const pt=(x,z)=>[x,y,-z],edges=[],line=(a,b)=>{if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-8)edges.push(hold(cad.makeLine(pt(...a),pt(...b))));},arc=(cx,start,end)=>edges.push(hold(cad.makeThreePointArc(pt(cx+r*Math.cos(start),h-r+r*Math.sin(start)),pt(cx+r*Math.cos((start+end)/2),h-r+r*Math.sin((start+end)/2)),pt(cx+r*Math.cos(end),h-r+r*Math.sin(end)))));
   const c=Math.max(0,q),xT=c+r*Math.cos(angle),zT=h-r+r*Math.sin(angle);
   line([-w/2,0],[w/2,0]);line([w/2,0],[w/2,t]);line([w/2,t],[xT,zT]);arc(c,angle,Math.PI/2);line([c,h],[-c,h]);arc(-c,Math.PI/2,Math.PI-angle);line([-xT,zT],[-w/2,t]);line([-w/2,t],[-w/2,0]);
   const wire=hold(cad.assembleWire(edges)),leg=hold(prism(cad,wire,[0,t,0])),old=shape;shape=old.fuse(leg);dispose(old);
  }
  const cut=tool=>{hold(tool);const old=shape;shape=old.cut(tool);dispose(old);};
  if(td)for(const y of [-pitch/2,pitch/2])cut(cad.makeCylinder(td/2,t+2,[0,y,-t-1]));
  if(fd&&mode!=='none')for(const [which,y]of [['front',-l/2],['back',l/2-t]])if(mode===which||mode==='both')cut(cad.makeCylinder(fd/2,t+2,[0,y-1,-holeZ],[0,1,0]));
  validMaterialSolid(shape,cad,'铁脚仔');const result=shape;shape=null;return result;
 }finally{dispose(shape);held.reverse().forEach(dispose);}
}
