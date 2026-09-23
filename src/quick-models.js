// Exact, bounded planar hardware templates ported from text-to-cad's verified
// simple-d / simple-circle / simple-rect / simple-oval Python generators.
// No business drawings or source product identifiers are embedded here.
import { HARDWARE_TEMPLATES, buildHardwareTemplate } from './hardware-templates.js';
const field = (key,label,labelEn,min=0,step=0.1) => ({key,label,labelEn,type:'number',min,step});
const section = {key:'section',label:'截面',labelEn:'Section',type:'select',options:[{value:'round',label:'圆线',labelEn:'Round wire'},{value:'square',label:'圆角方线',labelEn:'Rounded square'}]};
const s = field('sectionSize','线径／方线边长','Wire diameter / square size',0.1);
const sr = field('sectionRadius','方线截面 R（圆线忽略）','Square section corner R',0);
const w = field('innerWidth','内宽','Inner width',0.1), h = field('innerHeight','内高','Inner height',0.1);
const gap = field('gapWidth','底部实际缝宽（0 闭合）','Bottom gap (0 = closed)');
const base={section:'round',sectionSize:3,sectionRadius:0.3,gapWidth:0};
export const QUICK_MODELS = Object.freeze({
  flatFrame:{label:'独立内外圆角平面框',labelEn:'Flat frame with independent corner radii',description:'内外轮廓分别定义，框宽与厚度独立；圆角可等于短边一半形成跑道环。参数模板，不是原 IGS 完整复刻。',descriptionEn:'Independent inner/outer outlines and thickness. Half-short-side radii allow capsule frames. A parametric tool, not a complete reconstruction of an IGS part.',defaults:{outerWidth:40,outerHeight:28,innerWidth:28,innerHeight:16,outerRadius:5,innerRadius:3,thickness:3},fields:[field('outerWidth','外宽','Outer width',0.1),field('outerHeight','外高','Outer height',0.1),w,h,field('outerRadius','外轮廓 R','Outer corner radius'),field('innerRadius','内轮廓 R','Inner corner radius'),field('thickness','厚度','Thickness',0.1)]},
  mountingPlate:{label:'双孔圆角安装板',labelEn:'Two-hole rounded mounting plate',description:'孔沿 X 对称，中心距单独定义；孔为贯穿光孔，不含螺纹、沉头或沉孔。',descriptionEn:'Two symmetric X-axis holes with independent center spacing. Plain through holes only; no threads, countersinks or counterbores.',defaults:{width:40,depth:16,thickness:3,cornerRadius:3,holeDiameter:4,holeSpacing:24},fields:[field('width','板宽 X','Plate width X',0.1),field('depth','板深 Y','Plate depth Y',0.1),field('thickness','厚度','Thickness',0.1),field('cornerRadius','外角 R','Outer corner radius'),field('holeDiameter','孔径','Hole diameter',0.1),field('holeSpacing','两孔中心距','Hole center spacing',0.1)]},
  bossPlate:{label:'双空心柱安装板',labelEn:'Two hollow-boss mounting plate',description:'圆角板上两根对称空心圆柱凸台，孔贯穿凸台与板。参数化通用实体，不代表螺纹、沉孔或原产品复刻。',descriptionEn:'A rounded plate with two symmetric hollow cylindrical bosses; each bore passes through both boss and plate. Generic parametric geometry, not a threaded, counterbored, or source-product reconstruction.',defaults:{width:40,depth:16,thickness:3,cornerRadius:3,bossSpacing:24,bossOuterDiameter:8,boreDiameter:4,bossHeight:6},fields:[field('width','板宽 X','Plate width X',0.1),field('depth','板深 Y','Plate depth Y',0.1),field('thickness','板厚','Plate thickness',0.1),field('cornerRadius','板角 R','Plate corner radius'),field('bossSpacing','凸台中心距','Boss center spacing',0.1),field('bossOuterDiameter','凸台外径','Boss outer diameter',0.1),field('boreDiameter','通孔直径','Through-bore diameter',0.1),field('bossHeight','凸台高度（板下）','Boss height (below plate)',0.1)]},
  flangedBushing:{label:'法兰轴套',labelEn:'Flanged bushing',description:'同轴法兰与圆筒轴套，直孔贯穿全长。通用参数化实体，不含螺纹或原产品特征复刻。',descriptionEn:'A coaxial flange and cylindrical bushing with a straight bore through the full length. Generic parametric geometry, with no threads or source-product feature reconstruction.',defaults:{bodyDiameter:12,flangeDiameter:20,boreDiameter:6,bodyHeight:10,flangeThickness:3},fields:[field('bodyDiameter','轴套外径','Bushing body diameter',0.1),field('flangeDiameter','法兰外径','Flange diameter',0.1),field('boreDiameter','通孔直径','Through-bore diameter',0.1),field('bodyHeight','筒体高度','Body height',0.1),field('flangeThickness','法兰厚度','Flange thickness',0.1)]},
  openArcRing:{label:'大开口 C 环',labelEn:'Wide-gap C ring',description:'恒截面圆弧环，开口角度可调，适合开口环、钩环和未闭合圆框的基础毛坯；不包含端头球、铰链或变截面。',descriptionEn:'Constant-section circular arc with an adjustable opening angle for C rings, hook rings and open circular frames. End balls, hinges and variable sections are excluded.',defaults:{section:'round',innerDiameter:30,sectionSize:4,sectionRadius:0.4,openingAngle:70},fields:[field('innerDiameter','内径','Inner diameter',0.1),section,s,sr,field('openingAngle','开口角度（°）','Opening angle (degrees)',5,1)]},
  ...HARDWARE_TEMPLATES,
  ring:{label:'圆圈',labelEn:'Ring',description:'同心圆恒截面单圈；开缝为底部正中平行平切。',defaults:{...base,innerDiameter:24},fields:[field('innerDiameter','内径','Inner diameter',0.1),section,s,sr,gap]},
  dBuckle:{label:'D 扣',labelEn:'D buckle',description:'半圆冠、两直腿、底部圆弯；内高量到下横杠上沿。',defaults:{...base,innerWidth:24,innerHeight:19,innerRadius:2},fields:[w,h,section,s,sr,field('innerRadius','底内 R','Bottom inner radius',0.1),gap]},
  dBarBuckle:{label:'独立圆横杆 D 扣',labelEn:'D buckle with round bar',description:'圆角方线 U 主体与固定圆杆融合；杆底与脚底齐平。',defaults:{...base,section:'square',sectionSize:6,sectionRadius:0.6,innerWidth:32,innerHeight:24,barDiameter:4.5},fields:[w,h,s,sr,field('barDiameter','固定横杆直径','Bar diameter',0.1)]},
  rectBuckle:{label:'方扣',labelEn:'Rectangular buckle',description:'恒截面圆角矩形框；内宽高至少为截面尺寸的 4 倍。',defaults:{...base,innerWidth:28,innerHeight:20,innerRadius:3},fields:[w,h,section,s,sr,field('innerRadius','框内 R','Frame inner radius',0.1),gap]},
  sliderBuckle:{label:'日字扣',labelEn:'Slider buckle',description:'外框整体内高；固定圆杆偏移上正下负，不支持开缝。',defaults:{...base,innerWidth:30,innerHeight:24,innerRadius:3,barDiameter:2.5,barOffset:0},fields:[w,h,section,s,sr,field('innerRadius','框内 R','Frame inner radius',0.1),field('barDiameter','横杆直径','Bar diameter',0.1),field('barOffset','横杆偏移（上正下负）','Bar offset (+up)',-100)]},
  ovalBuckle:{label:'四圆弧旦扣',labelEn:'Four-arc oval buckle',description:'四段相切圆弧，不是椭圆或跑道圈；缝在右端正中。',defaults:{...base,innerWidth:28,innerHeight:16,innerRadius:5.6},fields:[w,h,section,s,sr,field('innerRadius','端部内 R','End inner radius',0.1),field('gapWidth','右端实际缝宽（0 闭合）','Right gap (0 = closed)')]},
  washer:{label:'平垫圈',labelEn:'Flat washer',description:'平面环片，外径 = 内径 + 2 × 径向宽度；无额外倒角。',defaults:{innerDiameter:10,sectionSize:3,innerHeight:1.5},fields:[field('innerDiameter','内径','Inner diameter',0.1),field('sectionSize','径向宽度','Radial width',0.1),field('innerHeight','厚度','Thickness',0.1)]},
});
const dispose=o=>{try{o?.delete();}catch{}};
const check=(condition,message)=>{if(!condition)throw new Error(message);};
export function buildQuickModel(params,cad) {
  const definition=QUICK_MODELS[params.kind];check(definition,'未知快速模型');
  const p={...definition.defaults,...params}, kind=p.kind;
  const number=(key,fallback=0)=>{const n=Number(p[key]??fallback);check(Number.isFinite(n),`${key} 必须为有限数值`);return n;};
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
        check(diameter>0&&spacing>diameter,'孔径须为正，孔距须大于孔径，两个孔不得相交或相切');
        check(spacing/2<ow/2,'孔中心必须位于板内');
        const centers=[[-spacing/2,0,0],[spacing/2,0,0]];
        for(const center of centers){const vertex=hold(cad.makeVertex(center));check(cad.measureDistanceBetween(outerSketch.wire,vertex)>diameter/2+1e-6,'孔与板边界相交或相切，请减小孔径或孔距');}
        result=outerSketch.extrude(thickness);
        for(const center of centers){const tool=hold(cad.makeCylinder(diameter/2,thickness+2,[center[0],0,-1])),old=result;result=old.cut(tool);dispose(old);}
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
    const sectionSize=number('sectionSize'),sectionRadius=number('sectionRadius'),innerDiameter=number('innerDiameter'),openingAngle=number('openingAngle');
    check(['round','square'].includes(p.section),'截面必须为圆线或圆角方线');
    check(sectionSize>0&&innerDiameter>=4*sectionSize,'内径至少为截面尺寸的 4 倍');
    check(openingAngle>=5&&openingAngle<=180,'开口角度须为 5° 到 180°');
    if(p.section==='square')check(sectionRadius>0&&sectionRadius<sectionSize/2,'方线须满足 0 < 截面 R < 边长/2');
    const resources=[],hold=o=>{resources.push(o);return o;};
    try {
      const radius=(innerDiameter+sectionSize)/2,gap=openingAngle*Math.PI/180;
      const start=-Math.PI/2+gap/2,end=3*Math.PI/2-gap/2,mid=(start+end)/2;
      const point=angle=>[radius*Math.cos(angle),radius*Math.sin(angle),0];
      const path=hold(cad.makeThreePointArc(point(start),point(mid),point(end)));
      const wire=hold(cad.assembleWire([path]));
      const origin=point(start),radial=[Math.cos(start),Math.sin(start),0],tangent=[-Math.sin(start),Math.cos(start),0];
      const plane=hold(new cad.Plane(origin,radial,tangent));
      const drawing=hold(p.section==='square'?cad.drawRoundedRectangle(sectionSize,sectionSize,sectionRadius):cad.drawCircle(sectionSize/2));
      const profile=hold(drawing.sketchOnPlane(plane));
      return cad.genericSweep(profile.wire,wire,{frenet:false,transitionMode:'right'});
    } finally {resources.reverse().forEach(dispose);}
  }
  if(Object.hasOwn(HARDWARE_TEMPLATES,kind)) return buildHardwareTemplate(p,cad);
  const s=number('sectionSize'), r=number('sectionRadius'), g=number('gapWidth'), w=number('innerWidth'),h=number('innerHeight'),ri=number('innerRadius');
  check(s>0,'截面尺寸必须大于 0');
  if(kind==='washer') {
    const di=number('innerDiameter');check(di>0&&h>0,'内径与厚度必须为正');
    const outer=cad.makeCylinder(di/2+s,h,[0,0,-h/2]),inner=cad.makeCylinder(di/2,h+2,[0,0,-h/2-1]);
    try{return outer.cut(inner);}finally{dispose(outer);dispose(inner);}
  }
  check(['round','square'].includes(p.section),'截面必须为圆线或圆角方线');
  const square=p.section==='square';if(square)check(r>0&&r<s/2,'方线须满足 0 < 截面 R < 边长/2');
  check(g>=0,'缝宽不能为负');
  const resources=[],hold=o=>{resources.push(o);return o;};
  const point=(cx,cy,rad,angle)=>[cx+rad*Math.cos(angle),cy+rad*Math.sin(angle),0];
  const arc=(cx,cy,rad,a,b)=>hold(cad.makeThreePointArc(point(cx,cy,rad,a),point(cx,cy,rad,(a+b)/2),point(cx,cy,rad,b)));
  const line=(a,b)=>hold(cad.makeLine(a,b));
  const sweep=(edges,origin,xDirection,normal)=>{
    const wire=hold(cad.assembleWire(edges)),plane=hold(new cad.Plane(origin,xDirection,normal));
    const drawing=hold(square?cad.drawRoundedRectangle(s,s,r):cad.drawCircle(s/2));
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
    if(kind==='ring') {
      const di=number('innerDiameter'),rc=(di+s)/2;check(di>0,'内径必须为正');
      check((!square&&!g)||di>=4*s,'方线或开缝圆圈需要内径至少为截面尺寸 4 倍');check(g<=s,'圆圈缝宽不得超过截面尺寸');
      shape=sweep([hold(cad.makeCircle(rc))],[rc,0,0],[1,0,0],[0,1,0]);
      if(g)cutBox([-g/2,-rc-s,-s], [g/2,0,s]);
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
      check(s>=.5&&s<=20&&Math.min(w,h)>=4*s&&Math.max(w,h)<=200&&ri>0&&ri<Math.min(w,h)/2,'方框范围：0.5≤截面≤20，内宽高≥4倍截面且≤200，0<框内R<短边/2');
      check(g<=s&&g<w-2*ri,'底缝须≤截面尺寸且小于底直段');
      const a=(w+s)/2,b=(h+s)/2,c=ri+s/2,x=a-c,y=b-c;
      shape=sweep([line([a,-y,0],[a,y,0]),arc(x,y,c,0,Math.PI/2),line([x,b,0],[-x,b,0]),arc(-x,y,c,Math.PI/2,Math.PI),line([-a,y,0],[-a,-y,0]),arc(-x,-y,c,Math.PI,Math.PI*1.5),line([-x,-b,0],[x,-b,0]),arc(x,-y,c,Math.PI*1.5,Math.PI*2)],[a,-y,0],[1,0,0],[0,1,0]);
      if(kind==='sliderBuckle') {
        const d=number('barDiameter'),off=number('barOffset');check(!g,'日字扣不支持开缝');check(d>0&&d<=s,'横杆直径须 >0 且不超过框截面尺寸');check(h/2-Math.abs(off)-d/2>=2*s&&Math.abs(off)+d/2<h/2-ri,'横杆须接在直腿区，且上下净窗口高至少为框截面尺寸 2 倍');
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
