const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>a[0]*b[1]-a[1]*b[0],tau=Math.PI*2,phase=a=>(a%tau+tau)%tau,epsilon=1e-7;
function curve(segment,xy){
 const a=xy(segment.start),b=xy(segment.end);if(segment.type==='line')return {type:'line',a,b};
 const m=xy(segment.mid),u=sub(m,a),v=sub(b,a),d=2*cross(u,v),U=dot(u,u),V=dot(v,v),center=[a[0]+(U*v[1]-V*u[1])/d,a[1]+(u[0]*V-v[0]*U)/d],radius=Math.hypot(...sub(a,center)),from=Math.atan2(a[1]-center[1],a[0]-center[0]),to=Math.atan2(b[1]-center[1],b[0]-center[0]),mid=Math.atan2(m[1]-center[1],m[0]-center[0]);
 let sweep=phase(to-from);if(phase(mid-from)>sweep)sweep-=tau;return {type:'arc',a,b,m,center,radius,from,sweep};
}
const contains=(arc,p,strict=false)=>{const t=phase(Math.sign(arc.sweep)*(Math.atan2(p[1]-arc.center[1],p[0]-arc.center[0])-arc.from)),e=epsilon/Math.max(arc.radius,epsilon);return strict?t>e&&t<Math.abs(arc.sweep)-e:t<=Math.abs(arc.sweep)+e||tau-t<e;};
function lineLine(a,b){
 const u=sub(a.b,a.a),v=sub(b.b,b.a),w=sub(b.a,a.a),den=cross(u,v),size=Math.hypot(...u)*Math.hypot(...v);
 if(Math.abs(den)>size*1e-12){const s=cross(w,v)/den,t=cross(w,u)/den;return s>=-1e-10&&s<=1+1e-10&&t>=-1e-10&&t<=1+1e-10?[a.a.map((x,i)=>x+s*u[i])]:[];}
 if(Math.abs(cross(w,u))>epsilon*Math.hypot(...u))return [];
 const length=dot(u,u);if(!length)return [];const ends=[dot(sub(b.a,a.a),u)/length,dot(sub(b.b,a.a),u)/length],low=Math.max(0,Math.min(...ends)),high=Math.min(1,Math.max(...ends));if(low>high)return [];return [low,(low+high)/2,high].map(t=>a.a.map((x,i)=>x+t*u[i]));
}
function lineArc(line,arc){
 const d=sub(line.b,line.a),p=sub(line.a,arc.center),A=dot(d,d),B=2*dot(p,d),C=dot(p,p)-arc.radius*arc.radius,discriminant=B*B-4*A*C;if(!A||discriminant<-1e-12)return [];
 const root=Math.sqrt(Math.max(0,discriminant));return [(-B-root)/(2*A),(-B+root)/(2*A)].filter(t=>t>=-1e-10&&t<=1+1e-10).map(t=>line.a.map((v,i)=>v+t*d[i])).filter(p=>contains(arc,p));
}
function arcArc(a,b){
 const v=sub(b.center,a.center),d=Math.hypot(...v);if(d<epsilon&&Math.abs(a.radius-b.radius)<epsilon)return [a.a,a.m,a.b,b.a,b.m,b.b].filter(p=>contains(a,p,true)&&contains(b,p,true));
 if(!d||d>a.radius+b.radius+epsilon||d<Math.abs(a.radius-b.radius)-epsilon)return [];
 const x=(a.radius*a.radius-b.radius*b.radius+d*d)/(2*d),h2=a.radius*a.radius-x*x;if(h2<-1e-10)return [];const h=Math.sqrt(Math.max(0,h2)),base=a.center.map((q,i)=>q+x*v[i]/d);return [1,-1].map(sign=>[base[0]-sign*h*v[1]/d,base[1]+sign*h*v[0]/d]).filter(p=>contains(a,p)&&contains(b,p));
}
export function contourPlanIntersections(plans,normal,{limit=16,maxPairs=2000000}={}){
 const first=plans[0].segments[0],origin=first.start,u=sub(first.end,origin),length=Math.hypot(...u),x=u.map(v=>v/length),y=[normal[1]*x[2]-normal[2]*x[1],normal[2]*x[0]-normal[0]*x[2],normal[0]*x[1]-normal[1]*x[0]],xy=p=>[dot(sub(p,origin),x),dot(sub(p,origin),y)],curves=plans.map(p=>p.segments.map(s=>curve(s,xy))),collisions=[];
 let pairs=0;for(let ringA=0;ringA<curves.length;ringA++)for(let ringB=ringA;ringB<curves.length;ringB++){
  const a=curves[ringA],b=curves[ringB];for(let i=0;i<a.length;i++)for(let j=ringA===ringB?i+1:0;j<b.length;j++){
   if(++pairs>maxPairs)throw Object.assign(new Error('轮廓拓扑规划超过已声明的检查预算；未降低轮廓精度'),{code:'RELIEF_PLAN_LIMIT'});
   const ca=a[i],cb=b[j],points=ca.type==='line'&&cb.type==='line'?lineLine(ca,cb):ca.type==='line'?lineArc(ca,cb):cb.type==='line'?lineArc(cb,ca):arcArc(ca,cb),shared=ringA===ringB?(j===i+1?ca.b:i===0&&j===a.length-1?ca.a:null):null;
   const unexpected=points.filter(p=>!shared||Math.hypot(...sub(p,shared))>epsilon);if(unexpected.length){collisions.push({ringIndices:[ringA,ringB],segmentIndices:[i,j],point2dMm:unexpected[0]});if(collisions.length>=limit)return collisions;}
  }
 }
 return collisions;
}
