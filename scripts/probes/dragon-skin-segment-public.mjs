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
import {encodeProjectV4,decodeProject} from '../../src/project-container.js';
if(!process.argv[2]||!process.argv[3]||!process.argv[4])throw new Error("Usage: node scripts/probes/dragon-skin-segment-public.mjs <output-dir> <base-recipe.webcad> <audit.json>");
const output=path.resolve(process.argv[2]||'artifacts/surface-pattern-public');
const headOnly=process.argv.includes('--head-only');fs.mkdirSync(output,{recursive:true});
const oc=await init({wasmBinary:fs.readFileSync(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
const referenceSystem=createReferenceSystem(),identity={sessionId:'anatomy-probe',documentId:'anatomy-dragon',documentInstanceId:'anatomy-probe-instance'};
let document={version:2,documentId:identity.documentId,name:'东方龙v4：长躯、自然颌根、四肢与顺脊甲列',referenceSystem,features:[],imports:{}},bodies=[],revision=0;
const evidence={kind:'public-page-api-command-service-real-occt',visualStatus:'NOT_REVIEWED',level:'ANATOMY_COMPONENT_STAGE',steps:[],failures:[]};
const service=createCommandService({allowAdvisory:true,snapshot:()=>({...identity,revision,documentName:document.name,features:structuredClone(document.features),bodies:structuredClone(bodies),selectedIds:[],selectedTopology:null,busy:false,kernelReady:true,dirty:revision>0,preview:false,referenceSystem}),execute:async(command,args)=>{
 assert.equal(command,'add_feature');
 const feature=markTopologySemantics({id:`anatomy-${document.features.length+1}`,op:args.op,params:args.params,refs:args.refs,name:args.name,...(args.placement?{placement:args.placement,semanticsVersion:2}:{})});
 const next={...document,features:[...document.features,feature]};validateProject(next);const result=await kernel.rebuild(next,{headless:true});document=next;bodies=result.bodies.map(bodyState);revision++;
}});
const api=createPageAPI({buildId:'anatomy-public-probe',state:()=>service.getState({sessionId:identity.sessionId,include:['summary','features','bodies']}),display:()=>({status:'not_rendered'}),execute:input=>service.execute(input),measure:input=>input.kind==='region'?kernel.measureRegion(input.bodyId,input.minMm,input.maxMm):kernel.measure(input.bodyId,input.kind,input.topologyId),files:async()=>({status:'read'}),confirmSaved:async()=>({saved:true})});
const world={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
let writingAudit=false;const checkpoint=()=>{fs.writeFileSync(path.join(output,'probe-evidence.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(output,writingAudit?'contact-audit-recipe.webcad':'recipe.webcad'),JSON.stringify(document,null,2));};
async function add(name,op,params,refs=[]){
 const card=api.getTool({id:op}),args={op,opVersion:card.version,schemaHash:card.schemaHash,params,refs,name,...(card.placementPolicy?.placementSupported?{placement:world}:{})};
 const request={context:api.createRequestContext(api.getState().context),idempotencyKey:`anatomy-${evidence.steps.length}-${name}`,action:'feature.add',args},started=performance.now();
 const result=await api.execute(request);evidence.steps.push({name,op,request,result,elapsedMs:performance.now()-started});checkpoint();
 assert.equal(result.status,'committed',name+': '+JSON.stringify(result));const id=result.createdBodyIds[0];
 const measure=await api.measure({context:api.createRequestContext(api.getState().context),bodyId:id});assert.equal(measure.status,'read');assert.equal(measure.solidCount,1,name);assert.ok(measure.volume>0,name);evidence.steps.at(-1).measure=measure;
 const body=api.getState().bodies.find(b=>b.id===id);if(body?.loftReport)evidence.steps.at(-1).loftReport=body.loftReport;if(body?.subdApproximation)evidence.steps.at(-1).subdApproximation=body.subdApproximation;
 const loft=body?.loftReport;if(loft){assert.ok(loft.ratio>=.7&&loft.ratio<=1.3,name+': implausible loft material ratio '+loft.ratio);assert.ok(!loft.envelopeWarning,name+': loft escaped intended station envelope '+JSON.stringify(loft.envelopeWarning));}
 checkpoint();console.log(JSON.stringify({name,id,volumeMm3:measure.volume,elapsedMs:Math.round(performance.now()-started)}));return id;
}
const law=samples=>({kind:'spline',samples});
const spine=(points,widths,depths,{count=16,up=[0,0,1],...extra}={})=>({pathType:'spine',spine:{kind:'bspline',pointsMm:points},stations:{count,distribution:'uniform'},widthLaw:law(widths),depthLaw:law(depths),rollMode:'absolute',lawSampling:'preserveKnots',upHint:up,loftDegree:3,tolerance:.01,...extra});
const taper=(points,width,depth=width,extra={})=>spine(points,[[0,width],[.3,width*.9],[.7,width*.48],[1,0]],[[0,depth],[.3,depth*.85],[.7,depth*.4],[1,0]],{count:12,...extra});
function skullCage(){
 const sections=[[-11,0,43,20,24],[-2,0,48,31,29],[9,0,49,28,25],[21,0,44,18,13],[34,0,45,18,11],[42,0,47,13,10]],vertices=[],faces=[];
 for(const [x,y,z,w,d]of sections)for(let i=0;i<8;i++){const a=2*Math.PI*i/8;vertices.push([x,y+w/2*Math.cos(a),z+d/2*Math.sin(a)]);}
 for(let r=0;r<sections.length-1;r++)for(let i=0;i<8;i++)faces.push([r*8+i,r*8+(i+1)%8,(r+1)*8+(i+1)%8,(r+1)*8+i]);
 for(const [r,sign]of [[0,-1],[sections.length-1,1]]){const section=sections[r],c=vertices.length;vertices.push(section.slice(0,3));for(let i=0;i<8;i+=2){const f=[c,r*8+i,r*8+(i+1)%8,r*8+(i+2)%8];faces.push(sign<0?f.toReversed():f);}}
 return {vertices,faces};
}
async function save(){
 if(!document.features.length)return;validateProject(document);const inventory=[];
 for(const body of bodies){const shape=kernel.shapes.get(body.id),check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);try{assert.equal(check.IsValid(),true,body.name);}finally{check.delete();}inventory.push({id:body.id,name:body.name,measure:kernel.measure(body.id),relation:'intentional editable component; no global fusion claimed'});}
 const baked=kernel.bakeProject(document),bytes=encodeProjectV4({...baked.document,version:4,binaryAssets:baked.document.binaryAssets||{}});fs.writeFileSync(path.join(output,'anatomy-dragon.webcad'),bytes);
 const decoded=await decodeProject(bytes);validateProject(decoded);assert.ok(decoded.features.filter(f=>f.placement).every(f=>f.semanticsVersion===2));
 const reopenStarted=performance.now(),restored=new CadKernel(oc);try{const reopened=await restored.rebuild(decoded,{headless:true});assert.equal(reopened.bodies.length,bodies.length);for(const original of bodies.filter(b=>b.projectedGrooveReport)){const restoredBody=reopened.bodies.find(b=>b.id===original.id);assert.equal(restoredBody.projectedGrooveReport?.method,original.projectedGrooveReport.method);assert.equal(restoredBody.projectedGrooveReport?.instanceCount,original.projectedGrooveReport.instanceCount);}for(const b of reopened.bodies){const original=inventory.find(x=>x.id===b.id);assert.ok(Math.abs(b.volume-original.measure.volume)<.002,b.name);}evidence.reopen={bodies:reopened.bodies.length,featureCount:decoded.features.length,sameVolumes:true,elapsedMs:performance.now()-reopenStarted};}finally{restored.dispose();}
 fs.writeFileSync(path.join(output,'body-inventory.json'),JSON.stringify(inventory,null,2));evidence.final={bodies:bodies.length,features:document.features.length,baked:baked.baked,allBRepValid:true};checkpoint();
}

const sum=(...vs)=>vs[0].map((_,i)=>vs.reduce((s,v)=>s+v[i],0)),mul=(v,s)=>v.map(x=>x*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>mul(v,1/Math.hypot(...v));
const frameAt=(frames,t)=>frames.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a);
const report=id=>api.getState().bodies.find(b=>b.id===id).loftReport;
async function join(name,a,b){
 const av=(await api.measure({context:api.createRequestContext(api.getState().context),bodyId:a})).volume,bv=(await api.measure({context:api.createRequestContext(api.getState().context),bodyId:b})).volume;
 const id=await add(name,'union',{requireConnected:true,verifyMaterial:true},[a,b]);
 const volume=evidence.steps.at(-1).measure.volume,overlapMm3=av+bv-volume;
 assert.ok(volume>Math.max(av,bv)+.01,name+': each component must retain an extending region');assert.ok(overlapMm3>.001,name+': joint must have positive overlap');
 evidence.steps.at(-1).contactProof={requireConnected:true,verifyMaterial:true,sourceVolumesMm3:[av,bv],resultVolumeMm3:volume,overlapMm3};checkpoint();return id;
}



try{
 const base=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),failed=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));
 document.name='东方龙v5中段试片：真实曲面26处错列凹鳞（非全龙）';
 const sourceParams=base.features.find(f=>f.id==='anatomy-56').params,patternParams=failed.steps.find(s=>s.op==='projectedGroove').request.args.params;
 const source=await add('来自龙腹弯至高拱的可编辑连续皮层','curveSweep',sourceParams);
 const id=await add('真实曲面错列凹鳞26处','projectedGroove',patternParams,[source]);
 evidence.pattern=api.getState().bodies.find(b=>b.id===id).projectedGrooveReport;evidence.scope='EXACT_DRAGON_SEGMENT_ONLY_NOT_FULL_DRAGON';
 assert.equal(evidence.pattern.instanceCount,26);assert.equal(evidence.pattern.verifiedCutSampleCount,78);
 await save();
}catch(error){evidence.failures.push({message:error.message,stack:error.stack});console.error(error);process.exitCode=1;}finally{checkpoint();kernel.dispose();}
