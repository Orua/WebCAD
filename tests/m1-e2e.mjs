// Real MCP client -> local HTTP/WS -> opened browser -> real WASM.
// Open an isolated empty WebCAD page first. No page JS/DOM modeling in this file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const output=path.resolve('agent/output/m1');fs.mkdirSync(output,{recursive:true});
const client=new Client({name:'webcad-real-m1-acceptance',version:'1.0.0'});
await client.connect(new StreamableHTTPClientTransport(new URL(process.env.WEBCAD_TEST_URL??'http://127.0.0.1:17667/mcp')));
const transcript=[];
async function call(name,args={}){
 const raw=await client.callTool({name:`webcad_${name}`,arguments:args});
 const result=raw.structuredContent??JSON.parse(raw.content[0].text);
 transcript.push({tool:name,input:args,result:name==='export'?{...result,data:`<${result.data?.length??0} base64 chars>`}:result});
 if(raw.isError&&!['failed','unknown'].includes(result.status))throw new Error(JSON.stringify(result));return result;
}
const near=(a,b,tol=.01)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
let sessionId,state;
const context=()=>({...state.context,expectedRevision:state.context.revision,revision:undefined});
const requestContext=()=>{const c=context();delete c.revision;return c;};
async function read(){state=await call('get_state_v2',{sessionId,include:['summary','features','bodies','capabilities']});assert.equal(state.status,'read');return state;}
const card=async op=>call('get_tool',{id:op});
async function execute(action,args,key=crypto.randomUUID()){
 const input={context:requestContext(),idempotencyKey:key,action,args};const result=await call('execute_v2',input);
 assert.equal(result.status,'committed',JSON.stringify(result));await read();return {input,result};
}
async function add(op,params,refs=[]){const c=await card(op);return execute('feature.add',{op,opVersion:c.version,schemaHash:c.schemaHash,params,refs});}
async function edit(featureId,op,params){const c=await card(op);return execute('feature.edit',{featureId,opVersion:c.version,schemaHash:c.schemaHash,params});}
async function query(bodyId,kind,filter,requireUnique=true){return call('query_geometry',{context:requestContext(),bodyId,kind,filter,requireUnique});}
async function verifyPlate(width,rightX){
 assert.equal(state.bodies.length,1);const b=state.bodies[0];assert.equal(b.solidCount,1);
 [width,30,3].forEach((v,i)=>near(b.bounds.max[i]-b.bounds.min[i],v));near(b.volume,width*30*3-48*Math.PI,Math.max(.01,width*30*3*1e-5));
 const circles=await query(b.id,'edge',{curveType:'circle',radiusRangeMm:{min:1.99999,max:2.00001}},false);assert.equal(circles.status,'read');
 const positions=new Set(circles.items.map(e=>`${e.center[0].toFixed(4)},${e.center[1].toFixed(4)}`));
 assert.deepEqual([...positions].sort(),['5.0000,5.0000',`${rightX.toFixed(4)},5.0000`,'5.0000,25.0000',`${rightX.toFixed(4)},25.0000`].sort());
 return {width,volume:b.volume,holes:[...positions],solidCount:b.solidCount};
}
try{
 const boot=await call('bootstrap');assert.equal(boot.product,'WebCAD');
 const sessions=(await call('list_sessions')).sessions;assert.equal(sessions.length,1,'Run on isolated service with exactly one empty test page');sessionId=sessions[0].sessionId;
 await read();assert.equal(state.features.length,0,'Do not replace an existing design');assert(state.summary.kernelReady);
 const box=await add('box',{width:50,depth:30,height:3});const boxId=box.result.createdFeatureIds[0];
 assert.deepEqual(await call('execute_v2',box.input),box.result,'same payload replays receipt');
 const top=await query(boxId,'face',{surfaceType:'plane',normal:{direction:[0,0,1],sameDirection:true,angleToleranceDeg:.1},atExtreme:{axis:'Z',side:'max',toleranceMm:.01}});assert.equal(top.status,'read');assert.equal(top.matchCount,1);
 const boundary=await query(boxId,'edge',{onFaceToken:top.selectionToken,curveType:'line'},false);assert.equal(boundary.matchCount,4);
 const ambiguous=await query(boxId,'face',{surfaceType:'plane'});assert.equal(ambiguous.error.code,'AMBIGUOUS_SELECTION');
 const noMatch=await query(boxId,'edge',{curveType:'circle'});assert.equal(noMatch.error.code,'NO_MATCH');
 const holes=await add('multiHole',{radius:2,depth:5,axis:'Z',direction:-1,points:[[5,5,4],[45,5,4],[5,25,4],[45,25,4]]},[boxId]);const holesId=holes.result.createdFeatureIds[0];
 const measurements=[await verifyPlate(50,45)];
 const faceCard=await card('faceHole');
 const stale=await call('execute_v2',{context:requestContext(),idempotencyKey:crypto.randomUUID(),action:'feature.add',args:{op:'faceHole',opVersion:faceCard.version,schemaHash:faceCard.schemaHash,refs:[holesId],params:{point:[25,15,3],radius:1,through:true},selectionToken:top.selectionToken}});assert.equal(stale.error.code,'STALE_REFERENCE');
 // M1 explicit-coordinate edits, deliberately not claiming M3 associative holes.
 for(const [width,x]of [[60,55],[46,41]]){
  const points=[[5,5,4],[x,5,4],[5,25,4],[x,25,4]];
  // Shrinking the plate first would leave the old right holes outside material.
  // M1 has no atomic batch: keep each explicitly committed intermediate valid.
  if(width===60){await edit(boxId,'box',{width});await edit(holesId,'multiHole',{points});}
  else{await edit(holesId,'multiHole',{points});await edit(boxId,'box',{width});}
  measurements.push(await verifyPlate(width,x));
 }
 const exported=await call('export',{sessionId,expectedRevision:state.context.revision,format:'step'});
 const bytes=Buffer.from(exported.data,'base64');assert(bytes.includes(Buffer.from('ISO-10303-21')));fs.writeFileSync(path.join(output,'mounting-plate.stp'),bytes);
 fs.writeFileSync(path.join(output,'mounting-plate-state.json'),JSON.stringify(state,null,2));
 fs.writeFileSync(path.join(output,'mcp-measurements.json'),JSON.stringify(measurements,null,2));
 console.log(JSON.stringify({status:'pass',measurements,stepBytes:bytes.length,sessionId,documentInstanceId:state.context.documentInstanceId},null,2));
}finally{fs.writeFileSync(path.join(output,'mcp-transcript.json'),JSON.stringify(transcript,null,2));await client.close();}
