export async function runEngraveAcceptance(){
 const api=window.webcad.api,initial=api.connect({toolIds:['relief','readRelief','history.undo','history.redo']});
 if(!initial.canExecute||initial.bodyCount!==3)throw Error('Expected the three relief test plates in the existing page');
 const ctx=()=>api.connect().requestContext,checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const original=JSON.stringify(api.getState().features);
 const file=await api.files.register({name:'relief-levels.svg',data:await(await fetch('/agent/temp/relief-levels.svg')).blob()});
 const image=await api.readRelief({context:ctx(),resourceId:file.resourceId,name:'relief-levels.svg',samples:65,whiteHigh:true});
 await api.files.release({resourceId:file.resourceId});check(image.status==='read','65-sample multilevel SVG decodes through public resource API');
 const base=await api.run({context:ctx(),idempotencyKey:crypto.randomUUID(),steps:[
  {id:'base',method:'add',args:{op:'box',name:'凹雕试验底板',params:{width:40,depth:40,height:3},refs:[]}},
  {id:'position',method:'add',args:{op:'transform',params:{y:52},refs:[{$ref:'base.createdBodyIds.0'}]}},
  {id:'faces',method:'queryGeometry',args:{bodyId:{$ref:'position.createdBodyIds.0'},kind:'face',requireUnique:false,limit:10}}
 ]});check(base.status==='completed','engraving base committed');
 const sourceId=base.results[1].result.createdBodyIds[0],face=base.results[2].result.items.find(f=>f.planar&&f.normal?.[2]>.999&&f.areaMm2>1000);
 check(!!face,'current top face queried');
 const start=performance.now();
 const add=await api.run({context:ctx(),idempotencyKey:crypto.randomUUID(),steps:[{id:'engrave',method:'add',args:{op:'relief',name:'SVG 连续凹雕与层次',refs:[sourceId],params:{faceId:face.faceId,widthMm:32,heightMm:32/image.aspectRatio,depthMm:1.5,mode:'engrave',values:image.values,source:image.source}}}]});
 check(add.status==='completed','multilevel engraving committed');
 const id=add.results[0].result.createdBodyIds[0],body=api.getState().bodies.find(b=>b.id===id);
 check(body.solidCount===1&&body.reliefReport.valid&&body.volume<4800,'engraving removes material while retaining one valid solid');
 check(Math.abs(4800-body.volume-body.reliefReport.removedMm3)<1e-7,'removed material report agrees with body volume');
 const execute=action=>api.execute({context:ctx(),idempotencyKey:crypto.randomUUID(),action,args:{}});
 check((await execute('history.undo')).status==='committed','engraving undo committed');
 check(api.getState().bodies.some(b=>b.id===sourceId&&Math.abs(b.volume-4800)<1e-7),'undo restores uncut base');
 check((await execute('history.redo')).status==='committed','engraving redo committed');
 check(Math.abs(api.getState().bodies.find(b=>b.id===id).volume-body.volume)<1e-7,'redo restores exact engraving volume');
 check(JSON.stringify(api.getState().features.slice(0,JSON.parse(original).length))===original,'three earlier relief features preserved');
 await api.setView({context:ctx(),direction:'iso',fit:true,selectedIds:[],gizmo:'off',grid:false,display:'solid',panels:{left:false,right:false}});
 await api.redraw({context:ctx()});
 const state=api.getState();check(state.display.status==='rendered'&&state.display.rendered.revision===state.context.revision,'final frame shows current four-body geometry');
 return {status:'passed',checks,elapsedMs:performance.now()-start,bodyId:id,volume:body.volume,report:body.reliefReport,display:state.display,summary:state.summary};
}
