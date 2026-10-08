import {validMaterialSolid} from '../../modeling/profiles/material-validation.js';
import {dispose,numericParams,roundedDistance,outline} from '../installation-geometry.js';
export function build(params,cad,_options,{definitions}) {
  const p=numericParams(params,definitions.frameEyelet,'安装鸡眼');
  const fail=m=>{throw new Error(`安装鸡眼：${m}`);};
  const {outerWidthMm:w,outerHeightMm:h,boreWidthMm:iw,boreHeightMm:ih,flangeThicknessMm:t,collarProjectionMm:ch,collarWallMm:cw,mountingCount:count,pitchXMm:px,pitchYMm:py,bossDiameterMm:bd,bossHeightMm:bh,holeDiameterMm:hd,holeDepthMm:depth}=p;
  if(!['round','roundedRect'].includes(p.shape))fail('未知面框形状');
  if(!(w>iw&&h>ih&&iw>0&&ih>0&&t>0&&cw>0&&bd>0))fail('外框须大于正尺寸内孔，厚度、颈壁及柱径须为正');
  if([ch,bh,hd,depth,px,py,p.outerRadiusMm,p.boreRadiusMm].some(v=>v<0))fail('长度及半径不能为负');
  if(p.shape==='round'&&(w!==h||iw!==ih))fail('圆形内外宽高必须分别相等');
  const r=p.shape==='round'?w/2:p.outerRadiusMm,ir=p.shape==='round'?iw/2:p.boreRadiusMm;
  if(r>Math.min(w,h)/2||ir>Math.min(iw,ih)/2)fail('角R超出轮廓');
  if(![0,2,4].includes(count))fail('安装柱数量须为0、2或4');
  if(count&&(!(py>0)||count===4&&!(px>0)))fail('安装中心距须为正');
  if(count&&hd>=bd)fail('孔径须小于安装柱径');
  if(count&&hd>0&&depth>0&&depth>=t+bh)fail('盲孔须留底；贯穿请将孔深设0');
  if(count&&hd>0&&(py<=hd||count===4&&px<=hd))fail('安装孔不能相交或相切');
  const centers=count===0?[]:count===2?[[0,-py/2],[0,py/2]]:[[-px/2,-py/2],[px/2,-py/2],[-px/2,py/2],[px/2,py/2]];
  const held=[],hold=s=>{held.push(s);return s;};let result;
  try {
    const outer=hold(outline(cad,w,h,r)),inner=hold(outline(cad,iw,ih,ir));
    const os=hold(outer.sketchOnPlane('XY')),ins=hold(inner.sketchOnPlane('XY'));
    if(!(cad.measureDistanceBetween(os.wire,ins.wire)>1e-6))fail('内外轮廓相交或相切');
    const ring=(width,height,radius,z,heightZ)=>{
      const drawing=hold(outline(cad,width,height,radius)),sketch=hold(drawing.sketchOnPlane('XY',z));
      const holeDrawing=hold(outline(cad,iw,ih,ir)),holeSketch=hold(holeDrawing.sketchOnPlane('XY',z));
      const blank=hold(sketch.extrude(heightZ)),hole=hold(holeSketch.extrude(heightZ));return blank.cut(hole);
    };
    result=ring(w,h,r,0,t);
    if(ch>0){
      const cwidth=iw+2*cw,cheight=ih+2*cw,cr=ir+cw;
      if(!(cwidth<w&&cheight<h))fail('颈口外形须落在面框内');
      const co=hold(outline(cad,cwidth,cheight,cr)),cs=hold(co.sketchOnPlane('XY'));
      if(!(cad.measureDistanceBetween(cs.wire,os.wire)>1e-6))fail('颈口与外框相交或相切');
      const neck=hold(ring(cwidth,cheight,cr,t,ch)),old=result;result=old.fuse(neck);dispose(old);
    }
    for(const [x,y] of centers){
      const radius=bh>0?bd/2:hd/2;
      if(!(roundedDistance(x,y,w,h,r)<-radius-1e-6&&roundedDistance(x,y,iw,ih,ir)>radius+1e-6))fail('安装柱/孔须完整落在面框材料内');
      if(ch>0&&hd>0&&roundedDistance(x,y,iw+2*cw,ih+2*cw,ir+cw)<=hd/2+1e-6)fail('安装孔不得切入颈口');
      if(bh>0){const boss=hold(cad.makeCylinder(bd/2,bh,[x,y,t])),old=result;result=old.fuse(boss);dispose(old);}
      if(hd>0){
        const top=t+bh,start=depth===0?-1:top-depth,length=depth===0?top+2:depth+1;
        const tool=hold(cad.makeCylinder(hd/2,length,[x,y,start])),old=result;result=old.cut(tool);dispose(old);
      }
    }
    validMaterialSolid(result,cad,'安装鸡眼');const complete=result;result=null;return complete;
  } finally {dispose(result);held.reverse().forEach(dispose);}
}
