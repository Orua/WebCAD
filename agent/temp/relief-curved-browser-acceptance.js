export async function runCurvedAcceptance(){
 const a=window.webcad.api,c=a.connect({toolIds:['relief','logo','cylinder','sphere','transform','queryGeometry','readRelief','history.undo','history.redo']});
 if(!c.canExecute||c.bodyCount!==1)throw Error('Expected one unmodified test cylinder');
 const ctx=()=>a.connect().requestContext,report={started:new Date().toISOString(),cases:[],checks:[]};
 const check=(v,label)=>{if(!v)throw Error(label);report.checks.push(label);};
 const add=async(op,params,refs=[],name=op)=>{const r=await a.run({context:ctx(),idempotencyKey:crypto.randomUUID(),steps:[{id:'add',method:'add',args:{op,params,refs,name}}]});if(r.status!=='completed')throw Error(JSON.stringify(r));return r.results[0].result.createdBodyIds[0];};
 const face=async id=>(await a.queryGeometry({context:ctx(),bodyId:id,kind:'face',requireUnique:false,limit:50})).items.find(f=>!f.planar).faceId;
 for(const [i,file]of ['relief-waves.jpg','relief-rosette.svg','relief-vine.svg'].entries()){
  const x=i*55;
  let id=i===0?a.getState().bodies[0].id:await add('cylinder',{radius:20,height:40},[],'柱面浮雕底体');
  if(i)id=await add('transform',{x},[id]);
  const resource=await a.files.register({name:file,data:await(await fetch('/agent/temp/'+file)).blob()});
  const image=await a.readRelief({context:ctx(),resourceId:resource.resourceId,name:file,samples:25,whiteHigh:i!==2,style:i===2?'rounded':'grayscale'});await a.files.release({resourceId:resource.resourceId});
  const params={faceId:await face(id),point:[x,-20,20],baseMm:.02,widthMm:24,heightMm:24,depthMm:1.5,mode:i===1?'engrave':'emboss',values:image.values,source:image.source};
  const created=await add('relief',params,[id],file+' 柱面曲面');const body=a.getState().bodies.find(b=>b.id===created);
  check(body.solidCount===1&&body.reliefReport?.valid&&body.reliefReport.kind==='cylindrical-bspline-heightfield',file+' is one valid cylindrical relief solid');
  check(Math.abs(Math.abs(body.volume-Math.PI*400*40)-(body.reliefReport.addedMm3||body.reliefReport.removedMm3))<1e-5,file+' material report matches actual volume');
  report.cases.push({name:file,bodyId:created,volume:body.volume,report:body.reliefReport});
  if(i===0){
   const revision=a.getState().context.revision;const failed=await a.run({context:ctx(),idempotencyKey:crypto.randomUUID(),steps:[{id:'bad',method:'add',args:{op:'relief',params:{...params,angleDeg:12},refs:[created]}}]});
   check(failed.status==='failed'&&a.getState().context.revision===revision,'unsupported cylinder image rotation fails without commit');
   const undo=await a.execute({context:ctx(),idempotencyKey:crypto.randomUUID(),action:'history.undo',args:{}});check(undo.status==='committed','cylindrical relief undo');
   const redo=await a.execute({context:ctx(),idempotencyKey:crypto.randomUUID(),action:'history.redo',args:{}});check(redo.status==='committed'&&a.getState().bodies.find(b=>b.id===created).volume===body.volume,'cylindrical relief redo preserves exact volume');
  }
 }
 const regions=[{outer:[[-6,-6],[6,-6],[6,6],[-6,6]],holes:[[[-2,-2],[-2,2],[2,2],[2,-2]]]}];
 for(const [i,op]of ['cylinder','sphere'].entries()){
  const x=i*55;let id=await add(op,op==='sphere'?{radius:20}:{radius:20,height:40},[],op+' LOGO基体');
  id=await add('transform',{x,y:65,z:op==='sphere'?20:0},[id]);const before=a.getState().bodies.find(b=>b.id===id).volume;
  const created=await add('logo',{placementVersion:2,faceId:await face(id),point:[x,45,20],mode:'engrave',depth:.8,draftAngle:0,scale:1,angle:0,offsetX:0,offsetY:0,regions,source:{kind:'reviewed-contours',reviewed:true}},[id],op+' 曲面LOGO');
  const body=a.getState().bodies.find(b=>b.id===created);check(body.solidCount===1&&body.volume<before,op+' unified LOGO engraves a single solid');report.cases.push({name:op+' LOGO',bodyId:created,volume:body.volume,removedMm3:before-body.volume});
 }
 await a.setView({context:ctx(),direction:'iso',fit:true,selectedIds:[],display:'solid',grid:false,gizmo:'off',panels:{right:false,left:false}});
 report.finished=new Date().toISOString();report.summary=a.getState().summary;report.status='passed';return report;
}
