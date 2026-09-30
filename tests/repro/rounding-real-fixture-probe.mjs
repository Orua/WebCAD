/**
 * Copy to <WebCAD>/tests/repro/rounding-real-fixture-probe.mjs.
 * Syntax-checked here; NOT executed against the project WASM in this review.
 * One direct native attempt + one formal native-only attempt; no radius scan.
 * Usage: node tests/repro/rounding-real-fixture-probe.mjs <document.json> <case.json> [output-dir]
 * Run under the existing external process/worker timeout. A JS timer cannot
 * interrupt synchronous WASM Build(). Never run this against the live browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../../src/cad-kernel.js';
import {topologyDetails} from '../../src/modeling/rounding/topology.js';
import {buildRounding} from '../../src/modeling/rounding/index.js';

const [documentPath,casePath,outArg]=process.argv.slice(2);
if(!documentPath||!casePath)throw new Error('Usage: node <probe.mjs> <document.json> <case.json> [output-dir]');
const document=JSON.parse(fs.readFileSync(documentPath,'utf8'));
const request=JSON.parse(fs.readFileSync(casePath,'utf8'));
if(!request.bodyId||!Number.isFinite(request.radiusMm)||request.radiusMm<=0||!request.targets?.length)throw new Error('Invalid case.json');
const outDir=path.resolve(outArg||`agent/output/rounding-fixture-${Date.now()}`);
if(fs.existsSync(outDir))throw new Error('Output directory already exists; choose a new one to preserve prior evidence');
fs.mkdirSync(outDir,{recursive:true});
const dispose=x=>{try{x?.delete?.();}catch{}};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const tuple=v=>{try{return v.toTuple();}finally{dispose(v);}};
const wasmPath=new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url);
const wasmBinary=fs.readFileSync(wasmPath),wasmSha256=hash(wasmBinary);
if(request.expectedWasmSha256&&wasmSha256!==request.expectedWasmSha256)throw new Error(`WASM mismatch: ${wasmSha256}; not the baseline`);
const oc=await init({wasmBinary});cad.setOC(oc);
const kernel=new CadKernel(oc);
const report={documentSha256:hash(fs.readFileSync(documentPath)),wasmSha256,request,startedAt:new Date().toISOString(),verificationScope:'input replay and native diagnostic only; not full tool acceptance',cases:[]};
const write=()=>fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
function volume(shape){const g=new oc.GProp_GProps();try{const error=oc.BRepGProp.VolumePropertiesGK(shape.wrapped,g,1e-9,true,true,false,false,false);if(!Number.isFinite(error)||error<0)throw new Error('Volume integration failed');return Math.abs(g.Mass());}finally{dispose(g);}}
function state(builder,name,...args){try{return typeof builder[name]==='function'?builder[name](...args):'not_exposed';}catch(e){return {readError:String(e?.message||e)}}}
function enumName(value){
 if(value==='not_exposed'||value?.readError)return value;
 const n=value?.value??value;
 const entry=Object.entries(oc.ChFiDS_ErrorStatus||{}).find(([,v])=>(v?.value??v)===n);
 return {name:entry?.[0]??'unknown',value:typeof n==='number'?n:String(n)};
}
function exception(e){let message=e?.message;try{if(!message)message=oc.getExceptionMessage(e);}catch{}return {code:e?.code??null,message:String(message||e),report:e?.report??null};}
function edgeRows(shape){const es=shape.edges;try{return topologyDetails(shape).map(row=>({...row,curveType:es[row.edgeId].geomType,lengthMm:es[row.edgeId].length}));}finally{es.forEach(dispose);}}
function resolveTargets(rows){return request.targets.map(signature=>{
 const tol=request.matchToleranceMm??1e-4;
 const matches=rows.filter(row=>Math.abs(row.lengthMm-signature.lengthMm)<=tol&&((dist(row.startPoint,signature.startPoint)<=tol&&dist(row.endPoint,signature.endPoint)<=tol)||(dist(row.startPoint,signature.endPoint)<=tol&&dist(row.endPoint,signature.startPoint)<=tol)));
 if(matches.length!==1)throw new Error(`Target ${signature.name||''} has ${matches.length} geometric matches; do not substitute stored edge IDs`);
 return matches[0].edgeId;
});}
try{
 const rebuilt=await kernel.rebuild(document);
 const source=kernel.shapes.get(request.bodyId);if(!source)throw new Error('Requested source body is absent after replay');
 const saved=source.serialize(),rows=edgeRows(source),ids=resolveTargets(rows);
 report.source={bodyId:request.bodyId,volumeMm3:volume(source),brepSha256:hash(saved),resolvedEdgeIds:ids,featureCount:document.features.length};
 if(request.expectedVolumeMm3!==undefined&&Math.abs(report.source.volumeMm3-request.expectedVolumeMm3)>(request.volumeToleranceMm3??1e-5))throw new Error('Input volume differs from handoff; stop, do not test a different shape');
 fs.writeFileSync(path.join(outDir,'source.brep'),saved);
 fs.writeFileSync(path.join(outDir,'source-topology.json'),JSON.stringify(rows,null,2));
 write();
 // Raw native diagnostic on a deep BREP reconstruction, not on committed handles.
 let copy,edges,builder,result,check;
 const native={name:'raw-native-original-radius',radiusMm:request.radiusMm,seedEdgeIds:ids,nativeBuildCalls:0};
 try{
  copy=cad.deserializeShape(saved).asShape3D();edges=copy.edges;
  const copyIds=resolveTargets(edgeRows(copy));
  builder=new oc.BRepFilletAPI_MakeFillet(copy.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
  for(const id of copyIds){if(!builder.Contour(edges[id].wrapped))builder.Add(request.radiusMm,edges[id].wrapped);}
  native.contours=[];
  for(let i=1;i<=builder.NbContours();i++){
   const edgeIds=[];for(let j=1;j<=builder.NbEdges(i);j++){const e=builder.Edge(i,j);try{const k=edges.findIndex(edge=>edge.wrapped.IsSame(e));if(k<0)throw new Error('Unmapped native contour edge');edgeIds.push(k);}finally{dispose(e);}}
   native.contours.push({contour:i,edgeIds});
  }
  write();
  const p=new oc.Message_ProgressRange();native.nativeBuildCalls++;try{builder.Build(p);}finally{dispose(p);}
  native.isDone=builder.IsDone();native.faultyContours=state(builder,'NbFaultyContours');native.faultyVertices=state(builder,'NbFaultyVertices');native.hasPartialResult=state(builder,'HasResult');
  for(const c of native.contours){c.stripeStatus=enumName(state(builder,'StripeStatus',c.contour));c.computedSurfaces=state(builder,'NbComputedSurfaces',c.contour);}
  if(native.isDone){result=cad.cast(builder.Shape());check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);const solids=result.solids;try{native.valid=check.IsValid();native.solidCount=solids.length;}finally{solids.forEach(dispose);}native.volumeMm3=volume(result);native.radiusVerified=false;native.seamsVerified=false;fs.writeFileSync(path.join(outDir,'native-candidate-NOT-ACCEPTED.brep'),result.serialize());}
 }catch(e){native.error=exception(e);}
 finally{[check,result,builder].forEach(dispose);edges?.forEach(dispose);dispose(copy);report.cases.push(native);write();}
 // The same target through the formal path, forcing native to exclude fallbacks.
 const formal={name:'formal-native-only-tangent-chain',radiusMm:request.radiusMm};
 let input,output;
 try{
  input=cad.deserializeShape(saved).asShape3D();const freshIds=resolveTargets(edgeRows(input));
  output=buildRounding(input,{specVersion:1,mode:'constant',scope:{kind:'edges',edgeIds:freshIds},propagation:'tangent-chain',radiusMm:request.radiusMm,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}},{strategy:'native'});
  formal.returned=true;formal.roundingReport=output.roundingReport;
 }catch(e){formal.returned=false;formal.error=exception(e);}
 finally{dispose(output);dispose(input);report.cases.push(formal);}
 report.sourceUnchanged=hash(source.serialize())===report.source.brepSha256;
 if(!report.sourceUnchanged)throw new Error('Replay source changed during isolated probes');
 report.completedAt=new Date().toISOString();write();console.log(JSON.stringify(report,null,2));
}catch(e){report.fatal=exception(e);write();throw e;}
finally{kernel.dispose();}
