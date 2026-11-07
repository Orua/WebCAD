import {readFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {createPlaywrightPageFactory} from './browser-host.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const mime=path=>path.endsWith('.wasm')?'application/wasm':path.endsWith('.js')||path.endsWith('.mjs')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.md')?'text/plain; charset=utf-8':path.endsWith('.png')?'image/png':'application/octet-stream';
export async function createFrozenCandidateHost({browser,candidateDirectory,expectedBuildId,expectedSourceHash}={}){
 if(!browser?.newContext||!isAbsolute(candidateDirectory??'')||!expectedBuildId||!expectedSourceHash)throw Error('EXPLICIT_FROZEN_CANDIDATE_BINDING_REQUIRED');
 const directory=await realpath(candidateDirectory);
 const [source,manifest,inventory]=await Promise.all(['open-source/build-source.json','automation/manifest.json','open-source/inventory.json'].map(async path=>JSON.parse(await readFile(resolve(directory,path),'utf8'))));
 if(source.buildId!==expectedBuildId||source.sourceHash!==expectedSourceHash||!expectedBuildId.includes('-src-'+expectedSourceHash.slice(0,16)))throw Error('FROZEN_CANDIDATE_IDENTITY_MISMATCH');
 const pinned=new Map(inventory.artifacts.map(item=>[item.path.replaceAll('\\','/'),item.sha256.replace(/^sha256:/,'')]));
 const wasm=inventory.artifacts.find(item=>/replicad_single.*\.wasm$/.test(item.path));
 if(!wasm)throw Error('FROZEN_CANDIDATE_WASM_IDENTITY_MISSING');
 const wasmHash=hash(await readFile(resolve(directory,wasm.path)));
 if(wasmHash!==wasm.sha256.replace(/^sha256:/,''))throw Error('FROZEN_CANDIDATE_WASM_HASH_MISMATCH');
 const observedWasm=new Map(),served=new Map();
 async function asset(url){
  const parsed=new URL(url);
  if(parsed.origin!=='http://localhost'||!parsed.pathname.startsWith('/webcad/'))throw Error('FROZEN_CANDIDATE_EXTERNAL_REQUEST_BLOCKED');
  const name=decodeURIComponent(parsed.pathname.slice('/webcad/'.length))||'index.html';
  const path=resolve(directory,name),relativePath=relative(directory,path);
  if(isAbsolute(relativePath)||relativePath==='..'||relativePath.startsWith('..'+sep))throw Error('FROZEN_CANDIDATE_PATH_ESCAPE');
  const actualPath=await realpath(path),realRelative=relative(directory,actualPath);
  if(isAbsolute(realRelative)||realRelative==='..'||realRelative.startsWith('..'+sep))throw Error('FROZEN_CANDIDATE_LINK_ESCAPE');
  const bytes=await readFile(actualPath),sha256=hash(bytes),key=relativePath.replaceAll('\\','/');
  if(pinned.has(key)&&pinned.get(key)!==sha256)throw Error('FROZEN_CANDIDATE_ASSET_HASH_MISMATCH');
  if(served.has(key)&&served.get(key)!==sha256)throw Error('FROZEN_CANDIDATE_ASSET_CHANGED_DURING_RUN');
  served.set(key,sha256);if(name.endsWith('.wasm'))observedWasm.set(key,sha256);
  return {bytes,sha256,contentType:mime(name)};
 }
 const wrappedBrowser={newContext:async()=>{
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   try{const item=await asset(route.request().url());await route.fulfill({status:200,body:Buffer.from(item.bytes),contentType:item.contentType});}
   catch{await route.abort('blockedbyclient');}
  });return context;
 }};
 const openPage=createPlaywrightPageFactory(wrappedBrowser);
 return {
  openPage,source,manifest,wasmHash,
  fetchImpl:async url=>{const item=await asset(String(url));return new Response(item.bytes,{status:200,headers:{'Content-Type':item.contentType}});},
  verifyObservedWasm(){
   if(![...observedWasm.values()].includes(wasmHash))throw Error('FROZEN_CANDIDATE_EXPECTED_WASM_NOT_OBSERVED');
   return {wasmHash,observedWasm:[...observedWasm].map(([path,sha256])=>({path,sha256})),servedAssets:[...served].map(([path,sha256])=>({path,sha256}))};
  },
 };
}
