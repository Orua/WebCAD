import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {load,root} from '../scripts/load.mjs';
const j=async f=>JSON.parse(await readFile(join(root,f),'utf8'));
const source=await j('references/source-coverage.json'),repo=JSON.parse(gunzipSync(await readFile(join(root,'references/repository-disposition.json.gz'))));
assert.equal(source.files.length,106);assert.equal(source.files.filter(f=>f.path.startsWith('skills/')).length,92);assert.equal(new Set(source.files.filter(f=>f.path.startsWith('skills/')).map(f=>f.skillGroup)).size,14);
for(const f of source.files){assert.ok(f.sha256.length===64&&f.reason&&f.disposition&&f.review);for(const d of f.destinations)assert.ok((await stat(join(root,d))).isFile(),f.path+' -> '+d);}
assert.equal(repo.length,2895);for(const f of repo)assert.ok(f.sha256&&f.reason&&f.disposition&&f.review);
const tasks=[['按源图复刻五金','source-reconstruction','source'],['解析轮廓导入DXF','profiles-2d','read'],['轮廓断点修复','profiles-2d','repair'],['等距偏移轮廓','profiles-2d','offset'],['生成三视图工程图','drawings','drawing'],['CNC型腔刀具检查','manufacturing','cnc'],['检查注塑拔模','manufacturing','molding'],['钣金折弯展开料','manufacturing','sheet'],['可打印支撑检查','printability','inspect'],['轴承标准件导入','part-reuse','import'],['圆周阵列分度','part-reuse','circular'],['等距复制重复件','part-reuse','linear'],['按密度计算重量估重','material-properties','mass'],['制造交接发到打印机','handoff','artifacts'],['机器人仿真','handoff','artifacts']];
let maxPlanChars=0;for(const [task,id,branch] of tasks){const r=await load(task);assert.ok(r.matches.some(x=>x.id===id&&x.branch===branch),JSON.stringify({task,matches:r.matches}));assert.ok(r.files.includes('GUIDE.md'));assert.ok(r.contextChars<=24000);assert.ok(r.toolIds.length===0);maxPlanChars=Math.max(maxPlanChars,r.contextChars);}
const single=await load('',{tool:'inspectDraft'});assert.deepEqual(single.toolIds,['inspectDraft']);assert.ok(!single.files.includes('GUIDE.md'));await assert.rejects(()=>load('',{tool:'made-up-CAD-tool'}),/Unknown bundled tool/);
for(const name of ['source-reconstruction','profiles-and-drawings','process-aware-modeling','parts-and-repetition','representations-units-and-mass','external-handoff']){const text=await readFile(join(root,'methods',name+'.md'),'utf8');assert.ok(text.length>500,name+' is too thin');}
console.log(JSON.stringify({status:'passed',installedFilesDisposed:106,skillFiles:92,skillGroups:14,repositoryFilesDisposed:2895,newSemanticTasks:tasks.length,maxPlanChars,scope:'method applicability and artifact closure; not new geometry or model A/B'}));
