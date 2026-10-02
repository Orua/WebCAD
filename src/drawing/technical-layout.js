const fmt=v=>Number(v.toFixed(2)).toString();
// One paper-space scene feeds SVG, PDF, JPG and CAD exchange consistently.
export function layoutDrawing(drawing,{disabledDimensions=[],title='WebCAD',paper='A4'}={}){
 const width=paper==='A3'?420:297,height=paper==='A3'?297:210,rows=drawing.views.length>3?3:2;
 const cellW=(width-30)/2,cellH=(height-30)/rows;
 const sectionW=(width-24)/Math.max(1,drawing.views.length-3);
 const scale=Math.min(4,...drawing.views.map((v,i)=>Math.min(((i>=3?sectionW:cellW)-38)/(v.bounds.max[0]-v.bounds.min[0]||1),(cellH-33)/(v.bounds.max[1]-v.bounds.min[1]||1))));
 const primitives=[],add=p=>primitives.push(p),line=(a,b,style='dimension')=>add({kind:'line',a,b,style}),text=(p,value,size=2.7)=>add({kind:'text',p,text:value,size,style:'text'});
 text([8,8],String(title).slice(0,70),3.5);text([8,height-5],`${drawing.projection==='first'?'FIRST':'THIRD'} ANGLE | mm | Scale ${fmt(scale)}:1 | Geometric dimensions - verify manufacturing requirements`,2.5);
 const placements=[];
 for(const [i,v]of drawing.views.entries()){
  const row=i===0?(drawing.projection==='first'?0:1):i===1?(drawing.projection==='first'?1:0):i===2?(drawing.projection==='first'?0:1):2;
  const col=i===2?1:i>=3?i-3:0;
  // Three supplementary sections share the bottom row.
  const sectionW=(width-24)/Math.max(1,drawing.views.length-3),cw=i>=3?sectionW:cellW;
  const x=12+(i>=3?col*sectionW:col*cellW),y=15+row*cellH;
  const localScale=scale;
  const origin=[x+20+(cw-35-(v.bounds.max[0]-v.bounds.min[0])*localScale)/2,y+12];
  const map=p=>[origin[0]+(p[0]-v.bounds.min[0])*localScale,origin[1]+(v.bounds.max[1]-p[1])*localScale];
  placements.push({viewId:v.id,origin,scale:localScale,bounds:v.bounds});text([x+4,y+4],v.label,2.6);
  for(const c of [...v.curves].sort((a,b)=>Number(b.hidden)-Number(a.hidden))){const style=c.hidden?'hidden':'outline';if(c.kind==='circle')add({...c,center:map(c.center),radius:c.radius*localScale,style});else line(map(c.a),map(c.b),style);}
  let horizontal=0,vertical=0,diameter=0;
  for(const d of drawing.dimensions.filter(d=>d.viewId===v.id&&!disabledDimensions.includes(d.id))){
   if(d.kind==='diameter'){const p=map([d.center[0]+d.radius*.7,d.center[1]+d.radius*.7]),q=[x+cw-25,y+10+diameter++*5];line(p,q);text(q,d.label);continue;}
   const a=map(d.a),b=map(d.b);let p,q;
   if(d.kind==='horizontal'){const dy=map(v.bounds.min)[1]+6+horizontal++*5;p=[a[0],dy];q=[b[0],dy];}
   else{const dx=origin[0]-6-vertical++*5;p=[dx,a[1]];q=[dx,b[1]];}
   line(a,p);line(b,q);line(p,q);for(const end of [p,q])line([end[0]-1,end[1]+1],[end[0]+1,end[1]-1]);text([(p[0]+q[0])/2+.8,(p[1]+q[1])/2-1],d.label,2.5);
  }
 }
 return {width,height,scale,primitives,placements};
}
