import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import init from 'replicad-opencascadejs';import * as cad from 'replicad';
import {halfLengthPoint} from '../src/arc-length.js';import {buildQuickModel} from '../src/quick-models.js';import {CadKernel} from '../src/cad-kernel.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
function chordMidpoint(edge,steps){
 const a=new oc.BRepAdaptor_Curve(edge.wrapped),first=a.FirstParameter(),last=a.LastParameter(),points=[],lengths=[0];
 try{for(let i=0;i<=steps;i++){const p=a.Value(first+(last-first)*i/steps);points.push([p.X(),p.Y(),p.Z()]);p.delete();if(i)lengths.push(lengths[i-1]+Math.hypot(...points[i].map((v,j)=>v-points[i-1][j])));}
 const target=lengths.at(-1)/2,i=lengths.findIndex(v=>v>=target),ratio=(target-lengths[i-1])/(lengths[i]-lengths[i-1]);return points[i-1].map((v,j)=>v+ratio*(points[i][j]-v));
 }finally{a.delete();}
}
test('threaded sleeve nonuniform spline midpoints converge and agree with independent chord lengths',()=>{
 const shape=buildQuickModel({kind:'threadedSleeve'},cad),before=shape.serialize(),edges=shape.edges;let checked=0;
 try{for(const edge of edges){const result=halfLengthPoint(edge,oc,cad.measureLength(edge));assert(result.every(Number.isFinite));if(edge.geomType!=='BSPLINE_CURVE')continue;
  const a=new oc.BRepAdaptor_Curve(edge.wrapped);const count=a.NbIntervals(oc.GeomAbs_Shape.GeomAbs_C1);a.delete();if(count<2)continue;
  const estimated=chordMidpoint(edge,10000);assert(Math.hypot(...result.map((v,i)=>v-estimated[i]))<1e-4);checked++;
 }assert(checked>0);assert.equal(shape.serialize(),before);}finally{edges.forEach(e=>e.delete());shape.delete();}
});
test('default threaded sleeve reaches a rendered-body description instead of failing optional snap generation',async()=>{
 const k=new CadKernel(oc);try{const result=await k.rebuild({version:2,features:[{id:'sleeve',op:'quickModel',params:{kind:'threadedSleeve'},refs:[]}],imports:{},hidden:[]});assert.equal(result.bodies[0].solidCount,1);assert(result.bodies[0].snapPoints.some(p=>p.type==='midpoint'));assert(result.bodies[0].volume>0);}finally{k.dispose();}
});
