async (page) => {
  const plate=await page.evaluate(()=>window.webcad.getState());
  if(plate.document.features.length!==2 || Math.abs(plate.bodies[0].volume-(4500-48*Math.PI))>.01)throw new Error('Saved native project did not reopen');
  const savedIdentity=await page.evaluate(()=>window.__m1SavedIdentity);
  if(savedIdentity&&plate.document.documentId!==savedIdentity)throw new Error('Native reopen identity mismatch');
  const regressions=await page.evaluate(async()=>{
    const w=window.webcad,check=(ok,message)=>{if(!ok)throw new Error(message);};
    const fixture={version:1,name:'M1 isolated UI regressions',features:[{id:'box',op:'box',name:'Box',params:{width:20,depth:20,height:10},refs:[]}],imports:{},hidden:[]};
    const reload=()=>w.loadDocument(structuredClone(fixture));
    await reload();let s=w.getState();
    w.pick({id:'box',type:'edge',topologyId:7});
    await w.execute('add_feature',{op:'fillet',params:{radius:.5,edgeIds:[2]},refs:['box']},{expectedRevision:s.revision});
    check(w.getState().document.features.at(-1).params.edgeIds.join(',')==='2','Explicit edge overwritten');
    await reload();s=w.getState();w.pick({id:'box',type:'face',topologyId:0});
    await w.execute('add_feature',{op:'shell',params:{thickness:1,faceIds:[5]},refs:['box']},{expectedRevision:s.revision});
    check(w.getState().document.features.at(-1).params.faceIds.join(',')==='5','Explicit shell face overwritten');
    await reload();w.pick({id:'box',type:'edge',topologyId:2});
    await w.action('fillet',{radius:.5});check(w.getState().document.features.at(-1).params.edgeIds[0]===2,'UI selection adapter lost');
    await reload();s=w.getState();await w.action('preview',{op:'box',params:{width:1,depth:1,height:1}});
    let blocked=false;try{await w.execute('inspect_geometry',{bodyId:'box',kind:'face',topologyId:0});}catch{blocked=true;}
    check(blocked,'Preview leaked candidate snapshot');await w.action('cancelPreview');check(w.getState().revision===s.revision,'Preview changed revision');
    // Inject a rendering failure after the memory commit; geometry must stay committed.
    const saved=w.viewport.setBodies;w.viewport.setBodies=()=>{throw new Error('M1 deliberate display failure');};
    let result;try{result=await w.execute('add_feature',{op:'box',params:{width:2,depth:3,height:4},refs:[]},{expectedRevision:s.revision});}finally{w.viewport.setBodies=saved;}
    check(result.revision===s.revision+1&&result.features.length===2,'Display failure lost committed result');
    await w.execute('refresh',{}, {expectedRevision:result.revision});
    return {explicitEdge:true,explicitShellFace:true,uiSelectionFallback:true,previewIsolation:true,displayFailureCommit:true,legacyDocumentIdentity:!!w.getState().document.documentId};
  });
  const recoveries=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('webcad-local',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    return new Promise((resolve,reject)=>{const tx=db.transaction('documents');const store=tx.objectStore('documents'),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>resolve(keys.result.map((key,i)=>({key,documentId:values.result[i].document?.documentId,instanceId:values.result[i].instanceId,featureCount:values.result[i].document?.features?.length})));tx.onerror=()=>reject(tx.error);});
  });
  if(new Set(recoveries.filter(x=>x.instanceId).map(x=>x.instanceId)).size<2)throw new Error('Tab recovery isolation missing');
  const evidence={status:'pass',uiVolume:plate.bodies[0].volume,documentId:plate.document.documentId,nativeReopen:true,regressions,recoveries};
  await page.evaluate(value=>{window.__m1BrowserEvidence=value;},evidence);
  return evidence;
}
