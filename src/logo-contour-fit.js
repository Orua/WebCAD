// Bounded reconstruction of raster contours. The downstream LOGO contract is a
// polyline, so fitted circular arcs are sampled with an explicit chord bound.
const dist=(p,a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y||1)));return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);};
const gap=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function lineFit(points,tolerance){
 const n=points.length,c=points.reduce((s,p)=>[s[0]+p[0]/n,s[1]+p[1]/n],[0,0]);let xx=0,xy=0,yy=0;
 for(const p of points){const x=p[0]-c[0],y=p[1]-c[1];xx+=x*x;xy+=x*y;yy+=y*y;}
 const angle=.5*Math.atan2(2*xy,xx-yy),v=[Math.cos(angle),Math.sin(angle)],project=p=>{const t=(p[0]-c[0])*v[0]+(p[1]-c[1])*v[1];return [c[0]+t*v[0],c[1]+t*v[1]];};
 const a=project(points[0]),b=project(points.at(-1));
 if(gap(a,b)<tolerance)return null;
 if(points.some(p=>dist(p,a,b)>tolerance*.72))return null;
 return {kind:'line',points:[a,b]};
}
function circleFit(points,tolerance){
 if(points.length<5)return null;
 // Least-squares circle in centered coordinates, avoiding large-world offsets.
 const n=points.length,c=points.reduce((s,p)=>[s[0]+p[0]/n,s[1]+p[1]/n],[0,0]);
 let xx=0,xy=0,yy=0,xz=0,yz=0;
 for(const p of points){const x=p[0]-c[0],y=p[1]-c[1],z=x*x+y*y;xx+=x*x;xy+=x*y;yy+=y*y;xz+=x*z;yz+=y*z;}
 const det=xx*yy-xy*xy;if(Math.abs(det)<1e-18)return null;
 const center=[c[0]+(xz*yy-yz*xy)/(2*det),c[1]+(yz*xx-xz*xy)/(2*det)],radius=points.reduce((s,p)=>s+gap(p,center)/n,0);
 if(!Number.isFinite(radius)||radius<tolerance*2)return null;
 const angles=points.map(p=>Math.atan2(p[1]-center[1],p[0]-center[0]));let sweep=0,reverse=0;
 for(let i=1;i<n;i++){let d=angles[i]-angles[i-1];while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;sweep+=d;}
 if(Math.abs(sweep)<.15||Math.abs(sweep)>Math.PI*1.1)return null;
 for(let i=1;i<n;i++){let d=angles[i]-angles[i-1];while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;if(d*sweep<0)reverse+=Math.abs(d)*radius;}
 if(reverse>tolerance*2||points.some(p=>Math.abs(gap(p,center)-radius)>tolerance*.85))return null;
 const chordError=Math.min(.002,tolerance/8),step=2*Math.acos(Math.max(-1,1-chordError/radius)),count=Math.max(2,Math.ceil(Math.abs(sweep)/step));
 if(count>1024)return null;
 return {kind:'arc',chordError,points:Array.from({length:count+1},(_,i)=>{const a=angles[0]+sweep*i/count;return [center[0]+radius*Math.cos(a),center[1]+radius*Math.sin(a)];})};
}
function partition(points,tolerance,out){
 const line=lineFit(points,tolerance);if(line&&contourDeviationBound(points,line.points,tolerance,false)!==null){out.push(line);return;}
 const arc=circleFit(points,tolerance);if(arc&&contourDeviationBound(points,arc.points,tolerance,false)!==null){out.push(arc);return;}
 if(points.length<=2){out.push({kind:'line',points:points.map(p=>[...p])});return;}
 let split=1,max=-1;for(let i=1;i<points.length-1;i++){const d=dist(points[i],points[0],points.at(-1));if(d>max){max=d;split=i;}}
 partition(points.slice(0,split+1),tolerance,out);partition(points.slice(split),tolerance,out);
}
function joinLines(a,b,tolerance){
 const p=a.points[0],q=b.points[0],u=[a.points[1][0]-p[0],a.points[1][1]-p[1]],v=[b.points[1][0]-q[0],b.points[1][1]-q[1]],cross=u[0]*v[1]-u[1]*v[0];
 if(Math.abs(cross)<1e-12)return;
 const t=((q[0]-p[0])*v[1]-(q[1]-p[1])*v[0])/cross,hit=[p[0]+t*u[0],p[1]+t*u[1]];
 if(gap(hit,a.points.at(-1))<=tolerance*.6&&gap(hit,b.points[0])<=tolerance*.6){a.points[a.points.length-1]=hit;b.points[0]=hit;}
}
const nearest=(p,edges)=>{let best=Infinity;for(const [a,b]of edges)best=Math.min(best,dist(p,a,b));return best;};
// A distance-to-set function is 1-Lipschitz. Endpoint distances plus half the
// interval length therefore certify the entire interval, in BOTH directions.
export function contourDeviationBound(original,candidate,tolerance,closed=true){
 const edges=ring=>ring.slice(0,closed?ring.length:-1).map((p,i)=>[p,ring[(i+1)%ring.length]]);let bound=0,budget=300000;
 function directed(from,to){for(const [a,b]of edges(from)){const stack=[[a,b,nearest(a,to),nearest(b,to),0]];while(stack.length){if(--budget<0)return false;const [p,q,dp,dq,depth]=stack.pop(),length=gap(p,q);if(Math.max(dp,dq)>tolerance)return false;
   // Distance to ONE finite segment is convex, so this cheaper certificate
   // covers long straight intervals without subdividing them into pixels.
   let upper=Infinity;for(const [x,y]of to)upper=Math.min(upper,Math.max(dist(p,x,y),dist(q,x,y)));
   upper=Math.min(upper,Math.max(dp,dq)+length/2);
   if(upper<=tolerance){bound=Math.max(bound,upper);continue;}
   if(depth>=22)return false;const mid=[(p[0]+q[0])/2,(p[1]+q[1])/2],dm=nearest(mid,to);stack.push([p,mid,dp,dm,depth+1],[mid,q,dm,dq,depth+1]);
  }}return true;}
 return directed(original,edges(candidate))&&directed(candidate,edges(original))?bound:null;
}
export function fitRasterRing(ring,tolerance){
 if(tolerance<=0||ring.length<4)return {ring,bound:0,lines:0,arcs:0,rejected:false};
 const anchors=new Set();for(let axis=0;axis<2;axis++){let lo=0,hi=0;for(let i=1;i<ring.length;i++){if(ring[i][axis]<ring[lo][axis])lo=i;if(ring[i][axis]>ring[hi][axis])hi=i;}anchors.add(lo);anchors.add(hi);}
 const ids=[...anchors].sort((a,b)=>a-b),pieces=[];
 for(let k=0;k<ids.length;k++){const end=k+1<ids.length?ids[k+1]:ids[0]+ring.length;partition(Array.from({length:end-ids[k]+1},(_,i)=>ring[(ids[k]+i)%ring.length]),tolerance,pieces);}
 for(let i=0;i<pieces.length;i++){const a=pieces[i],b=pieces[(i+1)%pieces.length];if(a.kind==='line'&&b.kind==='line'){
  const oldA=a.points.map(p=>[...p]),oldB=b.points.map(p=>[...p]);joinLines(a,b,tolerance);
  if(contourDeviationBound(oldA,a.points,tolerance*.2,false)===null||contourDeviationBound(oldB,b.points,tolerance*.2,false)===null){a.points=oldA;b.points=oldB;}
 }}
 const candidate=[];for(const p of pieces)for(const point of p.points)if(!candidate.length||gap(candidate.at(-1),point)>1e-8)candidate.push(point);
 if(candidate.length>1&&gap(candidate[0],candidate.at(-1))<1e-8)candidate.pop();
 const joined=candidate.map(p=>[...p]);
 // Projected pieces can leave tiny reversing connector edges at a join.
 // Remove only local sub-tolerance joins, then certify the full boundary again.
 for(let pass=0;pass<4;pass++){let changed=false;for(let i=candidate.length-1;i>=0&&candidate.length>3;i--){const p=candidate[i],a=candidate[(i+candidate.length-1)%candidate.length],b=candidate[(i+1)%candidate.length],deviation=dist(p,a,b);if(deviation<Math.min(.0005,tolerance/100)||(Math.min(gap(a,p),gap(p,b))<tolerance*.6&&deviation<tolerance*.5)){candidate.splice(i,1);changed=true;}}if(!changed)break;}
 let bound=contourDeviationBound(ring,candidate,tolerance),output=candidate;
 if(bound===null){bound=contourDeviationBound(ring,joined,tolerance);output=joined;}
 return bound===null?{ring,bound:0,lines:0,arcs:0,rejected:true}:{ring:output,bound,lines:pieces.filter(p=>p.kind==='line').length,arcs:pieces.filter(p=>p.kind==='arc').length,rejected:false};
}
