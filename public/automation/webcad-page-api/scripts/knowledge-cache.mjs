// Host-side static documentation cache. Never stores the connection object or
// live document state. The frontend has no filesystem dependency on this file.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const names=['index.json','agent-routing.json','routes.json'];
const matches=(manifest,c)=>manifest?.schemaVersion===1&&manifest.catalogHash===c.catalogHash&&manifest.docsHash===c.docsHash;
function validateManifest(m,c){
  if(!matches(m,c))fail('KNOWLEDGE_STALE','Knowledge package and live page hashes differ; reconnect before downloading.');
  if(!Array.isArray(m.files)||m.files.length!==names.length||new Set(m.files.map(f=>f.name)).size!==names.length)fail('KNOWLEDGE_INVALID','Incomplete knowledge package.');
  for(const f of m.files)if(!names.includes(f.name)||f.url!==f.name||!Number.isSafeInteger(f.sizeBytes)||f.sizeBytes<1||f.sizeBytes>5*1024*1024||!/^sha256:[a-f0-9]{64}$/.test(f.sha256))fail('KNOWLEDGE_INVALID','Invalid finite package file.');
  if(m.files.reduce((n,f)=>n+f.sizeBytes,0)>8*1024*1024)fail('KNOWLEDGE_LIMIT','Knowledge package exceeds 8 MiB.');
}
function validatePayloads(payloads,c){
  const index=JSON.parse(payloads.get('index.json').toString('utf8'));
  const routes=JSON.parse(payloads.get('agent-routing.json').toString('utf8'));
  const ui=JSON.parse(payloads.get('routes.json').toString('utf8'));
  if(index.metadata?.catalogHash!==c.catalogHash||index.metadata?.docsHash!==c.docsHash||!Array.isArray(index.cards)||!index.docs||!matches(routes,c)||ui.catalogHash!==c.catalogHash||ui.docsHash!==c.docsHash)
    fail('KNOWLEDGE_INVALID','Package contents do not match the live static contracts.');
  return {index,routing:routes,ui};
}
export async function syncKnowledge(connection,{baseUrl,directory=join((typeof process==='undefined'?undefined:process.env.CODEX_HOME)||join(homedir(),'.codex'),'cache','webcad'),fetchImpl=globalThis.fetch}={}){
  if(!/^sha256:[a-f0-9]{64}$/.test(connection?.catalogHash)||!/^sha256:[a-f0-9]{64}$/.test(connection?.docsHash))fail('KNOWLEDGE_INVALID','Fresh live catalog/docs hashes are required.');
  let base;try{base=new URL('./',baseUrl);}catch{fail('KNOWLEDGE_SOURCE_REQUIRED','Supply the bound page base URL.');}
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password)fail('KNOWLEDGE_SOURCE_REQUIRED','Use the authorized HTTP(S) page base without credentials.');
  const sourceKey=hash(base.href).slice(7,23),versionKey=connection.catalogHash.slice(7,23)+'-'+connection.docsHash.slice(7,23);
  const cacheDir=resolve(directory,sourceKey,versionKey),manifestPath=join(cacheDir,'agent-knowledge.json');
  const descriptor=cacheHit=>({status:'ready',cacheHit,directory:cacheDir,manifestPath,sourceBaseUrl:base.href,catalogHash:connection.catalogHash,docsHash:connection.docsHash,downloadedFiles:cacheHit?0:4});
  try{
    const cached=JSON.parse(await readFile(manifestPath,'utf8'));validateManifest(cached,connection);
    if(cached.sourceBaseUrl!==base.href)throw new Error('Different source');
    const payloads=new Map(await Promise.all(cached.files.map(async f=>{
      const bytes=await readFile(join(cacheDir,f.name));if(bytes.length!==f.sizeBytes||hash(bytes)!==f.sha256)throw new Error('Cache corrupted');return [f.name,bytes];
    })));
    validatePayloads(payloads,connection);return descriptor(true);
  }catch{/* Missing or corrupted static cache: download one complete package. */}
  if(typeof fetchImpl!=='function')fail('KNOWLEDGE_DOWNLOAD_UNAVAILABLE','This host has no fetch; supply an authorized static-file download adapter.');
  const download=async name=>{
    const response=await fetchImpl(new URL('automation/'+name,base));
    if(!response.ok)fail('KNOWLEDGE_DOWNLOAD_FAILED',`Knowledge file ${name} returned HTTP ${response.status}.`);
    const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>5*1024*1024)fail('KNOWLEDGE_LIMIT','Knowledge file exceeds 5 MiB.');return bytes;
  };
  const manifest=JSON.parse((await download('agent-knowledge.json')).toString('utf8'));validateManifest(manifest,connection);
  const payloads=new Map(await Promise.all(manifest.files.map(async f=>{
    const bytes=await download(f.url);if(bytes.length!==f.sizeBytes||hash(bytes)!==f.sha256)fail('KNOWLEDGE_HASH_MISMATCH',`Knowledge file ${f.name} hash/size mismatch.`);return [f.name,bytes];
  })));
  validatePayloads(payloads,connection);
  await mkdir(cacheDir,{recursive:true});
  for(const [name,bytes]of payloads)await writeFile(join(cacheDir,name),bytes);
  // Commit marker last; an interrupted download is never treated as ready.
  await writeFile(manifestPath,JSON.stringify({...manifest,sourceBaseUrl:base.href},null,2)+'\n');
  return descriptor(false);
}
async function openCache(cache){
  if(cache?.status!=='ready')fail('KNOWLEDGE_CACHE_REQUIRED','Download and verify knowledge before local routing.');
  const manifest=JSON.parse(await readFile(cache.manifestPath,'utf8'));validateManifest(manifest,cache);
  const payloads=new Map(await Promise.all(manifest.files.map(async f=>{
    const bytes=await readFile(join(cache.directory,f.name));if(bytes.length!==f.sizeBytes||hash(bytes)!==f.sha256)fail('KNOWLEDGE_HASH_MISMATCH','Cached knowledge changed; reconnect and refresh.');return [f.name,bytes];
  })));
  return validatePayloads(payloads,cache);
}
export async function routeKnowledge(cache,query,{limit=3}={}){
  if(typeof query!=='string'||query.length>500||!Number.isInteger(limit)||limit<1||limit>10)fail('KNOWLEDGE_QUERY_INVALID','Use a short query and limit 1..10.');
  const {routing}=await openCache(cache),text=query.toLocaleLowerCase();
  return routing.routes.map(route=>({...route,score:route.keywords.filter(k=>text.includes(k.toLocaleLowerCase())).length})).filter(route=>route.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export async function readLocalKnowledge(cache,{docIds=[],toolIds=[],maxChars=32000}={}){
  const {index}=await openCache(cache);
  return selectKnowledge(index,cache,{docIds,toolIds,maxChars});
}
function selectKnowledge(index,cache,{docIds=[],toolIds=[],maxChars=32000}={}){
  if(!Array.isArray(docIds)||!Array.isArray(toolIds)||docIds.length+toolIds.length>20||[...docIds,...toolIds].some(id=>typeof id!=='string')||!Number.isInteger(maxChars)||maxChars<1000||maxChars>64000)fail('KNOWLEDGE_QUERY_INVALID','Read at most20 named items with a 1000..64000 character budget.');
  const items=[];let usedChars=0;
  for(const [kind,ids]of [['doc',docIds],['tool',toolIds]])for(const id of ids){
    const content=kind==='doc'?index.docs[id]:index.cards.find(c=>c.id===id);
    if(content===undefined){items.push({id,kind,status:'error',code:'KNOWLEDGE_ITEM_UNKNOWN'});continue;}
    const chars=kind==='doc'?content.length:JSON.stringify(content).length;
    if(usedChars+chars>maxChars){items.push({id,kind,status:'omitted',reason:'CHAR_BUDGET',chars});continue;}
    items.push({id,kind,status:'read',...(kind==='doc'?{text:content}:{card:content})});usedChars+=chars;
  }
  return {items,usedChars,catalogHash:cache.catalogHash,docsHash:cache.docsHash,scope:'static-only'};
}

// Evidence is asserted by the caller. This read-only planner cannot certify it.
export async function routeProductSource(cache,brief,{includeKnowledge=false,maxChars=32000}={}){
  if(typeof includeKnowledge!=='boolean'||!Number.isInteger(maxChars)||maxChars<1000||maxChars>64000)fail('KNOWLEDGE_QUERY_INVALID','Use boolean includeKnowledge and a 1000..64000 character budget.');
  const bad=message=>fail('SOURCE_BRIEF_INVALID',message);
  const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
  const label=v=>typeof v==='string'&&v.trim().length>0&&v.length<=500;
  if(!exact(brief,['schemaVersion','typeId','familyId','scope','targetPartIds','source','parts','unknowns'])||brief.schemaVersion!==1||!Number.isSafeInteger(brief.typeId)||brief.typeId<1||!['part','assembly'].includes(brief.scope))bad('Supply schemaVersion 1, positive typeId and part/assembly scope.');
  const s=brief.source;
  if(!exact(s,['kind','reference','version','geometry','units'])||!['dwg','photo'].includes(s.kind)||!label(s.reference)||!['resolved','unresolved'].includes(s.version)||!['complete','partial','unreadable'].includes(s.geometry)||(s.units!==undefined&&!['mm','cm','m','in','unresolved'].includes(s.units)))bad('Supply an explicit source reference, version, geometry status and supported units.');
  if(!Array.isArray(brief.parts)||brief.parts.length>32||!Array.isArray(brief.unknowns)||brief.unknowns.length>32||!brief.unknowns.every(label))bad('Use at most 32 parts and 32 named unknowns.');
  const ids=new Set();
  for(const p of brief.parts){
    if(!exact(p,['id','role','reference','section'])||typeof p.id!=='string'||! /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(p.id)||ids.has(p.id)||!['main','moving','fastener','backplate','purchased','decoration'].includes(p.role)||!label(p.reference)||!['resolved','unresolved'].includes(p.section))bad('Each part needs a unique id, explicit role, source reference and section status.');
    ids.add(p.id);
  }
  let targets=brief.targetPartIds??brief.parts.map(p=>p.id);
  if(!Array.isArray(targets)||targets.length>32||new Set(targets).size!==targets.length||!targets.every(id=>ids.has(id))||(brief.scope==='part'&&(!brief.targetPartIds||targets.length===0)))bad('A part task needs explicit existing targetPartIds.');
  if(brief.scope==='assembly'&&brief.targetPartIds&&targets.length!==ids.size)bad('Assembly scope must target every listed part.');
  if(brief.familyId!==undefined&&!label(brief.familyId))bad('Use a non-empty family id.');
  const {routing,index}=await openCache(cache);
  const families=routing.productFamilies??[];
  const candidates=families.filter(f=>f.typeIds.includes(brief.typeId));
  // Product categories are hints. An explicitly reviewed structure may cross them.
  const selected=families.find(f=>f.id===brief.familyId);
  const blockers=[];
  if(s.kind==='photo')blockers.push({code:'DRAWING_DIMENSIONS_REQUIRED',message:'A photograph only establishes a candidate structure.'});
  if(s.version!=='resolved')blockers.push({code:'SOURCE_VERSION_UNRESOLVED'});
  if(s.geometry!=='complete')blockers.push({code:'SOURCE_GEOMETRY_INCOMPLETE',actual:s.geometry});
  if(!s.units||s.units==='unresolved')blockers.push({code:'SOURCE_UNITS_UNRESOLVED'});
  else if(s.units!=='mm')blockers.push({code:'SOURCE_UNIT_CONVERSION_REQUIRED',actual:s.units,target:'mm',message:'Normalize geometry and dimensions to mm, record original unit and conversion in source.reference, then submit units:mm.'});
  if(!targets.length)blockers.push({code:'PARTS_REQUIRED'});
  for(const p of brief.parts)if(targets.includes(p.id)&&p.section!=='resolved')blockers.push({code:'PART_SECTION_UNRESOLVED',partId:p.id});
  for(const message of brief.unknowns)blockers.push({code:'SOURCE_UNKNOWN',message});
  if(!selected)blockers.push({code:candidates.length?'FAMILY_SELECTION_REQUIRED':'NO_LEARNED_FAMILY',...(brief.familyId?{requestedFamily:brief.familyId}:{})});
  const ready=blockers.length===0;
  const result={status:ready?'planning_ready':blockers.some(b=>!['FAMILY_SELECTION_REQUIRED','NO_LEARNED_FAMILY'].includes(b.code))?'needs_evidence':'needs_family',canPlan:ready,readOnly:true,sourceEvidenceVerified:false,scope:'source-brief-routing-only',catalogHash:cache.catalogHash,docsHash:cache.docsHash,targetPartIds:targets,referencePartIds:brief.parts.filter(p=>!targets.includes(p.id)).map(p=>p.id),blockers,categoryHintOverridden:!!selected&&!selected.typeIds.includes(brief.typeId),candidateFamilies:candidates.map(f=>({id:f.id,title:f.title,evidence:f.evidence})),selectedFamilyId:selected?.id??null,docIds:['api.product-source','api.reconstruction',...(selected?[selected.docId]:[])],toolIds:selected?.tools??[]};
  if(includeKnowledge)result.knowledge=selectKnowledge(index,cache,{docIds:result.docIds,toolIds:result.toolIds,maxChars});
  return result;
}
