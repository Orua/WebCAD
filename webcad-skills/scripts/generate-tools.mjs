import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv.includes('--repo'))throw Error('Explicit --repo is required');
const repo=resolve(process.argv[process.argv.indexOf('--repo')+1]);
const {getTool,infoMetadata}=await import(pathToFileURL(join(repo,'src/page-api-docs.js')));
const {UI_API_ROUTES}=await import(pathToFileURL(join(repo,'src/ui-api-coverage.js')));
const cat=JSON.parse(await readFile(join(root,'catalog.json')));
const ids=[...new Set(cat.routes.flatMap(r=>r.branches.flatMap(b=>b.tools)))].sort();
await mkdir(join(root,'tools/cards'),{recursive:true});
const index=[];for(const id of ids){const c=getTool({id});const data=JSON.stringify(c,null,2)+'\n';await writeFile(join(root,'tools/cards',id+'.json'),data);index.push({id,version:c.version,schemaHash:c.schemaHash??null,docsHash:c.docsHash,file:'tools/cards/'+id+'.json',sizeBytes:Buffer.byteLength(data),sha256:createHash('sha256').update(data).digest('hex')});}
const routes=Object.entries(UI_API_ROUTES).filter(([,r])=>r.tools.some(t=>ids.includes(t))).map(([action,r])=>({action,...r,uncachedTools:r.tools.filter(t=>!ids.includes(t))}));
// Additional UI tools are discoverable live, never silently treated as bundled.
for(const r of routes)for(const id of r.tools)getTool({id});
await writeFile(join(root,'tools/index.json'),JSON.stringify(index,null,2)+'\n');
await writeFile(join(root,'tools/ui-routes.json'),JSON.stringify({scope:'related actual UI routes; uncachedTools fetched live if used',routes},null,2)+'\n');
const m=infoMetadata(),q=getTool({id:'quickModel'});
await writeFile(join(root,'tools/template-adapter.json'),JSON.stringify({source:'generated from current getTool(quickModel)',id:q.id,version:q.version,schemaHash:q.schemaHash,docsHash:q.docsHash,usage:q.usage,templates:ids.filter(i=>i.startsWith('template.')),policy:'run add fills current parent version/hash; load full selected template card, never all-template parent catalogue by default'},null,2)+'\n');
const tracked=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:repo,encoding:'utf8'}).trim();
await writeFile(join(root,'manifest.json'),JSON.stringify({name:'webcad-modeling-methods',version:cat.version,entry:'SKILL.md',catalog:'catalog.json',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),trackedChanges:!!tracked,compatibility:{pageApiVersion:m.pageApiVersion,catalogHash:m.catalogHash,docsHash:m.docsHash,basis:'current worktree fingerprints; verify actual page before execution'},dependencyPolicy:'static methods on disk; live authorized WebCAD page; no second engine',integration:'not installed or wired into production model requests',validation:'tests/results.json',toolCount:index.length},null,2)+'\n');
console.log(JSON.stringify({tools:index.length,uiRoutes:routes.length,version:m.pageApiVersion}));
