import {validMaterialSolid} from '../../modeling/profiles/material-validation.js';
import {dispose,numericParams,prism} from '../installation-geometry.js';
export function build(params,cad,_options,{definitions}) {
  const p=numericParams(params,definitions.uStrapClip,'U形带夹'),fail=m=>{throw new Error(`U形带夹：${m}`);};
  const {widthMm:w,innerGapMm:g,wallThicknessMm:t,frontHeightMm:hf,backHeightMm:hb,innerBendRadiusMm:r,holeCount:count,holeDiameterMm:hd,holePitchMm:pitch,holeHeightMm:hz}=p;
  if(!(w>0&&g>0&&t>0&&hf>t+r&&hb>t+r))fail('正尺寸前后片须高于底弯切点');
  if(!(r>=0&&r<=g/2)||[hd,pitch,hz].some(v=>v<0))fail('内弯R须在0至内净距一半之间，尺寸不能为负');
  if(![0,1,2].includes(count))fail('后孔数须为0、1或2');
  if(count&&!(hd>0&&hz-hd/2>t+r&&hz+hd/2<hb))fail('后孔须完整落在后片直段');
  if(count&&!(w>(count===2?pitch:0)+hd)||count===2&&!(pitch>hd))fail('孔与侧边或另一孔相交/相切');
  const held=[],hold=s=>{held.push(s);return s;};let result;
  try {
    const d=g+2*t,R=r+t,left=-d/2,right=d/2,rootLeft=left+R,rootRight=right-R;
    const point=(y,z)=>[-w/2,y,z],edges=[];
    const line=(a,b)=>{if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-9)edges.push(hold(cad.makeLine(point(...a),point(...b))));};
    const arc=(a,mid,b)=>edges.push(hold(cad.makeThreePointArc(point(...a),point(...mid),point(...b))));
    const k=1/Math.sqrt(2);
    line([left,hf],[left,R]);arc([left,R],[rootLeft-R*k,R-R*k],[rootLeft,0]);
    line([rootLeft,0],[rootRight,0]);arc([rootRight,0],[rootRight+R*k,R-R*k],[right,R]);
    line([right,R],[right,hb]);line([right,hb],[right-t,hb]);line([right-t,hb],[right-t,t+r]);
    if(r>0)arc([right-t,t+r],[rootRight+r*k,t+r-r*k],[rootRight,t]);
    line([rootRight,t],[rootLeft,t]);
    if(r>0)arc([rootLeft,t],[rootLeft-r*k,t+r-r*k],[left+t,t+r]);
    line([left+t,t+r],[left+t,hf]);line([left+t,hf],[left,hf]);
    const wire=hold(cad.assembleWire(edges));result=prism(cad,wire,[w,0,0]);
    const xs=count===0?[]:count===1?[0]:[-pitch/2,pitch/2];
    for(const x of xs){const tool=hold(cad.makeCylinder(hd/2,t+1,[x,right-t,hz],[0,1,0])),old=result;result=old.cut(tool);dispose(old);}
    validMaterialSolid(result,cad,'U形带夹');const complete=result;result=null;return complete;
  } finally {dispose(result);held.reverse().forEach(dispose);}
}
