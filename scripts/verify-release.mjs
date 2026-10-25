import {verifyQuickModelPreviews} from './quick-model-preview-contracts.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {readBuildIdentity} from './build-identity.mjs';
import { infoMetadata, getTool, readDocs } from '../src/page-api-docs.js';
import { listOperations } from '../src/operation-registry.js';
import { assertPlacementCoverage } from '../src/placement-policy.js';
import { UI_API_ROUTES } from '../src/ui-api-coverage.js';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {AGENT_ONBOARDING} from '../src/agent-onboarding.js';
import {verifyOperationContracts} from './verify-operation-contracts.mjs';
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'three/addons/libs/fflate.module.js';

const root = resolve(import.meta.dirname, '..');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const outputDirectory=resolve(root,process.argv[2]||process.env.WEBCAD_DIST_DIR||'dist');
const outputJson=path=>json(resolve(outputDirectory,path));
const metadata = infoMetadata();
const {buildId}=readBuildIdentity(root);
const [index, manifest, report] = await Promise.all([
  outputJson('automation/index.json'), outputJson('automation/manifest.json'),
  json('agent/output/API_REFERENCE_COVERAGE.json'),
]);
assertPlacementCoverage();
await verifyQuickModelPreviews(outputDirectory);
for (const [label, actual] of [['index', index.metadata], ['manifest', manifest], ['coverage', report]]) {
  for (const key of ['catalogHash', 'docsHash']) {
    if (actual[key] !== metadata[key]) throw new Error(`${label} ${key} differs from runtime`);
  }
}
if (manifest.version !== metadata.pageApiVersion || report.pageApiVersion !== metadata.pageApiVersion)
  throw new Error('Page API version differs across release artifacts');
if (index.metadata.buildId !== buildId || manifest.buildId !== buildId)
  throw new Error('Build ID differs across page and static discovery artifacts');
const html=await readFile(resolve(outputDirectory,'index.html'),'utf8');
const modulePath=html.match(/<script[^>]*\bsrc="([^"]+)"[^>]*>/)?.[1];
if(!modulePath)throw new Error('Built page has no entry module');
const entry=await readFile(resolve(outputDirectory,modulePath.replace(/^\.\//,'').replace(/^\//,'')),'utf8');
if(!entry.includes(buildId))throw new Error('Built page JavaScript does not contain the current source build identity');
const cards = new Map(index.cards.map(card => [card.id, card]));
for (const op of listOperations()) {
  const id = ['import', 'remove'].includes(op.id) ? (op.id === 'import' ? 'files.import' : 'feature.remove') : op.id;
  if(op.legacyOnly){
    const legacy=getTool({id:op.id});
    if(!legacy.legacyOnly||legacy.replacedBy!==op.replacedBy||!cards.has(op.replacedBy)||cards.has(op.id))throw new Error(`Legacy operation ${op.id} must remain addressable and expose only its replacement in new discovery`);
  }else if (!cards.has(id)||!cards.has(op.id)) throw new Error(`Operation ${op.id} has no discoverable card or route`);
  if (!report.operations.some(item => item.id === op.id && item.placementPolicy))
    throw new Error(`Operation ${op.id} absent from coverage`);
}
for (const [id, route] of Object.entries(UI_API_ROUTES)) {
  if (!report.uiRoutes.some(item => item.id === id)) throw new Error(`UI route ${id} absent from coverage`);
  for (const tool of route.tools) if (!cards.has(tool)) throw new Error(`UI route ${id} misses ${tool}`);
}
const expected = new Set(manifest.tools.map(item => item.id + '.json'));
const actual = (await readdir(resolve(outputDirectory, 'automation/tools'))).filter(name => name.endsWith('.json'));
if (actual.length !== expected.size || actual.some(name => !expected.has(name)))
  throw new Error('Stale or missing generated tool card');
for (const path of ['docs/USER-GUIDE.zh-CN.md', 'automation/frame-placement.js',
  'automation/hardware-practice.js',
  'automation/clevis-practice.js',
  'automation/quickstart.md', 'automation/knowledge.md', 'automation/tool-library.mjs',
  'llms.txt']) await readFile(resolve(outputDirectory, path));
const bootstrap=await outputJson('automation/agent-start.json');
if(bootstrap.pageApiVersion!==metadata.pageApiVersion||bootstrap.catalogHash!==metadata.catalogHash||bootstrap.docsHash!==metadata.docsHash)
  throw new Error('Agent entry differs from current page contracts');
for(const [key,value] of Object.entries(AGENT_ONBOARDING))if(JSON.stringify(bootstrap[key])!==JSON.stringify(value))throw new Error(`Agent entry ${key} differs from handshake`);
for(const path of [bootstrap.startUrl,bootstrap.bootstrapUrl,...Object.entries(bootstrap.localKit).filter(([key])=>key.endsWith('Url')).map(([,value])=>value)])
  await readFile(resolve(outputDirectory,path));
const kit=await outputJson('automation/agent-kit.json');
for(const file of [...kit.files,kit.installer]){
  if(typeof file.url!=='string'||file.url.includes('..')||file.url.startsWith('/')||file.url.includes(':'))throw new Error('Invalid agent kit URL');
  const bytes=await readFile(resolve(outputDirectory,'automation',file.url));
  if(file.sha256!==`sha256:${createHash('sha256').update(bytes).digest('hex')}`||file.sizeBytes!==bytes.length)throw new Error(`Agent kit file verification failed: ${file.url}`);
}
// Contract and skill text changes must ship in the same complete knowledge ZIP.
const knowledgeManifest=await outputJson('automation/agent-knowledge.json');
for(const key of ['buildId','catalogHash','docsHash']){
  const expected=key==='buildId'?buildId:metadata[key];
  if(knowledgeManifest[key]!==expected)throw Error(`Knowledge package ${key} is stale`);
}
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const zipBytes=await readFile(resolve(outputDirectory,'automation',knowledgeManifest.archive.url));
if(zipBytes.length!==knowledgeManifest.archive.sizeBytes||digest(zipBytes)!==knowledgeManifest.archive.sha256)throw Error('Knowledge ZIP identity mismatch');
const unpacked=unzipSync(zipBytes);
if(Object.keys(unpacked).length!==knowledgeManifest.archive.files.length)throw Error('Knowledge ZIP file list mismatch');
for(const file of knowledgeManifest.archive.files){
  const archived=unpacked[file.name],published=await readFile(resolve(outputDirectory,'automation',file.name));
  if(!archived||archived.length!==file.sizeBytes||digest(archived)!==file.sha256||!Buffer.from(archived).equals(published))throw Error(`Stale knowledge ZIP member: ${file.name}`);
}
if(digest(Buffer.from(JSON.stringify(knowledgeManifest.archive.files)))!==knowledgeManifest.knowledgeVersion)throw Error('Knowledge version mismatch');
const skillSource=await readFile(resolve(root,'skills/webcad-page-api/SKILL.md'));
if(!Buffer.from(unpacked['webcad-page-api/SKILL.md']).equals(skillSource))throw Error('Knowledge ZIP skill differs from current source');
for(const [id,text] of Object.entries(index.docs)){
  let live='',cursor;do{const page=readDocs({docId:id,limitChars:16000,...(cursor?{cursor}:{})});live+=page.text;cursor=page.nextCursor;}while(cursor);
  if(text!==live)throw Error(`Stale knowledge doc: ${id}`);
}
const routes=await outputJson('automation/routes.json');
if(!isDeepStrictEqual(routes.routes,UI_API_ROUTES))throw new Error('Agent operation routes differ from UI API routes');
verifyOperationContracts();
for(const method of metadata.methods)if(!cards.get(method)?.contextPolicy)throw Error(`Missing method contextPolicy: ${method}`);
const contextTest=spawnSync(process.execPath,['--test','tests/page-context-policy.test.mjs'],{cwd:root,encoding:'utf8',windowsHide:true});if(contextTest.status!==0)throw Error('Runtime context policy check failed: '+contextTest.stdout+contextTest.stderr);
console.log(`Release gate passed: ${report.operations.length} operations, ${report.executeActions.length} actions, ${report.uiRoutes.length} UI routes; agent entry, kit and operation contracts verified`);
