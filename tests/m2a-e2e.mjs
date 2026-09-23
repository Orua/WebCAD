// Product acceptance: public MCP plus the shipped file-transfer adapter only.
// Prerequisite: one empty ready page on a task-owned isolated server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { uploadAsset,downloadArtifact } from '../scripts/file-transfer-client.mjs';

const baseUrl=process.env.WEBCAD_TEST_URL?.replace(/\/mcp\/?$/,'')||'http://127.0.0.1:17668';
const output=path.resolve(process.env.WEBCAD_M2A_OUTPUT||`agent/output/m2a/run-${Date.now()}`);await fs.mkdir(output,{recursive:true});
const client=new Client({name:'webcad-m2a-public-acceptance',version:'1.0.0'});
await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
let state,sessionId;const transcript=[],checks=[],files=[];
const context=()=>({sessionId,documentId:state.context.documentId,documentInstanceId:state.context.documentInstanceId,expectedRevision:state.context.revision});
const clean=value=>JSON.parse(JSON.stringify(value,(key,item)=>/Token$/.test(key)?'<capability omitted>':key==='data'&&typeof item==='string'?`<${item.length} chars omitted>`:item));
async function call(name,args={},failure=false){
 const raw=await client.callTool({name:`webcad_${name}`,arguments:args},undefined,{timeout:120000});const result=raw.structuredContent??JSON.parse(raw.content[0].text);
 transcript.push({tool:name,input:clean(args),result:clean(result)});
 if(!failure)assert(!raw.isError,`${name}: ${JSON.stringify(result)}`);else assert(raw.isError,`${name} unexpectedly succeeded`);
 return result;
}
async function read(){state=await call('get_state_v2',{sessionId,include:['summary','features','bodies','capabilities']});return state;}
async function action(name,args={}){const result=await call(name,{context:context(),...args});await read();return result;}
async function feature(action,args){const result=await call('execute_v2',{context:context(),idempotencyKey:crypto.randomUUID(),action,args});assert.equal(result.status,'committed');await read();return result;}
async function add(op,params,refs=[]){const card=await call('get_tool',{id:op});return feature('feature.add',{op,opVersion:card.version,schemaHash:card.schemaHash,params,refs});}
async function edit(id,op,params){const card=await call('get_tool',{id:op});return feature('feature.edit',{featureId:id,opVersion:card.version,schemaHash:card.schemaHash,params});}
async function upload(file){return uploadAsset(client,{filePath:file,directory:output,baseUrl});}
async function download(artifact,name){
 const saved=await downloadArtifact(client,artifact,{directory:output,baseUrl,name});
 files.push({name:path.basename(saved.filePath),size:saved.size,sha256:saved.sha256,revision:artifact.context?.revision});return saved;
}
async function save(name){const artifact=await action('save_document');const saved=await download(artifact,name);await read();assert(saved.confirmation.documentSaved);assert.equal(state.summary.dirty,false);return saved.filePath;}
const near=(a,b,tolerance=.01)=>assert(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
async function verifyPlate(width=46,x=41){
 assert.equal(state.bodies.length,1);const body=state.bodies[0];assert.equal(body.solidCount,1);[width,30,3].forEach((n,i)=>near(body.bounds.max[i]-body.bounds.min[i],n));near(body.volume,width*90-48*Math.PI,Math.max(.01,width*90*1e-5));
 const circles=await call('query_geometry',{context:context(),bodyId:body.id,kind:'edge',filter:{curveType:'circle',radiusRangeMm:{min:1.99999,max:2.00001}},requireUnique:false});
 const centers=[...new Set(circles.items.map(e=>`${e.center[0].toFixed(4)},${e.center[1].toFixed(4)}`))].sort();
 assert.deepEqual(centers,[[5,5],[x,5],[5,25],[x,25]].map(([a,b])=>`${a.toFixed(4)},${b.toFixed(4)}`).sort());
 checks.push({case:'plate',width,volume:body.volume,logicalHoles:centers});
}
async function unchangedFailure(name,args,code){const before=structuredClone(state);const result=await call(name,args,true);if(code)assert.equal(result.error.code,code);await read();assert.deepEqual(state.context,before.context);assert.deepEqual(state.features,before.features);assert.deepEqual(state.bodies,before.bodies);assert.equal(state.summary.dirty,before.summary.dirty);checks.push({case:name,expectedFailure:result.error.code,preserved:true});}
try{
 const boot=await call('bootstrap');assert.equal((await client.listTools()).tools.length,30);assert((await call('search_tools',{query:'file.save_document'})).items.length);
 let sessions;
 for(let i=0;i<30;i++){sessions=(await call('list_sessions')).sessions;if(sessions.length===1){sessionId=sessions[0].sessionId;await read();if(state.summary.kernelReady&&!state.summary.busy)break;}await new Promise(resolve=>setTimeout(resolve,1000));}
 assert.equal(sessions.length,1,'Use a task-owned isolated server with exactly one ready page.');assert.equal(state.features.length,0,'Existing designs must never be replaced by this test.');
 const capabilities=await call('file_capabilities');checks.push({case:'IGES_PREFLIGHT',...capabilities.iges});
 await action('new_document');
 const box=(await add('box',{width:50,depth:30,height:3})).createdFeatureIds[0];
 const points=x=>[[5,5,4],[x,5,4],[5,25,4],[x,25,4]];
 const holes=(await add('multiHole',{radius:2,depth:5,axis:'Z',direction:-1,points:points(45)},[box])).createdFeatureIds[0];await verifyPlate(50,45);
 await edit(box,'box',{width:60});await edit(holes,'multiHole',{points:points(55)});await verifyPlate(60,55);
 await edit(holes,'multiHole',{points:points(41)});await edit(box,'box',{width:46});await verifyPlate();
 const native=await save('plate-before-reopen.webcad'),oldContext=context();
 const token=await call('query_geometry',{context:context(),bodyId:holes,kind:'face',filter:{surfaceType:'plane',atExtreme:{axis:'Z',side:'max',toleranceMm:.01}},requireUnique:true});
 const input=await upload(native);await action('open_asset',{assetId:input.assetId});assert.equal(state.context.documentId,oldContext.documentId);assert.notEqual(state.context.documentInstanceId,oldContext.documentInstanceId);await verifyPlate();
 await unchangedFailure('new_document',{context:oldContext},'INSTANCE_MISMATCH');
 const faceCard=await call('get_tool',{id:'faceHole'});
 await unchangedFailure('execute_v2',{context:context(),idempotencyKey:crypto.randomUUID(),action:'feature.add',args:{op:'faceHole',opVersion:faceCard.version,schemaHash:faceCard.schemaHash,params:{point:[23,15,3],radius:1,through:true},refs:[holes],selectionToken:token.selectionToken}},'STALE_REFERENCE');
 await edit(box,'box',{width:47});await verifyPlate(47,41);await edit(box,'box',{width:46});
 const stale=await action('save_document');assert(state.summary.dirty);await edit(box,'box',{width:47});
 const staleWrite=await download(stale,'older-snapshot.webcad');assert.equal(staleWrite.confirmation.documentSaved,false);await read();assert(state.summary.dirty);checks.push({case:'save-during-edit',written:true,currentDirty:true});
 await unchangedFailure('open_asset',{context:context(),assetId:input.assetId},'UNSAVED_REPLACEMENT');
 await unchangedFailure('import_asset',{context:context(),assetId:input.assetId},'FORMAT_UNSUPPORTED');
 await edit(box,'box',{width:46});await verifyPlate();await save('mounting-plate.webcad');
 const step=await action('export_artifact',{format:'step'});await download(step,'mounting-plate.stp');
 const png=await action('export_artifact',{format:'png'});const picture=await download(png,'mounting-plate.png');assert.equal((await fs.readFile(picture.filePath)).subarray(1,4).toString(),'PNG');
 const stl=await action('export_artifact',{format:'stl'});await download(stl,'mounting-plate.stl');
 // Failure isolation on a clean, saved document: parse, rebuild, STEP and IGES conversion.
 for(const [name,bytes,tool]of [
  ['broken.webcad','{bad json','open_asset'],
  ['invalid-geometry.webcad',JSON.stringify({version:1,documentId:'invalid',features:[{id:'bad',op:'unknown-op',params:{},refs:[]}],imports:{}}),'open_asset'],
  ['broken.step','not a STEP file','import_asset'],
  ...(capabilities.iges.available?[['broken.igs','not an IGES file','import_asset']]:[]),
 ]){const file=path.join(output,name);await fs.writeFile(file,bytes);const asset=await upload(file);await unchangedFailure(tool,{context:context(),assetId:asset.assetId});await call('release_resource',{resourceId:asset.assetId});}
 // STEP import readback then additional machining, save, delete input/cache, reopen and edit.
 await action('new_document');const stepInput=path.join(output,'portable-input.step');await fs.copyFile(path.join(output,'mounting-plate.stp'),stepInput);
 const source=await upload(stepInput);await action('import_asset',{assetId:source.assetId});await verifyPlate();
 const cut=(await add('hole',{radius:1,depth:5,x:23,y:15,z:4,axis:'Z',direction:-1},[state.bodies[0].id])).createdFeatureIds[0];near(state.bodies[0].volume,3989.2035526276904-3*Math.PI);
 const portable=await save('portable-step.webcad');await call('release_resource',{resourceId:source.assetId});await fs.unlink(stepInput);
 const content=JSON.parse(await fs.readFile(portable,'utf8'));assert(Object.values(content.imports).every(entry=>typeof entry.data==='string'&&entry.data.length>0));assert(!JSON.stringify(content).includes(source.assetId));
 await action('new_document');const portableAsset=await upload(portable);await action('open_asset',{assetId:portableAsset.assetId});assert.equal(state.features.length,2);await edit(cut,'hole',{radius:1.25});near(state.bodies[0].volume,3989.2035526276904-3*Math.PI*1.25**2);await save('portable-step-edited.webcad');checks.push({case:'STEP_PORTABILITY',inputRemoved:true,assetReleased:true,historyEditable:true});
 // Independent BREP portable-source case.
 await action('new_document');await add('box',{width:10,depth:8,height:4});const brep=await action('export_artifact',{format:'brep'});const brepFile=(await download(brep,'portable-input.brep')).filePath;await save('brep-source.webcad');await action('new_document');
 const brepAsset=await upload(brepFile);await action('import_asset',{assetId:brepAsset.assetId});const brepCut=(await add('hole',{radius:1,depth:6,x:5,y:4,z:5,axis:'Z',direction:-1},[state.bodies[0].id])).createdFeatureIds[0];const brepNative=await save('portable-brep.webcad');
 await call('release_resource',{resourceId:brepAsset.assetId});await fs.unlink(brepFile);await action('new_document');const reopened=await upload(brepNative);await action('open_asset',{assetId:reopened.assetId});await edit(brepCut,'hole',{radius:1.2});near(state.bodies[0].volume,320-4*Math.PI*1.2**2);await save('portable-brep-edited.webcad');checks.push({case:'BREP_PORTABILITY',inputRemoved:true,assetReleased:true,historyEditable:true});
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify({status:'pass',bootstrap:boot,capabilities,checks,files,output},null,2));
 console.log(JSON.stringify({status:'pass',output,checks:checks.length,files:files.length,finalPlateSHA256:step.sha256}));
}catch(error){await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,state},null,2));throw error;}
finally{await fs.writeFile(path.join(output,'mcp-transcript.json'),JSON.stringify(transcript,null,2));await client.close();}
