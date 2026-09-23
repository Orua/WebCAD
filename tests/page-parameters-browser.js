async(page)=>{
  const testContext=await page.context().browser().newContext();page=await testContext.newPage();
  await page.goto('http://127.0.0.1:17670/');await page.waitForFunction(()=>window.webcad?.api.getState().summary?.kernelReady);
  const setup=await page.evaluate(async()=>{
    const a=window.webcad.api,ctx=()=>{const{revision,...c}=a.getState().context;return{...c,expectedRevision:revision};};
    const call=async(action,args)=>{const r=await a.execute({context:ctx(),idempotencyKey:crypto.randomUUID(),action,args});if(r.status!=='committed')throw new Error(JSON.stringify(r));return r;};
    const add=async(op,params,refs=[])=>{const c=a.getTool({id:op});return call('feature.add',{op,opVersion:c.version,schemaHash:c.schemaHash,params,refs});};
    const b=await add('box',{width:50,depth:30,height:3}),plate=b.createdFeatureIds[0];
    const h=await add('multiHole',{radius:2,depth:5,axis:'Z',direction:-1,points:[[5,5,4],[45,5,4],[5,25,4],[45,25,4]]},[plate]),hole=h.createdFeatureIds[0];
    const mm=value=>({value,unit:'mm'});
    const bind=await call('document.parameters',{parameters:{length:mm(50),width:mm(30),thickness:mm(3),holeRadius:mm(2),edgeMargin:mm(5)},bindings:{[plate]:{width:'length',depth:'width',height:'thickness'},[hole]:{radius:'holeRadius','points.0.0':'edgeMargin','points.0.1':'edgeMargin','points.1.0':'length-edgeMargin','points.1.1':'edgeMargin','points.2.0':'edgeMargin','points.2.1':'width-edgeMargin','points.3.0':'length-edgeMargin','points.3.1':'width-edgeMargin'}}});
    return{bind,state:a.getState()};
  });
  // UI-only parameter change: no second feature edit, no AI call, no internal state access.
  await page.getByRole('button',{name:'参数表',exact:true}).click();
  await page.locator('[data-parameter-form] input[name="length"]').fill('63');
  await page.getByRole('dialog').getByRole('button',{name:'应用参数',exact:true}).click();
  await page.waitForFunction(()=>window.webcad.api.getState().parameterValues.length?.value===63&&!window.webcad.api.getState().summary.busy);
  const first=await page.evaluate(async()=>{
    const a=window.webcad.api,c=()=>{const{revision,...x}=a.getState().context;return{...x,expectedRevision:revision};};
    const s=a.getState();if(s.features[1].params.points[1][0]!==58)throw new Error('Not linked to X58');
    const m=await a.measure({context:c(),bodyId:s.bodies[0].id});if(Math.abs(m.volume-(63*90-48*Math.PI))>.01)throw new Error('Wrong linked solid');
    const artifact=await a.files.save({context:c()}),bytes=await a.files.read({resourceId:artifact.resourceId,as:'bytes'});
    const dir=await navigator.storage.getDirectory(),handle=await dir.getFileHandle('linked.webcad',{create:true});await a.files.write({resourceId:artifact.resourceId,handle});
    const source=await a.files.register({name:'linked.webcad',data:bytes});await a.files.open({context:c(),resourceId:source.resourceId});
    const png=await a.capture({context:c()});let raw='';for(const b of bytes)raw+=String.fromCharCode(b);
    return{state:s,measure:m,reopened:a.getState(),file:{name:'linked-63.webcad',base64:btoa(raw),sha256:artifact.sha256},png:png.dataUrl};
  });
  await page.getByRole('button',{name:'参数表',exact:true}).click();await page.locator('[data-parameter-form] input[name="length"]').fill('58');await page.getByRole('dialog').getByRole('button',{name:'应用参数',exact:true}).click();
  await page.waitForFunction(()=>window.webcad.api.getState().parameterValues.length?.value===58&&!window.webcad.api.getState().summary.busy);
  const final=await page.evaluate(async()=>{
    const a=window.webcad.api,c=()=>{const{revision,...x}=a.getState().context;return{...x,expectedRevision:revision};};const state=a.getState();if(state.features[1].params.points[1][0]!==53)throw new Error('Reload lost binding');
    const before=JSON.stringify(state.features),r=state.context.revision,bad=[];
    for(const parameters of [{length:{value:'width',unit:'mm'},width:{value:'length',unit:'mm'}},{length:{value:'missing',unit:'mm'}},{length:{value:-6,unit:'mm'}}]){
      const result=await a.execute({context:c(),idempotencyKey:crypto.randomUUID(),action:'document.parameters',args:{parameters}});if(result.status!=='failed')throw new Error('Bad dependency accepted');if(a.getState().context.revision!==r||JSON.stringify(a.getState().features)!==before)throw new Error('Failure lost good model');bad.push(result);
    }
    const undo=await a.execute({context:c(),idempotencyKey:crypto.randomUUID(),action:'history.undo',args:{}});if(a.getState().features[1].params.points[1][0]!==58)throw new Error('Parameter update not one undo');
    const redo=await a.execute({context:c(),idempotencyKey:crypto.randomUUID(),action:'history.redo',args:{}});
    const artifact=await a.files.save({context:c()}),bytes=await a.files.read({resourceId:artifact.resourceId,as:'bytes'});let raw='';for(const b of bytes)raw+=String.fromCharCode(b);
    return{state:a.getState(),measure:await a.measure({context:c(),bodyId:a.getState().bodies[0].id}),bad,undo,redo,file:{name:'linked-58.webcad',base64:btoa(raw),sha256:artifact.sha256},capture:await a.capture({context:c()})};
  });
  await testContext.close();return{setup,first,final};
}
