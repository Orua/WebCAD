async (page) => {
  const context=await page.context().browser().newContext();page=await context.newPage();
  await page.goto('http://127.0.0.1:17670/');await page.waitForFunction(()=>window.webcad?.api.getState().summary?.kernelReady);
  const report=await page.evaluate(async()=>{
    const a=window.webcad.api,records=[],assert=(v,m)=>{if(!v)throw new Error(m);};
    const ctx=()=>{const{revision,...c}=a.getState().context;return{...c,expectedRevision:revision};};
    const card=op=>a.getTool({id:op});
    const command=(op,params,refs=[])=>({context:ctx(),idempotencyKey:crypto.randomUUID(),action:'feature.add',args:{op,opVersion:card(op).version,schemaHash:card(op).schemaHash,params,refs}});
    const accept=async req=>{const r=await a.execute(req);assert(r.status==='committed',JSON.stringify(r));return r;};
    const unchanged=async(name,fn,code)=>{const before=a.getState();let r;try{r=await fn();}catch(e){r={error:{code:e.code,message:e.message}};}assert(r.error,`${name} no error`);if(code)assert(r.error.code===code,`${name}: ${JSON.stringify(r)}`);const after=a.getState();assert(after.context.revision===before.context.revision&&JSON.stringify(after.features)===JSON.stringify(before.features)&&after.summary.dirty===before.summary.dirty,`${name} mutated model`);records.push({name,result:r});};
    const req=command('box',{width:20,depth:20,height:5}),first=await accept(req),A=first.createdBodyIds[0];
    const retry=await a.execute(req);assert(retry.transactionId===first.transactionId,'retry duplicated');records.push({name:'idempotent',first,retry});
    const B=(await accept(command('box',{width:30,depth:20,height:5}))).createdBodyIds[0];
    await a.setView({context:ctx(),selectedIds:[A]});
    await accept(command('hole',{radius:2,depth:7,x:10,y:10,z:6,axis:'Z',direction:-1},[B]));
    const s=a.getState();assert(Math.abs(s.bodies.find(b=>b.id===A).volume-2000)<.01,'UI-selected A was modified');assert(Math.abs(s.bodies.find(b=>b.id!==A).volume-(3000-20*Math.PI))<.01,'explicit B not cut');records.push({name:'explicit-B-over-UI-A',state:s});
    await unchanged('empty-selection',()=>a.execute(command('hole',{radius:2,depth:5},[])));
    await unchanged('negative-radius',()=>a.execute(command('hole',{radius:-2,depth:5},[A])));
    await unchanged('old-revision',()=>a.execute({...command('box',{width:2,depth:2,height:2}),context:{...ctx(),expectedRevision:1}}),'REVISION_CONFLICT');
    const token=await a.queryGeometry({context:ctx(),bodyId:A,kind:'face',filter:{surfaceType:'plane',normal:{direction:[0,0,1]},atExtreme:{axis:'Z',side:'max'}},requireUnique:true});assert(token.selectionToken,'token missing');
    const conflict=command('faceHole',{radius:1,through:true,point:[10,10,5],faceId:0},[A]);conflict.args.selectionToken=token.selectionToken;
    await unchanged('conflicting-selection',()=>a.execute(conflict),'SELECTION_CONFLICT');
    await accept(command('box',{width:3,depth:3,height:3}));const stale=command('faceHole',{radius:1,through:true,point:[10,10,5]},[A]);stale.args.selectionToken=token.selectionToken;
    await unchanged('old-token',()=>a.execute(stale),'STALE_REFERENCE');
    for(const name of ['../bad.step','C:\\secret.step','https://x/file.step'])await unchanged('invalid-file-name',()=>a.files.register({name,data:new Blob(['x'])}),'NAME_INVALID');
    await unchanged('oversized-file',()=>a.files.register({name:'large.step',data:new Blob([new Uint8Array(20*1024*1024+1)])}),'SIZE_LIMIT');
    const iges=await a.files.register({name:'part.igs',data:new Blob(['x'])});await unchanged('IGES-unavailable',()=>a.files.import({context:ctx(),resourceId:iges.resourceId}),'CAPABILITY_UNAVAILABLE');
    const artifact=await a.files.save({context:ctx()});await unchanged('fake-handle',()=>a.files.write({resourceId:artifact.resourceId,handle:{kind:'file'}}),'HANDLE_REQUIRED');
    await accept(command('box',{width:4,depth:4,height:4}));const dir=await navigator.storage.getDirectory(),handle=await dir.getFileHandle('race.webcad',{create:true});const written=await a.files.write({resourceId:artifact.resourceId,handle});assert(a.getState().summary.dirty,'old snapshot cleared new edits');records.push({name:'save-race',written,state:a.getState()});
    const current=await a.files.save({context:ctx()});await a.files.write({resourceId:current.resourceId,handle});assert(!a.getState().summary.dirty,'current saved');
    const bad=await a.files.register({name:'broken.webcad',data:new Blob(['{'])});await unchanged('corrupt-clean-project',()=>a.files.open({context:ctx(),resourceId:bad.resourceId}));
    const badStep=await a.files.register({name:'broken.step',data:new Blob(['not STEP'])});await unchanged('bad-step-rebuild',()=>a.files.import({context:ctx(),resourceId:badStep.resourceId}));
    const before=a.getState(),proto=WebGL2RenderingContext.prototype,original=proto.drawElements;
    try{
      proto.drawElements=function(){throw new Error('Injected test-only display failure');};
      const added=await accept(command('box',{width:5,depth:5,height:5}));
      const capture=await a.capture({context:ctx()});assert(capture.status==='failed','display failure should surface');assert(a.getState().context.revision===before.context.revision+1,'committed model lost on display failure');records.push({name:'display-failure-after-commit',added,capture});
    }finally{proto.drawElements=original;}
    const rev=ctx().expectedRevision,redraw=await a.redraw({context:ctx()}),capture=await a.capture({context:ctx()});assert(redraw.status==='read'&&capture.status==='read'&&ctx().expectedRevision===rev,'redraw recovery rebuilt/mutated');records.push({name:'redraw-recovery',redraw,display:capture.display});
    return records;
  });
  await context.close();return{records:report};
}
