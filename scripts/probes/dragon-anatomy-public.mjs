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
const output=path.resolve(process.argv[2]||'artifacts/dragon-anatomy');
const headOnly=process.argv.includes('--head-only');fs.mkdirSync(output,{recursive:true});
const oc=await init({wasmBinary:fs.readFileSync(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc);
const referenceSystem=createReferenceSystem(),identity={sessionId:'anatomy-probe',documentId:'anatomy-dragon',documentInstanceId:'anatomy-probe-instance'};
let document={version:2,documentId:identity.documentId,name:'东方龙解剖阶段：开颌、分叉角与钩爪',referenceSystem,features:[],imports:{}},bodies=[],revision=0;
const evidence={kind:'public-page-api-command-service-real-occt',visualStatus:'NOT_REVIEWED',level:'ANATOMY_COMPONENT_STAGE',steps:[],failures:[]};
const service=createCommandService({allowAdvisory:true,snapshot:()=>({...identity,revision,documentName:document.name,features:structuredClone(document.features),bodies:structuredClone(bodies),selectedIds:[],selectedTopology:null,busy:false,kernelReady:true,dirty:revision>0,preview:false,referenceSystem}),execute:async(command,args)=>{
 assert.equal(command,'add_feature');
 const feature=markTopologySemantics({id:`anatomy-${document.features.length+1}`,op:args.op,params:args.params,refs:args.refs,name:args.name,...(args.placement?{placement:args.placement,semanticsVersion:2}:{})});
 const next={...document,features:[...document.features,feature]};validateProject(next);const result=await kernel.rebuild(next,{headless:true});document=next;bodies=result.bodies.map(bodyState);revision++;
}});
const api=createPageAPI({buildId:'anatomy-public-probe',state:()=>service.getState({sessionId:identity.sessionId,include:['summary','features','bodies']}),display:()=>({status:'not_rendered'}),execute:input=>service.execute(input),measure:input=>kernel.measure(input.bodyId,input.kind,input.topologyId),files:async()=>({status:'read'}),confirmSaved:async()=>({saved:true})});
const world={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
const checkpoint=()=>{fs.writeFileSync(path.join(output,'probe-evidence.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(output,'recipe.webcad'),JSON.stringify(document,null,2));};
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
 const restored=new CadKernel(oc);try{const reopened=await restored.rebuild(decoded,{headless:true});assert.equal(reopened.bodies.length,bodies.length);for(const b of reopened.bodies){const original=inventory.find(x=>x.id===b.id);assert.ok(Math.abs(b.volume-original.measure.volume)<.002,b.name);}evidence.reopen={bodies:reopened.bodies.length,featureCount:decoded.features.length,sameVolumes:true};}finally{restored.dispose();}
 fs.writeFileSync(path.join(output,'body-inventory.json'),JSON.stringify(inventory,null,2));evidence.final={bodies:bodies.length,features:document.features.length,baked:baked.baked,allBRepValid:true};checkpoint();
}
try{
 let skull=await add('闭合控制笼长吻颊额','subdBody',{cage:skullCage(),brushes:[{mode:'move',centerMm:[9,0,60],radiusMm:18,deltaMm:[0,0,2]}],sampleDepth:3,fitGrid:9,referenceGrid:16,fittingTolerance:.02,sewingTolerance:.02});
 for(const side of [-1,1]){
  const socket=await add('眼眶刀具'+side,'ellipsoid',{centerMm:[10,side*11.8,51.2],radiiMm:[6.4,4.2,4.4]});
  skull=await add('真实内凹眼眶'+side,'cut',{},[skull,socket]);
  await add('嵌入眼球'+side,'ellipsoid',{centerMm:[10.5,side*11.4,51.2],radiiMm:[3.6,2.6,2.7]});
  await add('高起后掠眉脊'+side,'curveSweep',spine([[17,side*10,53],[11,side*12.8,56.5],[3,side*13,57],[-5,side*14,55]],[[0,1.5],[.32,4.5],[.7,3.5],[1,0]],[[0,1.5],[.32,3.5],[.7,2.8],[1,0]],{count:14}));
  const nostril=await add('鼻孔刀具'+side,'ellipsoid',{centerMm:[36,side*6.6,48.8],radiiMm:[3.4,2.8,2.2]});
  skull=await add('外翻鼻孔开口'+side,'cut',{},[skull,nostril]);
 }
 await add('独立上扬下颌与口腔负空间','curveSweep',spine([[-3,0,36],[6,0,30],[21,0,28.8],[35,0,31],[42,0,34]],[[0,13],[.25,21],[.65,16],[1,9]],[[0,11],[.25,7],[.65,5],[1,2.5]],{count:20,up:[0,0,1]}));
 for(const side of [-1,1]){
  for(const [i,x]of [29,18].entries())await add('上颌弯獠牙'+side+'-'+i,'curveSweep',taper([[x,side*5,40.8],[x+1.4,side*5.2,37.5],[x+.2,side*5.1,34.5]],i?1.5:2.5));
  let horn=await add('后掠主角'+side,'curveSweep',taper([[-3,side*8.5,57],[-8,side*13,68],[-15,side*16,81],[-10,side*18,93]],5.6,4.8));
  for(const [i,points]of [[[-11,side*14.5,74],[-22,side*20,80],[-28,side*21,86]],[[-14,side*16,83],[-24,side*16,91],[-21,side*18,97]]].entries()){
   const branch=await add('分叉角枝'+side+'-'+i,'curveSweep',taper(points,3.4,3));horn=await add('角枝实体接合'+side+'-'+i,'union',{},[horn,branch]);
  }
  for(let i=0;i<3;i++)await add('层叠后掠扁鬃'+side+'-'+i,'curveSweep',spine([[-4-i*3,side*(8+i*1.6),55-i*4],[-14-i*3,side*(16+i),57-i*5],[-28-i*4,side*(19+i),48-i*5]],[[0,3.5],[.17,11-i],[.4,6],[1,0]],[[0,2],[.17,3],[.4,2],[1,0]],{count:8,up:[0,0,1]}));
  await add('长卷须'+side,'curveSweep',taper([[35,side*7,43],[48,side*17,38],[45,side*28,45],[31,side*31,54]],2.1));
 }
 if(!headOnly){
  await add('非共面S形变径躯干与尖尾','curveSweep',spine([[-12,0,43],[-26,0,29],[-24,1,13],[-41,4,2],[-62,5,10],[-75,0,29],[-96,-4,29],[-111,0,14],[-121,5,5],[-137,7,10]],[[0,18],[.16,24],[.3,22],[.5,19],[.68,14],[.83,8],[.93,3],[1,0]],[[0,21],[.16,26],[.3,18],[.5,16],[.68,12],[.83,6],[.93,2],[1,0]],{count:48,loftDegree:2}));
  for(const side of [-1,1]){
   await add('弯曲肌肉前肢'+side,'curveSweep',spine([[-25,side*7,23],[-14,side*16,12],[-23,side*22,2],[-18,side*23,-3]],[[0,10],[.2,12],[.55,6],[1,4.5]],[[0,12],[.2,10],[.55,6],[1,3.8]],{count:20}));
   for(let i=0;i<3;i++)await add('分开的弯钩爪趾'+side+'-'+i,'curveSweep',taper([[-19+i*2,side*(21+i),-2],[-25+i*10,side*(28+i*2),-4],[-25+i*10,side*(33+i),-7],[-28+i*10,side*(33+i),-12]],3.7,3.2));
  }
 }
 await save();
}catch(error){evidence.failures.push({message:error.message,stack:error.stack});console.error(error);try{await save();}catch(saveError){evidence.failures.push({phase:'save-last-stable',message:saveError.message});}process.exitCode=1;}
finally{checkpoint();kernel.dispose();}
