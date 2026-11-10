import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

// Exercise the actual entry-point install transaction without a browser or kernel.
// Fixtures are controlled render receipts, not performance/geometry evidence.
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const helper=source.match(/async function changeDisplayQuality\([\s\S]+?\n\}/)?.[0];
assert.ok(helper);
function harness({frameError=false,stale=false,remeshError}={}){
  const old=[{id:'part',indices:[0,1,2]}],installed=[],selected=[],preferences=[];
  let remeshCalls=0;
  const env={busy:false,kernelReady:true,pending:new Map(),previewNext:null,previewComputing:false,ui:{hasActiveTask:()=>false},
    documentInstanceId:'doc',revision:3,bodies:old,qualityKey:'standard',selectedIds:['part'],selectedTopology:{type:'face',ids:[0]},clone:structuredClone,
    documentModel:{documentId:'d',hidden:[],features:[{id:'part',name:'part'}]},flushDisplayBatch(){},setBusy:value=>{env.busy=value;},
    request:async type=>{assert.equal(type,'remesh');remeshCalls++;if(stale)env.revision++;if(remeshError)throw remeshError;return {bodies:[{id:'part',indices:[0,1,2,0,2,3]}]};},
    viewport:{setBodies:b=>installed.push(b),setSelection:(ids,topology)=>selected.push({ids,topology}),resetPerformanceSamples(){},markModel(){},frame:async()=>{if(frameError)throw Error('DISPLAY_FAILED');}},
    applyAppearance(){},performanceRuntime:{setEffectiveQuality:(quality,options)=>preferences.push({quality,...options})},setStatus(){},RENDER_QUALITIES:{fine:{label:'fine'}},qualityState:()=>({triangleCount:2})};
  const context=createContext(env);runInContext(helper,context);
  return {env,old,installed,selected,preferences,remeshCalls:()=>remeshCalls,change:runInContext('changeDisplayQuality',context)};
}
test('actual display install preserves selection, revision and source reference and updates preferred only after success',async()=>{
  const h=harness();await h.change('fine');assert.equal(h.env.revision,3);assert.equal(h.env.qualityKey,'fine');assert.equal(h.env.busy,false);
  assert.deepEqual(h.env.selectedIds,['part']);assert.deepEqual(h.selected.at(-1).topology,{type:'face',ids:[0]});assert.deepEqual(h.old,[{id:'part',indices:[0,1,2]}]);
  assert.equal(h.preferences.length,1);assert.equal(h.preferences[0].manual,true);
});
test('failed rendered frame rolls back installed display and does not overwrite preferred',async()=>{
  const h=harness({frameError:true});await assert.rejects(h.change('fine'),/DISPLAY_FAILED/);assert.equal(h.env.bodies,h.old);assert.equal(h.env.qualityKey,'standard');
  assert.equal(h.installed.at(-1),h.old);assert.equal(h.preferences.length,0);assert.equal(h.env.busy,false);
});
test('late quality reply cannot install into a newer geometry revision',async()=>{
  const h=harness({stale:true});await assert.rejects(h.change('fine'),/stale/);assert.equal(h.installed.length,0);assert.equal(h.env.bodies,h.old);assert.equal(h.preferences.length,0);
});

test('remesh failure keeps the tab responsive, returns a failure code, and does not retry fine',async()=>{
  const h=harness({remeshError:new Error('memory access out of bounds')});
  await assert.rejects(h.change('fine'),error=>error.code==='DISPLAY_REFINEMENT_FAILED'&&/memory access out of bounds/.test(error.message));
  assert.equal(h.env.bodies,h.old);assert.equal(h.env.qualityKey,'standard');assert.equal(h.env.busy,false);
  assert.equal(h.preferences.length,0);assert.equal(h.remeshCalls(),1);
});
