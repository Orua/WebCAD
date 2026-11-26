const fitLimitMm=0.00018;
const fail=(message,code='FAIRING_SOURCE_UNSUPPORTED')=>{throw Object.assign(new Error(message),{code});};
const ref=value=>Number(value.trim().slice(1));
const list=value=>value.slice(1,-1).split(',').map(Number);

function argumentsOf(value){
  const args=[];let start=value.indexOf('(')+1, depth=0;
  for(let i=start;i<value.length;i++){
    const ch=value[i];
    if(ch==="'"){
      do{i=value.indexOf("'",i+1);if(i<0)fail('STEP 字符串不完整');}while(value[i+1]==="'"&&++i);
    }else if(ch==='(')depth++;
    else if(ch===')'){if(depth===0){args.push(value.slice(start,i).trim());return args;}depth--;}
    else if(ch===','&&depth===0){args.push(value.slice(start,i).trim());start=i+1;}
  }
  fail('STEP 几何参数不完整');
}

function readStep(text){
  const data=/\bDATA\s*;/i.exec(text), end=text.lastIndexOf('ENDSEC;');
  if(!data||end<=data.index||!/SI_UNIT\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/i.test(text))fail('需要毫米制的有效 STEP 文件');
  const start=data.index+data[0].length, entities=new Map();
  let at=start, last=0;
  while(at<end){
    if(/\s/.test(text[at])){at++;continue;}
    if(text.startsWith('/*',at)){const closed=text.indexOf('*/',at+2);if(closed<0)fail('STEP 注释不完整');at=closed+2;continue;}
    const eq=text.indexOf('=',at), id=Number(text.slice(at+1,eq));
    if(text[at]!=='#'||eq<at||!Number.isSafeInteger(id)||id<1||entities.has(id))fail('STEP 实体编号无效');
    let stop=text.indexOf(';',eq+1), quote=text.indexOf("'",eq+1);
    while(quote>=0&&quote<stop){
      const close=text.indexOf("'",quote+1);if(close<0)fail('STEP 字符串不完整');
      if(close>stop)stop=text.indexOf(';',close+1);
      quote=text.indexOf("'",close+1);
    }
    if(stop<0||stop>=end)fail('STEP 实体未结束');
    entities.set(id,text.slice(eq+1,stop).trim());last=Math.max(last,id);at=stop+1;
  }
  return {header:text.slice(0,start),tail:text.slice(end),entities,last};
}

function basisAt(knots,p,count,t){
  let low=p,high=count;
  if(t>=knots[count])low=count-1;
  else while(high-low>1){const middle=(high+low)>>1;if(t<knots[middle])high=middle;else low=middle;}
  const w=[1],l=[],r=[];
  for(let j=1;j<=p;j++){
    l[j]=t-knots[low+1-j];r[j]=knots[low+j]-t;
    let saved=0;
    for(let i=0;i<j;i++){
      const d=r[i+1]+l[j-i], temp=d?w[i]/d:0;
      w[i]=saved+r[i+1]*temp;saved=l[j-i]*temp;
    }
    w[j]=saved;
  }
  return {first:low-p,w};
}

function axis(degree,knots,mults){
  if(knots.length!==mults.length||mults.some(n=>!Number.isInteger(n)||n<1||n>7))fail('样条节点重数无效');
  const complete=knots.flatMap((k,i)=>Array(mults[i]).fill(k)), count=complete.length-degree-1;
  if(!Number.isInteger(degree)||degree<1||degree>6||mults[0]!==degree+1||mults.at(-1)!==degree+1||
      count<degree+1||count>256||knots.some((x,i)=>!Number.isFinite(x)||(i>0&&x<=knots[i-1]))||
      mults.slice(1,-1).some(n=>!Number.isInteger(n)||n<1||n>degree))fail('不支持当前样条的节点或重数');
  const nodes=Array.from({length:count},(_,i)=>complete.slice(i+1,i+degree+1).reduce((a,b)=>a+b,0)/degree);
  const terms=locations=>locations.map(t=>basisAt(complete,degree,count,t));
  return {degree,knots,mults,count,nodes,terms};
}

const dummy={degree:0,knots:[0,1],mults:[1,1],count:1,nodes:[0],terms:values=>values.map(()=>({first:0,w:[1]}))};

function evaluate(model,u,v){
  const cols=model.v.count, source=model.points, ut=model.u.terms(u), vt=model.v.terms(v);
  const mid=new Float64Array(model.u.count*v.length*3), result=new Float64Array(u.length*v.length*3);
  for(let i=0;i<model.u.count;i++)for(let j=0;j<v.length;j++){
    const {first,w}=vt[j], target=(i*v.length+j)*3;
    for(let k=0;k<w.length;k++){
      const start=(i*cols+first+k)*3;
      for(let c=0;c<3;c++)mid[target+c]+=source[start+c]*w[k];
    }
  }
  for(let i=0;i<u.length;i++){
    const {first,w}=ut[i];
    for(let j=0;j<v.length;j++)for(let k=0;k<w.length;k++){
      const start=((first+k)*v.length+j)*3, target=(i*v.length+j)*3;
      for(let c=0;c<3;c++)result[target+c]+=mid[start+c]*w[k];
    }
  }
  return result;
}

function collocation(a){
  const n=a.count,p=a.degree;
  const rows=a.terms(a.nodes).map(({first,w})=>{const row=new Float64Array(n);row.set(w,first);return row;});
  for(let i=0;i<n;i++){
    if(Math.abs(rows[i][i])<1e-12)fail('样条拟合矩阵奇异','FAIRING_FIT_FAILED');
    for(let j=i+1;j<=Math.min(i+p,n-1);j++){
      if(!rows[j][i])continue;
      rows[j][i]/=rows[i][i];
      for(let k=i+1;k<=Math.min(i+p,n-1);k++)rows[j][k]-=rows[j][i]*rows[i][k];
    }
  }
  return (values,base,stride)=>{
    for(let i=1;i<n;i++)for(let j=Math.max(0,i-p);j<i;j++)values[base+i*stride]-=rows[i][j]*values[base+j*stride];
    for(let i=n-1;i>=0;i--){
      for(let j=i+1;j<=Math.min(i+p,n-1);j++)values[base+i*stride]-=rows[i][j]*values[base+j*stride];
      values[base+i*stride]/=rows[i][i];
    }
  };
}

function fit(original,u,v,shift){
  const points=evaluate(original,u.nodes,v.nodes);
  let correction=0;
  for(let i=0;i<points.length;i+=3){
    const d=shift(points[i],points[i+1],points[i+2]);points[i+2]+=d;
    correction=Math.max(correction,Math.abs(d));
  }
  if(correction<2e-8)return null;
  const solveU=collocation(u),solveV=collocation(v);
  for(let i=0;i<3*v.count;i++)solveU(points,i,3*v.count);
  for(let i=0;i<u.count;i++)for(let c=0;c<3;c++)solveV(points,i*3*v.count+c,3);
  return {u,v,points};
}

const probes=a=>a.degree===0?[{t:0,span:-1}]:[
  ...a.nodes.map(t=>({t,span:-1})),
  ...a.knots.slice(1).map((end,i)=>({t:(end+a.knots[i])/2,span:i}))
];

function addSpans(a,spans){
  if(!spans.size)return a;
  const knots=[],mults=[];
  a.knots.forEach((value,i)=>{
    knots.push(value);mults.push(a.mults[i]);
    if(spans.has(i)){knots.push((value+a.knots[i+1])/2);mults.push(1);}
  });
  return axis(a.degree,knots,mults);
}

function fitChecked(original,shift,stats){
  let {u,v}=original;
  for(let round=0;round<6;round++){
    if(u.count*v.count>40000)fail('单张曲面的拟合采样超出容量','FAIRING_FIT_FAILED');
    const candidate=fit(original,u,v,shift);
    const us=probes(u),vs=probes(v),a=evaluate(original,us.map(p=>p.t),vs.map(p=>p.t));
    const b=candidate?evaluate(candidate,us.map(p=>p.t),vs.map(p=>p.t)):a;
    const addU=new Set(),addV=new Set();let max=0,maxXy=0;
    for(let i=0;i<us.length;i++)for(let j=0;j<vs.length;j++){
      const k=3*(i*vs.length+j), z=a[k+2]+shift(a[k],a[k+1],a[k+2]);
      const error=Math.abs(b[k+2]-z);max=Math.max(max,error);
      maxXy=Math.max(maxXy,Math.hypot(a[k]-b[k],a[k+1]-b[k+1]));
      if(error>fitLimitMm){if(us[i].span>=0)addU.add(us[i].span);if(vs[j].span>=0)addV.add(vs[j].span);}
    }
    if(max<=fitLimitMm){
      if(maxXy>0.001)fail('修顺后的样条 XY 投影变化超过 0.001 mm','FAIRING_FIT_FAILED');
      stats.maxFitResidualMm=Math.max(stats.maxFitResidualMm,max);
      stats.maxSampledXyChangeMm=Math.max(stats.maxSampledXyChangeMm,maxXy);
      return candidate;
    }
    if(!addU.size&&!addV.size)break;
    u=addSpans(u,addU);v=addSpans(v,addV);
  }
  fail('未在规定拟合精度内重建曲面或共边','FAIRING_FIT_FAILED');
}

function number(value){
  const [coefficient,exponent]=value.toPrecision(15).split('e');
  return (coefficient.includes('.')?coefficient:coefficient+'.')+(exponent===undefined?'':`E${exponent}`);
}
const group=items=>'('+items.join(',')+')';

export function remapStepZ(text,shift){
  const {header,tail,entities,last}=readStep(text), seen=new Set(), retired=new Set(), changed=new Set();
  const stats={changedSurfaces:0,changedCurves:0,changedVertices:0,maxFitResidualMm:0,maxSampledXyChangeMm:0};
  let next=last;
  const put=expr=>{const id=++next;entities.set(id,expr);return '#'+id;};
  const point=id=>{
    const entity=entities.get(id);
    if(!entity?.startsWith('CARTESIAN_POINT('))fail('缺少样条的三维控制点');
    const xyz=list(argumentsOf(entity)[1]);
    if(xyz.length!==3||!xyz.every(Number.isFinite))fail('只有三维控制点受支持');
    return xyz;
  };
  const writePoint=xyz=>put(`CARTESIAN_POINT('',${group(xyz.map(number))})`);
  const used=new Set(), faces=[], vertices=[];
  for(const [id,entity] of entities){
    if(entity.startsWith('ADVANCED_FACE(')){
      const args=argumentsOf(entity);used.add(ref(args.at(-2)));faces.push(args);
    }else if(entity.startsWith('EDGE_CURVE(')){
      const args=argumentsOf(entity);let curve=ref(args.at(-2));
      const wrapper=entities.get(curve);
      if(/^(?:SURFACE_CURVE|SEAM_CURVE)\(/.test(wrapper)){
        curve=ref(argumentsOf(wrapper)[1]);args[args.length-2]='#'+curve;
        entities.set(id,'EDGE_CURVE'+group(args));
      }
      used.add(curve);
    }else if(entity.startsWith('VERTEX_POINT('))vertices.push(id);
  }
  if(!faces.length)fail('STEP 中没有可修顺的裁剪曲面');
  for(const id of used){
    const expr=entities.get(id), tag=expr?.slice(0,expr.indexOf('('));
    if(!['B_SPLINE_SURFACE_WITH_KNOTS','B_SPLINE_CURVE_WITH_KNOTS'].includes(tag))continue;
    const a=argumentsOf(expr), surface=tag==='B_SPLINE_SURFACE_WITH_KNOTS';
    const refs=surface?argumentsOf(a[3]).flatMap(row=>argumentsOf(row).map(ref)):argumentsOf(a[2]).map(ref);
    const points=Float64Array.from(refs.flatMap(point));
    const u=axis(+a[1],list(a[surface?10:7]),list(a[surface?8:6]));
    const v=surface?axis(+a[2],list(a[11]),list(a[9])):dummy;
    if(points.length!==3*u.count*v.count)fail('样条控制点与节点数量不一致');
    const fitted=fitChecked({u,v,points},shift,stats);
    seen.add(id);
    if(!fitted)continue;
    refs.forEach(id=>retired.add(id));changed.add(id);
    const ids=Array.from({length:fitted.points.length/3},(_,i)=>writePoint(Array.from(fitted.points.slice(i*3,i*3+3))));
    if(surface){
      a[3]=group(Array.from({length:fitted.u.count},(_,i)=>group(ids.slice(i*fitted.v.count,(i+1)*fitted.v.count))));
      a[8]=group(fitted.u.mults);a[9]=group(fitted.v.mults);
      a[10]=group(fitted.u.knots.map(number));a[11]=group(fitted.v.knots.map(number));stats.changedSurfaces++;
    }else{
      a[2]=group(ids);a[6]=group(fitted.u.mults);a[7]=group(fitted.u.knots.map(number));stats.changedCurves++;
    }
    entities.set(id,tag+group(a));
  }
  for(const id of vertices){
    const args=argumentsOf(entities.get(id)), source=ref(args[1]), xyz=point(source), d=shift(...xyz);
    if(Math.abs(d)<2e-8)continue;
    retired.add(source);xyz[2]+=d;args[1]=writePoint(xyz);entities.set(id,'VERTEX_POINT'+group(args));
    changed.add(id);stats.changedVertices++;
  }
  for(const [id,expr] of entities){
    if(id>last||!expr.startsWith('EDGE_CURVE('))continue;
    const args=argumentsOf(expr), curve=ref(args.at(-2));
    if(!seen.has(curve)&&(changed.has(ref(args[1]))||changed.has(ref(args[2]))))fail('修顺范围穿过未支持的解析或有理共边');
  }
  if(!stats.changedSurfaces)fail('位移场没有修到有效曲面','NO_CHANGE');
  for(const expression of entities.values())for(const match of expression.matchAll(/#(\d+)/g))retired.delete(+match[1]);
  const rows=[];
  for(const [id,expression] of entities)if(!retired.has(id))rows.push(`#${id}=${expression};`);
  return {text:header+'\n'+rows.join('\n')+'\n'+tail,stats};
}
