import {mkdir,readFile,readdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {listOperations} from '../src/operation-registry.js';
import {QUICK_MODEL_PREVIEWS} from '../src/quick-models/preview-assets.js';
import policy from '../contracts/services/v1/execution-routing.json' with {type:'json'};

// Explicit static assets only. No examples, trial samples, installers, host software,
// production configuration, user attachments or arbitrary files at public/ root.
export const PUBLIC_ASSET_RULES=Object.freeze([
  /^vector-dwg-worker\.js$/, /^web\.config$/, /^llms\.txt$/,
  /^render-assets\/[\w.-]+\.(?:bin|jpg|txt)$/,
  /^quick-model-previews\/[\w./-]+\.(?:svg|png|json)$/,
  /^docs\/[\w./-]+\.md$/,
  /^automation\/(?:docs\/[\w.-]+\.md|tools\/[\w.-]+\.json)$/,
  /^automation\/(?:index\.(?:json|md|html)|manifest\.json|knowledge\.md|quickstart\.md|agent-knowledge\.json|agent-routing\.json|routes\.json|agent-bundle\.zip|runtime-uuid\.js|tool-library\.mjs|frame-placement\.js|hardware-practice\.js|clevis-practice\.js)$/,
  /^automation\/webcad-page-api\/(?:SKILL\.md|references\/connection\.md)$/,
]);
const referencedPreviews=new Set(Object.values(QUICK_MODEL_PREVIEWS).flatMap(asset=>[asset.image,asset.guide]));
export function publicAssetAllowed(path){return !path.split('/').some(p=>p==='..'||p.startsWith('.'))&&
  (!path.startsWith('quick-model-previews/')||referencedPreviews.has(path))&&PUBLIC_ASSET_RULES.some(rule=>rule.test(path));}
export function assertPublicModules(modules){
  const forbidden=modules.filter(id=>/(?:^|\/)src\/(?:agent\/(?:assistant-panel|host-adapter)\.(?:js|css)|editions\/integrated-host\.js|ai-bridge\.js|host-control\.(?:js|css)|transfer\/chunked-upload\.js)(?:\?|$)/.test(id.replaceAll('\\','/')));
  if(forbidden.length)throw new Error('Public build contains host startup modules: '+forbidden.join(', '));
}
export function assertPublicOutputPaths(paths,emittedFiles){
  const emitted=new Set(emittedFiles);
  for(const path of paths){
    if(emitted.has(path)||publicAssetAllowed(path)||
      /^(?:index\.html|edition\.json|edition\.sha256|build-modules\.json|public-feature-parity\.json|open-source-notices\.html)$/.test(path)||
      /^open-source\//.test(path)||
      /^cad-viewer\/(?:open-source-notices\.html|bindings\/libredwg-web\.js|wasm\/libredwg-web\.(?:js|wasm)|LICENSES\/(?:MIT|GPL-3\.0-or-later)\.txt)$/.test(path))continue;
    throw new Error('Unapproved or stale public output: '+path);
  }
}
export async function verifyPublicOutput(directory){
  const graph=JSON.parse(await readFile(resolve(directory,'build-modules.json'),'utf8'));
  if(graph.edition!=='public'||!Array.isArray(graph.modules)||!Array.isArray(graph.emittedFiles))throw Error('Public module inventory missing');
  assertPublicModules(graph.modules);
  const paths=[];
  async function walk(part=''){
    for(const entry of await readdir(resolve(directory,part),{withFileTypes:true})){
      const path=part?part+'/'+entry.name:entry.name;
      if(entry.isSymbolicLink())throw Error('Public output contains symlink: '+path);
      if(entry.isDirectory())await walk(path);else paths.push(path);
    }
  }
  await walk();assertPublicOutputPaths(paths,graph.emittedFiles);
}
async function copyAllowed(root,out,part=''){
  for(const entry of await readdir(resolve(root,'public',part),{withFileTypes:true})){
    const path=part?part+'/'+entry.name:entry.name;
    if(entry.isSymbolicLink())throw new Error('Static public assets cannot be symlinks: '+path);
    if(entry.isDirectory())await copyAllowed(root,out,path);
    else if(entry.isFile()&&publicAssetAllowed(path)){
      await mkdir(dirname(resolve(out,path)),{recursive:true});
      await copyFile(resolve(root,'public',path),resolve(out,path));
    }
  }
}
export function editionBuildPlugin(root,identity){
  let out;const modules=new Set(),emittedFiles=new Set();
  const isPublic=identity.edition==='public';
  return {name:'edition-boundary',
    configResolved(config){out=resolve(config.root,config.build.outDir);},
    transformIndexHtml(html){return isPublic?html.replace(/<link[^>]+href="\.\/automation\/agent-start\.(?:json|html)"[^>]*>/g,'')
      .replace(/<meta name="webcad-agent"[^>]*>/g,''):html;},
    generateBundle(_options,bundle){
      for(const path of Object.keys(bundle))emittedFiles.add(path);
      for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules))modules.add(id);
      if(isPublic)assertPublicModules([...modules]);
    },
    async closeBundle(){
      if(isPublic)await copyAllowed(root,out);
      const moduleIds=[...modules].map(id=>id.replaceAll('\\','/')).map(id=>id.startsWith(root.replaceAll('\\','/')+'/')?id.slice(root.length+1):id.includes('/node_modules/')?'node_modules/'+id.split('/node_modules/').at(-1):id.startsWith('\0')?'virtual-module':'external-module').sort();
      const capabilities={schemaVersion:1,edition:identity.edition,buildId:identity.buildId,
        agentWorkspace:!isPublic,hostChannels:!isPublic,localPageApi:true,
        services:isPublic?'explicit-same-origin-visitor-session':'explicit-configuration',
        distributionGate:'NOT_ACCEPTED',browserAcceptance:'NOT_RUN',
        unavailableMethods:isPublic?['configureAgentPanel','setAgentPanel','markLocation']:[]};
      await writeFile(resolve(out,'edition.json'),JSON.stringify(capabilities,null,2)+'\n');
      await writeFile(resolve(out,'build-modules.json'),JSON.stringify({edition:identity.edition,modules:moduleIds,emittedFiles:[...emittedFiles].sort()},null,2)+'\n');
      if(isPublic){
        const parity={schemaVersion:1,buildId:identity.buildId,status:'PARTIAL_PENDING_ACCEPTANCE',
          remoteCompute:'Explicit same-origin visitor compute; requires isolationVersion 1 endpoint and live acceptance',
          operations:listOperations().filter(op=>!op.legacyOnly).map(op=>({id:op.id,
            integratedPath:policy.servicesEligibleOperations.includes(op.id)?'conditional-services-or-local':'local',
            publicPath:policy.servicesEligibleOperations.includes(op.id)?'conditional-same-origin-services-or-local':'local',acceptance:'NOT_RUN',
            remoteDifference:policy.servicesEligibleOperations.includes(op.id)?'VISITOR_LIMITS_AND_LIVE_ENDPOINT_ACCEPTANCE_REQUIRED':'none-identified'})),
          workflows:['create-edit-undo-redo','save-reopen-final-geometry','STEP-BREP-import-STEP-export','offline-loaded-core'].map(id=>({id,acceptance:'NOT_RUN'}))};
        await writeFile(resolve(out,'public-feature-parity.json'),JSON.stringify(parity,null,2)+'\n');
        // Integrity inventory is evidence, never permission to distribute.
        const bytes=await readFile(resolve(out,'edition.json'));
        await writeFile(resolve(out,'edition.sha256'),createHash('sha256').update(bytes).digest('hex')+'\n');
      }
    }};
}
