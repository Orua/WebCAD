async (page) => {
  const testContext=await page.context().browser().newContext();page=await testContext.newPage();
  const network=[],sockets=[];
  page.on('request',r=>network.push({method:r.method(),url:r.url()}));page.on('websocket',s=>sockets.push(s.url()));
  await page.goto('http://127.0.0.1:17670/');
  await page.waitForFunction(()=>window.webcad?.api.getState().summary?.kernelReady);
  const result=await page.evaluate(async()=>{
    const api=window.webcad.api,records=[],files=[];
    const assert=(v,m)=>{if(!v)throw new Error(m);};
    const ctx=()=>{const {revision,...c}=api.getState().context;return {...c,expectedRevision:revision};};
    const record=(name,result)=>{records.push({name,result});return result;};
    const call=async(action,args)=>{const r=await api.execute({context:ctx(),idempotencyKey:crypto.randomUUID(),action,args});assert(r.status==='committed',JSON.stringify(r));return record(action,r);};
    const add=async(op,params,refs=[])=>{const c=api.getTool({id:op});return call('feature.add',{op,opVersion:c.version,schemaHash:c.schemaHash,params,refs});};
    const edit=async(featureId,op,params)=>{const c=api.getTool({id:op});return call('feature.edit',{featureId,opVersion:c.version,schemaHash:c.schemaHash,params});};
    const saveFile=async(a,name)=>{const bytes=await api.files.read({resourceId:a.resourceId,as:'bytes'});let raw='';for(const b of bytes)raw+=String.fromCharCode(b);files.push({name,base64:btoa(raw),size:bytes.length,sha256:a.sha256});return bytes;};
    const measure=async(length)=>{const bodyId=api.getState().bodies.at(-1).id;const m=await api.measure({context:ctx(),bodyId});assert(m.status==='read',JSON.stringify(m));assert(m.solidCount===1,'single solid');assert(Math.abs(m.volume-(length*90-48*Math.PI))<.01,'volume');assert(m.bounds.max[0]-m.bounds.min[0]===length,'length');record('measure',m);return m;};
    record('info',api.info());assert(!('viewport' in window.webcad),'no mutable internals');
    const b=await add('box',{width:50,depth:30,height:3});
    const plate=b.createdFeatureIds[0];
    const h=await add('multiHole',{radius:2,depth:5,axis:'Z',direction:-1,points:[[5,5,4],[45,5,4],[5,25,4],[45,25,4]]},[plate]);
    const holes=h.createdFeatureIds[0];await measure(50);
    const query=record('hole-circles',await api.queryGeometry({context:ctx(),bodyId:holes,kind:'edge',filter:{curveType:'circle',radiusRangeMm:{min:1.99,max:2.01}},requireUnique:false,limit:100}));
    assert(query.matchCount===8,'four through holes have eight circular rims');
    const centers=new Set(query.items.map(i=>i.center.slice(0,2).map(n=>n.toFixed(4)).join(',')));assert(centers.size===4,'four logical centers');
    for(const direction of ['top','side','iso']){const before=ctx();record('view-'+direction,await api.setView({context:before,direction,projection:'orthographic',fit:true}));const c=await api.capture({context:ctx()});assert(c.display.rendered.revision===ctx().expectedRevision,'matching frame');files.push({name:direction+'.png',base64:c.dataUrl.split(',')[1]});assert(before.expectedRevision===ctx().expectedRevision,'camera must not revise model');}
    await edit(plate,'box',{width:63});await edit(holes,'multiHole',{points:[[5,5,4],[58,5,4],[5,25,4],[58,25,4]]});await measure(63);
    const oldContext=ctx();
    const a=await api.files.save({context:ctx()});await saveFile(a,'plate-63.webcad');assert(api.getState().summary.dirty,'generation cannot mark saved');
    const dir=await navigator.storage.getDirectory(),handle=await dir.getFileHandle('plate.webcad',{create:true});
    record('browser-handle-write',await api.files.write({resourceId:a.resourceId,handle}));assert(!api.getState().summary.dirty,'verified write should clear dirty');
    const reopen=await api.files.register({name:'plate.webcad',data:await api.files.read({resourceId:a.resourceId})});record('reopen',await api.files.open({context:ctx(),resourceId:reopen.resourceId}));
    assert(api.getState().context.documentId===oldContext.documentId,'ordinary native identity');assert(api.getState().context.documentInstanceId!==oldContext.documentInstanceId,'reopen instance');
    const c=api.getTool({id:'box'});
    const stale=await api.execute({context:oldContext,idempotencyKey:crypto.randomUUID(),action:'feature.edit',args:{featureId:plate,opVersion:c.version,schemaHash:c.schemaHash,params:{width:64}}});assert(stale.status==='failed','old instance rejected');record('old-instance',stale);
    await edit(holes,'multiHole',{points:[[5,5,4],[41,5,4],[5,25,4],[41,25,4]]});await edit(plate,'box',{width:46});await measure(46);
    const final=await api.files.save({context:ctx()});await saveFile(final,'plate-46.webcad');
    const step=await api.files.export({context:ctx(),format:'step'});await saveFile(step,'plate-46.step');
    const brep=await api.files.export({context:ctx(),format:'brep'});await saveFile(brep,'plate-46.brep');
    const stl=await api.files.export({context:ctx(),format:'stl'});await saveFile(stl,'plate-46.stl');
    const png=await api.capture({context:ctx()});files.push({name:'plate-46.png',base64:png.dataUrl.split(',')[1]});
    const before=api.getState();
    let rejected;try{await api.files.new({context:ctx()});}catch(e){rejected=e.code;}assert(rejected==='UNSAVED_REPLACEMENT','unsaved replacement');
    const bad=await api.files.register({name:'broken.webcad',data:new Blob(['{bad'])});try{await api.files.open({context:ctx(),resourceId:bad.resourceId});}catch(e){record('bad-file',{code:e.code});}assert(api.getState().context.revision===before.context.revision,'bad file unchanged');
    await api.files.write({resourceId:final.resourceId,handle});
    await api.files.new({context:ctx()});
    const inputStep=await api.files.register({name:'plate.step',data:await api.files.read({resourceId:step.resourceId})});record('step-import',await api.files.import({context:ctx(),resourceId:inputStep.resourceId}));await measure(46);
    // Re-open one imported source in a clean context later, then edit this explicit feature.
    const imported=api.getState().bodies[0].id;
    await add('hole',{radius:1,depth:5,x:20,y:15,z:4,axis:'Z',direction:-1},[imported]);
    const portable=await api.files.save({context:ctx()});await saveFile(portable,'portable-import.webcad');
    return {records,files,finalState:api.getState(),portableName:'portable-import.webcad'};
  });
  const clean=await page.context().browser().newContext();
  const p=await clean.newPage();await p.goto('http://127.0.0.1:17670/sub/');await p.waitForFunction(()=>window.webcad?.api.getState().summary?.kernelReady);
  const portable=result.files.find(f=>f.name===result.portableName);
  result.clean=await p.evaluate(async data=>{
    const a=window.webcad.api,c=()=>{const{revision,...x}=a.getState().context;return{...x,expectedRevision:revision};};
    const bytes=Uint8Array.from(atob(data.base64),v=>v.charCodeAt(0));const r=await a.files.register({name:data.name,data:bytes});await a.files.open({context:c(),resourceId:r.resourceId});
    const before=a.getState(),feature=before.features.at(-1),card=a.getTool({id:'hole'});
    const edit=await a.execute({context:c(),idempotencyKey:crypto.randomUUID(),action:'feature.edit',args:{featureId:feature.id,opVersion:card.version,schemaHash:card.schemaHash,params:{radius:1.2}}});
    if(edit.status!=='committed')throw new Error(JSON.stringify(edit));
    return{info:a.info(),before,after:a.getState(),edit,measure:await a.measure({context:c(),bodyId:a.getState().bodies[0].id})};
  },portable);
  await clean.close();
  result.network=network;result.sockets=sockets;
  if(sockets.length||network.some(r=>r.method!=='GET'||/\/mcp|\/ai-bridge|\/api\//.test(r.url)))throw new Error('Unexpected application network');
  await testContext.close();return result;
}
