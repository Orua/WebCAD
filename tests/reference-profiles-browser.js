async (page) => {
  const fixtures = /*FIXTURE_DATA*/[];
  const testContext = await page.context().browser().newContext();
  try {
    page = await testContext.newPage();
    await page.goto('http://localhost:1443/webcad-trial/');
    await page.waitForFunction(() => window.webcad?.api.getState().summary.kernelReady);
    return await page.evaluate(async fixtures => {
      const api = window.webcad.api, records = [];
      const context = () => { const {revision,...rest}=api.getState().context; return {...rest,expectedRevision:revision}; };
      const call = async (action,args) => {
        const result=await api.execute({context:context(),idempotencyKey:crypto.randomUUID(),action,args});
        if(result.status!=='committed')throw new Error(JSON.stringify(result));return result;
      };
      const add = async (op,params,refs=[]) => {
        const card=api.getTool({id:op});
        const result=await call('feature.add',{op,opVersion:card.version,schemaHash:card.schemaHash,params,refs});
        return result.createdFeatureIds[0];
      };
      const encoded = bytes => {let binary='';for(const n of bytes)binary+=String.fromCharCode(n);return btoa(binary);};
      const save = async name => {
        const file=await api.files.save({context:context(),name:name+'.webcad'});
        const dir=await navigator.storage.getDirectory(),handle=await dir.getFileHandle(name+'.webcad',{create:true});
        const receipt=await api.files.write({resourceId:file.resourceId,handle});
        const bytes=await api.files.read({resourceId:file.resourceId,as:'bytes'});
        api.files.release({resourceId:file.resourceId});
        return {name:name+'.webcad',sha256:file.sha256,base64:encoded(bytes),receipt};
      };
      const exportStep = async (name,id) => {
        const file=await api.files.export({context:context(),format:'step',ids:[id],name:name+'.step'});
        const bytes=await api.files.read({resourceId:file.resourceId,as:'bytes'});
        api.files.release({resourceId:file.resourceId});
        return {name:name+'.step',sha256:file.sha256,base64:encoded(bytes)};
      };
      const register = async fixture => {
        const bytes=Uint8Array.from(atob(fixture.base64),c=>c.charCodeAt(0));
        const asset=await api.files.register({name:fixture.name+'.brep',data:bytes});
        await api.files.import({context:context(),resourceId:asset.resourceId});
        api.files.release({resourceId:asset.resourceId});
        return api.getState().bodies.at(-1).id;
      };
      for(const fixture of fixtures){
        await api.files.new({context:context()});
        const source=await register(fixture),recovered=await add('sewFaces',{tolerance:.01,makeSolid:true},[source]);
        const measure=await api.measure({context:context(),bodyId:recovered});
        if(measure.solidCount!==1||!(measure.volume>0))throw new Error('Recovery not a positive solid');
        await api.setView({context:context(),direction:'iso',fit:true,selectedIds:[recovered]});
        const capture=await api.capture({context:context()});
        const native=await save(fixture.name+'-recovered');
        const reopened=await api.files.register({name:native.name,data:Uint8Array.from(atob(native.base64),c=>c.charCodeAt(0))});
        const oldInstance=api.getState().context.documentInstanceId;
        await api.files.open({context:context(),resourceId:reopened.resourceId});api.files.release({resourceId:reopened.resourceId});
        if(api.getState().context.documentInstanceId===oldInstance)throw new Error('Open did not create instance');
        const after=await api.measure({context:context(),bodyId:recovered});
        if(Math.abs(after.volume-measure.volume)>1e-6)throw new Error('Reopen changed geometry');
        records.push({name:fixture.name,qualification:'source-backed full solid recovery, not independent parametric reconstruction',measure,after,native,step:await exportStep(fixture.name+'-recovered',recovered),capture});
      }
      await api.files.new({context:context()});
      const fixture=fixtures.at(-1),source=await register(fixture);
      const query=await api.queryGeometry({context:context(),bodyId:source,kind:'face',filter:{},requireUnique:false,limit:100});
      const baseCandidates=query.items.filter(face=>Math.abs(face.center[2])<1e-6&&face.areaMm2>27&&face.areaMm2<28);
      if(baseCandidates.length!==1)throw new Error('Source base face not unique');
      const box=await add('box',{width:30,depth:30,height:30});
      const tool=await add('transform',{x:-15,y:-15,z:-15},[box]);
      const face=await add('surfaceTrim',{faceId:baseCandidates[0].faceId,mode:'intersect'},[source,tool]);
      const extruded=await add('referenceExtrude',{direction:[0,0,1],distance:.2},[face]);
      const measured=await api.measure({context:context(),bodyId:extruded});
      if(Math.abs(measured.volume-baseCandidates[0].areaMm2*.2)>.00001)throw new Error('Exact base extrusion volume mismatch');
      const outer=await add('faceBoundary',{faceId:0,boundary:'outer'},[face]);
      const outerSolid=await add('referenceExtrude',{direction:[0,0,1],distance:1},[outer]);
      const outerArea=(await api.measure({context:context(),bodyId:outerSolid})).volume;
      const upper=await add('copy',{x:0,y:0,z:2,scale:.7},[outer]);
      const loft=await add('referenceLoft',{ruled:true},[outer,upper]);
      const loftMeasure=await api.measure({context:context(),bodyId:loft});
      const expectedLoft=outerArea*2*(1+.7+.49)/3;
      if(Math.abs(loftMeasure.volume-expectedLoft)>.001)throw new Error(`Loft volume mismatch: ${loftMeasure.volume} vs ${expectedLoft}`);
      const before=api.getState(),card=api.getTool({id:'referenceExtrude'});
      const rejected=await api.execute({context:context(),idempotencyKey:crypto.randomUUID(),action:'feature.add',args:{op:'referenceExtrude',opVersion:card.version,schemaHash:card.schemaHash,params:{direction:[0,0,1],distance:0},refs:[outer]}});
      if(rejected.status!=='failed'||api.getState().context.revision!==before.context.revision)throw new Error('Failure was not atomic');
      const baseStep=await exportStep('source-star-flat-base',extruded);
      await call('feature.remove',{bodyIds:[source,tool,face,extruded,outer,outerSolid,upper]});
      await api.setView({context:context(),direction:'iso',fit:true,selectedIds:[loft]});
      const native=await save('source-star-reference-loft');
      const nativeAsset=await api.files.register({name:native.name,data:Uint8Array.from(atob(native.base64),c=>c.charCodeAt(0))});
      const loftInstance=api.getState().context.documentInstanceId;
      await api.files.open({context:context(),resourceId:nativeAsset.resourceId});api.files.release({resourceId:nativeAsset.resourceId});
      const loftReopened=await api.measure({context:context(),bodyId:loft});
      if(api.getState().context.documentInstanceId===loftInstance||Math.abs(loftReopened.volume-loftMeasure.volume)>1e-6)throw new Error('Loft native history did not reopen correctly');
      const capture=await api.capture({context:context()});
      return {info:api.info(),records,referenceTools:{qualification:'Exact source outer profile reused in a NEW demonstration frustum; not original star reconstruction',baseFace:baseCandidates[0],extruded:measured,baseStep,loft:loftMeasure,loftReopened,expectedLoft,rejected,native,step:await exportStep('source-star-reference-loft',loft),capture},discovery:api.readDocs({docId:'recipes.reference-reconstruction'})};
    },fixtures);
  } finally { await testContext.close(); }
}
