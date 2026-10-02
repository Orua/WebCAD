export async function runReliefAcceptance(){
 const api=window.webcad.api,report={started:new Date().toISOString(),cases:[],checks:[]};
 const initial=api.connect({toolIds:['relief','readRelief','box','transform','queryGeometry','preview.start','preview.commit','feature.edit','history.undo','history.redo']});
 if(!initial.canExecute||initial.bodyCount)throw Error('Use the existing empty task-owned test page');
 const card=api.getTool({id:'relief'});
 const contract=card.card??card;
 const ctx=()=>api.connect().requestContext;
 const execute=(action,args)=>api.execute({context:ctx(),idempotencyKey:crypto.randomUUID(),action,args});
 const check=(ok,message)=>{if(!ok)throw Error(message);report.checks.push(message);};
 for(const [i,c]of [
  {name:'JPG 波纹曲面',file:'relief-waves.jpg',style:'grayscale',whiteHigh:true,samples:33,depth:2},
  {name:'SVG 花瓣层次',file:'relief-rosette.svg',style:'grayscale',whiteHigh:true,samples:49,depth:3},
  {name:'SVG 叶片柔和鼓起',file:'relief-vine.svg',style:'rounded',whiteHigh:false,samples:49,depth:2.5}
 ].entries()){
  const blob=await (await fetch('/agent/temp/'+c.file)).blob();
  const resource=await api.files.register({name:c.file,data:blob});
  const decoded=await api.readRelief({context:ctx(),resourceId:resource.resourceId,name:c.file,samples:c.samples,style:c.style,whiteHigh:c.whiteHigh});
  check(decoded.status==='read',c.name+' image decoded');await api.files.release({resourceId:resource.resourceId});
  const base=await api.run({context:ctx(),idempotencyKey:crypto.randomUUID(),steps:[
   {id:'base',method:'add',args:{op:'box',params:{width:40,depth:40,height:3},refs:[],name:c.name+'底板'}},
   {id:'position',method:'add',args:{op:'transform',params:{x:(i-1)*48},refs:[{$ref:'base.createdBodyIds.0'}]}},
   {id:'faces',method:'queryGeometry',args:{bodyId:{$ref:'position.createdBodyIds.0'},kind:'face',requireUnique:false,limit:10}}
  ]});
  check(base.status==='completed',c.name+' base committed');
  const bodyId=base.results.find(x=>x.id==='position').result.createdBodyIds[0];
  const faces=base.results.find(x=>x.id==='faces').result.items;
  const face=faces.find(f=>f.planar&&f.normal?.[2]>.999&&f.areaMm2>1000);check(!!face,c.name+' actual top face queried');
  const params={faceId:face.faceId,widthMm:32,heightMm:32/decoded.aspectRatio,depthMm:c.depth,values:decoded.values,source:decoded.source};
  const start=performance.now(),request={context:ctx(),idempotencyKey:crypto.randomUUID(),steps:[{id:'relief',method:'add',args:{op:'relief',name:c.name,params,refs:[bodyId]}}]};
  const receipt=await api.run(request);check(receipt.status==='completed',c.name+' relief committed');
  const state=api.getState(),resultId=receipt.results[0].result.createdBodyIds[0],body=state.bodies.find(b=>b.id===resultId);
  check(body.solidCount===1&&body.reliefReport?.valid,c.name+' one validated solid');
  check(Math.abs((body.volume-4800)-body.reliefReport.addedMm3)<1e-6,c.name+' report agrees with exact body volume');
  const beforeRevision=state.context.revision,beforeCount=state.summary.featureCount;
  const replay=await api.run(request),after=api.getState();check(replay.status==='completed'&&after.context.revision===beforeRevision&&after.summary.featureCount===beforeCount,c.name+' duplicate request does not duplicate geometry');
  report.cases.push({name:c.name,bodyId:resultId,elapsedMs:performance.now()-start,volume:body.volume,solidCount:body.solidCount,report:body.reliefReport,display:receipt.display.status,displayMatchesContext:receipt.displayMatchesContext,source:decoded.source});
  if(i===0){
   const invalidBefore=api.getState();
   const invalid=await api.run({context:ctx(),idempotencyKey:crypto.randomUUID(),steps:[{id:'outside',method:'add',args:{op:'relief',params:{...params,widthMm:90},refs:[resultId]}}]});
   check(invalid.status==='failed'&&api.getState().context.revision===invalidBefore.context.revision,'failed geometry does not commit');
   const edited=await execute('feature.edit',{featureId:resultId,opVersion:contract.version,schemaHash:contract.schemaHash,params:{depthMm:1.5}});
   check(edited.status==='committed','history edits relief from upstream base');
   const editedVolume=api.getState().bodies.find(b=>b.id===resultId).volume;check(editedVolume<body.volume&&editedVolume>4800,'history depth edit changes actual relief volume');
   check((await execute('history.undo',{})).status==='committed','undo succeeds');
   check(Math.abs(api.getState().bodies.find(b=>b.id===resultId).volume-body.volume)<1e-6,'undo restores original relief geometry');
  }
 }
 const view=await api.setView({context:ctx(),direction:'iso',fit:true,selectedIds:[],display:'solid',grid:false,panels:{right:false,left:false}});
 report.finished=new Date().toISOString();report.display=api.getState().display;report.summary=api.getState().summary;report.viewStatus=view.status;
 return report;
}
