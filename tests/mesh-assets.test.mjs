import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeBinarySTL,exportBinarySTL} from '../src/mesh/stl-source.js';
import {encodeMesh,decodeMesh} from '../src/mesh/mesh-codec.js';
import {MeshShape} from '../src/mesh/mesh-shape.js';
import {indexedDisplayMesh} from '../src/mesh/display-mesh.js';
import {cloneAssetDocument} from '../src/mesh/mesh-assets.js';
import {binaryHash} from '../src/contracts/operation-schema.js';
import {encodeProjectV4,encodeProjectV3,decodeProject} from '../src/project-container.js';
import {recordTimeline,restoreTimeline,validateTimeline} from '../src/document-timeline.js';
function fixture(){const b=new Uint8Array(184),v=new DataView(b.buffer);v.setUint32(80,2,true);const p=[[1,2,3,4,2,3,1,5,3],[1,2,3,1,5,3,1,2,6]];for(let f=0;f<2;f++)for(let j=0;j<9;j++)v.setFloat32(84+f*50+12+j*4,p[f][j],true);v.setUint16(132,42,true);return b;}
test('raw STL preserves source identity, exact corner order and explicit units; display is separate',()=>{
 const bytes=fixture(),copy=bytes.slice(),hash=binaryHash(bytes).slice(7);
 assert.throws(()=>decodeBinarySTL(bytes),{code:'MESH_UNITS_REQUIRED'});
 const mesh=decodeBinarySTL(bytes,'mm');assert.equal(mesh.positions[0],1);assert.equal(decodeBinarySTL(bytes,'in').positions[0],25.4);
 const preview=indexedDisplayMesh(mesh);assert.equal(preview.indices.length,mesh.indices.length);for(let i=0;i<preview.indices.length;i++)assert.deepEqual(preview.positions.subarray(preview.indices[i]*3,preview.indices[i]*3+3),mesh.positions.subarray(mesh.indices[i]*3,mesh.indices[i]*3+3));assert(preview.positions.length<mesh.positions.length);
 const shape=MeshShape.fromAsset({format:'stl',units:'mm',assetHash:hash},bytes);
 assert.deepEqual(shape.exportSTL().data,bytes,'unchanged export includes original normals/attribute bytes');
 const display=shape.describe({id:'raw'});display.positions[0]=999;assert.equal(shape.mesh.positions[0],1);
 assert.equal(display.meshReport.solidEligibility,'not-checked');assert.equal(display.solidCount,0);assert.equal(display.volume,null);
 const moved=shape.clone().translate(3,4,5);assert.equal(moved.metrics().bounds.min[0],4);assert.equal(shape.metrics().bounds.min[0],1);moved.translate(1,0,0);assert.equal(moved.metrics().bounds.min[0],5);
 assert.equal(decodeBinarySTL(moved.exportSTL().data,'mm').positions[0],5);assert.deepEqual(bytes,copy);
 const rotated=shape.clone().rotate(90,[0,0,0],[0,0,1]);assert(Math.abs(rotated.transformed().positions[0]+2)<1e-12);assert(Math.abs(rotated.transformed().positions[1]-1)<1e-12);
});
test('STL reader distinguishes exact binary and complete multi-solid ASCII, and rejects truncation',()=>{
 const binary=fixture();binary.set(new TextEncoder().encode('solid binary header'));
 const binaryMesh=decodeBinarySTL(binary,'mm');assert.equal(binaryMesh.report.sourceFormat,'binary-stl');assert.equal(binaryMesh.report.triangleCount,2);
 const ascii=new TextEncoder().encode([
  'solid first block\r\n',
  '\tfacet normal 0e0 0 1\r\n outer loop\r\n',
  ' vertex 0 0 0\r\n vertex 1e0 0 0\r\n vertex 0 1.0 0\r\n',
  ' endloop\r\n endfacet\r\nendsolid first block\r\n',
  'solid second block\r\n',
  ' facet normal 0 0 1\r\n outer loop\r\n',
  ' vertex 1 2 3\r\n vertex 2 2 3\r\n vertex 1 3 3\r\n',
  ' endloop\r\n endfacet\r\nendsolid second block\r\n',
 ].join(''));
 const asciiMesh=decodeBinarySTL(ascii,'mm');assert.equal(asciiMesh.report.sourceFormat,'ascii-stl');assert.equal(asciiMesh.report.triangleCount,2);assert.equal(asciiMesh.positions[3],1);assert.equal(asciiMesh.positions[9],1);
 const hash=binaryHash(ascii).slice(7),shape=MeshShape.fromAsset({format:'stl',units:'mm',assetHash:hash},ascii),exported=shape.exportSTL();
 assert.deepEqual(exported.data,ascii);assert.deepEqual(exported.meshReport,{sourceBytesUnchanged:true,sourceHash:hash,sourceFormat:'ascii-stl',units:'mm'});
 const centimeters=MeshShape.fromAsset({format:'stl',units:'cm',assetHash:hash},ascii),millimeters=centimeters.exportSTL();
 assert.equal(centimeters.mesh.positions[3],10);assert.equal(millimeters.meshReport.units,'mm');assert.equal(decodeBinarySTL(millimeters.data,'mm').positions[3],10);
 assert.throws(()=>decodeBinarySTL(binary.slice(0,-1),'mm'),{code:'MESH_SOURCE_INVALID'});
 assert.throws(()=>decodeBinarySTL(ascii.slice(0,-16),'mm'),{code:'MESH_SOURCE_INVALID'});
 assert.throws(()=>decodeBinarySTL(new TextEncoder().encode(new TextDecoder().decode(ascii).replace('normal 0e0','normal NaN')),'mm'),{code:'MESH_NONFINITE'});
});
test('Float64 mesh codec is length/version/unit/index bounded and never silently repairs geometry',()=>{
 const mesh=decodeBinarySTL(fixture(),'mm'),b=encodeMesh(mesh),r=decodeMesh(b);assert.deepEqual(r.positions,mesh.positions);assert.deepEqual(r.indices,mesh.indices);
 const bad=b.slice();new DataView(bad.buffer).setUint32(20,4000001,true);assert.throws(()=>decodeMesh(bad),{code:'MESH_CODEC_INVALID'});
 const reserved=b.slice();reserved[36]=1;assert.throws(()=>decodeMesh(reserved),{code:'MESH_CODEC_INVALID'});
 const indices=new Uint32Array([999,0,1]);assert.throws(()=>encodeMesh({...mesh,indices}),{code:'MESH_INDEX_INVALID'});
 const finite={positions:new Float64Array([1e40,0,0,1e40,1,0,1e40,0,1]),indices:new Uint32Array([0,1,2])};assert.throws(()=>exportBinarySTL(finite),{code:'MESH_EXPORT_PRECISION'});
});
test('v4 stores full binary sources once across history and survives cold offline decoding without services',async()=>{
 const bytes=fixture(),hash=binaryHash(bytes).slice(7),empty={version:2,documentId:'d',features:[],imports:{},hidden:[]};
 const doc={...empty,version:4,features:[{id:'f',op:'import',params:{key:'source'},refs:[]}],imports:{source:{format:'stl',units:'mm',assetHash:hash}},binaryAssets:{[hash]:bytes}};
 recordTimeline(empty,doc);validateTimeline(doc);assert.equal(JSON.stringify(doc.timeline).includes('source'),true,'history references an import key; the import owns its content hash once');assert.equal(JSON.stringify(doc.timeline).includes('binaryAssets'),false);
 const clone=cloneAssetDocument(doc);assert.equal(clone.binaryAssets[hash],bytes);clone.features[0].name='edited';assert.equal(doc.features[0].name,undefined);
 const packed=encodeProjectV4(doc),cold=await decodeProject(packed);assert.deepEqual(cold.binaryAssets[hash],bytes);validateTimeline(cold);const body=MeshShape.fromAsset(cold.imports.source,cold.binaryAssets[hash]);assert.equal(body.metrics().triangleCount,2);assert.deepEqual(body.exportSTL().data,bytes);
 const prior=restoreTimeline(cold,cold.timeline.baseId);assert.equal(prior.version,4);assert.deepEqual(prior.binaryAssets[hash],bytes,'undo carries retained source without buffer copies');
 const corrupted=cloneAssetDocument(doc);corrupted.binaryAssets[hash]=bytes.slice();corrupted.binaryAssets[hash][90]^=1;assert.throws(()=>encodeProjectV4(corrupted),{code:'MESH_ASSET_CORRUPT'});
 assert.throws(()=>encodeProjectV3({...doc,version:3}),{code:'DOCUMENT_VERSION_UNSUPPORTED'});
});
test('v4 reader and writer share the 512-entry budget',async()=>{
 const project={version:4,documentId:'many-sources',features:[],imports:{},binaryAssets:{},hidden:[]};
 function addSource(index){
  const bytes=fixture();
  new DataView(bytes.buffer).setUint16(0,index,true);
  const hash=binaryHash(bytes).slice(7),key='source-'+index;
  project.binaryAssets[hash]=bytes;
  project.imports[key]={format:'stl',units:'mm',assetHash:hash};
  project.features.push({id:key,op:'import',params:{key},refs:[]});
 }
 for(let i=0;i<510;i++)addSource(i);
 const restored=await decodeProject(encodeProjectV4(project));
 assert.equal(restored.features.length,510);
 assert.deepEqual(restored.binaryAssets,project.binaryAssets);
 addSource(510);
 assert.throws(()=>encodeProjectV4(project),{code:'SIZE_LIMIT',message:/512-entry ZIP limit/});
});
