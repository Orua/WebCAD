import {recipe} from './recipes.mjs';
// Host supplies authorized API on a new empty document at 17674.
// No browser launch, model inference, server, installation or automatic rollback.
export async function runPageRegression(api){
 const initial=api.getState();if(initial.summary.bodyCount!==0||initial.summary.busy)throw Error('Requires new empty ready test document');
 const evidence={initial,logs:[]};
 const run=async(id,steps)=>{const request={context:api.getState().requestContext,idempotencyKey:'methods-'+id+'-'+Date.now(),steps};const receipt=await api.run(request);evidence.logs.push({id,request,receipt});if(receipt.status!=='completed'&&id!=='negative')throw Object.assign(Error('Stopped after '+id),{evidence});return receipt;};
 const m=id=>({id:'measure',method:'measure',args:{bodyId:{$ref:id+'.createdBodyIds.0'}}});
 const base=()=>({id:'plate',method:'add',args:{op:'box',params:{width:30,depth:20,height:3},refs:[],placement:{version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}}}});
 await run('plate-two-holes',recipe('plate-two-holes'));await run('blind-hole',recipe('blind-hole'));
 const fb=await run('finish-base',[base(),m('plate')]);const body=fb.results[0].result.createdBodyIds[0];
 const input={context:api.getState().context,bodyId:body,kind:'edge',filter:{curveType:'line',lengthRangeMm:{min:2.999999,max:3.000001}},requireUnique:false,expectedCount:4};
 const result=await api.queryGeometry(input);evidence.selection={input,result};if(result.status!=='read')throw Object.assign(Error('Current edges ambiguous'),{evidence});
 await run('chamfer',recipe('finish',{bodyId:body,edgeIds:result.items.map(x=>x.edgeId),kind:'chamfer',distanceMm:0.5}));
 const eb=await run('edit-base',[{...base(),id:'part'}]),feature=eb.results[0].result.createdFeatureIds[0],card=api.getTool({id:'box'});
 await run('edit',[...recipe('edit-box',{featureId:feature,opVersion:card.version,schemaHash:card.schemaHash,heightMm:4}),{id:'measure',method:'measure',args:{bodyId:feature}}]);
 const ex=await run('export',recipe('export',{bodyId:feature,format:'step'})),artifact=ex.results[0].result,bytes=await api.files.read({resourceId:artifact.resourceId,as:'bytes'});
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 evidence.exportBytes={size:bytes.byteLength,header:new TextDecoder().decode(bytes.slice(0,80)),sha256:hash,descriptorMatches:hash===artifact.sha256&&bytes.byteLength===artifact.size,diskWritten:false};
 const find=(id,step)=>evidence.logs.find(x=>x.id===id).receipt.results.find(x=>x.id===step).result;
 evidence.geometryQueries=[];for(const [id,bodyId,filter,count]of [['double-hole-edges',find('plate-two-holes','holes').createdBodyIds[0],{curveType:'circle',radiusRangeMm:{min:1.999999,max:2.000001},lengthRangeMm:{min:4*Math.PI-1e-6,max:4*Math.PI+1e-6}},4],['blind-bottom',find('blind-hole','hole').createdBodyIds[0],{curveType:'circle',radiusRangeMm:{min:1.999999,max:2.000001}},2],['chamfer-diagonals',find('chamfer','finish').createdBodyIds[0],{curveType:'line',lengthRangeMm:{min:Math.sqrt(0.5)-1e-6,max:Math.sqrt(0.5)+1e-6}},8]]){const input={context:api.getState().context,bodyId,kind:'edge',filter,requireUnique:false,expectedCount:count};evidence.geometryQueries.push({id,input,result:await api.queryGeometry(input)});}
 const before=api.getState();await run('negative',[{id:'bad',method:'add',args:{op:'cylinder',params:{radius:-2,height:8},refs:[]}}]);evidence.negativeRevision={before:before.context.revision,after:api.getState().context.revision};
 const original=evidence.logs.find(x=>x.id==='edit').request;const key={idempotencyKey:original.idempotencyKey,documentInstanceId:original.context.documentInstanceId};evidence.reconcile={input:key,result:await api.getBatchReceipt(key)};
 evidence.finalState=api.getState();return evidence;
}
