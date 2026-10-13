import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandService} from '../src/command-service.js';
import {encodeCommittedProject} from '../src/project-save.js';
import {getTool,infoMetadata} from '../src/page-api-docs.js';
import {AGENT_CONTRACT} from '../src/agent/protocol.js';
const state={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:9,documentName:'retained',features:[],bodies:[],kernelReady:false,busy:true,preview:true,previewComputing:true};
const context={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:9};
test('save is available on an unavailable/busy kernel and active preview, without mutating the revision',async()=>{
 let writes=0;
 const service=createCommandService({snapshot:()=>structuredClone(state),execute:async command=>{
  assert.equal(command,'file_save');writes++;return {revision:9,documentId:'d',documentInstanceId:'i',data:new Uint8Array([1,2,3]),encoding:'bytes',extension:'webcad'};
 }});
 const saved=await service.fileCommand({context,action:'save'});
 assert.equal(saved.status,'read');assert.equal(saved.revision,9);assert.equal(writes,1);assert.equal(state.revision,9);
 assert.equal((await service.fileCommand({context:{...context,expectedRevision:8},action:'save'})).error.code,'REVISION_CONFLICT');
 assert.equal((await service.fileCommand({context,action:'export'})).error.code,'CAPABILITY_UNAVAILABLE');
});
test('v4 save uses an independent codec worker and retains source buffers',async()=>{
 const asset=new Uint8Array([7,8,9]);let terminated=false,posted;
 const codec={postMessage(value){posted=value;queueMicrotask(()=>codec.onmessage({data:{ok:true,bytes:new Uint8Array([4,5])}}));},terminate(){terminated=true;}};
 const bytes=await encodeCommittedProject({version:4,binaryAssets:{hash:asset}},{createWorker:()=>codec});
 assert.deepEqual([...bytes],[4,5]);assert.equal(posted.document.binaryAssets.hash,asset);assert.deepEqual([...asset],[7,8,9]);assert.equal(terminated,true);
});
test('recovery is discoverable and the downloadable contract matches current page metadata',()=>{
 assert.equal(getTool({id:'recoverKernel'}).implementationStatus,'implemented');
 assert.equal(infoMetadata().agentProtocol.contractHash,AGENT_CONTRACT.contractHash);
 assert(AGENT_CONTRACT.jobMethods.includes('recoverKernel'));
 assert(AGENT_CONTRACT.readMethods.includes('getModelLibrary'));
});
