import test from 'node:test';
import assert from 'node:assert/strict';
import {planPatternMachining,assertPatternExecution,imageToReliefPoint,reliefToImagePoint,uiPatternIntent,intentForUIParameterEdit} from '../src/machining-intent.js';
import {createPageAPI} from '../src/page-api.js';
import {createCommandService} from '../src/command-service.js';
import {getOperation} from '../src/operation-registry.js';
import {CadKernel} from '../src/cad-kernel.js';
import {getTool,readDocs} from '../src/page-api-docs.js';
import {createReferenceSystem} from '../src/work-frame.js';
import {readReliefImage,heightValuesFromRgba} from '../src/relief-image.js';
import {reliefContours} from '../src/relief-contours.js';

const sourceHash='d5f01e5d15c63cfc3aaf2878cc7f8259033dd9db4747fdacdb32bc3af36770b9';
const base={version:1,requestedGeometry:'constantDepthContours',sourceInterpretation:'reviewedVectors',userIntentEvidence:'stripes.png 居中做凹线条，凹下0.4mm',direction:'engrave',sourceHash,
 dimensionsMm:{width:24.55,height:28},specifiedDepthsMm:[.4],preserve:['原图空白与孔洞'],supportBinding:{bodyId:'plate',geometryFingerprint:'current-geometry'},placementSnapshot:{origin:[25,20,2.5],quaternion:[0,0,0,1]}};
const logoParams={depth:.4,mode:'engrave',source:{kind:'reviewed-contours',reviewed:true,original:{sha256:sourceHash}},machiningIntent:base};

test('R01/R04/R09 constant depth ignores subject/color and retains confirmed depth',()=>{
 for(const text of [base.userIntentEvidence,'彩色商标整体凸起0.4mm','上文凹0.4mm已确认，本次只改居中']){
  const result=planPatternMachining({...base,userIntentEvidence:text});assert.equal(result.route,'logo');assert.equal(result.canExecute,true);assert.deepEqual(result.requiredTools,['logo']);assert.equal(result.intent.specifiedDepthsMm[0],.4);
 }
 const raster=planPatternMachining({...base,sourceInterpretation:'rasterArtwork'});assert.equal(raster.route,'logo');assert.equal(raster.canExecute,false);assert(raster.capabilityBlockers.some(b=>b.code==='SOURCE_PREPARATION_REQUIRED'));
 assertPatternExecution('logo',logoParams,{required:true});
 assert.throws(()=>assertPatternExecution('relief',logoParams),{code:'MACHINING_INTENT_CONFLICT'});
 assert.throws(()=>assertPatternExecution('logo',{...logoParams,depth:.3}),{code:'MACHINING_INTENT_CONFLICT'});
 assert.throws(()=>assertPatternExecution('logo',{...logoParams,mode:'emboss'}),{code:'MACHINING_INTENT_CONFLICT'});
});
test('R02/R03/R06/R07/R08 preserve the goal and expose unavailable semantics',()=>{
 const tiger=planPatternMachining({...base,requestedGeometry:'continuousRelief',sourceInterpretation:'shadedReference',targetPeakMm:2.8});
 assert.equal(tiger.route,'continuous-relief');assert.equal(tiger.canExecute,false);assert(tiger.reasonCodes.includes('LIGHTING_IS_NOT_DEPTH'));assert.equal(tiger.fallbackAllowed,false);assert(tiger.capabilityBlockers.some(b=>b.code==='CONTINUOUS_SCULPT_UNAVAILABLE'));
 const authored=planPatternMachining({...base,requestedGeometry:'continuousRelief',sourceInterpretation:'authoredHeightMap'});assert.equal(authored.canExecute,true);
 const peak=planPatternMachining({...authored.intent,targetPeakMm:2.8});assert(peak.capabilityBlockers.some(b=>b.code==='TARGET_PEAK_UNAVAILABLE'));
 const layer=planPatternMachining({...base,requestedGeometry:'layeredRelief',specifiedDepthsMm:[.3,.8,1.2]});assert.equal(layer.route,'layered-relief');assert.equal(layer.canExecute,true);
 const mixed=planPatternMachining({...base,requestedGeometry:'mixed'});assert.equal(mixed.route,'mixed');assert.equal(mixed.canExecute,false);assert.deepEqual(mixed.requiredTools,['relief','logo']);
 assert.throws(()=>assertPatternExecution('relief',{machiningIntent:tiger.intent,values:[]}),{code:'MACHINING_INTENT_CONFLICT'});
 assert.throws(()=>assertPatternExecution('logo',{...logoParams,machiningIntent:layer.intent}),{code:'MACHINING_INTENT_CONFLICT'});
 assert.throws(()=>assertPatternExecution('logo',{...logoParams,source:{sha256:'0'.repeat(64)}}),{code:'MACHINING_INTENT_CONFLICT'});
});
test('R05 asks only for unresolved intent; schema does not coerce or fabricate evidence',()=>{
 const ambiguous=planPatternMachining({...base,requestedGeometry:'unspecified',userIntentEvidence:'做上去'});assert.equal(ambiguous.route,'needs-intent');assert.equal(ambiguous.canExecute,false);assert.deepEqual(ambiguous.requiredTools,[]);assert(ambiguous.missingInputs.includes('requestedGeometry'));
 for(const bad of [{...base,userIntentEvidence:' '},{...base,sourceHash:'fake'},{...base,targetPeakMm:'2.8'},{...base,extra:true}])assert.throws(()=>planPatternMachining(bad));
});
test('source interpretation fails before decoding; height and mask use Y up without a second flip',async()=>{
 const blob=new Blob(['not a decoded image']);
 await assert.rejects(readReliefImage(blob,{name:'reference.png',sourceInterpretation:'shadedReference'}),{code:'MACHINING_SOURCE_CONFLICT'});
 await assert.rejects(readReliefImage(blob,{name:'art.png',sourceInterpretation:'rasterArtwork',style:'grayscale'}),{code:'MACHINING_SOURCE_CONFLICT'});
 const w=17,h=17,rgba=new Uint8ClampedArray(w*h*4);for(let y=2;y<6;y++)for(let x=3;x<7;x++)rgba.set([255,255,255,255],(y*w+x)*4);
 const values=heightValuesFromRgba(rgba,w,h,{whiteHigh:true});assert(values[h-1-3][4]>0);assert.equal(values[3][4],0);
 const regions=reliefContours(values,.5);assert(regions[0].outer.every(p=>p[1]>0),'upper image remains positive relief Y for the mask');
 const p=imageToReliefPoint(4,3,w,h);assert(p[1]>0);const q=reliefToImagePoint(...p,w,h);assert(Math.abs(q[0]-4)<1e-12&&Math.abs(q[1]-3)<1e-12);
 assert.equal(uiPatternIntent('relief',{surfaceMode:'smooth',source:{style:'rounded',sourceInterpretation:'rasterArtwork'}}).sourceInterpretation,'rasterArtwork');
});
test('shared page planner is read-only and rejects stale context; tool is complete',async()=>{
 const context={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:3};let writes=0;
 const api=createPageAPI({state:()=>({context,summary:{busy:false,kernelReady:true},preview:{active:false},bodies:[]}),files:()=>{writes++;},confirmSaved:()=>{writes++;}});
 const request={context:{...context,expectedRevision:3},intent:base};delete request.context.revision;
 const result=await api.planPatternMachining(request);assert.equal(result.route,'logo');assert.equal(writes,0);
 assert.equal((await api.invoke({method:'planPatternMachining',args:request})).route,'logo');
 assert.equal((await api.planPatternMachining({...request,context:{...request.context,documentInstanceId:'other'}})).error.code,'INSTANCE_MISMATCH');
 assert.equal(getTool({id:'planPatternMachining'}).docs,'api.pattern-machining');assert(readDocs({docId:'api.pattern-machining',limitChars:16000}).text.includes('stripes.png'));
});
test('new creation requires declaration; legacy edits retain old semantics and no migration',async()=>{
 const params={faceId:0,mode:'engrave',depth:.4,regions:[{outer:[[-1,-1],[1,-1],[1,1],[-1,1]]}],source:{kind:'reviewed-contours',reviewed:true}};
 const s={sessionId:'s',documentId:'d',documentInstanceId:'i',revision:1,features:[{id:'old',op:'logo',params,refs:['plate']}],bodies:[{id:'plate'},{id:'old'}],kernelReady:true,busy:false,referenceSystem:createReferenceSystem()};let writes=0,last;
 const service=createCommandService({allowAdvisory:true,snapshot:()=>structuredClone(s),execute:async(command,args)=>{writes++;last={command,args};s.revision++;}});
 const card=getOperation('logo'),args={op:'logo',opVersion:card.version,schemaHash:card.schemaHash,params,refs:['plate']};
 const input=(action,args)=>({context:{sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:s.revision},idempotencyKey:crypto.randomUUID(),action,args});
 const failed=await service.execute(input('feature.add',args));assert.equal(failed.error.code,'MACHINING_INTENT_REQUIRED');assert.equal(failed.commitState,'not_committed');assert.equal(writes,0);
 const legacy=await service.execute(input('feature.edit',{featureId:'old',opVersion:card.version,schemaHash:card.schemaHash,params:{depth:.5}}));assert.equal(legacy.status,'committed');assert.equal(last.args.params.machiningIntent,undefined);
 const declared=await service.execute(input('feature.add',{...args,params:{...params,machiningIntent:base}}));assert.equal(declared.status,'committed');assert.deepEqual(last.args.params.machiningIntent,base);
 assert.deepEqual(s.features[0].params,params);
});

test('explicit UI controls update declared numbers while API and kernel reject conflicting recipes',async()=>{
 const original={depth:.4,mode:'engrave',machiningIntent:{version:1,requestedGeometry:'constantDepthContours',sourceInterpretation:'reviewedVectors',userIntentEvidence:'confirmed user contour request',direction:'engrave',specifiedDepthsMm:[.4]}},before=structuredClone(original);
 const changed={...original,depth:.6,mode:'emboss'};
 assert.throws(()=>assertPatternExecution('logo',changed),{code:'MACHINING_INTENT_CONFLICT'});
 const ui=intentForUIParameterEdit('logo',changed);assert.doesNotThrow(()=>assertPatternExecution('logo',ui));assert.equal(ui.machiningIntent.direction,'emboss');assert.deepEqual(ui.machiningIntent.specifiedDepthsMm,[.6]);assert.equal(ui.machiningIntent.userIntentEvidence,original.machiningIntent.userIntentEvidence);assert.deepEqual(original,before);
 const legacy={depth:.6};assert.equal(intentForUIParameterEdit('logo',legacy),legacy);assert.equal(Object.hasOwn(legacy,'machiningIntent'),false);
 const kernel=Object.create(CadKernel.prototype);await assert.rejects(kernel.operation({op:'logo',params:changed},new Map(),{}),{code:'MACHINING_INTENT_CONFLICT'});
});
