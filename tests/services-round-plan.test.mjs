import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildEdgeBlend} from '../src/edge-blend.js';
import {inspectFaceRoundSource} from '../src/services/face-round-plan.js';
import {assertCompilableFeature,compiledSemanticVersion} from '../src/services/geometry-exchange.js';
import {chooseExecutor} from '../src/services/execution-router.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const tuple=point=>{try{return point.toTuple();}finally{point.delete();}};
test('one pre-rounded rectangular face yields geometric intent and the original radius without source mutation',()=>{
 const box=cad.makeBox([0,0,0],[40,30,10]),edges=box.edges;let source;
 try{
  const edgeId=edges.findIndex(edge=>{const p=tuple(edge.pointAt(.5));return Math.abs(p[0]-20)<1e-7&&Math.abs(p[1])<1e-7&&Math.abs(p[2]-10)<1e-7;});assert.ok(edgeId>=0);
  source=buildEdgeBlend(box,'fillet',{edgeIds:[edgeId],radius:2});
  const faces=source.faces;let faceId;try{faceId=faces.findIndex(face=>face.geomType==='PLANE'&&Math.abs(tuple(face.center)[2]-10)<1e-7);}finally{faces.forEach(face=>face.delete());}assert.ok(faceId>=0);
  const before=source.serialize(),params={mode:'edge',strength:.5,faceIds:[faceId]};
  assert.equal(inspectFaceRoundSource(source,params,oc,cad,{sourceBrep:before}).candidate,true);
  const plan=inspectFaceRoundSource(source,params,oc,cad,{sourceBrep:before,prepare:true});
  assert.equal(plan.params.radius,2);assert.deepEqual(plan.selectionIntent.normal,[0,0,1]);assert.equal(plan.selectionIntent.point[2],10);
  assert.equal('faceId' in plan.selectionIntent,false);assert.equal(plan.roundReport.control.kind,'fixed-radius');assert.equal(source.serialize(),before);
  assert.throws(()=>inspectFaceRoundSource(source,{...params,radiusMm:1},oc,cad,{prepare:true}),{code:'ROUND_RADIUS_MISMATCH'});
  assert.equal(inspectFaceRoundSource(box,params,oc,cad).candidate,false);
  const feature={op:'round',refs:['source'],params};assert.equal(compiledSemanticVersion(feature),'round.planar-boundary-1.0');assertCompilableFeature(feature);
  for(const patch of [{strength:.8},{mode:'end'},{axis:'X'},{faceIds:[faceId,faceId]}])assert.throws(()=>assertCompilableFeature({...feature,params:{...params,...patch}}),{code:'OPERATION_UNAVAILABLE'});
  const capability={operation:'round',semanticVersion:'round.planar-boundary-1.0',enabled:true,acceptanceStatus:'passed'};
  const args={operation:'round',semanticVersion:capability.semanticVersion,params,source:{preexistingBoundaryRound:true},servicesAvailable:true,clientImportReady:true,capabilities:{operations:[capability]}};
  assert.equal(chooseExecutor(args).executor,'remote');assert.equal(chooseExecutor({...args,servicesAvailable:false}).executor,'local');
  assert.equal(chooseExecutor({...args,source:{preexistingBoundaryRound:false}}).executor,'local');
 }finally{source?.delete();edges.forEach(edge=>edge.delete());box.delete();}
});
