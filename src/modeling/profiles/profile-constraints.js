import {validateProfile} from './profile-model.js';
import {expandProfilePrimitives} from './profile-primitives.js';
import {constraintsSchema} from './profile-constraint-contracts.js';

const definitions = new Map(constraintsSchema.items.oneOf.map(schema=>[schema.properties.type.const,schema]));
const failure = (code,message,diagnostics=null,path) => ({status:'failed',success:false,error:{code,message,...(path?{path}:{})},diagnostics});
const reject = (message,path='constraints') => {throw Object.assign(new Error(message),{code:'PROFILE_CONSTRAINT_INVALID',path});};
const norm = values => Math.hypot(...values);
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const wrapAngle = value => Math.atan2(Math.sin(value),Math.cos(value));

/** Explicitly derive rectangle edges; the borrowed source stays untouched. */
export function prepareConstraintProfile(source) {
  validateProfile(source);
  const cloned=structuredClone(source),metadata=cloned.constraintMetadata;
  if(metadata&&(metadata.version!==1||!Array.isArray(metadata.intrinsicConstraints)||metadata.intrinsicConstraints.length>64||metadata.intrinsicConstraints.some(constraint=>!['horizontal','vertical'].includes(constraint?.type))))reject('保存的内在矩形约束元数据无效','profile.constraintMetadata');
  const intrinsicConstraints=structuredClone(metadata?.intrinsicConstraints??[]);
  const primitiveConversion=structuredClone(metadata?.primitiveConversion??[]);
  if(!Array.isArray(primitiveConversion)||primitiveConversion.length>64)reject('保存的基础轮廓映射超出范围','profile.constraintMetadata.primitiveConversion');
  for(const entity of cloned.entities)if(entity.type==='rectangle') {
    const entityIds=Array.from({length:4},(_,index)=>`${entity.id}_${index}`);
    primitiveConversion.push({sourceId:entity.id,sourceType:'rectangle',entityIds});
    entityIds.forEach((entityId,index)=>intrinsicConstraints.push({type:index%2?'vertical':'horizontal',entityId}));
  }
  const profile=expandProfilePrimitives(cloned);
  if(profile.entities.some(entity=>!['line','circle'].includes(entity.type)))throw Object.assign(new Error('约束首版只支持解析直线、圆和派生矩形；圆弧、圆角矩形、长圆和样条仍未支持'),{code:'PROFILE_CONSTRAINT_UNSUPPORTED',path:'profile.entities'});
  if(profile.entities.length>64||intrinsicConstraints.length>64||primitiveConversion.length>64)throw Object.assign(new Error('约束首版最多 64 个派生直线/圆实体和 64 个内在矩形关系'),{code:'PROFILE_CONSTRAINT_LIMIT',path:'profile.entities'});
  // A standalone subsequent solve must retain the original rectangle meaning.
  // Only H/V relationships are intrinsic; no hidden fixed origin or dimensions.
  if(intrinsicConstraints.length||primitiveConversion.length)profile.constraintMetadata={...metadata,version:1,intrinsicConstraints:structuredClone(intrinsicConstraints),primitiveConversion:structuredClone(primitiveConversion)};
  return {profile,primitiveConversion,intrinsicConstraints};
}

function checkSchema(value,schema,path) {
  if(schema.type==='object') {
    if(!value||Array.isArray(value)||typeof value!=='object')reject('约束字段须为对象',path);
    for(const key of schema.required??[])if(!Object.hasOwn(value,key))reject(`缺少约束字段 ${key}`,`${path}.${key}`);
    for(const [key,item] of Object.entries(value)) {
      if(!Object.hasOwn(schema.properties,key))reject(`未知约束字段 ${key}`,`${path}.${key}`);
      checkSchema(item,schema.properties[key],`${path}.${key}`);
    }
  } else if(schema.type==='array') {
    if(!Array.isArray(value)||value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity))reject('约束数组长度无效',path);
    value.forEach((item,index)=>checkSchema(item,schema.items,`${path}[${index}]`));
  } else if(schema.type==='number') {
    if(typeof value!=='number'||!Number.isFinite(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)||(schema.exclusiveMinimum!==undefined&&value<=schema.exclusiveMinimum))reject('约束数值超出范围或不是有限数',path);
  } else if(schema.type==='string') {
    if(typeof value!=='string'||value.length<(schema.minLength??0)||value.length>(schema.maxLength??Infinity)||(schema.pattern&&!new RegExp(schema.pattern).test(value)))reject('约束 ID 或文本无效',path);
  }
  if(schema.const!==undefined&&value!==schema.const)reject('约束类型无效',path);
  if(schema.enum&&!schema.enum.includes(value))reject('约束选项无效',path);
}

/** Share endpoints according to explicitly saved paths, not by proximity. */
function modelFor(profile) {
  const nodes=new Map(),parent=new Map(),byId=new Map(profile.entities.map(entity=>[entity.id,entity]));
  const add=(entity,point,position)=>{const key=`${entity.id}:${point}`;nodes.set(key,position);parent.set(key,key);};
  for(const entity of profile.entities) {
    if(entity.type==='line'){add(entity,'start',entity.startMm);add(entity,'end',entity.endMm);}
    else add(entity,'center',entity.centerMm);
  }
  const find=key=>{let root=key;while(parent.get(root)!==root)root=parent.get(root);while(key!==root){const next=parent.get(key);parent.set(key,root);key=next;}return root;};
  const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(b,a);};
  for(const [paths,closed] of [[profile.loops??[],true],[profile.chains??[],false]])for(const path of paths) {
    for(let i=0;i<path.edges.length-(closed?0:1);i++) {
      const first=path.edges[i],second=path.edges[(i+1)%path.edges.length];
      if(byId.get(first.entityId).type!=='line'||byId.get(second.entityId).type!=='line')continue;
      union(`${first.entityId}:${first.reversed?'start':'end'}`,`${second.entityId}:${second.reversed?'end':'start'}`);
    }
  }
  const points=[...nodes.values()],origin=points[0].slice();
  const min=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],max=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
  const scale=Math.max(1,max[0]-min[0],max[1]-min[1],...profile.entities.filter(entity=>entity.type==='circle').map(entity=>entity.diameterMm));
  const groups=new Map();for(const [key,position] of nodes){const root=find(key);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(position);}
  const values=[],indices=new Map(),pointIndices=new Map(),radiusIndices=new Map();
  for(const [key,positions] of groups) {
    indices.set(key,values.length);
    for(let axis=0;axis<2;axis++)values.push((positions.reduce((sum,p)=>sum+p[axis],0)/positions.length-origin[axis])/scale);
  }
  for(const key of nodes.keys())pointIndices.set(key,indices.get(find(key)));
  for(const entity of profile.entities)if(entity.type==='circle'){radiusIndices.set(entity.id,values.length);values.push(entity.diameterMm/(2*scale));}
  const point=(ref,x)=>{const index=pointIndices.get(`${ref.entityId}:${ref.point}`);return [x[index],x[index+1]];};
  const direction=(id,x)=>{const a=point({entityId:id,point:'start'},x),b=point({entityId:id,point:'end'},x);return [b[0]-a[0],b[1]-a[1]];};
  const radius=(id,x)=>x[radiusIndices.get(id)];
  const valid=x=>{
    if(x.some(value=>!Number.isFinite(value)))return false;
    for(const entity of profile.entities) {
      if(entity.type==='line'&&norm(direction(entity.id,x))*scale<1e-7)return false;
      if(entity.type==='circle'&&(radius(entity.id,x)*scale<1e-7||radius(entity.id,x)*scale>1e6))return false;
      for(const name of entity.type==='line'?['start','end']:['center']) {
        const p=point({entityId:entity.id,point:name},x);
        if(p.some((value,i)=>Math.abs(value*scale+origin[i])>1e6))return false;
      }
    }
    return true;
  };
  const result=x=>{
    const output=structuredClone(profile);
    for(const entity of output.entities) {
      for(const [name,field] of entity.type==='line'?[['start','startMm'],['end','endMm']]:[['center','centerMm']])entity[field]=point({entityId:entity.id,point:name},x).map((value,i)=>value*scale+origin[i]);
      if(entity.type==='circle')entity.diameterMm=2*radius(entity.id,x)*scale;
    }
    return output;
  };
  return {byId,values,scale,origin,point,direction,radius,valid,result,pointIndices,radiusIndices,structuralEndpointCount:nodes.size-groups.size};
}

function equationsFor(model,constraints,intrinsicCount=0) {
  const {byId,point,direction,radius,scale,origin}=model,equations=[];
  const entity=(id,type,path)=>{const item=byId.get(id);if(!item||type&&item.type!==type)reject(`${id} 须引用已存在的${type==='line'?'直线':type==='circle'?'圆':'解析实体'}`,path);return item;};
  const ref=(value,path)=>{const item=entity(value.entityId,null,`${path}.entityId`);if(item.type==='line'&&!['start','end'].includes(value.point)||item.type==='circle'&&value.point!=='center')reject('直线须引用 start/end，圆须引用 center',`${path}.point`);};
  const length=(id,x)=>norm(direction(id,x));
  const angle=(a,b,x)=>{const u=direction(a,x),v=direction(b,x);return Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);};
  const ids=new Set();
  constraints.forEach((constraint,index)=>{
    const path=`constraints[${index}]`,definition=definitions.get(constraint?.type);
    if(!definition)reject('未知或未支持的约束类型',`${path}.type`);
    checkSchema(constraint,definition,path);
    if(constraint.id&&ids.has(constraint.id))reject('约束 ID 重复',`${path}.id`);if(constraint.id)ids.add(constraint.id);
    const originCategory=index<intrinsicCount?'intrinsic':'user',inputIndex=index<intrinsicCount?index:index-intrinsicCount;
    const id=constraint.id??`${originCategory==='intrinsic'?'intrinsic':'constraint'}-${inputIndex+1}`;
    const add=(unit,evaluate)=>equations.push({id,index,inputIndex,origin:originCategory,type:constraint.type,unit,evaluate});
    const addPoint=(first,second)=>{for(let axis=0;axis<2;axis++)add('mm',x=>point(first,x)[axis]-second(x)[axis]);};
    if(constraint.type==='fixPoint') {
      ref(constraint.point,`${path}.point`);addPoint(constraint.point,()=>constraint.positionMm.map((value,i)=>(value-origin[i])/scale));
    } else if(constraint.type==='fixEntity') {
      const item=entity(constraint.entityId,null,`${path}.entityId`);
      for(const name of item.type==='line'?['start','end']:['center']){const sourceRef={entityId:item.id,point:name},source=point(sourceRef,model.values);addPoint(sourceRef,()=>source);}
      if(item.type==='circle'){const original=radius(item.id,model.values);add('mm',x=>radius(item.id,x)-original);}
    } else if(['coincident','distance'].includes(constraint.type)) {
      ref(constraint.first,`${path}.first`);ref(constraint.second,`${path}.second`);
      if(constraint.type==='coincident'||(constraint.axis??'euclidean')==='euclidean'&&constraint.distanceMm===0)addPoint(constraint.first,x=>point(constraint.second,x));
      else {
        const axis=constraint.axis??'euclidean';if(axis==='euclidean'&&constraint.distanceMm<0)reject('欧氏距离不能为负',`${path}.distanceMm`);
        add('mm',x=>{const a=point(constraint.first,x),b=point(constraint.second,x);return (axis==='euclidean'?Math.hypot(b[0]-a[0],b[1]-a[1]):b[axis==='x'?0:1]-a[axis==='x'?0:1])-constraint.distanceMm/scale;});
      }
    } else if(['horizontal','vertical','length'].includes(constraint.type)) {
      entity(constraint.entityId,'line',`${path}.entityId`);
      if(constraint.type==='length')add('mm',x=>length(constraint.entityId,x)-constraint.lengthMm/scale);
      else {
        const original=direction(constraint.entityId,model.values);
        const target=constraint.type==='horizontal'?(original[0]>=0?0:Math.PI):(original[1]>=0?Math.PI/2:-Math.PI/2);
        // An angular residual cannot satisfy horizontal AND vertical by
        // shrinking a line below the absolute positional tolerance.
        add('radians',x=>{const d=direction(constraint.entityId,x);return wrapAngle(Math.atan2(d[1],d[0])-target);});
      }
    } else if(['radius','diameter'].includes(constraint.type)) {
      entity(constraint.entityId,'circle',`${path}.entityId`);
      add('mm',x=>constraint.type==='radius'?radius(constraint.entityId,x)-constraint.radiusMm/scale:2*radius(constraint.entityId,x)-constraint.diameterMm/scale);
    } else if(constraint.type==='equalRadius') {
      entity(constraint.firstId,'circle',`${path}.firstId`);entity(constraint.secondId,'circle',`${path}.secondId`);add('mm',x=>radius(constraint.firstId,x)-radius(constraint.secondId,x));
    } else if(constraint.type==='tangent') {
      entity(constraint.lineId,'line',`${path}.lineId`);entity(constraint.circleId,'circle',`${path}.circleId`);
      add('mm',x=>{const d=direction(constraint.lineId,x),a=point({entityId:constraint.lineId,point:'start'},x),c=point({entityId:constraint.circleId,point:'center'},x);return (d[0]*(c[1]-a[1])-d[1]*(c[0]-a[0]))/norm(d)-(constraint.side==='right'?-1:1)*radius(constraint.circleId,x);});
    } else {
      entity(constraint.firstId,'line',`${path}.firstId`);entity(constraint.secondId,'line',`${path}.secondId`);
      if(constraint.type==='equalLength')add('mm',x=>length(constraint.firstId,x)-length(constraint.secondId,x));
      else if(constraint.type==='angle')add('radians',x=>wrapAngle(angle(constraint.firstId,constraint.secondId,x)-(constraint.direction==='cw'?-1:1)*constraint.angleDeg*Math.PI/180));
      else {
        // A folded asin(sin/cos) residual has a cusp and zero finite-difference
        // slope at an initially perpendicular/parallel pair. Pick the nearest
        // valid directed branch once, then use a smooth wrapped angle residual.
        const initial=angle(constraint.firstId,constraint.secondId,model.values);
        const target=constraint.type==='parallel'?(Math.cos(initial)>=0?0:Math.PI):(Math.sin(initial)>=0?Math.PI/2:-Math.PI/2);
        add('radians',x=>wrapAngle(angle(constraint.firstId,constraint.secondId,x)-target));
      }
    }
  });
  return equations;
}

function residuals(equations,x) {
  const output=equations.map(eq=>eq.evaluate(x));
  return output.every(Number.isFinite)?output:null;
}
function jacobian(equations,x,model) {
  const rows=Array.from({length:equations.length},()=>Array(x.length).fill(0));
  const steps=x.map(value=>1e-6*Math.max(1,Math.abs(value)));
  // Do not step through a very short line and create a zero direction while
  // differentiating its tangent/angle. Account for every shared endpoint.
  if(model)for(const entity of model.byId.values()) {
    if(entity.type==='line') {
      const limit=Math.max(1e-12,norm(model.direction(entity.id,x))*1e-4);
      for(const name of ['start','end']){const index=model.pointIndices.get(`${entity.id}:${name}`);steps[index]=Math.min(steps[index],limit);steps[index+1]=Math.min(steps[index+1],limit);}
    } else {const index=model.radiusIndices.get(entity.id);steps[index]=Math.min(steps[index],Math.max(1e-12,model.radius(entity.id,x)*1e-4));}
  }
  for(let column=0;column<x.length;column++) {
    const step=steps[column],plus=x.slice(),minus=x.slice();plus[column]+=step;minus[column]-=step;
    const a=residuals(equations,plus),b=residuals(equations,minus);if(!a||!b)return null;
    for(let row=0;row<equations.length;row++)rows[row][column]=(a[row]-b[row])/(2*step);
  }
  return rows;
}
function solveLinear(matrix,vector) {
  const n=vector.length,a=matrix.map((row,i)=>[...row,vector[i]]);
  for(let column=0;column<n;column++) {
    let pivot=column;for(let row=column+1;row<n;row++)if(Math.abs(a[row][column])>Math.abs(a[pivot][column]))pivot=row;
    if(!Number.isFinite(a[pivot][column])||Math.abs(a[pivot][column])<1e-20)return null;
    [a[pivot],a[column]]=[a[column],a[pivot]];
    for(let row=column+1;row<n;row++){const factor=a[row][column]/a[column][column];if(!factor)continue;for(let j=column;j<=n;j++)a[row][j]-=factor*a[column][j];}
  }
  const result=Array(n).fill(0);for(let i=n-1;i>=0;i--){let value=a[i][n];for(let j=i+1;j<n;j++)value-=a[i][j]*result[j];result[i]=value/a[i][i];}
  return result.every(Number.isFinite)?result:null;
}
/** Rank of the normalized Jacobian; complete pivoting avoids an ID-order bias. */
function rankOf(jacobian,variableCount) {
  if(!jacobian?.length)return 0;
  const a=jacobian.map(row=>row.slice());
  for(let column=0;column<variableCount;column++){
    const maximum=Math.max(...a.map(row=>Math.abs(row[column])));
    // Do not promote finite-difference roundoff in an otherwise free variable
    // to an independent constraint by dividing by an arbitrarily tiny number.
    for(const row of a)row[column]=maximum>1e-10?row[column]/maximum:0;
  }
  let rank=0;
  for(;rank<Math.min(a.length,variableCount);rank++) {
    let best=0,pivotRow=rank,pivotColumn=rank;
    for(let row=rank;row<a.length;row++)for(let column=rank;column<variableCount;column++)if(Math.abs(a[row][column])>best){best=Math.abs(a[row][column]);pivotRow=row;pivotColumn=column;}
    if(best<1e-7)break;
    [a[rank],a[pivotRow]]=[a[pivotRow],a[rank]];for(const row of a)[row[rank],row[pivotColumn]]=[row[pivotColumn],row[rank]];
    for(let row=rank+1;row<a.length;row++){const factor=a[row][rank]/a[rank][rank];for(let column=rank;column<variableCount;column++)a[row][column]-=factor*a[rank][column];}
  }
  return rank;
}
const satisfied=(equations,r,scale,options)=>r&&equations.every((eq,i)=>Math.abs(r[i])<=(eq.unit==='mm'?options.toleranceMm/scale:options.toleranceDeg*Math.PI/180));
const cost=r=>r.reduce((sum,value)=>sum+value*value,0);

function diagnosticsFor(model,equations,x,r,iterations,options) {
  const j=jacobian(equations,x,model);if(!j)throw Object.assign(new Error('残差可读但导数不稳定，无法可靠报告约束自由度'),{code:'PROFILE_CONSTRAINT_NUMERICAL'});
  const rank=rankOf(j,x.length),records=new Map();
  equations.forEach((eq,i)=>{
    if(!records.has(eq.index))records.set(eq.index,{id:eq.id,index:eq.inputIndex,origin:eq.origin,type:eq.type,residualMm:0,residualDeg:0,satisfied:true});
    const record=records.get(eq.index),value=Math.abs(r[i])*(eq.unit==='mm'?model.scale:180/Math.PI);
    if(eq.unit==='mm')record.residualMm=Math.max(record.residualMm,value);else record.residualDeg=Math.max(record.residualDeg,value);
    record.satisfied&&=value<=(eq.unit==='mm'?options.toleranceMm:options.toleranceDeg);
  });
  const constraintResiduals=[...records.values()],degreesOfFreedom=Math.max(0,x.length-rank);
  return {iterations,variableCount:x.length,equationCount:equations.length,rank,degreesOfFreedom,underconstrained:degreesOfFreedom>0,redundantEquationCount:Math.max(0,equations.length-rank),structurallySharedEndpointCount:model.structuralEndpointCount,maxResidualMm:Math.max(0,...constraintResiduals.map(item=>item.residualMm)),maxAngularResidualDeg:Math.max(0,...constraintResiduals.map(item=>item.residualDeg)),toleranceMm:options.toleranceMm,toleranceDeg:options.toleranceDeg,constraintResiduals,unsatisfiedConstraintIds:constraintResiduals.filter(item=>!item.satisfied).map(item=>item.id),rankMeaning:'Local numerical Jacobian rank at this result; not a global uniqueness or minimal-conflict proof.'};
}

/**
 * Bounded, deterministic local LM solve. It never writes to source/constraints.
 * Closed-loop/chain endpoints share variables, so connectivity is exact.
 * Failure never returns a profile suitable for geometric commit.
 */
export function solveProfileConstraints(profile,constraints,options={}) {
  let model,equations,x,r,iterations=0,settings,prepared;
  try {
    if(!profile||!Array.isArray(profile.entities)||profile.entities.length>64)reject('约束求解须有 1–64 个直线/圆实体','profile.entities');
    prepared=prepareConstraintProfile(profile);
    if(!Array.isArray(constraints)||constraints.length>128)reject('约束须为不超过 128 项的数组');
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['maxIterations','toleranceMm','toleranceDeg'].includes(key)))reject('求解选项无效','options');
    settings={maxIterations:80,toleranceMm:1e-6,toleranceDeg:1e-5,...options};
    if(!Number.isInteger(settings.maxIterations)||settings.maxIterations<1||settings.maxIterations>200||!Number.isFinite(settings.toleranceMm)||settings.toleranceMm<1e-9||settings.toleranceMm>1e-3||!Number.isFinite(settings.toleranceDeg)||settings.toleranceDeg<1e-7||settings.toleranceDeg>1e-2)reject('求解次数或容差超出有界范围','options');
    model=modelFor(prepared.profile);x=model.values.slice();
    if(x.length>128)return failure('PROFILE_CONSTRAINT_LIMIT','首版稠密求解最多 128 个独立标量变量；可减少独立实体或拆分草图');
    if(!model.valid(x))reject('求解首版不支持短于 1e-7 mm 的线或半径','profile.entities');
    equations=equationsFor(model,[...prepared.intrinsicConstraints,...structuredClone(constraints)],prepared.intrinsicConstraints.length);r=residuals(equations,x);if(!r)return failure('PROFILE_CONSTRAINT_NUMERICAL','初始约束残差不是有限数');
    let damping=1e-3;
    for(;iterations<settings.maxIterations&&!satisfied(equations,r,model.scale,settings);iterations++) {
      const j=jacobian(equations,x,model);if(!j)break;
      const n=x.length,matrix=Array.from({length:n},()=>Array(n).fill(0)),gradient=Array(n).fill(0);
      for(let row=0;row<j.length;row++)for(let a=0;a<n;a++){gradient[a]+=j[row][a]*r[row];for(let b=0;b<=a;b++)matrix[a][b]+=j[row][a]*j[row][b];}
      for(let a=0;a<n;a++)for(let b=0;b<a;b++)matrix[b][a]=matrix[a][b];
      let accepted=false;
      for(let attempt=0;attempt<12;attempt++) {
        const damped=matrix.map((row,i)=>row.map((value,k)=>value+(i===k?damping*Math.max(1,matrix[i][i]):0)));
        const delta=solveLinear(damped,gradient.map(value=>-value));if(!delta){damping*=10;continue;}
        const largest=Math.max(1,...delta.map(value=>Math.abs(value)/10)),trial=x.map((value,i)=>value+delta[i]/largest),next=model.valid(trial)?residuals(equations,trial):null;
        if(next&&cost(next)<cost(r)){x=trial;r=next;damping=Math.max(1e-12,damping/3);accepted=true;break;}
        damping=Math.min(1e20,damping*10);
      }
      if(!accepted){iterations++;break;}
    }
    const diagnostics=diagnosticsFor(model,equations,x,r,iterations,settings);
    if(!satisfied(equations,r,model.scale,settings))return failure('PROFILE_CONSTRAINT_UNSATISFIED','约束未同时满足：可能冲突、局部求解未收敛或需要更合适的初始几何',diagnostics);
    const output=model.result(x);
    try{validateProfile(output);}catch(error){return failure('PROFILE_CONSTRAINT_GEOMETRY_INVALID',`约束数值满足，但结果几何无效：${error.message}`,diagnostics,error.path);}
    return {status:'solved',success:true,profile:output,diagnostics,primitiveConversion:prepared.primitiveConversion,intrinsicConstraints:prepared.intrinsicConstraints};
  } catch(error) {
    return failure(error.code??'PROFILE_CONSTRAINT_INVALID',error.message,null,error.path);
  }
}
