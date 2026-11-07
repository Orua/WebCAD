// Original committed tool receipts can prove bounded cut scope even when all six
// cutters are submitted in one Boolean; a nonexistent first-hole state is not invented.
const near=(a,b,t=1e-6)=>Number.isFinite(a)&&Math.abs(a-b)<=t;
const vector=(a,b,t=1e-6)=>Array.isArray(a)&&a.length===3&&a.every((v,i)=>near(v,b[i],t));
const canonical=x=>JSON.stringify(x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
function rotated(p,params){
 let [x,y,z]=p;
 for(const axis of ['x','y','z']){
  const angle=(params['r'+axis]??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  if(axis==='x')[y,z]=[c*y-s*z,s*y+c*z];
  else if(axis==='y')[x,z]=[c*x+s*z,-s*x+c*z];
  else [x,y]=[c*x-s*y,s*x+c*y];
 }
 return [x,y,z];
}
export function m05CommittedCutScope({events,finalGeometry,documentInstanceId,finalRevision}){
 const evidence={scope:'Original committed requests and numeric/bounds receipts, plus independent final STEP; no inferred intermediate STEP',documentInstanceId,finalRevision,stages:[],tools:[],finalStepSha256:finalGeometry?.reader?.inputSha256??null};
 const check=(pass,reason)=>({checkerId:'m05-committed-bounded-radial-cutters-1',pass,evidence:{...evidence,reason}});
 const fail=reason=>{throw Error(reason);};
 try{
  if(!Array.isArray(events)||!documentInstanceId||!Number.isInteger(finalRevision)||finalGeometry?.reader?.independent!==true||!finalGeometry.reader.inputSha256)fail('ORIGINAL_SESSION_AND_FINAL_STEP_REQUIRED');
  if(!['holeCount','radialAxes','retainedMaterial'].every(id=>finalGeometry.checks?.[id]?.pass===true))fail('FINAL_INDEPENDENT_GEOMETRY_NOT_PASSED');
  const requests=events.filter(e=>e.event==='page-request').map(e=>e.request).sort((a,b)=>a.context.expectedRevision-b.context.expectedRevision),nodes=new Map();
  let revision=requests[0]?.context.expectedRevision,main=null,cutCount=0;
  if(!requests.length)fail('COMMITTED_REQUESTS_REQUIRED');
  for(const request of requests){
   if(request.context.documentInstanceId!==documentInstanceId||request.context.expectedRevision!==revision)fail('ORIGINAL_REQUEST_CHAIN_MISMATCH');
   const matches=events.filter(e=>e.event==='page-receipt'&&e.requestKey===request.idempotencyKey);
   if(matches.length!==1||matches[0].receipt?.status!=='completed')fail('UNIQUE_COMPLETED_RECEIPT_REQUIRED');
   const receipt=matches[0].receipt,local=new Map();
   for(const step of request.steps){
    const row=receipt.results.find(r=>r.id===step.id),result=row?.result;
    if(step.method!=='add'){
     if(!['measure','queryGeometry','inspectDesign','readDocs'].includes(step.method)||result?.status!=='read')fail('UNEXPECTED_MUTATION_OR_READ_FAILURE');
     continue;
    }
    const args=step.args,p=args.params??{},refs=(args.refs??[]).map(value=>{
     if(typeof value==='string')return value;
     const path=value?.$ref?.split('.');if(path?.length!==3||path[1]!=='createdBodyIds'||path[2]!=='0'||!local.has(path[0]))fail('UNRESOLVED_ORIGINAL_REF');return local.get(path[0]);
    });
    if(result?.status!=='committed'||result.documentInstanceId!==documentInstanceId||result.revisionBefore!==revision||result.revisionAfter!==revision+1||result.validation?.geometry!=='passed'||result.createdBodyIds?.length!==1||canonical(result.numericInput?.effectiveParams)!==canonical(p))fail('ORIGINAL_COMMIT_OR_EFFECTIVE_PARAMS_MISMATCH');
    revision=result.revisionAfter;const id=result.createdBodyIds[0];let node;
    if(args.op==='cylinder'){
     if(refs.length||!vector(result.resolvedPlacement?.worldPoint,[0,0,0])||!Object.keys(p).every(k=>['radius','height'].includes(k)))fail('CYLINDER_SOURCE_PLACEMENT_NOT_PROVEN');
     node={kind:'cylinder',radius:p.radius,height:p.height,origin:[0,0,0],axis:[0,0,1]};
    }else if(args.op==='transform'){
     const source=nodes.get(refs[0]);if(refs.length!==1||source?.kind!=='cylinder'||!Object.keys(p).every(k=>['x','y','z','rx','ry','rz'].includes(k)))fail('UNSUPPORTED_CUTTER_TRANSFORM');
     node={...source,origin:rotated(source.origin,p).map((v,i)=>v+(p[['x','y','z'][i]]??0)),axis:rotated(source.axis,p)};
     const bounds=result.facts?.bounds?.items?.find(b=>b.id===id),end=node.origin.map((v,i)=>v+node.axis[i]*node.height),extent=node.axis.map(a=>node.radius*Math.sqrt(Math.max(0,1-a*a)));
     if(!bounds||!vector(bounds.min,node.origin.map((v,i)=>Math.min(v,end[i])-extent[i]),.002)||!vector(bounds.max,node.origin.map((v,i)=>Math.max(v,end[i])+extent[i]),.002))fail('ACTUAL_CUTTER_BOUNDS_MISMATCH');
     node.bounds=bounds;
    }else if(args.op==='cut'){
     if(Object.keys(p).length||refs.length<2)fail('UNSUPPORTED_BOOLEAN_PARAMS');
     const source=nodes.get(refs[0]),tools=refs.slice(1).map(id=>nodes.get(id));
     if(main===null){
      if(refs.length!==2||source?.kind!=='cylinder'||!near(source.radius,12)||!near(source.height,20)||!vector(source.origin,[0,0,0])||!vector(source.axis,[0,0,1])||tools[0]?.kind!=='cylinder'||!near(tools[0].radius,10)||!near(tools[0].height,20)||!vector(tools[0].origin,[0,0,0])||!vector(tools[0].axis,[0,0,1]))fail('ORIGINAL_SLEEVE_NOT_PROVEN');
     }else{
      if(refs[0]!==main)fail('CUTS_MUST_KEEP_ORIGINAL_MAIN_CHAIN');
      for(let i=0;i<tools.length;i++){
       const tool=tools[i],angle=tool?Math.atan2(tool.origin[1],tool.origin[0]):NaN,index=((Math.round(angle/(Math.PI/3))%6)+6)%6;
       const axis=[Math.cos(index*Math.PI/3),Math.sin(index*Math.PI/3),0],origin=[9*axis[0],9*axis[1],10];
       if(tool?.kind!=='cylinder'||!near(tool.radius,1)||!near(tool.height,4)||!vector(tool.axis,axis)||!vector(tool.origin,origin)||!tool.bounds)fail('CUTTER_NOT_WITHIN_ORIGINAL_RADIAL_9_TO_13');
       evidence.tools.push({bodyId:refs[i+1],index,radius:tool.radius,height:tool.height,origin:tool.origin,axis:tool.axis,actualBounds:tool.bounds,cutRequestId:result.requestId});
      }
     }
     cutCount++;node={kind:'main'};main=id;
    }else fail('UNEXPECTED_GEOMETRY_OPERATION');
    nodes.set(id,node);local.set(step.id,id);evidence.stages.push({stepId:step.id,op:args.op,bodyId:id,refs,requestId:result.requestId,revisionBefore:result.revisionBefore,revisionAfter:result.revisionAfter});
   }
  }
  if(revision!==finalRevision||cutCount<2||evidence.tools.length!==6||new Set(evidence.tools.map(t=>t.index)).size!==6)fail('SIX_ORIGINAL_COMMITTED_CUTTERS_AND_FINAL_REVISION_REQUIRED');
  return check(true,null);
 }catch(error){return check(null,error.message);}
}
