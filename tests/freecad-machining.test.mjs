import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {buildEdgeBlend} from '../src/edge-blend.js';
import {topologyDetails} from '../src/smooth-transition.js';
import {normalizeOperationParams,normalizeOperationPatch,getOperation} from '../src/operation-registry.js';
import {solveProfileConstraints} from '../src/modeling/profiles/profile-constraints.js';
import {packCommonToolOptions} from '../src/ui/forms/common-tool-options.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const dispose=value=>{try{value?.delete();}catch{}};

test('FreeCAD chamfer modes use the requested distances/angle and resolved support face',()=>{
  const shape=cad.makeBox([0,0,0],[10,8,4]),row=topologyDetails(shape).find(row=>row.startPoint[1]===0&&row.endPoint[1]===0&&row.startPoint[2]===0&&row.endPoint[2]===0),before=cad.measureVolume(shape);
  try{
    assert(row);const scope={edgeIds:[row.edgeId],referenceFaceId:row.adjacentFaceIds[0]},intercepts=[];
    for(const flipDirection of [false,true]){
      let result;try{
        result=buildEdgeBlend(shape,'chamfer',{...scope,mode:'twoDistances',distance:1,distance2:2,flipDirection});
        near(cad.measureVolume(result),310);assert.equal(result.blendReport.mode,'twoDistances');
        assert.equal(result.blendReport.supportFaces[0].referenceFaceId,row.adjacentFaceIds[flipDirection?1:0]);
        const edges=result.edges;try{
          const points=edges.flatMap(edge=>{const a=edge.startPoint,b=edge.endPoint;try{return [a.toTuple(),b.toTuple()];}finally{dispose(a);dispose(b);}});
          // The supports are y=0 and z=0: swapping support swaps which axis
          // receives the 1 mm and 2 mm offsets, without changing removed volume.
          assert(points.some(p=>Math.abs(p[1]-1)<1e-6&&Math.abs(p[2])<1e-6)||points.some(p=>Math.abs(p[2]-1)<1e-6&&Math.abs(p[1])<1e-6));
          assert(points.some(p=>Math.abs(p[1]-2)<1e-6&&Math.abs(p[2])<1e-6)||points.some(p=>Math.abs(p[2]-2)<1e-6&&Math.abs(p[1])<1e-6));
          intercepts.push([...new Set(points.filter(p=>Math.abs(p[0])<1e-6&&((Math.abs(p[1])<1e-6&&p[2]>.1&&p[2]<2.1)||(Math.abs(p[2])<1e-6&&p[1]>.1&&p[1]<2.1))).map(p=>p.slice(1).map(v=>v.toFixed(6)).join(',')))].sort());
        }finally{edges.forEach(dispose);}
      }finally{dispose(result);}
    }
    assert.notDeepEqual(intercepts[0],intercepts[1],'flipping changes the physical offsets on the two support planes');
    let angled;try{angled=buildEdgeBlend(shape,'chamfer',{...scope,mode:'distanceAngle',distance:1,angleDeg:30});near(cad.measureVolume(angled),320-5*Math.tan(Math.PI/6));assert.equal(angled.blendReport.angleDeg,30);}finally{dispose(angled);}
    assert.throws(()=>buildEdgeBlend(shape,'chamfer',{...scope,referenceFaceId:row.adjacentFaceIds.find(id=>false)??99,mode:'twoDistances',distance:1,distance2:2}),/不与边/);
    near(cad.measureVolume(shape),before);
  }finally{dispose(shape);}
});

test('drill tips use exact cone height and either depth convention, including signed axes',async()=>{
  const kernel=new CadKernel(oc),base={id:'base',op:'box',params:{width:30,depth:30,height:10},refs:[]},tip=2/Math.tan(118*Math.PI/360);
  const run=async params=>{await kernel.rebuild({version:2,imports:{},features:[base,{id:'hole',op:'holeWizard',refs:['base'],params:{kind:'plain',diameterMm:4,depthMm:6,through:false,x:15,y:15,z:10,axis:'Z',direction:-1,drillPoint:'angled',drillPointAngleDeg:118,...params}}]});return kernel.measure('hole');};
  try{
    near((await run({})).volume,9000-Math.PI*4*(6+tip/3));
    near((await run({depthReference:'tipDepth'})).volume,9000-Math.PI*4*(6-tip+tip/3));
    near((await run({kind:'counterbore',recessDiameterMm:7,recessDepthMm:2})).volume,9000-Math.PI*4*(6+tip/3)-2*Math.PI*(3.5**2-4));
    near((await run({kind:'countersink',recessDiameterMm:7,includedAngleDeg:90})).volume,9000-Math.PI*4*(6+tip/3)-Math.PI*1.5*(3.5**2+7+4)/3+Math.PI*4*1.5);
    near((await run({axis:'X',direction:1,x:0,y:15,z:5})).volume,9000-Math.PI*4*(6+tip/3));
    await assert.rejects(run({depthMm:9}),/含钻尖/);
    await assert.rejects(run({depthMm:1,depthReference:'tipDepth'}),/必须大于钻尖/);
    await assert.rejects(run({through:true}),/贯穿孔不支持/);
  }finally{kernel.dispose();}
});

const line=(id,startMm,endMm)=>({id,type:'line',startMm,endMm}),circle=(id,centerMm,diameterMm)=>({id,type:'circle',centerMm,diameterMm});
const profile=entities=>({profileVersion:1,output:'wire',entities,loops:[],chains:entities.map(e=>({id:`path_${e.id}`,edges:[{entityId:e.id,reversed:false}]})),regions:[]});
test('new sketch relations solve with independent radii and reject real conflict/reference errors',()=>{
  const source=profile([circle('a',[0,0],10),circle('b',[2,3],6)]),before=structuredClone(source);
  const result=solveProfileConstraints(source,[{type:'fixEntity',entityId:'a'},{type:'concentric',firstId:'a',secondId:'b'},{type:'diameter',entityId:'b',diameterMm:6}]);
  assert.equal(result.success,true,JSON.stringify(result));assert.equal(result.diagnostics.degreesOfFreedom,0);
  result.profile.entities[1].centerMm.forEach(v=>near(v,0));near(result.profile.entities[1].diameterMm,6);assert.deepEqual(source,before);
  for(const [type,target] of [['pointOnLine',line('target',[0,0],[10,0])],['pointOnCircle',circle('target',[0,0],10)]]){
    const source=profile([target,line('probe',[7,2],[10,6])]),constraints=[{type:'fixEntity',entityId:'target'},{type:'fixPoint',point:{entityId:'probe',point:'end'},positionMm:[10,6]},{type,point:{entityId:'probe',point:'start'},entityId:'target'}];
    const solved=solveProfileConstraints(source,constraints);assert.equal(solved.success,true,JSON.stringify(solved));const p=solved.profile.entities[1].startMm;
    near(type==='pointOnLine'?p[1]:Math.hypot(...p),type==='pointOnLine'?0:5);
    const conflict=solveProfileConstraints(source,[...constraints,{type:'fixPoint',point:{entityId:'probe',point:'start'},positionMm:[7,2]}]);assert.equal(conflict.success,false);assert.equal(conflict.profile,undefined);
  }
  assert.equal(solveProfileConstraints(source,[{type:'concentric',firstId:'a',secondId:'a'}]).success,false);
  assert.equal(solveProfileConstraints(profile([line('a',[0,0],[1,0])]),[{type:'pointOnLine',point:{entityId:'a',point:'end'},entityId:'a'}]).success,false);
});

test('strict contracts, history mode switching and UI packing agree on active fields',()=>{
  const chamfer={distance:1,edgeIds:[0],mode:'twoDistances',distance2:2};
  assert.equal(getOperation('chamfer').version,'1.1.0');assert.equal(getOperation('chamfer').inputSchema.properties.distance2.unit,'mm');
  assert.deepEqual(normalizeOperationPatch('chamfer',chamfer,{mode:'distanceAngle',angleDeg:30}),{distance:1,edgeIds:[0],mode:'distanceAngle',angleDeg:30});
  assert.deepEqual(normalizeOperationPatch('chamfer',chamfer,{mode:'equalDistance'}),{distance:1,edgeIds:[0],mode:'equalDistance'});
  assert.throws(()=>normalizeOperationPatch('chamfer',chamfer,{mode:'equalDistance',distance2:2}));
  for(const p of [{distance:1,edgeIds:[0],mode:'twoDistances'},{...chamfer,angleDeg:45},{distance:1,edgeIds:[0],mode:'distanceAngle',angleDeg:90}])assert.throws(()=>normalizeOperationParams('chamfer',p));
  const hole={kind:'plain',diameterMm:4,through:false,depthMm:6,x:5,y:5,z:10,drillPoint:'angled',drillPointAngleDeg:118,depthReference:'tipDepth'};
  assert.equal(normalizeOperationPatch('holeWizard',hole,{through:true}).drillPoint,'flat');
  assert.throws(()=>normalizeOperationPatch('holeWizard',hole,{drillPoint:'flat',drillPointAngleDeg:118}));
  const defaultInput={...hole};delete defaultInput.drillPointAngleDeg;delete defaultInput.depthReference;
  const defaults=normalizeOperationParams('holeWizard',defaultInput);assert.equal(defaults.drillPointAngleDeg,118);assert.equal(defaults.depthReference,'cylindricalLength');
  assert.throws(()=>normalizeOperationParams('holeWizard',{...hole,through:true}));assert.throws(()=>normalizeOperationParams('holeWizard',{...hole,drillPoint:'flat'}));
  const packed=packCommonToolOptions('holeWizard',{...hole,through:true,recessDiameterMm:8,recessDepthMm:2,includedAngleDeg:90});
  assert.equal(packed.depthMm,undefined);assert.equal(packed.drillPointAngleDeg,undefined);assert.equal(packed.recessDepthMm,undefined);normalizeOperationParams('holeWizard',packed);
  assert.deepEqual(packCommonToolOptions('chamfer',{...chamfer,mode:'equalDistance',angleDeg:45,flipDirection:true}),{distance:1,edgeIds:[0],mode:'equalDistance'});
});
