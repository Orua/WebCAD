import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync} from 'three/examples/jsm/libs/fflate.module.js';
import {binaryHash,contractHash} from '../src/contracts/operation-schema.js';
import {encodeProjectV3,decodeProject} from '../src/project-container.js';
import {recordTimeline,validateTimeline} from '../src/document-timeline.js';
test('v3 is an explicit bounded ZIP with raw hashed artifacts, while v1/v2 JSON remains readable',async()=>{
 const bytes=new TextEncoder().encode('container-only integrity fixture; not a geometry acceptance'),hash=binaryHash(bytes).slice(7);assert.equal(hash,createHash('sha256').update(bytes).digest('hex'));
 const old={version:2,documentId:'doc',features:[],imports:{}},doc={...old,version:3,features:[{id:'f',op:'transform',params:{x:1},refs:[],compiledCheckpoint:{artifactSha256:hash}}],compiledArtifacts:{[hash]:bytes}};
 recordTimeline(old,doc);validateTimeline(doc);assert.equal(JSON.stringify(doc.timeline).includes('container-only'),false);
 const packet=encodeProjectV3(doc);assert.deepEqual([...packet.slice(0,2)],[80,75]);const reopened=await decodeProject(packet);assert.equal(reopened.version,3);assert.deepEqual(reopened.compiledArtifacts[hash],bytes);validateTimeline(reopened);
 for(const version of [1,2])assert.equal((await decodeProject(new TextEncoder().encode(JSON.stringify({...old,version})))).version,version);
 const tampered={...doc,compiledArtifacts:{[hash]:new Uint8Array([0])}};assert.throws(()=>encodeProjectV3(tampered),{code:'ARTIFACT_CORRUPT'});
 const staleTimeline={...doc,features:doc.features.map(f=>({...f,params:{x:2}}))};assert.throws(()=>encodeProjectV3(staleTimeline),{code:'HISTORY_INVALID'});
 const invalid=zipSync({'../escape':new Uint8Array([1]),'manifest.json':new Uint8Array([123]),'document.json':new Uint8Array([123])});await assert.rejects(decodeProject(invalid),{code:'PROJECT_FORMAT_INVALID'});
 assert.equal(contractHash({a:1}),`sha256:${createHash('sha256').update('{"a":1}').digest('hex')}`);
});
