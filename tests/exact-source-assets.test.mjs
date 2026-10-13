import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync} from 'three/examples/jsm/libs/fflate.module.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {cloneAssetDocument,validateBinaryAssets} from '../src/mesh/mesh-assets.js';
import {preflightProjectV4} from '../src/mesh/project-v4.js';
import {encodeProjectV4,encodeProjectV3,decodeProject,decodedProjectTransfers} from '../src/project-container.js';
import {recordTimeline,restoreTimeline,validateTimeline} from '../src/document-timeline.js';

const encoder=new TextEncoder(),decoder=new TextDecoder(),MiB=1024*1024;
test('decoded Worker assets transfer ownership once without losing shared identity',()=>{
 const bytes=new Uint8Array([4,5,6]),doc={binaryAssets:{a:bytes},compiledArtifacts:{b:bytes}};
 const transfers=decodedProjectTransfers(doc);assert.equal(transfers.length,1);
 const received=structuredClone(doc,{transfer:transfers});
 assert.equal(bytes.byteLength,0);assert.deepEqual([...received.binaryAssets.a],[4,5,6]);
 assert.equal(received.binaryAssets.a.buffer,received.compiledArtifacts.b.buffer);
});
test('decoded subviews do not detach another owner of their surrounding buffer',()=>{
 const source=new Uint8Array([0,7,8,9]),doc={binaryAssets:{a:source.subarray(1,3)}};
 const received=structuredClone(doc,{transfer:decodedProjectTransfers(doc)});
 assert.deepEqual([...received.binaryAssets.a],[7,8]);assert.deepEqual([...source],[0,7,8,9]);
 assert.deepEqual(decodedProjectTransfers({version:2,imports:{}}),[]);
});
// Container-only fixtures deliberately exceed the previous file limit. These
// test byte preservation and history, not the validity of any CAD geometry.
function source(format,size=21*MiB+79){
 const bytes=new Uint8Array(size).fill(32);
 bytes.set(encoder.encode(format==='step'?'ISO-10303-21;\n/* container fixture */':'DBRep_DrawableShape\nCASCADE Topology V3, (c) Open Cascade\n'));
 bytes[bytes.length-1]=10;return bytes;
}
const hashOf=bytes=>createHash('sha256').update(bytes).digest('hex');
function imported(format,bytes){
 const hash=hashOf(bytes),empty={version:2,documentId:`exact-${format}`,name:'empty',features:[],imports:{}};
 const doc={...empty,version:4,name:'imported',features:['a','b'].map(id=>({id,op:'import',params:{key:id},refs:[]})),imports:Object.fromEntries(['a','b'].map(id=>[id,{format,assetHash:hash,name:`${id}.${format}`} ])),binaryAssets:{[hash]:bytes}};
 recordTimeline(empty,doc);return {doc,hash};
}

for(const format of ['step','brep'])test(`v4 ${format} retains a >20 MiB source once and restores deleted imports offline`,async()=>{
 const bytes=source(format),{doc,hash}=imported(format,bytes);
 assert.equal(binaryHash(bytes).slice(7),hash);validateTimeline(doc);
 const importedState=doc.timeline.entries.at(-1).id,removed=cloneAssetDocument(doc);removed.features=[];removed.name='removed';recordTimeline(doc,removed);
 assert.equal(removed.binaryAssets[hash],bytes);assert.equal(Object.keys(removed.binaryAssets).length,1);
 assert.equal(JSON.stringify(removed.timeline).includes('binaryAssets'),false);
 assert.equal(JSON.stringify(removed.timeline).includes(hash),false,'history contains import keys, not repeated source data');
 const packed=encodeProjectV4(removed),entries=unzipSync(packed);
 assert.deepEqual(Object.keys(entries).filter(name=>name.startsWith('assets/')),[`assets/${hash}.${format}`]);
 const metadata=JSON.parse(decoder.decode(entries['document.json']));assert.equal(metadata.binaryAssets,undefined);
 assert.equal(metadata.imports.a.data,undefined);assert.equal(metadata.imports.b.assetHash,hash);assert(entries['document.json'].length<10000);
 const cold=await decodeProject(packed);validateTimeline(cold);
 assert.equal(hashOf(cold.binaryAssets[hash]),hash);assert.equal(cold.binaryAssets[hash].length,bytes.length);
 const restored=restoreTimeline(cold,importedState);assert.equal(restored.features.length,2);assert.equal(restored.binaryAssets[hash],cold.binaryAssets[hash]);
 recordTimeline(cold,restored,{label:'restore imported source'});validateTimeline(restored);
 assert.equal(restored.imports.a.assetHash,restored.imports.b.assetHash);
 const corrupt=cloneAssetDocument(doc);corrupt.binaryAssets[hash]=bytes.slice();corrupt.binaryAssets[hash][100]^=1;
 assert.throws(()=>encodeProjectV4(corrupt),{code:'ARTIFACT_CORRUPT'});
 if(format==='step'){
  entries[`assets/${hash}.${format}`][100]^=1;
  await assert.rejects(decodeProject(zipSync(entries,{level:0})),{code:'ARTIFACT_CORRUPT'});
 }
});

test('exact source BREP capacity is distinct from Services checkpoint capacity in both directions',async()=>{
 const bytes=source('brep'),hash=hashOf(bytes),{doc}=imported('brep',bytes);
 assert.doesNotThrow(()=>preflightProjectV4(doc));
 const checkpoint={version:4,documentId:'checkpoint',features:[],imports:{},binaryAssets:{},compiledArtifacts:{[hash]:bytes}};
 assert.throws(()=>encodeProjectV4(checkpoint),{code:'SIZE_LIMIT'});
 // Build an external container bypassing the writer to exercise reader gates.
 const json=encoder.encode(JSON.stringify({...checkpoint,compiledArtifacts:undefined}));
 const manifest={type:'webcad-project',version:4,documentSha256:hashOf(json),artifacts:[{sha256:hash,bytes:bytes.length,format:'occt-text-brep-v1',brepVersion:3}],binaryAssets:[]};
 const packed=zipSync({'document.json':json,'manifest.json':encoder.encode(JSON.stringify(manifest)),[`artifacts/${hash}.brep`]:bytes},{level:0});
 await assert.rejects(decodeProject(packed),{code:'SIZE_LIMIT'});
 assert.throws(()=>encodeProjectV3({...doc,version:3}),{code:'DOCUMENT_VERSION_UNSUPPORTED'});
});

test('new exact references reject absent bytes, duplicate metadata bytes and mismatched archive formats',async()=>{
 const bytes=source('step',120),{doc,hash}=imported('step',bytes);
 const missing=cloneAssetDocument(doc);delete missing.binaryAssets[hash];assert.throws(()=>validateBinaryAssets(missing),{code:'ARTIFACT_CORRUPT'});
 for(const data of ['base64 duplicate',bytes]){const invalid=cloneAssetDocument(doc);invalid.imports.a.data=data;assert.throws(()=>encodeProjectV4(invalid),{code:'ARTIFACT_CORRUPT'});}
 const entries=unzipSync(encodeProjectV4(doc)),manifest=JSON.parse(decoder.decode(entries['manifest.json']));
 manifest.binaryAssets[0].format='brep';entries[`assets/${hash}.brep`]=entries[`assets/${hash}.step`];delete entries[`assets/${hash}.step`];entries['manifest.json']=encoder.encode(JSON.stringify(manifest));
 await assert.rejects(decodeProject(zipSync(entries,{level:0})),{code:'ARTIFACT_CORRUPT'});
 const legacy={version:2,documentId:'legacy',features:[{id:'old',op:'import',params:{key:'old'},refs:[]}],imports:{old:{format:'step',data:'legacy base64'}}};
 assert.deepEqual(await decodeProject(encoder.encode(JSON.stringify(legacy))),legacy);
 const mixed={...legacy,version:4,binaryAssets:{}};assert.deepEqual((await decodeProject(encodeProjectV4(mixed))).imports,legacy.imports);
});

test('retained exact assets are released only after their last history reference is pruned',()=>{
 const bytes=source('step',120),{doc,hash}=imported('step',bytes);
 doc.timeline.maxSteps=2;
 const removed=cloneAssetDocument(doc);removed.features=[];recordTimeline(doc,removed);
 assert.equal(removed.binaryAssets[hash],bytes);
 const later=cloneAssetDocument(removed);later.name='later';recordTimeline(removed,later);validateTimeline(later);
 assert.deepEqual(later.imports,{});assert.deepEqual(later.binaryAssets,{});assert.equal(doc.binaryAssets[hash],bytes,'pruning never mutates live undo snapshots');
});

test('metadata and legacy project budgets remain 20 MiB even with large-source v4 support',async()=>{
 const metadata={version:4,documentId:'metadata',features:[],imports:{},binaryAssets:{},name:'x'.repeat(20*MiB)};
 assert.throws(()=>encodeProjectV4(metadata),{code:'SIZE_LIMIT'});
 const legacy=encoder.encode(JSON.stringify({...metadata,version:2,binaryAssets:undefined}));
 await assert.rejects(decodeProject(legacy),{code:'SIZE_LIMIT'});
 assert.throws(()=>encodeProjectV3({...metadata,version:3,binaryAssets:undefined}),{code:'SIZE_LIMIT'});
 const previous={version:4,documentId:'metadata-history',features:[],imports:{},binaryAssets:{},name:'previous',notes:'x'.repeat(19*MiB)};
 const next={...previous,name:'next'};recordTimeline(previous,next);
 assert.equal(next.timeline,undefined,'history must fit metadata capacity, independently of remaining asset capacity');
 assert.doesNotThrow(()=>preflightProjectV4(next));
});
