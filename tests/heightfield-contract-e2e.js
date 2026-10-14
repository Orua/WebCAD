// Runs against one fresh, ready page through the public API only.
export async function runHeightfieldContractE2E(){
 const api=window.webcad.api,assert=(ok,message)=>{if(!ok)throw Error(message);},receipts=[];
 assert(api.getState().summary.bodyCount===0,'T9 requires an empty task-owned document');
 const execute=async(action,args)=>{const r=await api.execute({context:api.createRequestContext(),idempotencyKey:crypto.randomUUID(),action,args});assert(r.status==='committed',JSON.stringify(r));receipts.push({action,status:r.status,revision:r.context?.revision});return r;};
 const add=async(op,params,refs=[],placement)=>{const c=api.getTool({id:op});const r=await execute('feature.add',{op,opVersion:c.version,schemaHash:c.schemaHash,params,refs,...(placement?{placement}:{})});return r.createdBodyIds[0];};
 const c=21,r=21,params={version:2,sizeXMm:20,sizeYMm:20,baseThicknessMm:2,reliefHeightMm:1,columns:c,rows:r,heights:{encoding:'u8',data:btoa(String.fromCharCode(...new Uint8Array(c*r).fill(255)))},smoothing:0,gamma:1,edgeFadeMm:0};
 const world={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
 const relief=await add('meshHeightfieldRelief',params,[],world),card=api.getTool({id:'meshHeightfieldRelief'});
 await execute('feature.edit',{featureId:relief,opVersion:card.version,schemaHash:card.schemaHash,params:{sculpt:[{mode:'raise',radiusMm:1.5,strength:.2,points:[-8,-2]},{mode:'lower',radiusMm:1,strength:.1,points:[-6,-4]}]}});
 const before=await api.measure({context:api.getState().context,bodyId:relief});assert(before.status==='read'&&before.volume>0,'relief volume');
 const box=await add('box',{width:8,depth:8,height:4},[],world),boxMeasure=await api.measure({context:api.getState().context,bodyId:box});
 const overlap=8*8*3; // Box footprint [0,8]^2 misses both brush discs; height there is exactly 3 mm.
 const merged=await add('meshBoolean',{version:1,operation:'union',toleranceMm:.05},[relief,box]);
 const measure=await api.measure({context:api.getState().context,bodyId:merged}),expected=before.volume+boxMeasure.volume-overlap;
 assert(measure.meshReport.closed===true,'closed merged mesh');assert(Math.abs(measure.volume-expected)<.01,`union volume ${measure.volume} expected ${expected}`);
 const artifact=await api.files.export({context:api.createRequestContext(),format:'stl',ids:[merged]});assert(artifact.status==='generated','STL generated');
 const bytes=await api.files.read({resourceId:artifact.resourceId,as:'bytes'});assert(bytes.byteLength>84,'STL bytes');let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const read={status:'read',size:bytes.length,sha256:artifact.sha256,base64:btoa(binary)};
 await api.setView({context:api.getState().context,direction:'iso',fit:true});await api.redraw({context:api.getState().context});const state=api.getState();assert(state.display.rendered.revision===state.context.revision,'matching rendered revision');
 return {status:'passed',receipts,reliefVolume:before.volume,boxVolume:boxMeasure.volume,overlapVolume:overlap,unionVolume:measure.volume,expectedVolume:expected,sculptStrokes:2,bodyId:merged,stl:read,display:state.display};
}
