async (page) => {
  const context=await page.context().browser().newContext();page=await context.newPage();
  await page.goto('http://127.0.0.1:17670/');await page.waitForFunction(()=>window.webcad?.api.getState().summary?.kernelReady);
  const results=await page.evaluate(async()=>{
    const a=window.webcad.api,records=[],files=[],assert=(v,m)=>{if(!v)throw new Error(m);},near=(x,y)=>assert(Math.abs(x-y)<.01,`${x} != ${y}`);
    const ctx=()=>{const{revision,...c}=a.getState().context;return{...c,expectedRevision:revision};};
    const call=async(action,args)=>{const r=await a.execute({context:ctx(),idempotencyKey:crypto.randomUUID(),action,args});assert(r.status==='committed',JSON.stringify(r));return r;};
    const add=async(op,params,refs=[])=>{const c=a.getTool({id:op}),r=await call('feature.add',{op,opVersion:c.version,schemaHash:c.schemaHash,params,refs});return r.createdFeatureIds[0];};
    const mm=value=>({value,unit:'mm'});
    const template=kind=>({kind,...a.getTool({id:'quickModel'}).templates.find(t=>t.kind===kind).defaults});
    const measure=async()=>{const m=await a.measure({context:ctx(),bodyId:a.getState().bodies[0].id});assert(m.status==='read'&&m.solidCount===1,'real single-solid measurement');return m;};
    const bytesFile=async(resource,name)=>{const b=await a.files.read({resourceId:resource.resourceId,as:'bytes'});let raw='';for(const v of b)raw+=String.fromCharCode(v);files.push({name,base64:btoa(raw),sha256:resource.sha256});return b;};
    const dir=await navigator.storage.getDirectory(),handle=await dir.getFileHandle('products.webcad',{create:true});
    const save=async name=>{await a.setView({context:ctx(),direction:'iso',fit:true,section:{axis:'Z',position:0,enabled:false}});const cap=await a.capture({context:ctx()});files.push({name:name+'.png',base64:cap.dataUrl.split(',')[1]});const native=await a.files.save({context:ctx()});const bytes=await bytesFile(native,name+'.webcad');await a.files.write({resourceId:native.resourceId,handle});const step=await a.files.export({context:ctx(),format:'step'});await bytesFile(step,name+'.step');const input=await a.files.register({name:name+'.webcad',data:bytes});const before=await measure();await a.files.open({context:ctx(),resourceId:input.resourceId});near((await measure()).volume,before.volume);return a.getState();};
    const reset=async()=>{const s=await a.files.save({context:ctx()});await a.files.write({resourceId:s.resourceId,handle});await a.files.new({context:ctx()});};
    // Frame: one binding, inner dimensions remain clear, square/round section unchanged.
    const fp=template('rectBuckle'),frame=await add('quickModel',fp);
    await call('document.parameters',{parameters:{innerWidth:mm(fp.innerWidth)},bindings:{[frame]:{innerWidth:'innerWidth'}}});
    const f0=await measure();await save('frame-28');
    await call('document.parameters',{parameters:{innerWidth:mm(37)}});const f1=await measure();near((f1.bounds.max[0]-f1.bounds.min[0])-(f0.bounds.max[0]-f0.bounds.min[0]),9);near(f1.bounds.max[1]-f1.bounds.min[1],f0.bounds.max[1]-f0.bounds.min[1]);
    records.push({family:'frame',before:f0,after:f1,state:await save('frame-37')});await reset();
    // Irregular nameplate + real hole + solid raised L, all existing operations, no font service.
    const p=await add('extrude',{profile:'polygon',plane:'XY',height:3,points:[[0,0],[36,0],[42,9],[36,18],[0,18],[-4,9]]});
    const drilled=await add('hole',{radius:2,depth:6,x:3,y:9,z:5,axis:'Z',direction:-1},[p]);
    const letter=await add('extrude',{profile:'polygon',plane:'XY',height:.6,points:[[15,5],[17,5],[17,11],[22,11],[22,13],[15,13]]});
    const placed=await add('transform',{z:3},[letter]);await add('union',{},[drilled,placed]);
    await call('document.parameters',{parameters:{thickness:mm(3)},bindings:{[p]:{height:'thickness'},[placed]:{z:'thickness'}}});
    const n0=await measure();near(n0.volume,(738-4*Math.PI)*3+26*.6);await save('nameplate-3');
    await call('document.parameters',{parameters:{thickness:mm(4.2)}});const n1=await measure();near(n1.volume,(738-4*Math.PI)*4.2+26*.6);near(n1.bounds.max[2]-n1.bounds.min[2],4.8);records.push({family:'nameplate',before:n0,after:n1,state:await save('nameplate-4_2')});await reset();
    // Bushing: exact concentric surfaces and analytical volume; section is display clipping only.
    const bp=template('flangedBushing'),b=await add('quickModel',bp);await call('document.parameters',{parameters:{bodyDiameter:mm(bp.bodyDiameter)},bindings:{[b]:{bodyDiameter:'bodyDiameter'}}});
    const b0=await measure();near(b0.volume,Math.PI/4*((bp.flangeDiameter**2-bp.boreDiameter**2)*bp.flangeThickness+(bp.bodyDiameter**2-bp.boreDiameter**2)*bp.bodyHeight));await save('bushing-12');
    await call('document.parameters',{parameters:{bodyDiameter:mm(15)}});const b1=await measure();near(b1.volume-b0.volume,Math.PI/4*(15**2-12**2)*bp.bodyHeight);
    const circles=await a.queryGeometry({context:ctx(),bodyId:a.getState().bodies[0].id,kind:'edge',filter:{curveType:'circle'},requireUnique:false,limit:100});assert(circles.items.every(e=>Math.abs(e.center[0])<.01&&Math.abs(e.center[1])<.01),'bushing coaxial');
    await a.setView({context:ctx(),direction:'iso',section:{axis:'Y',position:0,enabled:true}});const section=await a.capture({context:ctx()});files.push({name:'bushing-section.png',base64:section.dataUrl.split(',')[1]});
    records.push({family:'bushing',before:b0,after:b1,circles,state:await save('bushing-15')});await reset();
    const tp=template('thinWallTray'),tray=await add('quickModel',tp);await call('document.parameters',{parameters:{outerWidth:mm(tp.outerWidth)},bindings:{[tray]:{outerWidth:'outerWidth'}}});
    const t0=await measure();await save('tray-60');await call('document.parameters',{parameters:{outerWidth:mm(73)}});const t1=await measure();near(t1.bounds.max[0]-t1.bounds.min[0],73);
    const expected=p=>p.outerWidth*p.outerDepth*p.height-(p.outerWidth-2*p.wallThickness)*(p.outerDepth-2*p.wallThickness)*(p.height-p.floorThickness)+2*Math.PI*(p.bossOuterDiameter/2)**2*p.bossHeight-2*Math.PI*(p.boreDiameter/2)**2*(p.floorThickness+p.bossHeight);
    near(t0.volume,expected(tp));near(t1.volume,expected({...tp,outerWidth:73}));
    const holes=await a.queryGeometry({context:ctx(),bodyId:a.getState().bodies[0].id,kind:'edge',filter:{curveType:'circle',radiusRangeMm:{min:1.49,max:1.51}},requireUnique:false,limit:100});assert(holes.matchCount===4,'two boss bore rims');
    records.push({family:'thinWallTray',before:t0,after:t1,holes,state:await save('tray-73')});
    return{records,files};
  });
  await context.close();return results;
}
