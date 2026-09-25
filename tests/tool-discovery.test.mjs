import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPageAPI } from '../src/page-api.js';
import { searchTools, getTool, getTools, readDocs, infoMetadata, pageCatalogHash, pageDocsHash } from '../src/page-api-docs.js';
import { createToolLibrary } from '../src/tool-discovery.js';
import { TOOL_LABELS } from '../src/tool-labels.js';

const ids = query => searchTools({query,limit:5}).items.map(item=>item.id);
const fixture = () => {
  const state = {context:{sessionId:'page-a',documentId:'doc-a',documentInstanceId:'instance-a',revision:8},
    summary:{kernelReady:true,busy:false},preview:{active:false,computing:false},bodies:[{id:'body-a',name:'Part'}]};
  let writes=0;
  const api=createPageAPI({buildId:'test',state:()=>state,display:()=>({status:'rendered'}),execute:()=>{writes++;},files:()=>{writes++;},confirmSaved:async()=>({saved:true})});
  return {api,state,writes:()=>writes};
};

test('discovery ranks unrelated creation, editing, geometry, file, view and appearance capabilities',()=>{
  for(const [query, expected] of [
    ['圆柱','cylinder'],['直线阵列','linearPattern'],['把实体移动并复制','copy'],
    ['沿路径扫掠截面','sweep'],['曲面缝合','sewFaces'],['提取真实截面','planeSection'],
    ['导出STEP','files.export'],['保存工程','files.save'],['设成俯视图','setView'],
    ['测量体积','measure'],['厚度抽壳','shell'],['更改颜色和金属材质','body.appearance'],
    ['export step','files.export'],['sweep path','sweep'],
  ]) assert(ids(query).slice(0,3).includes(expected), `${query}: ${ids(query)}`);
  assert.deepEqual(ids('unfindablexyzz'),[]);
});

test('every UI-backed operation name and every exact ID is discoverable',()=>{
  let cursor,all=[];
  do {const page=searchTools({query:'',limit:50,...(cursor?{cursor}:{})});all.push(...page.items);cursor=page.nextCursor;}while(cursor);
  assert.equal(new Set(all.map(card=>card.id)).size,all.length);
  for(const card of all){
    assert.equal(ids(card.id)[0],card.id);
    if(TOOL_LABELS[card.id])assert(ids(TOOL_LABELS[card.id]).includes(card.id),card.id);
  }
  assert.equal(all.length,infoMetadata().discovery.toolCount);
  assert(searchTools({query:'导入IGS'}).items.some(card=>card.id==='import.iges'&&card.runtimeAvailability==='unavailable'));
});

test('ranking and pagination are stable and cursors cannot cross queries or categories',()=>{
  const page=searchTools({query:'',limit:3});
  const next=searchTools({query:'',limit:3,cursor:page.nextCursor});
  assert.equal(new Set([...page.items,...next.items].map(card=>card.id)).size,6);
  assert.throws(()=>searchTools({query:'sweep',cursor:page.nextCursor}),{code:'PARAM_SCHEMA_INVALID'});
  assert.throws(()=>searchTools({query:'',category:'file',cursor:page.nextCursor}),{code:'PARAM_SCHEMA_INVALID'});
  assert(searchTools({query:'',category:'file'}).items.every(card=>card.category==='file'));
  assert.deepEqual(ids('sweep path'),ids('sweep path'));
});

test('batched cards preserve complete contracts, isolate unknown IDs, and never expose cached objects',()=>{
  const batch=getTools({ids:['shell','missing-operation','files.export']});
  assert.deepEqual(batch.items.map(item=>item.status),['read','error','read']);
  assert.deepEqual(batch.items[0].card,getTool({id:'shell'}));
  batch.items[0].card.inputSchema.properties.thickness.description='corrupted';
  assert.notEqual(getTool({id:'shell'}).inputSchema.properties.thickness.description,'corrupted');
  const card=getTool({id:'box'});card.synonyms.push('corrupted');
  assert(!getTool({id:'box'}).synonyms.includes('corrupted'));
  assert.deepEqual(ids('corrupted'),[]);
});

test('conditional card reads detect drift and bound request sizes',()=>{
  const card=getTool({id:'fillet'}),knownHashes={fillet:card.docsHash};
  const hit=getTools({ids:['fillet'],knownHashes,expectedCatalogHash:pageCatalogHash}).items[0];
  assert.equal(hit.status,'not_modified');assert(!('card' in hit));
  assert.equal(getTools({ids:['fillet'],knownHashes:{fillet:'sha256:'+'0'.repeat(64)}}).items[0].status,'read');
  assert.throws(()=>getTools({ids:['fillet'],expectedCatalogHash:'old'}),{code:'CATALOG_CHANGED'});
  for(const input of [{ids:[]},{ids:['box','box']},{ids:Array.from({length:21},(_,i)=>'id'+i)}, {ids:['box'],knownHashes:{box:'bad'}},{ids:['box'],unexpected:true}])
    assert.throws(()=>getTools(input),{code:'PARAM_SCHEMA_INVALID'});
});

test('document conditional reads work for both page and legacy docs without caching a partial page',()=>{
  for(const docId of ['api.discovery','coordinates']){
    const first=readDocs({docId,limitChars:1000});
    const hit=readDocs({docId,knownHash:first.docsHash});
    assert.equal(hit.status,'not_modified');assert(!('text' in hit));
    assert.throws(()=>readDocs({docId,knownHash:first.docsHash,cursor:'0'}),{code:'PARAM_SCHEMA_INVALID'});
  }
  assert.notEqual(readDocs({docId:'api.discovery',knownHash:'sha256:'+'0'.repeat(64)}).status,'not_modified');
});

test('connect joins live context, search and optional complete contracts without touching geometry',()=>{
  const {api,state,writes}=fixture();
  const first=api.connect({queries:['体积','导出STEP'],includeContracts:true,limit:2});
  assert.equal(first.requestContext.expectedRevision,8);
  assert.equal(first.context.sessionId,'page-a');assert.equal(first.bodyCount,1);
  assert(first.contracts.items.some(item=>item.id==='measure'&&item.status==='read'));
  const knownHashes=Object.fromEntries(first.contracts.items.map(item=>[item.id,item.docsHash]));
  state.context.revision=12;state.context.documentInstanceId='instance-b';state.summary.kernelReady=false;
  const next=api.connect({queries:['体积','导出STEP'],includeContracts:true,limit:2,knownHashes,knownCatalogHash:first.catalogHash,knownDocsHash:first.docsHash});
  assert.equal(next.requestContext.expectedRevision,12);assert.equal(next.context.documentInstanceId,'instance-b');
  assert.equal(next.ready,false);assert(next.contracts.items.every(item=>item.status==='not_modified'));
  assert.deepEqual(next.cache,{catalogChanged:false,docsChanged:false});assert.equal(writes(),0);
});

test('connect bounds state and never silently omits contract results',()=>{
  const {api,state}=fixture();
  state.bodies=Array.from({length:30},(_,i)=>({id:'body'+i,mesh:'large payload',sourceBytes:'private'}));
  const result=api.connect();assert.equal(result.bodies.length,20);assert.equal(result.bodyCount,30);assert.equal(result.bodiesTruncated,true);
  assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('large payload'));
  for(const input of [{queries:['a','b','c','d','e']},{queries:['x'.repeat(501)]},{limit:11},{includeContracts:'yes'},{knownCatalogHash:'bad'},{unexpected:1}])
    assert.throws(()=>api.connect(input),{code:'PARAM_SCHEMA_INVALID'});
});

test('offline library and live page rank all tested query types identically and protect snapshots',async()=>{
  const snapshot=JSON.parse(await readFile(new URL('../public/automation/index.json',import.meta.url),'utf8'));
  assert.equal(snapshot.metadata.catalogHash,pageCatalogHash,'run document generation before testing');
  const library=createToolLibrary(snapshot);
  for(const query of ['导出STEP','曲面缝合','体积','setView','颜色','圆柱','sweep path']){
    assert.deepEqual(library.search(query,{limit:5}).map(item=>item.id),ids(query));
    assert(library.search(query).every(item=>item.runtimeAvailability==='unknown'));
  }
  assert(library.isCurrent({catalogHash:pageCatalogHash,docsHash:pageDocsHash}));
  assert(!library.isCurrent({catalogHash:'changed',docsHash:pageDocsHash}));
  assert(!library.isCurrent({catalogHash:pageCatalogHash,docsHash:'changed'}));
  const card=library.get('shell');card.id='modified';assert.equal(library.get('shell').id,'shell');
  snapshot.cards.length=0;assert.equal(library.get('shell').id,'shell');
  assert(library.readDoc('api.discovery').includes('knownHashes'));
  assert.throws(()=>library.get('unknown'));assert.throws(()=>createToolLibrary({cards:[],metadata:{}}));
});

test('generated manifest supports per-item invalidation and offline module matches the live search source',async()=>{
  const base=new URL('../public/automation/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
  for(const entry of manifest.tools)assert.equal(entry.docsHash,getTool({id:entry.id}).docsHash);
  for(const entry of manifest.docs)assert.equal(entry.docsHash,readDocs({docId:entry.id}).docsHash);
  assert.equal(await readFile(new URL('tool-library.mjs',base),'utf8'),await readFile(new URL('../src/tool-discovery.js',import.meta.url),'utf8'));
});
