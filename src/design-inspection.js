// Requirements come from the drawing/user, never from the generated model.
// This module is shared by the page boundary and the exact Worker inspector.
const fail=(code,message,path)=>{throw Object.assign(new Error(message),{code,path});};
const keys=(value,allowed,path)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))
    fail('PARAM_SCHEMA_INVALID','Unexpected fields',path);
};
const point=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const xyzSchema={type:'array',items:{type:'number'},minItems:3,maxItems:3};
const evidenceSchema={type:'object',properties:{kind:{enum:['drawing','user','assumption']},reference:{type:'string',minLength:1,maxLength:500}},required:['kind','reference'],additionalProperties:false};
const variant=(kind,fields,required)=>({type:'object',properties:{id:{type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,39}$'},bodyId:{type:'string',minLength:1,maxLength:150},kind:{const:kind},evidence:evidenceSchema,...fields},required:['id','bodyId','kind','evidence',...required],additionalProperties:false});
export const DESIGN_INSPECTION_SCHEMA={type:'object',properties:{
  context:{type:'object',properties:{sessionId:{type:'string'},documentId:{type:'string'},documentInstanceId:{type:'string'},expectedRevision:{type:'integer',minimum:0}},required:['sessionId','documentId','documentInstanceId','expectedRevision'],additionalProperties:false},
  requirePass:{type:'boolean',default:false},
  requirements:{type:'array',minItems:1,maxItems:64,items:{oneOf:[
    variant('bounds',{sizeMm:{...xyzSchema,items:{type:'number',minimum:0}},toleranceMm:{type:'number',exclusiveMinimum:0,maximum:1}},['sizeMm','toleranceMm']),
    variant('solidCount',{count:{type:'integer',minimum:1,maximum:1000}},['count']),
    variant('material',{points:{type:'array',items:xyzSchema,minItems:1,maxItems:128},expected:{enum:['inside','outside']},toleranceMm:{type:'number',exclusiveMinimum:0,maximum:0.01,default:0.00001}},['points','expected']),
  ]}},
},required:['context','requirements'],additionalProperties:false};
export function validateDesignRequirements(requirements){
  if(!Array.isArray(requirements)||!requirements.length||requirements.length>64)
    fail('RESOURCE_LIMIT','Provide 1..64 requirements','requirements');
  const ids=new Set();let samples=0;
  requirements.forEach((r,i)=>{
    const at=`requirements.${i}`;
    keys(r,['id','bodyId','kind','evidence',...({bounds:['sizeMm','toleranceMm'],solidCount:['count'],material:['points','expected','toleranceMm']}[r?.kind]||[])],at);
    if(typeof r.id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(r.id)||ids.has(r.id))fail('PARAM_SCHEMA_INVALID','Unique requirement ID required',`${at}.id`);
    ids.add(r.id);
    if(typeof r.bodyId!=='string'||!r.bodyId.length||r.bodyId.length>150)fail('PARAM_SCHEMA_INVALID','Current bodyId required',`${at}.bodyId`);
    keys(r.evidence,['kind','reference'],`${at}.evidence`);
    if(!['drawing','user','assumption'].includes(r.evidence.kind)||typeof r.evidence.reference!=='string'||!r.evidence.reference.trim()||r.evidence.reference.length>500)
      fail('PARAM_SCHEMA_INVALID','Evidence requires kind drawing/user/assumption and a short source reference',`${at}.evidence`);
    if(r.kind==='bounds'){
      if(!point(r.sizeMm)||r.sizeMm.some(v=>v<0))fail('PARAM_SCHEMA_INVALID','sizeMm is world XYZ extent in mm',`${at}.sizeMm`);
      if(!Number.isFinite(r.toleranceMm)||r.toleranceMm<=0||r.toleranceMm>1)fail('PARAM_RANGE_INVALID','Explicit toleranceMm must be >0 and <=1',`${at}.toleranceMm`);
    }else if(r.kind==='solidCount'){
      if(!Number.isSafeInteger(r.count)||r.count<1||r.count>1000)fail('PARAM_RANGE_INVALID','count must be 1..1000',`${at}.count`);
    }else if(r.kind==='material'){
      if(!Array.isArray(r.points)||!r.points.length||r.points.some(p=>!point(p))||!['inside','outside'].includes(r.expected))fail('PARAM_SCHEMA_INVALID','Provide world XYZ sample points and expected inside/outside',at);
      samples+=r.points.length;
      if(samples>128)fail('RESOURCE_LIMIT','At most 128 material samples per request',`${at}.points`);
      if(r.toleranceMm!==undefined&&(!Number.isFinite(r.toleranceMm)||r.toleranceMm<=0||r.toleranceMm>0.01))fail('PARAM_RANGE_INVALID','Material tolerance must be >0 and <=0.01 mm',`${at}.toleranceMm`);
    }else fail('PARAM_SCHEMA_INVALID','kind must be bounds, solidCount or material',`${at}.kind`);
  });
  return requirements;
}

export function inspectDesignRequirements(requirements,kernel,cad,oc){
  validateDesignRequirements(requirements);
  // Resolve all references before doing any kernel work, including on direct calls.
  const shapes=new Map(requirements.map(r=>[r.bodyId,kernel.activeShape(r.bodyId)]));
  const measurements=new Map(),boundaries=new Map(),isolated=new Map(),insideVertices=new Map(),distanceCache=new Map();
  const dispose=value=>value?.delete?.();
  const measure=id=>{if(!measurements.has(id))measurements.set(id,kernel.measure(id));return measurements.get(id);};
  function prepare(bodyId){
    if(insideVertices.has(bodyId))return;
    if(measure(bodyId).solidCount!==1)fail('DESIGN_CHECK_UNSUPPORTED','Material samples require one solid',bodyId);
    const copy=cad.deserializeShape(shapes.get(bodyId).serialize());isolated.set(bodyId,copy);
    const shells=Array.from(cad.iterTopo(copy.wrapped,'shell'),item=>cad.cast(item));
    try{boundaries.set(bodyId,cad.makeCompound(shells));}finally{shells.forEach(dispose);}
    const unique=new Map(requirements.filter(r=>r.kind==='material'&&r.bodyId===bodyId).flatMap(r=>r.points.map(p=>[JSON.stringify(p),p])));
    const entries=Array.from(unique),close=new Set();
    // Boolean builders may merge distinct vertices closer than OCC tolerance.
    // Those points keep the original independent exact classification path.
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)if(Math.hypot(...entries[i][1].map((v,k)=>v-entries[j][1][k]))<=1e-6){close.add(entries[i][0]);close.add(entries[j][0]);}
    const vertices=entries.filter(([key])=>!close.has(key)).map(([,p])=>cad.makeVertex(p));let compound,common;
    try{
      if(vertices.length){compound=cad.makeCompound(vertices);common=copy.intersect(compound);}
      const found=common?Array.from(cad.iterTopo(common.wrapped,'vertex'),v=>cad.cast(v)):[];
      try{
        const classified=new Map(Array.from(unique.keys(),key=>[key,false]));
        for(const vertex of found){
          const xyz=vertex.asTuple();
          // OCC retains input coordinates. Reject ambiguous/unmapped vertices
          // instead of accepting nearest neighbours or relaxing tolerances.
          const key=JSON.stringify(xyz);
          if(!classified.has(key))fail('DESIGN_CHECK_INCONCLUSIVE','Point common returned an unmapped vertex',bodyId);
          classified.set(key,true);
        }
        for(const key of close){
          const vertex=cad.makeVertex(unique.get(key));let single;
          try{
            single=copy.intersect(vertex);
            const retained=Array.from(cad.iterTopo(single.wrapped,'vertex'),v=>cad.cast(v));
            try{if(retained.length>1)fail('DESIGN_CHECK_INCONCLUSIVE','Point common has unexpected topology',bodyId);classified.set(key,retained.length===1);}finally{retained.forEach(dispose);}
          }finally{single?.delete();vertex.delete();}
        }
        insideVertices.set(bodyId,classified);
      }finally{found.forEach(dispose);}
    }finally{[common,compound,...vertices].forEach(dispose);}
  }
  function sample(bodyId,xyz,toleranceMm){
    let vertex,boundaryQuery;
    try{
      prepare(bodyId);
      const key=JSON.stringify(xyz),distanceKey=bodyId+':'+key;
      let boundaryDistanceMm=distanceCache.get(distanceKey);
      if(boundaryDistanceMm===undefined){
        vertex=cad.makeVertex(xyz);
        boundaryQuery=new oc.BRepExtrema_DistShapeShape();boundaryQuery.LoadS1(vertex.wrapped);boundaryQuery.LoadS2(boundaries.get(bodyId).wrapped);boundaryQuery.Perform();
        if(!boundaryQuery.IsDone()||boundaryQuery.NbSolution()<1)fail('DESIGN_CHECK_INCONCLUSIVE','Boundary distance did not converge',bodyId);
        boundaryDistanceMm=boundaryQuery.Value();distanceCache.set(distanceKey,boundaryDistanceMm);
      }
      if(!Number.isFinite(boundaryDistanceMm)||boundaryDistanceMm<0)fail('DESIGN_CHECK_INCONCLUSIVE','Invalid boundary distance',bodyId);
      if(boundaryDistanceMm<=toleranceMm)return {point:[...xyz],classification:'boundary',boundaryDistanceMm};
      return {point:[...xyz],classification:insideVertices.get(bodyId).get(key)?'inside':'outside',boundaryDistanceMm};
    }catch(error){
      if(error?.code)throw error;
      fail('DESIGN_CHECK_INCONCLUSIVE','Exact material classification failed; inspect the source geometry',bodyId);
    }finally{[boundaryQuery,vertex].forEach(dispose);}
  }
  try{
    const results=requirements.map(r=>{
      let actual,matches;
      if(r.kind==='bounds'){
        const {bounds}=measure(r.bodyId),sizeMm=bounds.max.map((v,i)=>v-bounds.min[i]);
        const deltaMm=sizeMm.map((v,i)=>v-r.sizeMm[i]);
        actual={bounds,sizeMm,deltaMm};matches=deltaMm.every(v=>Math.abs(v)<=r.toleranceMm);
      }else if(r.kind==='solidCount'){
        actual={count:measure(r.bodyId).solidCount};matches=actual.count===r.count;
      }else{
        const toleranceMm=r.toleranceMm??1e-5;
        const samples=r.points.map(p=>sample(r.bodyId,p,toleranceMm));
        actual={samples,toleranceMm};
        matches=samples.some(p=>p.classification!==r.expected&&p.classification!=='boundary')?false:samples.some(p=>p.classification==='boundary')?null:true;
      }
      const verdict=matches===false?'fail':matches===null||r.evidence.kind==='assumption'?'unverified':'pass';
      return {id:r.id,bodyId:r.bodyId,kind:r.kind,evidence:{...r.evidence},matches,verdict,
        expected:r.kind==='bounds'?{sizeMm:[...r.sizeMm],toleranceMm:r.toleranceMm}:r.kind==='solidCount'?{count:r.count}:{classification:r.expected},actual};
    });
    const summary=Object.fromEntries(['pass','fail','unverified'].map(k=>[k,results.filter(r=>r.verdict===k).length]));
    return {verdict:summary.fail?'fail':summary.unverified?'unverified':'pass',summary,results,
      scope:'specified-checks-only',sourceEvidenceVerified:false,
      limitations:['Evidence labels are supplied by the caller, not independently verified.',
        'Material samples do not prove whole-part connectivity, complete hole clearance, section shape or fillet continuity.',
        'This is not product acceptance, rendering, export or disk-write verification.']};
  }finally{boundaries.forEach(dispose);isolated.forEach(dispose);}
}
