// Shared geometry for models migrated from the original quick-model builder.
import { HARDWARE_TEMPLATES, buildHardwareTemplate } from '../hardware-templates.js';
const dispose=o=>{try{o?.delete();}catch{}};
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const drawWireSection=(cad,kind,size,radius,chamfer)=>{
  if(kind==='round')return cad.drawCircle(size/2);
  if(kind==='square')return cad.drawRoundedRectangle(size,size,radius);
  const half=size/2,c=chamfer;
  return cad.draw([-half+c,-half]).lineTo([half-c,-half]).lineTo([half,-half+c])
    .lineTo([half,half-c]).lineTo([half-c,half]).lineTo([-half+c,half])
    .lineTo([-half,half-c]).lineTo([-half,-half+c]).close();
};
export function buildLegacyQuickModel(params,cad,{roundAll}={},definitions,buildNested) {
  const definition=definitions[params.kind];check(definition,'未知快速模型');
  const p={...definition.defaults,...params}, kind=p.kind;
  const number=(key,fallback=0)=>{const n=Number(p[key]??fallback);check(Number.isFinite(n),`${key} 必须为有限数值`);return n;};
  if(kind==='uEndHolePlate'){
    const ow=number('outerWidth'),iw=number('innerWidth'),height=number('totalHeight'),thickness=number('thickness');
    const hole=number('holeDiameter'),inset=number('holeInset'),band=(ow-iw)/2,ro=ow/2,ri=iw/2,straight=height-ro;
    check(ow>iw&&iw>0&&height>ro&&thickness>0,'U 板须外宽>内宽>0、总高>外冠半径、板厚>0');
    check(hole>0&&hole<band&&inset>hole/2&&inset+hole/2<straight,'端孔须完整留在直腿内，且不得接触端面或圆冠');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    const line=(a,b)=>hold(cad.makeLine(a,b));
    const arc=(a,b,c)=>hold(cad.makeThreePointArc(a,b,c));
    try{
      const cy=height/2-ro,bottom=-height/2,ox=ow/2,ix=iw/2;
      const wire=hold(cad.assembleWire([
        arc([ox,cy,0],[0,height/2,0],[-ox,cy,0]),
        line([-ox,cy,0],[-ox,bottom,0]),line([-ox,bottom,0],[-ix,bottom,0]),
        line([-ix,bottom,0],[-ix,cy,0]),arc([-ix,cy,0],[0,cy+ri,0],[ix,cy,0]),
        line([ix,cy,0],[ix,bottom,0]),line([ix,bottom,0],[ox,bottom,0]),
        line([ox,bottom,0],[ox,cy,0]),
      ]));
      const face=hold(cad.makeFace(wire)),vector=hold(new (cad.getOC().gp_Vec)(0,0,thickness));
      const maker=hold(new (cad.getOC().BRepPrimAPI_MakePrism)(face.wrapped,vector,false,true));result=cad.cast(maker.Shape());
      for(const x of [-(ow+iw)/4,(ow+iw)/4]){
        const bore=hold(cad.makeCylinder(hole/2,thickness+2,[x,bottom+inset,-1])),old=result;
        result=old.cut(bore);dispose(old);
      }
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false)),solids=result.solids;
      try{check(checker.IsValid()&&solids.length===1,'双端孔 U 板未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    }finally{dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='ellipseSectionRing'){
    const di=number('innerDiameter'),sw=number('sectionWidth'),sd=number('sectionDepth');
    check(di>0&&sw>0&&sd>0&&sw!==sd&&di>=2.5*sw&&di<=300,'椭圆截面圆环须内径≥2.5×正面料宽，宽深不等且均为正');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    try{
      const centerRadius=(di+sw)/2,major=Math.max(sw,sd)/2,minor=Math.min(sw,sd)/2;
      const section=hold(cad.makeEllipse(major,minor,[centerRadius,0,0],[0,1,0],sd>sw?[0,0,1]:[1,0,0]));
      const profile=hold(cad.assembleWire([section])),path=hold(cad.assembleWire([hold(cad.makeCircle(centerRadius))]));
      result=cad.genericSweep(profile,path,{frenet:false,transitionMode:'right'});
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false)),solids=result.solids;
      try{check(checker.IsValid()&&solids.length===1,'椭圆截面圆环未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    }finally{dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='arcBandPlate'){
    const ro=number('outerRadius'),ri=number('innerRadius'),ca=number('centerAngle'),span=number('spanAngle'),thickness=number('thickness');
    const inset=number('holeInsetAngle'),hole=number('holeDiameter'),recess=number('recessDiameter'),recessDepth=number('recessDepth');
    const band=ro-ri,mid=(ro+ri)/2,rad=Math.PI/180;
    check(ro>ri&&ri>0&&band>0&&thickness>0&&span>0&&span<350,'弧板须外R>内R>0、板厚>0，弧跨度在0到350度之间');
    check(inset>0&&2*inset<span&&hole>0&&recess>=hole&&recess<band&&recessDepth>=0&&recessDepth<thickness,'孔位、沉孔和板厚范围无效');
    check(mid*Math.sin(inset*rad)>recess/2&&mid*2*Math.sin((span/2-inset)*rad)>recess,'孔必须完整落在弧板内且两孔不能相交');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    const point=(r,a)=>[r*Math.cos(a),r*Math.sin(a),0];
    try{
      const start=(ca-span/2)*rad,end=(ca+span/2)*rad,middle=(start+end)/2;
      const outline=hold(cad.assembleWire([
        hold(cad.makeThreePointArc(point(ro,start),point(ro,middle),point(ro,end))),
        hold(cad.makeLine(point(ro,end),point(ri,end))),
        hold(cad.makeThreePointArc(point(ri,end),point(ri,middle),point(ri,start))),
        hold(cad.makeLine(point(ri,start),point(ro,start))),
      ]));
      const face=hold(cad.makeFace(outline)),vector=hold(new (cad.getOC().gp_Vec)(0,0,thickness));
      const maker=hold(new (cad.getOC().BRepPrimAPI_MakePrism)(face.wrapped,vector,false,true));result=cad.cast(maker.Shape());
      for(const angle of [start+inset*rad,end-inset*rad]){
        const [x,y]=point(mid,angle);
        const bore=hold(cad.makeCylinder(hole/2,thickness+2,[x,y,-1])),old=result;result=old.cut(bore);dispose(old);
        if(recessDepth>0&&recess>hole){
          const counterbore=hold(cad.makeCylinder(recess/2,recessDepth+1,[x,y,thickness-recessDepth])),before=result;
          result=before.cut(counterbore);dispose(before);
        }
      }
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false)),solids=result.solids;
      try{check(checker.IsValid()&&solids.length===1,'双孔弧板未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    }finally{dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='gableOpenFrame') {
    const ow=number('outerWidth'),iw=number('innerWidth'),op=number('outerPeakHeight'),os=number('outerShoulderHeight');
    const ip=number('innerPeakHeight'),is=number('innerShoulderHeight'),thickness=number('thickness'),r=number('endRadius');
    const band=(ow-iw)/2,outerAtInner=op+(os-op)*iw/ow;
    check(ow>iw&&iw>0&&thickness>0&&r>0&&r<=band/2,'开口框须有正的内外宽、板厚和不超过半带宽的端 R');
    check(op>ip&&ip>is&&outerAtInner>is&&os>r&&is>r,'斜肩框的内外峰、肩须有正的间距，端部不能越过肩');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    const line=(a,b)=>hold(cad.makeLine(a,b));
    const arc=(cx,cy,rad,a,b)=>{const point=t=>[cx+rad*Math.cos(t),cy+rad*Math.sin(t),0];return hold(cad.makeThreePointArc(point(a),point((a+b)/2),point(b)));};
    try {
      const xo=ow/2,xi=iw/2;
      const edges=[line([-xo,r,0],[-xo,os,0]),line([-xo,os,0],[0,op,0]),line([0,op,0],[xo,os,0]),line([xo,os,0],[xo,r,0]),
        arc(xo-r,r,r,0,-Math.PI/2)];
      if(band>2*r+1e-9)edges.push(line([xo-r,0,0],[xi+r,0,0]));
      edges.push(arc(xi+r,r,r,-Math.PI/2,-Math.PI),line([xi,r,0],[xi,is,0]),line([xi,is,0],[0,ip,0]),line([0,ip,0],[-xi,is,0]),line([-xi,is,0],[-xi,r,0]),arc(-xi-r,r,r,0,-Math.PI/2));
      if(band>2*r+1e-9)edges.push(line([-xi-r,0,0],[-xo+r,0,0]));
      edges.push(arc(-xo+r,r,r,-Math.PI/2,-Math.PI));
      const wire=hold(cad.assembleWire(edges)),face=hold(cad.makeFace(wire)),vector=hold(new (cad.getOC().gp_Vec)(0,0,thickness));
      const maker=hold(new (cad.getOC().BRepPrimAPI_MakePrism)(face.wrapped,vector,false,true));result=cad.cast(maker.Shape());
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false)),solids=result.solids;
      try{check(checker.IsValid()&&solids.length===1,'斜肩开口框未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='ellipseSectionRectFrame') {
    const iw=number('innerWidth'),ih=number('innerHeight'),ri=number('innerRadius'),sw=number('sectionWidth'),sd=number('sectionDepth');
    check(sw>0&&sd>0&&sw!==sd&&iw>=2.5*sw&&ih>=2.5*sw&&Math.max(iw,ih)<=200,'椭圆截面方框须正面料宽与侧深不等，内宽高至少为料宽 2.5 倍且不超过 200');
    check(ri>0&&ri<Math.min(iw,ih)/2,'平面内 R 须大于 0 且小于内短边一半');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    const a=(iw+sw)/2,b=(ih+sw)/2,c=ri+sw/2,x=a-c,y=b-c;
    const point=(cx,cy,rad,t)=>[cx+rad*Math.cos(t),cy+rad*Math.sin(t),0];
    const arc=(cx,cy,r,u,v)=>hold(cad.makeThreePointArc(point(cx,cy,r,u),point(cx,cy,r,(u+v)/2),point(cx,cy,r,v)));
    const line=(start,end)=>hold(cad.makeLine(start,end));
    try {
      const path=hold(cad.assembleWire([line([a,-y,0],[a,y,0]),arc(x,y,c,0,Math.PI/2),line([x,b,0],[-x,b,0]),arc(-x,y,c,Math.PI/2,Math.PI),line([-a,y,0],[-a,-y,0]),arc(-x,-y,c,Math.PI,Math.PI*1.5),line([-x,-b,0],[x,-b,0]),arc(x,-y,c,Math.PI*1.5,Math.PI*2)]));
      const major=sd>sw?sd/2:sw/2,minor=sd>sw?sw/2:sd/2,majorAxis=sd>sw?[0,0,1]:[1,0,0];
      const section=hold(cad.makeEllipse(major,minor,[a,-y,0],[0,1,0],majorAxis));
      const profile=hold(cad.assembleWire([section]));
      result=cad.genericSweep(profile,path,{frenet:false,transitionMode:'right'});
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false)),solids=result.solids;
      try{check(checker.IsValid()&&solids.length===1,'椭圆截面方框未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='dFlatFrame') {
    const ow=number('outerWidth'),oh=number('outerHeight'),iw=number('innerWidth'),ih=number('innerHeight');
    const ro=number('outerBottomRadius'),ri=number('innerBottomRadius'),thickness=number('thickness'),gapWidth=number('gapWidth');
    check(ow>iw&&iw>0&&oh>ih&&ih>0&&thickness>0,'D 框须满足外宽高大于内宽高，且平板厚度为正');
    check(oh>ow/2+ro&&ih>iw/2+ri&&ro>0&&ro<ow/2&&ri>0&&ri<iw/2,'半圆冠下方须保留直腿和正的底角 R');
    check(gapWidth>=0&&gapWidth<iw-2*ri,'底缝须非负并小于内底直段');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    const line=(a,b)=>hold(cad.makeLine(a,b));
    const arc=(cx,cy,r,a,b)=>{const point=t=>[cx+r*Math.cos(t),cy+r*Math.sin(t),0];return hold(cad.makeThreePointArc(point(a),point((a+b)/2),point(b)));};
    const outline=(width,height,r)=>{
      const x=width/2,crown=height/2-x,bottom=-height/2,cy=bottom+r,cx=x-r;
      return hold(cad.assembleWire([
        arc(0,crown,x,0,Math.PI),line([-x,crown,0],[-x,cy,0]),
        arc(-cx,cy,r,Math.PI,Math.PI*1.5),line([-cx,bottom,0],[cx,bottom,0]),
        arc(cx,cy,r,Math.PI*1.5,Math.PI*2),line([x,cy,0],[x,crown,0]),
      ]));
    };
    const prism=(wire)=>{const face=hold(cad.makeFace(wire)),vector=hold(new (cad.getOC().gp_Vec)(0,0,thickness)),maker=hold(new (cad.getOC().BRepPrimAPI_MakePrism)(face.wrapped,vector,false,true));return cad.cast(maker.Shape());};
    try {
      const outer=outline(ow,oh,ro),inner=outline(iw,ih,ri);
      check(cad.measureDistanceBetween(outer,inner)>1e-6,'内外 D 轮廓相交或相切');
      const blank=hold(prism(outer)),hole=hold(prism(inner));result=blank.cut(hole);
      if(gapWidth){const cutter=hold(cad.makeBox([-gapWidth/2,-oh/2-1,-1],[gapWidth/2,-ih/2+0.001,thickness+1])),old=result;result=old.cut(cutter);dispose(old);}
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false)),solids=result.solids;
      try{check(checker.IsValid()&&solids.length===1,'平板 D 框未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='archedTwinWindowPlate') {
    const ow=number('outerWidth'),oh=number('outerHeight'),radius=number('bendRadius'),thickness=number('radialThickness');
    check(ow>0&&oh>0&&thickness>0&&radius-thickness>oh/2,'拱板须满足外宽高、径向厚度为正，内弧半径大于外高一半');
    const depth=radius-Math.sqrt((radius-thickness)**2-(oh/2)**2);
    check(depth+1<radius,'拱弧过深，不能可靠隔离圆筒上半面');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    try {
      const flat=hold(buildNested({...p,kind:'twinWindowPlate',thickness:depth+2,edgeRadius:0},cad));
      const prism=hold(flat.translate(0,0,-depth-1));
      const outer=hold(cad.makeCylinder(radius,ow+4,[-ow/2-2,0,-radius],[1,0,0]));
      const inner=hold(cad.makeCylinder(radius-thickness,ow+4,[-ow/2-2,0,-radius],[1,0,0]));
      const wall=hold(outer.cut(inner));result=prism.intersect(wall);
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false)),solids=result.solids;
      try{check(checker.IsValid()&&solids.length===1,'拱弯双窗未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='bowedTwinWindowPlate') {
    const height=number('outerHeight'),straight=number('topStraightWidth'),sideR=number('sideRadius'),cornerR=number('cornerRadius');
    const winW=number('windowWidth'),winH=number('windowHeight'),spacing=number('windowSpacing'),thickness=number('thickness'),edgeR=number('edgeRadius');
    check(height>0&&straight>0&&cornerR>0&&2*cornerR<height&&sideR>cornerR,'鼓边外廓须有正直段、角 R 小于半高、侧 R 大于角 R');
    const cy=height/2-cornerR,delta=sideR-cornerR;
    check(delta>cy,'侧边鼓弧与角弧无法相切');
    const cx=straight/2,sideCx=cx-Math.sqrt(delta*delta-cy*cy),outerWidth=2*(sideCx+sideR);
    check(winW>winH&&winH>0&&spacing>winH&&spacing+winH<height&&winW<outerWidth&&thickness>0,'两个跑道孔必须分离并位于板内');
    check(edgeR>=0&&2*edgeR<Math.min(thickness,spacing-winH,(height-spacing-winH)/2),'边缘 R 须小于板厚、横条和上下边壁的一半');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    const arc=(center,r,a,b)=>{const pt=t=>[center[0]+r*Math.cos(t),center[1]+r*Math.sin(t),0];return hold(cad.makeThreePointArc(pt(a),pt((a+b)/2),pt(b)));};
    const line=(a,b)=>hold(cad.makeLine(a,b));
    const prism=(wire)=>{const face=hold(cad.makeFace(wire)),vector=hold(new (cad.getOC().gp_Vec)(0,0,thickness)),maker=hold(new (cad.getOC().BRepPrimAPI_MakePrism)(face.wrapped,vector,false,true));return cad.cast(maker.Shape());};
    try {
      const angle=Math.atan2(cy,cx-sideCx),right=[sideCx,0],left=[-sideCx,0];
      const topLeft=[-cx,height/2,0],topRight=[cx,height/2,0],bottomRight=[cx,-height/2,0],bottomLeft=[-cx,-height/2,0];
      const outer=hold(cad.assembleWire([
        line(topLeft,topRight),arc([cx,cy],cornerR,Math.PI/2,angle),arc(right,sideR,angle,-angle),arc([cx,-cy],cornerR,-angle,-Math.PI/2),
        line(bottomRight,bottomLeft),arc([-cx,-cy],cornerR,-Math.PI/2,-Math.PI+angle),arc(left,sideR,-Math.PI+angle,-Math.PI-angle),arc([-cx,cy],cornerR,-Math.PI-angle,-3*Math.PI/2),
      ]));
      result=prism(outer);
      for(const y of [spacing/2,-spacing/2]){
        const run=(winW-winH)/2,r=winH/2;
        const hole=hold(cad.assembleWire([
          line([-run,y-r,0],[run,y-r,0]),arc([run,y],r,-Math.PI/2,Math.PI/2),line([run,y+r,0],[-run,y+r,0]),arc([-run,y],r,Math.PI/2,3*Math.PI/2),
        ]));
        check(cad.measureDistanceBetween(outer,hole)>1e-6,'窗口与外廓相交或相切');
        const tool=hold(prism(hole)),old=result;result=old.cut(tool);dispose(old);
      }
      if(edgeR){check(typeof roundAll==='function','当前建模内核不支持边缘倒圆');const old=result;result=roundAll(old,edgeR);dispose(old);}
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false)),solids=result.solids;
      try{check(checker.IsValid()&&solids.length===1,'鼓边双窗未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='roundedFlatFrame') {
    const edgeRadius=number('edgeRadius'),thickness=number('thickness');
    check(edgeRadius>0&&edgeRadius<=thickness/2,'整件圆边 R 须大于 0 且不超过框厚的一半');
    const flat=buildNested({...p,kind:'flatFrame'},cad);
    try{check(typeof roundAll==='function','当前建模内核不支持整件圆边');return roundAll(flat,edgeRadius);}
    finally{dispose(flat);}
  }
  if(kind==='twinWindowPlate') {
    const ow=number('outerWidth'),oh=number('outerHeight'),ro=number('outerRadius'),iw=number('windowWidth'),total=number('totalInnerHeight'),ri=number('windowRadius'),bar=number('barWidth'),thickness=number('thickness'),edgeRadius=number('edgeRadius');
    const windowHeight=(total-bar)/2,windowCenter=(total+bar)/4;
    check(ow>iw&&oh>total&&total>bar&&bar>0&&thickness>0,'双窗板须满足外宽>孔宽、外高>总内高>横条宽>0，板厚>0');
    check(ro>0&&2*ro<Math.min(ow,oh)&&ri>0&&2*ri<Math.min(iw,windowHeight),'外 R 与孔 R 必须为正，且小于相应轮廓短边的一半');
    check(edgeRadius>=0&&2*edgeRadius<Math.min(thickness,bar,(ow-iw)/2,(oh-total)/2),'截面 R 须≥0，且其两倍小于板厚、横条宽及最窄框壁');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    try {
      const outer=hold(cad.drawRoundedRectangle(ow,oh,ro)),outerSketch=hold(outer.sketchOnPlane('XY'));
      const window=hold(cad.drawRoundedRectangle(iw,windowHeight,ri));
      const windows=[windowCenter,-windowCenter].map(y=>hold(window.sketchOnPlane('XY',[0,y,0])));
      for(const hole of windows)check(cad.measureDistanceBetween(outerSketch.wire,hole.wire)>1e-6,'窗口与外轮廓相交或相切');
      result=outerSketch.extrude(thickness);
      for(const hole of windows){const tool=hold(hole.extrude(thickness)),old=result;result=old.cut(tool);dispose(old);}
      if(edgeRadius){check(typeof roundAll==='function','当前建模内核不支持边缘倒圆');const old=result;result=roundAll(old,edgeRadius);dispose(old);}
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='flatFrame'||kind==='mountingPlate'||kind==='bossPlate') {
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    const outline=(width,height,radius)=>{
      check(width>0&&height>0,'轮廓宽高必须大于 0');
      check(radius>=0&&radius<=Math.min(width,height)/2,'轮廓 R 须为 0 到短边的一半');
      return hold(width===height&&radius===width/2?cad.drawCircle(radius):cad.drawRoundedRectangle(width,height,radius));
    };
    try {
      const thickness=number('thickness');check(thickness>0,'厚度必须大于 0');
      const ow=number(kind==='flatFrame'?'outerWidth':'width'),oh=number(kind==='flatFrame'?'outerHeight':'depth'),or=number(kind==='flatFrame'?'outerRadius':'cornerRadius');
      const outer=outline(ow,oh,or),outerSketch=hold(outer.sketchOnPlane('XY'));
      if(kind==='flatFrame') {
        const iw=number('innerWidth'),ih=number('innerHeight'),ir=number('innerRadius');
        check(iw<ow&&ih<oh,'内宽高须分别小于外宽高，并保留真实框壁');
        const inner=outline(iw,ih,ir),innerSketch=hold(inner.sketchOnPlane('XY'));
        check(cad.measureDistanceBetween(outerSketch.wire,innerSketch.wire)>1e-6,'内外轮廓相交或相切，请增大框壁或调整内外 R');
        const blank=hold(outerSketch.extrude(thickness)),tool=hold(innerSketch.extrude(thickness));
        result=blank.cut(tool);
      } else if(kind==='mountingPlate') {
        const diameter=number('holeDiameter'),spacing=number('holeSpacing');
        check(diameter>0&&spacing>diameter&&spacing/2<ow/2,'孔距须大于孔径，且孔中心须位于板内');
        const centers=[[-spacing/2,0,0],[spacing/2,0,0]];
        for(const center of centers){const vertex=hold(cad.makeVertex(center));check(cad.measureDistanceBetween(outerSketch.wire,vertex)>diameter/2+1e-6,'孔与板边界相交或相切，请减小孔径或孔距');}
        result=outerSketch.extrude(thickness);
        for(const center of centers){const tool=hold(cad.makeCylinder(diameter/2,thickness+2,[center[0],center[1],-1])),old=result;result=old.cut(tool);dispose(old);}
      } else {
        const spacing=number('bossSpacing'),outerDiameter=number('bossOuterDiameter'),boreDiameter=number('boreDiameter'),bossHeight=number('bossHeight');
        check(spacing>outerDiameter,'凸台中心距必须大于外径，凸台不得相切或重叠');
        check(outerDiameter>0&&boreDiameter>0&&boreDiameter<outerDiameter,'孔径须大于 0 且小于凸台外径');
        check(bossHeight>0,'凸台高度必须大于 0');
        const centers=[-spacing/2,spacing/2].map(x=>[x,0,0]);
        check(spacing/2<ow/2,'凸台中心必须位于板宽范围内');
        for(const center of centers){const vertex=hold(cad.makeVertex(center));check(cad.measureDistanceBetween(outerSketch.wire,vertex)>outerDiameter/2+1e-6,'凸台外缘必须严格位于板轮廓内');}
        result=outerSketch.extrude(thickness);
        for(const center of centers){
          const boss=hold(cad.makeCylinder(outerDiameter/2,bossHeight,[center[0],0,-bossHeight])),old=result;
          const builder=hold(new (cad.getOC().BRepAlgoAPI_Fuse)(old.wrapped,boss.wrapped));builder.Build();result=cad.cast(builder.Shape());dispose(old);
        }
        for(const center of centers){const tool=hold(cad.makeCylinder(boreDiameter/2,bossHeight+thickness+2,[center[0],0,-bossHeight-1])),old=result;result=old.cut(tool);dispose(old);}
      }
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='flangedBushing') {
    const bodyDiameter=number('bodyDiameter'),flangeDiameter=number('flangeDiameter'),boreDiameter=number('boreDiameter'),bodyHeight=number('bodyHeight'),flangeThickness=number('flangeThickness');
    check(boreDiameter>0&&bodyDiameter>boreDiameter&&flangeDiameter>=bodyDiameter,'尺寸须满足 0 < 孔径 < 筒体外径 ≤ 法兰外径');
    check(bodyHeight>0&&flangeThickness>0,'筒体高度与法兰厚度必须大于 0');
    const resources=[],hold=o=>{resources.push(o);return o;};let result=null;
    try {
      const flange=hold(cad.makeCylinder(flangeDiameter/2,flangeThickness,[0,0,0]));
      const body=hold(cad.makeCylinder(bodyDiameter/2,bodyHeight,[0,0,flangeThickness]));
      const builder=hold(new (cad.getOC().BRepAlgoAPI_Fuse)(flange.wrapped,body.wrapped));builder.Build();result=cad.cast(builder.Shape());
      const bore=hold(cad.makeCylinder(boreDiameter/2,bodyHeight+flangeThickness+2,[0,0,-1]));const old=result;result=old.cut(bore);dispose(old);
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='openArcRing') {
    const sectionSize=number('sectionSize'),sectionRadius=number('sectionRadius'),sectionChamfer=number('sectionChamfer'),innerDiameter=number('innerDiameter'),openingAngle=number('openingAngle');
    check(['round','square','chamferedSquare'].includes(p.section),'截面必须为圆线、圆角方线或倒角方线');
    check(sectionSize>0&&innerDiameter>=4*sectionSize,'内径至少为截面尺寸的 4 倍');
    check(openingAngle>=5&&openingAngle<=180,'开口角度须为 5° 到 180°');
    if(p.section==='square')check(sectionRadius>0&&sectionRadius<sectionSize/2,'方线须满足 0 < 截面 R < 边长/2');
    if(p.section==='chamferedSquare')check(sectionChamfer>0&&sectionChamfer<sectionSize/2,'倒角方线须满足 0 < 截面 C < 边长/2');
    const resources=[],hold=o=>{resources.push(o);return o;};
    try {
      const radius=(innerDiameter+sectionSize)/2,gap=openingAngle*Math.PI/180;
      const start=-Math.PI/2+gap/2,end=3*Math.PI/2-gap/2,mid=(start+end)/2;
      const point=angle=>[radius*Math.cos(angle),radius*Math.sin(angle),0];
      const path=hold(cad.makeThreePointArc(point(start),point(mid),point(end)));
      const wire=hold(cad.assembleWire([path]));
      const origin=point(start),radial=[Math.cos(start),Math.sin(start),0],tangent=[-Math.sin(start),Math.cos(start),0];
      const plane=hold(new cad.Plane(origin,radial,tangent));
      const drawing=hold(drawWireSection(cad,p.section,sectionSize,sectionRadius,sectionChamfer));
      const profile=hold(drawing.sketchOnPlane(plane));
      return cad.genericSweep(profile.wire,wire,{frenet:false,transitionMode:'right'});
    } finally {resources.reverse().forEach(dispose);}
  }
  if(kind==='ellipseBar') {
    const iw=number('innerWidth'),ih=number('innerHeight'),size=number('sectionSize'),diameter=number('barDiameter'),depth=number('barDepthOffset');
    check(iw>ih&&ih>=4*size&&size>0,'椭圆圈须满足长径>短径≥4×线径>0');
    check(diameter>0&&diameter<=size&&Math.abs(depth)<(size+diameter)/2,'杆径须为正且不大于线径，Z 错层须保持实体交叠');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    try {
      const a=iw/2,b=ih/2,centerRadius=size/2;
      const ellipse=hold(cad.makeEllipse(a,b)),innerWire=hold(cad.assembleWire([ellipse]));
      // offset2D consumes its source wire. The resulting path is the exact
      // outward offset of the specified inner ellipse, not another ellipse.
      const path=hold(innerWire.offset2D(centerRadius));
      const plane=hold(new cad.Plane([a+centerRadius,0,0],[1,0,0],[0,1,0]));
      const profileDrawing=hold(cad.drawCircle(centerRadius)),profile=hold(profileDrawing.sketchOnPlane(plane));
      const ring=hold(cad.genericSweep(profile.wire,path,{frenet:false,transitionMode:'right'}));
      const bar=hold(cad.makeCylinder(diameter/2,iw+size,[-a-centerRadius,0,depth],[1,0,0]));
      const builder=hold(new (cad.getOC().BRepAlgoAPI_Fuse)(ring.wrapped,bar.wrapped));builder.Build();result=cad.cast(builder.Shape());
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false));
      const solids=result.solids;try{check(checker.IsValid()&&solids.length===1,'椭圆圈与横杆未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='ellipseOpenWire') {
    const iw=number('innerWidth'),ih=number('innerHeight'),size=number('sectionSize'),gap=number('gapWidth');
    check(size>0&&Math.min(iw,ih)>=4*size&&iw!==ih,'内真椭圆须两轴不等且短轴≥4×线径>0');
    check(gap>0&&gap<size,'底中实际缝宽须大于 0 且小于线径');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    try {
      const radius=size/2,vertical=ih>iw,xDir=vertical?[0,1,0]:[1,0,0];
      const ellipse=hold(cad.makeEllipse(Math.max(iw,ih)/2,Math.min(iw,ih)/2,[0,0,0],[0,0,1],xDir));
      const innerWire=hold(cad.assembleWire([ellipse]));
      // offset2D consumes its source wire; the original inner outline remains
      // a true ellipse while the swept centerline is its outward parallel.
      const path=hold(innerWire.offset2D(radius));
      const start=vertical?[0,ih/2+radius,0]:[iw/2+radius,0,0];
      const plane=hold(new cad.Plane(start,xDir,vertical?[1,0,0]:[0,1,0]));
      const drawing=hold(cad.drawCircle(radius)),profile=hold(drawing.sketchOnPlane(plane));
      const ring=hold(cad.genericSweep(profile.wire,path,{frenet:false,transitionMode:'right'}));
      const outerHeight=ih+2*size;
      const cutter=hold(cad.makeBox([-gap/2,-outerHeight/2-size,-size],[gap/2,-outerHeight/2+2*size,size]));
      const builder=hold(new (cad.getOC().BRepAlgoAPI_Cut)(ring.wrapped,cutter.wrapped));builder.Build();
      result=cad.cast(builder.Shape());
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false));
      const solids=result.solids;try{check(checker.IsValid()&&solids.length===1,'椭圆开缝切口未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(kind==='profileLoop'||kind==='capsuleWire') {
    const round=kind==='capsuleWire',iw=number('innerWidth'),ih=number('innerHeight');
    const width=round?number('sectionSize'):number('sectionWidth'),depth=round?width:number('sectionDepth'),radius=round?0:number('sectionRadius');
    check(iw>ih&&ih>0&&width>0&&depth>0,'直段长圈须内宽>内高>0，截面宽厚均为正');
    if(!round)check(radius>0&&2*radius<=Math.min(width,depth),'截面四角 R 须大于 0 且不大于截面短边一半');
    const resources=[],hold=o=>{resources.push(o);return o;};let result;
    try {
      const halfRun=(iw-ih)/2,centerRadius=(ih+width)/2;
      const edges=[
        hold(cad.makeLine([-halfRun,-centerRadius,0],[halfRun,-centerRadius,0])),
        hold(cad.makeThreePointArc([halfRun,-centerRadius,0],[halfRun+centerRadius,0,0],[halfRun,centerRadius,0])),
        hold(cad.makeLine([halfRun,centerRadius,0],[-halfRun,centerRadius,0])),
        hold(cad.makeThreePointArc([-halfRun,centerRadius,0],[-halfRun-centerRadius,0,0],[-halfRun,-centerRadius,0])),
      ];
      const path=hold(cad.assembleWire(edges));
      const plane=hold(new cad.Plane([-halfRun,-centerRadius,0],[0,-1,0],[1,0,0]));
      let sectionWire;
      if(!round&&width===depth&&2*radius===width){
        const drawing=hold(cad.drawCircle(radius)),profile=hold(drawing.sketchOnPlane(plane));
        sectionWire=profile.wire;
      }else if(!round&&2*radius===Math.min(width,depth)){
        // Replicad's roundedRectangle sketch degenerates at a half-short-side
        // radius. Construct the exact stadium section from two lines and arcs.
        const r=radius,halfStraight=(Math.max(width,depth)-2*r)/2;
        const local=(x,y)=>[-halfRun,-centerRadius-x,-y];
        const vertical=width<=depth;
        const p=(u,v)=>vertical?local(u,v):local(v,u);
        sectionWire=hold(cad.assembleWire([
          hold(cad.makeLine(p(r,-halfStraight),p(r,halfStraight))),
          hold(cad.makeThreePointArc(p(r,halfStraight),p(0,halfStraight+r),p(-r,halfStraight))),
          hold(cad.makeLine(p(-r,halfStraight),p(-r,-halfStraight))),
          hold(cad.makeThreePointArc(p(-r,-halfStraight),p(0,-halfStraight-r),p(r,-halfStraight))),
        ]));
      }else{
        const drawing=hold(round?cad.drawCircle(width/2):cad.drawRoundedRectangle(width,depth,radius)),profile=hold(drawing.sketchOnPlane(plane));
        sectionWire=profile.wire;
      }
      result=cad.genericSweep(sectionWire,path,{frenet:false,transitionMode:'right'});
      const checker=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false));
      const solids=result.solids;try{check(checker.IsValid()&&solids.length===1,'直段长圈未形成有效单实体');}finally{solids.forEach(dispose);}
      const complete=result;result=null;return complete;
    } finally {dispose(result);resources.reverse().forEach(dispose);}
  }
  if(Object.hasOwn(HARDWARE_TEMPLATES,kind)) return buildHardwareTemplate(p,cad);
  const s=number('sectionSize'), r=number('sectionRadius'), c=number('sectionChamfer'), g=number('gapWidth'), w=number('innerWidth'),h=number('innerHeight'),ri=number('innerRadius');
  check(s>0,'截面尺寸必须大于 0');
  if(kind==='washer') {
    const di=number('innerDiameter');check(di>0&&h>0,'内径与厚度必须为正');
    const outer=cad.makeCylinder(di/2+s,h,[0,0,-h/2]),inner=cad.makeCylinder(di/2,h+2,[0,0,-h/2-1]);
    try{return outer.cut(inner);}finally{dispose(outer);dispose(inner);}
  }
  check(['round','square','chamferedSquare'].includes(p.section),'截面必须为圆线、圆角方线或倒角方线');
  const round=p.section==='round',square=p.section==='square',chamfered=p.section==='chamferedSquare';
  if(square)check(r>0&&r<s/2,'方线须满足 0 < 截面 R < 边长/2');
  if(chamfered)check(c>0&&c<s/2,'倒角方线须满足 0 < 截面 C < 边长/2');
  check(g>=0,'缝宽不能为负');
  const resources=[],hold=o=>{resources.push(o);return o;};
  const point=(cx,cy,rad,angle)=>[cx+rad*Math.cos(angle),cy+rad*Math.sin(angle),0];
  const arc=(cx,cy,rad,a,b)=>hold(cad.makeThreePointArc(point(cx,cy,rad,a),point(cx,cy,rad,(a+b)/2),point(cx,cy,rad,b)));
  const line=(a,b)=>hold(cad.makeLine(a,b));
  const sweep=(edges,origin,xDirection,normal)=>{
    const wire=hold(cad.assembleWire(edges)),plane=hold(new cad.Plane(origin,xDirection,normal));
    const drawing=hold(drawWireSection(cad,p.section,s,r,c));
    const profile=hold(drawing.sketchOnPlane(plane));
    return cad.genericSweep(profile.wire,wire,{frenet:false,transitionMode:'right'});
  };
  let shape=null;
  const cutBox=(min,max)=>{const tool=hold(cad.makeBox(min,max)),old=shape;shape=old.cut(tool);dispose(old);};
  const addBar=(length,origin,d)=>{
    const tool=hold(cad.makeCylinder(d/2,length,origin,[1,0,0])),old=shape;
    // Keep OCCT's exact intersection topology: Replicad's unconditional
    // SimplifyResult(angularTolerance=.001) can invalidate round-wire joins.
    const builder=hold(new (cad.getOC().BRepAlgoAPI_Fuse)(old.wrapped,tool.wrapped));
    builder.Build();shape=cad.cast(builder.Shape());dispose(old);
  };
  try {
    if(kind==='ring'||kind==='ringBar') {
      const di=number('innerDiameter'),rc=(di+s)/2;check(di>0,'内径必须为正');
      check((round&&!g&&kind==='ring')||di>=4*s,'方线、横杆或开缝圆圈需要内径至少为截面尺寸 4 倍');check(g<=s,'圆圈缝宽不得超过截面尺寸');
      shape=sweep([hold(cad.makeCircle(rc))],[rc,0,0],[1,0,0],[0,1,0]);
      if(kind==='ringBar'){
        const d=number('barDiameter'),off=number('barOffset'),depth=number('barDepthOffset');
        check(!g&&d>0&&d<=s,'固定横杆需要闭合圆环，且 0 < 杆径 ≤ 环截面尺寸');
        check(Math.abs(off)+d/2<di/2,'横杆必须位于环内孔并接到左右环壁');
        check(Math.abs(depth)<(s+d)/2,'横杆 Z 错层过大，无法与环形成实体交叠');
        const end=Math.sqrt(rc*rc-off*off);
        addBar(2*end,[-end,off,depth],d);
      } else if(g)cutBox([-g/2,-rc-s,-s], [g/2,0,s]);
    } else if(kind==='dBuckle'||kind==='dBarBuckle') {
      check(w>0&&h>0,'内宽高必须为正');const rc=(w+s)/2;
      if(kind==='dBarBuckle') {
        const d=number('barDiameter');check(square&&d>0&&d<s&&h>w/2,'独立横杆 D 扣需要方线、0 < 杆径 < 方线边长、内高 > 内宽/2');check(!g,'独立横杆 D 扣不支持开缝');
        const foot=w/2-h-d,by=w/2-h-d/2;
        shape=sweep([line([rc,foot,0],[rc,0,0]),arc(0,0,rc,0,Math.PI),line([-rc,0,0],[-rc,foot,0])],[rc,foot,0],[1,0,0],[0,1,0]);
        addBar(2*rc,[-rc,by,0],d);
      } else {
        check(ri>0&&ri<w/2&&h>w/2+ri,'D 扣需要 0 < 底内 R < 内宽/2，内高 > 内宽/2 + 底内 R');check(g<w-2*ri,'缝宽必须小于底部直段长度');
        const cr=ri+s/2,bottom=w/2-h-s/2,cy=bottom+cr,cx=rc-cr;
        shape=sweep([arc(0,0,rc,0,Math.PI),line([-rc,0,0],[-rc,cy,0]),arc(-cx,cy,cr,Math.PI,Math.PI*1.5),line([-cx,bottom,0],[cx,bottom,0]),arc(cx,cy,cr,Math.PI*1.5,Math.PI*2),line([rc,cy,0],[rc,0,0])],[rc,0,0],[1,0,0],[0,1,0]);
        if(g)cutBox([-g/2,bottom-s/2-.001,-s/2-.001],[g/2,bottom+s/2+.001,s/2+.001]);
      }
    } else if(kind==='rectBuckle'||kind==='sliderBuckle') {
      const minimumRatio=round&&!g?2.5:4;
      check(s>=.5&&s<=20&&Math.min(w,h)>=minimumRatio*s&&Math.max(w,h)<=200&&ri>0&&ri<Math.min(w,h)/2,`方框范围：0.5≤截面≤20，内宽高≥${minimumRatio}倍截面且≤200，0<框内R<短边/2`);
      check(g<=s&&g<w-2*ri,'底缝须≤截面尺寸且小于底直段');
      const a=(w+s)/2,b=(h+s)/2,c=ri+s/2,x=a-c,y=b-c;
      shape=sweep([line([a,-y,0],[a,y,0]),arc(x,y,c,0,Math.PI/2),line([x,b,0],[-x,b,0]),arc(-x,y,c,Math.PI/2,Math.PI),line([-a,y,0],[-a,-y,0]),arc(-x,-y,c,Math.PI,Math.PI*1.5),line([-x,-b,0],[x,-b,0]),arc(x,-y,c,Math.PI*1.5,Math.PI*2)],[a,-y,0],[1,0,0],[0,1,0]);
      if(kind==='sliderBuckle') {
        const d=number('barDiameter'),off=number('barOffset');check(!g,'日字扣不支持开缝');check(d>0&&d<=s,'横杆直径须 >0 且不超过框截面尺寸');check(h/2-Math.abs(off)-d/2>=s&&Math.abs(off)+d/2<h/2-ri,'横杆须接在直腿区，且上下净窗口高至少为框截面尺寸 1 倍');
        addBar(2*a,[-a,off,0],d);
      } else if(g)cutBox([-g/2,-b-s/2-.001,-s/2-.001],[g/2,-b+s/2+.001,s/2+.001]);
    } else if(kind==='ovalBuckle') {
      check(w>=1.1*h&&w<=2.5*h&&h>=2.5*s&&ri>=s&&ri<.48*h,'四圆弧旦扣范围：1.1H≤W≤2.5H，H≥2.5s，s≤端内R<0.48H');check(g<=s,'旦扣缝宽不得超过截面尺寸');
      const a=w/2,b=h/2,cx=a-ri,large=(cx*cx+b*b-ri*ri)/(2*(b-ri)),cy=large-b,t=Math.atan2(cy,cx),rr=ri+s/2,lr=large+s/2;
      shape=sweep([arc(cx,0,rr,-t,t),arc(0,-cy,lr,t,Math.PI-t),arc(-cx,0,rr,Math.PI-t,Math.PI+t),arc(0,cy,lr,Math.PI+t,Math.PI*2-t)],point(cx,0,rr,-t),[Math.cos(t),-Math.sin(t),0],[Math.sin(t),Math.cos(t),0]);
      if(g)cutBox([cx+rr-s,-g/2,-s],[cx+rr+s,g/2,s]);
    } else throw new Error('未知快速模型');
    const result=shape;shape=null;return result;
  } finally {dispose(shape);resources.reverse().forEach(dispose);}
}
