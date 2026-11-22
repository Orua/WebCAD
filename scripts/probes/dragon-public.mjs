import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import init from 'replicad-opencascadejs';
import {createPageAPI} from '../../src/page-api.js';
import {createCommandService} from '../../src/command-service.js';
import {createReferenceSystem} from '../../src/work-frame.js';
import {CadKernel} from '../../src/cad-kernel.js';
import {bodyState} from '../../src/body-state.js';
import {markTopologySemantics} from '../../src/legacy-topology-policy.js';
import {validateProject} from '../../src/document-validation.js';
// No browser is driven: this probes public request/receipt semantics with the real kernel.
// File serialization below is a headless artifact check, not browser file/UI acceptance.
if(![3,4].includes(process.argv.length)||process.argv[3]&&process.argv[3]!=='--zero-depth')throw new Error('Usage: node scripts/probes/dragon-public.mjs <output-directory> [--zero-depth]');
const zeroDepth=process.argv[3]==='--zero-depth';
const output=path.resolve(process.argv[2]);fs.mkdirSync(output,{recursive:true});
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
  const referenceSystem=createReferenceSystem();
  let document={version:2,documentId:'dragon-probe-document',name:'盘龙复杂实体探针',referenceSystem,features:[],imports:{}},bodies=[],revision=0;
  const identity={sessionId:'dragon-probe-session',documentId:'dragon-probe-document',documentInstanceId:'dragon-probe-instance'};
  const service=createCommandService({
    allowAdvisory:true,
    snapshot:()=>({...identity,revision,documentName:document.name,features:structuredClone(document.features),bodies:structuredClone(bodies),selectedIds:[],selectedTopology:null,busy:false,kernelReady:true,dirty:revision>0,preview:false,referenceSystem}),
    execute:async(command,args)=>{
      assert.equal(command,'add_feature');
      const feature=markTopologySemantics({id:`feature-${document.features.length+1}`,op:args.op,params:args.params,refs:args.refs,name:args.name,...(args.placement?{placement:args.placement,semanticsVersion:2}:{})});
      const next={...document,features:[...document.features,feature]};validateProject(next);const result=await kernel.rebuild(next,{headless:true});
      document=next;bodies=result.bodies.map(bodyState);revision++;
    },
  });
  const api=createPageAPI({buildId:'test',state:()=>service.getState({sessionId:identity.sessionId,include:['summary','features','bodies']}),display:()=>({status:'not_rendered'}),execute:input=>service.execute(input),measure:input=>input.kind==='region'?kernel.measureRegion(input.bodyId,input.minMm,input.maxMm):kernel.measure(input.bodyId,input.kind,input.topologyId),files:async()=>({status:'read'}),confirmSaved:async()=>({saved:true})});

const evidence={kind:'public-page-api-command-service-real-occt',visualStatus:'NOT_REVIEWED',zeroDepthExperiment:zeroDepth,steps:[],failures:[]};
const world={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
async function add(name,op,params,refs=[]){
  const card=api.getTool({id:op}),before=api.getState();
  const r=await api.execute({context:api.createRequestContext(before.context),idempotencyKey:'dragon-'+name,action:'feature.add',args:{op,opVersion:card.version,schemaHash:card.schemaHash,params,refs,name,...(['ellipsoid','curveSweep'].includes(op)?{placement:world}:{})}});
  evidence.steps.push({name,op,result:r});
  fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));
  assert.equal(r.status,'committed',JSON.stringify(r));
  const id=r.createdBodyIds[0],m=await api.measure({context:api.createRequestContext(api.getState().context),bodyId:id});
  assert.equal(m.status,'read',JSON.stringify(m));assert.equal(m.solidCount,1,name);assert.ok(m.volume>0,name);
  evidence.steps.at(-1).measure=m;
  const report=api.getState().bodies.find(b=>b.id===id)?.projectedGrooveReport;
  if(op==='projectedGroove'){assert.ok(report);assert.equal(report.crossingCount,1);assert.equal(report.variableWidth,true);evidence.steps.at(-1).projectedGrooveReport=report;}console.log(name,id,m.volume);return id;
}
try{
  const points=Array.from({length:21},(_,i)=>{const t=-2.5*Math.PI+2.5*Math.PI*i/20;return [28*Math.cos(t),28*Math.sin(t),5+30*i/20];});
  const body=await add('盘绕龙身','curveSweep',{pathType:'spline',points,radius:3.8,tolerance:.02});
  const head=await add('头部体积','ellipsoid',{radiiMm:[8,6,7],centerMm:[28,0,37]});
  const groovePoints=Array.from({length:7},(_,i)=>{const x=23+i;return [x,-2,37+7*Math.sqrt(1-((x-28)/8)**2-(-2/6)**2)];});
  const carved=await add('额头变宽刻槽','projectedGroove',{pointsMm:groovePoints,widthLaw:{kind:'spline',samples:[[0,.2],[.5,1],[1,.2]]},...(zeroDepth?{depthLaw:{kind:'spline',samples:[[0,0],[.5,.6],[1,0]]}}:{depthMm:.6})},[head]);
  let dragon=await add('颈头融合','union',{},[body,carved]);
  for(const [name,center,radii] of [['吻部',[35,0,35],[7,4.5,3.5]],['左眉骨',[31,-4.3,40],[3,2,2]],['右眉骨',[31,4.3,40],[3,2,2]]]){const part=await add(name,'ellipsoid',{radiiMm:radii,centerMm:center});dragon=await add(name+'融合','union',{},[dragon,part]);}
  for(const y of [-3,3]){const horn=await add('角'+y,'curveSweep',{pathType:'spline',points:[[26,y,41],[24,y*1.2,46],[27,y*1.5,50]],radius:1.1,tolerance:.02});dragon=await add('角融合'+y,'union',{},[dragon,horn]);}
  const shape=kernel.shapes.get(dragon);const checker=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);try{assert.equal(checker.IsValid(),true);}finally{checker.delete();}
  fs.writeFileSync(path.join(output,'dragon-recipe.webcad'),JSON.stringify(document,null,2));
  const baked=kernel.bakeProject(document);const {encodeProjectV4}=await import('../../src/project-container.js');fs.writeFileSync(path.join(output,'dragon.webcad'),encodeProjectV4({...baked.document,version:4,binaryAssets:baked.document.binaryAssets||{}}));
  const step=await kernel.export('step');fs.writeFileSync(path.join(output,'dragon.step'),step.data);
  evidence.final={id:dragon,measure:kernel.measure(dragon),valid:true,featureCount:document.features.length,baked:baked.baked};
  const {decodeProject}=await import('../../src/project-container.js');const restored=new CadKernel(oc);
  try{const decoded=await decodeProject(fs.readFileSync(path.join(output,'dragon.webcad')));validateProject(decoded);const reopened=await restored.rebuild(decoded,{headless:true});assert.equal(reopened.bodies.length,1);assert.equal(reopened.bodies[0].solidCount,1);assert.ok(Math.abs(reopened.bodies[0].volume-evidence.final.measure.volume)<.001);evidence.reopen={solidCount:reopened.bodies[0].solidCount,volumeMm3:reopened.bodies[0].volume};}finally{restored.dispose();}
}catch(error){fs.writeFileSync(path.join(output,'partial-recipe.webcad'),JSON.stringify(document,null,2));evidence.failures.push({message:error.message,stack:error.stack});process.exitCode=1;console.error(error);}
finally{fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));kernel.dispose();}
