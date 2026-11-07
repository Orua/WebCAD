import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {publicAssetAllowed,assertPublicModules,assertPublicOutputPaths} from '../scripts/edition-build.mjs';
import {knowledgeBundleNames} from '../scripts/generate-agent-knowledge.mjs';

function inEdition(edition,body){
  return execFileSync(process.execPath,['--input-type=module','-e',body],{cwd:process.cwd(),
    env:{...process.env,WEBCAD_EDITION:edition},stdio:'pipe',windowsHide:true});
}
test('public startup ignores poisoned private storage and deployment defaults',()=>{
  inEdition('public',`
    import assert from 'node:assert/strict';
    globalThis.localStorage=new Proxy({}, {get(){throw Error('private storage touched')}});
    globalThis.sessionStorage=globalThis.localStorage;
    globalThis.WEBCAD_DEPLOYMENT_CONFIG=new Proxy({}, {get(){throw Error('private deployment touched')}});
    const settings=await import('./src/services/settings.js');
    assert.equal(settings.getServicesConfig().configured,false);
    assert.equal(settings.getServicesConfig().allowGeometryUploads,false);
    assert.equal(settings.getServicesCredential(),'');
    assert.throws(()=>settings.saveServicesConfig({enabled:true,url:'/private'}),{code:'CAPABILITY_UNAVAILABLE'});
    assert.throws(()=>settings.clearServicesCredential(),{code:'CAPABILITY_UNAVAILABLE'});
    const host=await import('./src/editions/public-host.js');
    assert.equal(host.createAssistantPanel().get().visible,false);
    assert.equal(host.createHostControl().get().locked,false);
    assert.equal(host.createHostControl().set,undefined);
    assert.throws(()=>host.createAssistantPanel().enter(),{code:'CAPABILITY_UNAVAILABLE'});
  `);
});
test('integrated Services settings retain explicit configuration semantics',()=>{
  inEdition('integrated',`
    import assert from 'node:assert/strict';
    const values=new Map();
    globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
    globalThis.sessionStorage={getItem:()=>null,removeItem(){}};
    globalThis.location={href:'https://example.invalid/cad/',origin:'https://example.invalid',protocol:'https:'};
    const s=await import('./src/services/settings.js');
    s.saveServicesConfig({enabled:true,url:'/compute',authMode:'siteSession'});
    assert.equal(s.getServicesConfig().configured,true);
    assert.equal(s.getServicesConfig().url,'https://example.invalid/compute');
  `);
});
test('public and integrated contracts declare different identities and unavailable host tools',()=>{
  const hashes=[];
  for(const edition of ['public','integrated'])hashes.push(inEdition(edition,`
    import assert from 'node:assert/strict';
    const {infoMetadata,getTool}=await import('./src/page-api-docs.js');
    const meta=infoMetadata();assert.equal(meta.edition.edition,'${edition}');
    assert.equal(meta.edition.agentWorkspace,${edition==='integrated'});
    if('${edition}'==='public')assert.equal(getTool({id:'setAgentPanel'}).runtimeAvailability,'unavailable');
    assert.ok(meta.methods.includes('execute'));assert.ok(meta.filesMethods.includes('export'));
    console.log(JSON.stringify([meta.catalogHash,meta.docsHash]));
  `).toString().trim());
  const [publicHashes,integratedHashes]=hashes.map(row=>JSON.parse(row));
  assert.notEqual(publicHashes[0],integratedHashes[0]);assert.notEqual(publicHashes[1],integratedHashes[1]);
});
test('public Page API refuses host mutations while retaining local execution',()=>{
  inEdition('public',`
    import assert from 'node:assert/strict';
    const {createPageAPI}=await import('./src/page-api.js');
    const identity={sessionId:'s',documentId:'d',documentInstanceId:'i'};
    const context={...identity,expectedRevision:1};let calls=0;
    const api=createPageAPI({state:()=>({context:{...identity,revision:1},summary:{busy:false,kernelReady:true},preview:{},bodies:[]}),
      files:async()=>({}),confirmSaved:async()=>({saved:true}),execute:async()=>{calls++;return {status:'committed'};},display:()=>({}),view:async()=>{}});
    assert.equal(api.getAgentPanel().available,false);
    for(const [method,args] of [['configureAgentPanel',{url:'https://example.invalid/assistant'}],
      ['setAgentPanel',{visible:true}],['markLocation',{active:true}],['setView',{workspace:'agent'}]]){
      const result=await api[method]({context,...args});assert.equal(result.error.code,'CAPABILITY_UNAVAILABLE',method);
    }
    assert.equal((await api.execute({context,action:'feature.add',args:{op:'box',params:{}}})).status,'committed');
    assert.equal(calls,1);
  `);
});
test('public graph excludes host startup even if a future import reintroduces it',()=>{
  for(const path of ['src/agent/assistant-panel.js','src/agent/assistant-panel.css','src/agent/host-adapter.js',
    'src/editions/integrated-host.js','src/ai-bridge.js','src/host-control.js','src/transfer/chunked-upload.js']){
    assert.throws(()=>assertPublicModules(['C:/checkout/'+path]),/host startup/);
  }
  assert.doesNotThrow(()=>assertPublicModules(['src/page-api.js','src/editions/public-host.js','src/kernel-worker.js']));
});
test('public copy allowlist retains core assets while excluding host software and fixtures',()=>{
  for(const path of ['vector-dwg-worker.js','render-assets/studio-small-09.bin','automation/tools/box.json',
    'automation/agent-bundle.zip','automation/webcad-page-api/SKILL.md'])assert.equal(publicAssetAllowed(path),true,path);
  for(const path of ['examples/customer.webcad','trial-samples/example.step','automation/install-agent.ps1',
    'automation/remote-agent/host-adapter.js','automation/agent-kit.json','.env','config.json',
    'render-assets/../secret.jpg','render-assets/.private.jpg'])assert.equal(publicAssetAllowed(path),false,path);
});
test('public knowledge ZIP cannot carry the excluded host software as an indirect payload',()=>{
  const files=['index.json','agent-routing.json','routes.json'];
  const publicFiles=knowledgeBundleNames(files,true);
  for(const path of publicFiles)assert.equal(publicAssetAllowed('automation/'+path),true,path);
  assert.ok(publicFiles.includes('webcad-page-api/SKILL.md'));
  assert.ok(!publicFiles.some(path=>/remote-agent|agent-kit|\.mjs$|\.js$|\.ps1$/.test(path)));
  assert.ok(knowledgeBundleNames(files,false).includes('remote-agent/host-adapter.js'));
});

test('public preview copying uses the current catalog and excludes unreferenced old images',async()=>{
 const {QUICK_MODEL_PREVIEWS}=await import('../src/quick-models/preview-assets.js');
 const referenced=Object.values(QUICK_MODEL_PREVIEWS).flatMap(asset=>[asset.image,asset.guide]);
 assert.ok(referenced.length>0);
 for(const path of referenced)assert.equal(publicAssetAllowed(path),true,path);
 assert.equal(publicAssetAllowed('quick-model-previews/obsolete-000000000000.png'),false);
 assert.throws(()=>assertPublicOutputPaths(['quick-model-previews/obsolete-000000000000.png'],[]),/Unapproved or stale/);
});
test('public output rejects stale bundles and unapproved configuration',()=>{
  assert.doesNotThrow(()=>assertPublicOutputPaths(['index.html','assets/current.js','edition.json'],['assets/current.js']));
  for(const path of ['assets/old-integrated.js','config.json','automation/remote-agent/host-adapter.js'])
    assert.throws(()=>assertPublicOutputPaths([path],['assets/current.js']),/Unapproved or stale/);
});
