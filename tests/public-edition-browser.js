// Playwright CLI run-code function. Uses a fresh context and the existing localhost
// origin. Candidate bytes are intercepted only in this test context; no HTTP server,
// user tab, IIS mapping or deployed files are changed. This is not deployment acceptance.
async (page) => {
  const {readFile}=await import('node:fs/promises');
  const {resolve,sep}=await import('node:path');
  const candidate=process.env.WEBCAD_PUBLIC_CANDIDATE;
  if(!candidate)throw Error('BLOCKED: WEBCAD_PUBLIC_CANDIDATE must name the reviewed public build');
  const directory=resolve(candidate),edition=JSON.parse(await readFile(resolve(directory,'edition.json'),'utf8'));
  if(edition.edition!=='public'||edition.agentWorkspace||edition.hostChannels)throw Error('Expected isolated public candidate');
  const browser=page.context().browser(),contexts=[],requests=[],errors=[];
  async function newPage(stale=false){
    const context=await browser.newContext();contexts.push(context);
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      requests.push({host:url.host,path:url.pathname});
      if(url.origin!=='http://localhost'||!url.pathname.startsWith('/webcad/'))return route.abort();
      const relative=decodeURIComponent(url.pathname.slice('/webcad/'.length))||'index.html';
      const file=resolve(directory,relative);
      if(!file.startsWith(directory+sep))return route.abort();
      try{
        const bytes=await readFile(file),ext=file.split('.').at(-1);
        const mime={html:'text/html',js:'text/javascript',mjs:'text/javascript',css:'text/css',wasm:'application/wasm',json:'application/json',png:'image/png',jpg:'image/jpeg',svg:'image/svg+xml'}[ext]||'application/octet-stream';
        return route.fulfill({status:200,contentType:mime,body:bytes});
      }catch{return route.fulfill({status:404,body:'Not in reviewed candidate'});}
    });
    if(stale)await context.addInitScript(()=>{
      localStorage.setItem('webcad.assistant-url.v1','http://localhost/private-assistant');
      localStorage.setItem('webcad.services.v1',JSON.stringify({enabled:true,url:'http://localhost/private-compute',authMode:'siteSession'}));
    });
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto('http://localhost/webcad/?agent=1&t02-test=1');
    await p.waitForFunction(()=>window.webcad?.api.getState().summary.kernelReady,{},{timeout:60000});
    return p;
  }
  try{
    page=await newPage();
    const result=await page.evaluate(async()=>{
      const api=window.webcad.api,check=(ok,msg)=>{if(!ok)throw Error(msg);};
      const context=()=>{const {revision,...identity}=api.getState().context;return {...identity,expectedRevision:revision};};
      check(api.info().edition.edition==='public','public identity');
      check(!window.webcad.agent&&!window.webcad.assistantPanel&&!window.webcad.hostControl,'no host exports');
      check(!document.querySelector('.agent-mode-button,iframe'),'no assistant UI');
      check(api.getState().bodies.length===0,'test page must be empty');
      async function command(action,args={}){
        const receipt=await api.execute({context:context(),idempotencyKey:crypto.randomUUID(),action,args});
        check(receipt.status==='committed',JSON.stringify(receipt));return receipt;
      }
      async function add(op,params,refs=[],placement){const card=api.getTool({id:op});return command('feature.add',{op,params,refs,...(placement?{placement}:{}),opVersion:card.version,schemaHash:card.schemaHash});}
      // This oracle uses a box at [0,0,0]..[width,depth,height]. The product's
      // omitted box placement instead uses bottom-center at the current work frame.
      // Make both inputs explicitly world-based; do not change the geometric oracle.
      const worldOrigin={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
      const box=await add('box',{width:20,depth:10,height:4},[],worldOrigin);
      const boxId=box.createdFeatureIds[0];
      await add('hole',{radius:1,depth:6,x:10,y:5,z:5,axis:'Z',direction:-1},[boxId],worldOrigin);
      const card=api.getTool({id:'box'});
      await command('feature.edit',{featureId:boxId,opVersion:card.version,schemaHash:card.schemaHash,params:{width:22}});
      await command('history.undo');await command('history.redo');
      const body=api.getState().bodies[0].id,measurement=await api.measure({context:context(),bodyId:body});
      check(measurement.status==='read'&&measurement.solidCount===1,'valid final solid');
      const expected=22*10*4-Math.PI*4;
      const placementEvidence=api.getState().features.map(feature=>({id:feature.id,op:feature.op,params:feature.params,placement:feature.placement??null}));
      check(Math.abs(measurement.volume-expected)<0.01,'independent box-minus-hole volume: '+JSON.stringify({actual:measurement.volume,expected,tolerance:0.01,bounds:measurement.bounds,features:placementEvidence}));
      const saved=await api.files.save({context:context()}),project=await api.files.read({resourceId:saved.resourceId,as:'bytes'});
      const exported=await api.files.export({context:context(),format:'step'}),step=await api.files.read({resourceId:exported.resourceId,as:'bytes'});
      check(new TextDecoder().decode(new Uint8Array(step).slice(0,100)).includes('ISO-10303-21'),'STEP header');
      return {project:Array.from(project),step:Array.from(step),volume:measurement.volume,bodyCount:api.getState().bodies.length};
    });
    await page.close();page=await newPage(true);
    const reopened=await page.evaluate(async input=>{
      const api=window.webcad.api,ctx=()=>{const {revision,...identity}=api.getState().context;return {...identity,expectedRevision:revision};};
      if(window.webcad.agent||window.webcad.assistantPanel||document.querySelector('iframe,.agent-mode-button'))throw Error('Old configuration restored assistant');
      const registered=await api.files.register({name:'public-test.webcad',data:new Uint8Array(input.project)});
      const opened=await api.files.open({context:ctx(),resourceId:registered.resourceId,unsaved:'discard'});
      if(opened.status==='failed')throw Error(JSON.stringify(opened));
      let measurement=await api.measure({context:ctx(),bodyId:api.getState().bodies[0].id});
      if(Math.abs(measurement.volume-input.volume)>0.01||api.getState().bodies.length!==input.bodyCount)throw Error('Saved final geometry changed');
      const reset=await api.files.new({context:ctx()});
      if(reset.status==='failed'||reset.status==='unknown'||api.getState().bodies.length!==0)throw Error('File reset failed: '+JSON.stringify(reset));
      const step=await api.files.register({name:'public-test.step',data:new Uint8Array(input.step)});
      const imported=await api.files.import({context:ctx(),resourceId:step.resourceId});
      if(imported.status==='failed')throw Error(JSON.stringify(imported));
      measurement=await api.measure({context:ctx(),bodyId:api.getState().bodies[0].id});
      if(Math.abs(measurement.volume-input.volume)>0.01)throw Error('STEP roundtrip volume changed');
      return {volume:measurement.volume,solidCount:measurement.solidCount};
    },result);
    const forbidden=requests.filter(r=>r.host!=='localhost'||/private-|cadservices|\/api\/|assistant/i.test(r.path));
    if(forbidden.length||errors.length)throw Error(JSON.stringify({forbidden,errors}));
    return {scope:'real-browser candidate interception; not deployed-site acceptance',buildId:edition.buildId,
      status:'PASS',geometry:reopened,projectBytes:result.project.length,stepBytes:result.step.length,
      privateNetworkRequests:0,pageErrors:0,unrun:['integrated login','protected endpoint negative tests','anonymous service isolation','second browser engine','website deployment and rollback','appearance and position persistence']};
  }finally{for(const context of contexts)await context.close();}
}
