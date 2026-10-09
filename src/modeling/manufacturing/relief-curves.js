// Bounded arc fitting keeps source corners and avoids one BRep face per pixel.
// The tolerance is explicit in millimetres; every supplied vertex is checked.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>a.map(v=>v/Math.hypot(...a));
const dispose=x=>{try{x?.delete?.();}catch{}};
export function fitContour(points,normal,tolerance=0,closed=true){
 const origin=points[0],x=unit(sub(points[1],origin)),y=unit(cross(normal,x));
 const xy=points.map(p=>[dot(sub(p,origin),x),dot(sub(p,origin),y)]);
 if(closed){points=[...points,points[0]];xy.push(xy[0]);}
 const segments=[];
 for(let start=0;start<points.length-1;){
  let end=start+1,best={type:'line',start:points[start],end:points[end]};
  if(tolerance>0)for(let stop=start+2;stop<Math.min(points.length,start+65);stop++){
   const a=xy[start],b=xy[stop],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   if(length<1e-9)continue;
   const interior=xy.slice(start+1,stop);
   if(interior.every(p=>Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/length<=tolerance && (p[0]-a[0])*dx+(p[1]-a[1])*dy>=0 && (p[0]-b[0])*dx+(p[1]-b[1])*dy<=0)){
    end=stop;best={type:'line',start:points[start],end:points[stop]};continue;
   }
   const mid=Math.floor((start+stop)/2),m=xy[mid],u=m[0]-a[0],v=m[1]-a[1],det=2*(u*dy-v*dx);
   if(Math.abs(det)<1e-12)continue;
   const q=u*u+v*v,r=dx*dx+dy*dy,c=[a[0]+(q*dy-v*r)/det,a[1]+(u*r-q*dx)/det],radius=Math.hypot(a[0]-c[0],a[1]-c[1]);
   if(!Number.isFinite(radius)||radius>1e6||radius<tolerance*2)continue;
   let angle=0,last=Math.atan2(a[1]-c[1],a[0]-c[0]),sign=0,ok=true;
   for(let k=start+1;k<=stop;k++){
    const p=xy[k];if(Math.abs(Math.hypot(p[0]-c[0],p[1]-c[1])-radius)>tolerance){ok=false;break;}
    const now=Math.atan2(p[1]-c[1],p[0]-c[0]),delta=Math.atan2(Math.sin(now-last),Math.cos(now-last));
    // Vertex-only fitting accepts any three-point corner as a huge arc. Also
    // bound the arc between vertices against the supplied polyline segment.
    const previous=xy[k-1],vx=p[0]-previous[0],vy=p[1]-previous[1],length2=vx*vx+vy*vy;
    for(const t of [.25,.5,.75]){
     const a=last+delta*t,q=[c[0]+radius*Math.cos(a),c[1]+radius*Math.sin(a)],u=Math.max(0,Math.min(1,((q[0]-previous[0])*vx+(q[1]-previous[1])*vy)/length2));
     if(Math.hypot(q[0]-previous[0]-u*vx,q[1]-previous[1]-u*vy)>tolerance){ok=false;break;}
    }
    if(!ok)break;
    if(!sign)sign=Math.sign(delta);if(delta*sign<=0){ok=false;break;}angle+=delta;last=now;
   }
   if(ok&&Math.abs(angle)<Math.PI*.95){end=stop;best={type:'arc',start:points[start],mid:points[mid],end:points[stop]};}
  }
  segments.push(best);start=end;
 }
 return segments;
}
// Metrics refer to the supplied polyline, never to an unavailable source spline.
export function contourConversionReport(points,normal,segments,tolerance=0,closed=true){
 const origin=points[0],x=unit(sub(points[1],origin)),y=unit(cross(normal,x)),xy=p=>[dot(sub(p,origin),x),dot(sub(p,origin),y)],source=points.map(xy),indices=new Map(points.map((p,i)=>[p,i]));
 const det=(a,b)=>a[0]*b[1]-a[1]*b[0],distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
 let sourceArea=0,resultArea=0,perimeter=0,maxDeviationMm=0,sampleCount=0;
 for(let i=0;i<source.length-(closed?0:1);i++){const a=source[i],b=source[(i+1)%source.length];sourceArea+=det(a,b)/2;perimeter+=Math.hypot(b[0]-a[0],b[1]-a[1]);}
 for(const s of segments){
  const a=xy(s.start),b=xy(s.end),start=indices.get(s.start),end=indices.get(s.end)===0&&closed?points.length:indices.get(s.end),path=Array.from({length:end-start+1},(_,k)=>source[(start+k)%source.length]);
  resultArea+=det(a,b)/2;let at,pointDistance;
  if(s.type==='line'){at=t=>a.map((v,i)=>v+(b[i]-v)*t);pointDistance=p=>distance(p,a,b);}
  else{
   const m=xy(s.mid),u=sub(m,a),v=sub(b,a),d=2*det(u,v),U=dot(u,u),V=dot(v,v),c=[a[0]+(U*v[1]-V*u[1])/d,a[1]+(u[0]*V-v[0]*U)/d],r=Math.hypot(...sub(a,c)),angle=p=>Math.atan2(p[1]-c[1],p[0]-c[0]),tau=2*Math.PI,from=angle(a),to=angle(b),mid=angle(m);
   let sweep=((to-from)%tau+tau)%tau;if(((mid-from)%tau+tau)%tau>sweep)sweep-=tau;
   resultArea+=r*r*(sweep-Math.sin(sweep))/2;at=t=>[c[0]+r*Math.cos(from+sweep*t),c[1]+r*Math.sin(from+sweep*t)];
   pointDistance=p=>{const phase=((Math.sign(sweep)*(angle(p)-from))%tau+tau)%tau;return phase<=Math.abs(sweep)+1e-10?Math.abs(Math.hypot(...sub(p,c))-r):Math.min(Math.hypot(...sub(p,a)),Math.hypot(...sub(p,b)));};
  }
  for(const p of path){maxDeviationMm=Math.max(maxDeviationMm,pointDistance(p));sampleCount++;}
  for(let k=1;k<8;k++){const p=at(k/8);maxDeviationMm=Math.max(maxDeviationMm,Math.min(...path.slice(1).map((b,i)=>distance(p,path[i],b))));sampleCount++;}
 }
 const areaChangeMm2=closed?Math.abs(resultArea)-Math.abs(sourceArea):null,areaLimitMm2=tolerance*(perimeter+Math.PI*tolerance)+1e-9;
 const accepted=maxDeviationMm<=tolerance+1e-8&&(!closed||sourceArea*resultArea>0&&Math.abs(areaChangeMm2)<=areaLimitMm2);
 return {reference:'supplied-polyline-after-explicit-cleanup',sourceEdgeCount:points.length-(closed?0:1),resultEdgeCount:segments.length,toleranceMm:tolerance,maxSampledDeviationMm:maxDeviationMm,sampleCount,sourceAreaMm2:closed?Math.abs(sourceArea):null,resultAreaMm2:closed?Math.abs(resultArea):null,areaChangeMm2,areaLimitMm2,accepted,errorBound:'sampled-not-global',closed};
}
export function contourWire(points,normal,cad,tolerance=0,closed=true,onConversion){
 const edges=[];
 try{const segments=fitContour(points,normal,tolerance,closed),report=contourConversionReport(points,normal,segments,tolerance,closed);if(!report.accepted)throw Object.assign(new Error('轮廓转换偏差或面积变化超过显式公差；请降低拟合公差或使用原始折线'),{code:'RELIEF_CURVE_DEVIATION',report});onConversion?.(report);for(const s of segments)edges.push(s.type==='arc'?cad.makeThreePointArc(s.start,s.mid,s.end):cad.makeLine(s.start,s.end));return cad.assembleWire(edges);}
 finally{edges.forEach(dispose);}
}
export function strokeOutline(points,normal,width){
 const origin=points[0],x=unit(sub(points[1],origin)),y=unit(cross(normal,x)),r=width/2;
 const p=points.map(v=>[dot(sub(v,origin),x),dot(sub(v,origin),y)]),dirs=p.slice(1).map((v,i)=>unit(sub(v,p[i])));
 if(dirs.some(v=>v.some(n=>!Number.isFinite(n))))throw new Error('开放刻线路径含重复的相邻点');
 const normals=dirs.map(v=>[-v[1],v[0]]),at=(i,n,s)=>p[i].map((v,k)=>v+s*r*n[k]);
 const arc=(center,a,b,sign)=>{let delta=b-a;while(delta*sign<0)delta+=sign*Math.PI*2;while(Math.abs(delta)>Math.PI*2)delta-=sign*Math.PI*2;const n=Math.max(2,Math.ceil(Math.abs(delta)/(Math.PI/12)));return Array.from({length:n},(_,i)=>{const t=a+delta*(i+1)/n;return[center[0]+r*Math.cos(t),center[1]+r*Math.sin(t)];});};
 const side=s=>{const out=[at(0,normals[0],s)];for(let i=1;i<p.length-1;i++){
  const a=dirs[i-1],b=dirs[i],turn=a[0]*b[1]-a[1]*b[0],before=at(i,normals[i-1],s),after=at(i,normals[i],s);
  if(Math.abs(turn)<1e-8){out.push(after);continue;}
  if(turn*s<0){out.push(before,...arc(p[i],Math.atan2(normals[i-1][1]*s,normals[i-1][0]*s),Math.atan2(normals[i][1]*s,normals[i][0]*s),Math.sign(turn)));}
  else{const d=sub(after,before),t=(d[0]*b[1]-d[1]*b[0])/turn,join=before.map((v,k)=>v+t*a[k]);if(Math.hypot(...sub(join,p[i]))>r*4)out.push(before,after);else out.push(join);}
 }out.push(at(p.length-1,normals.at(-1),s));return out;};
 const left=side(1),right=side(-1),end=p.at(-1),start=p[0],en=normals.at(-1),sn=normals[0];
 const ring=[...left,...arc(end,Math.atan2(en[1],en[0]),Math.atan2(-en[1],-en[0]),-1),...right.reverse().slice(1),...arc(start,Math.atan2(-sn[1],-sn[0]),Math.atan2(sn[1],sn[0]),-1)];
 ring.pop();return ring.map(v=>origin.map((n,k)=>n+v[0]*x[k]+v[1]*y[k]));
}
