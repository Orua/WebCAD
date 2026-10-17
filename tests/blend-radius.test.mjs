import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {topologyDetails} from '../src/smooth-transition.js';
import {buildBlendRadius,attemptBlendRadius} from '../src/blend-radius.js';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=value=>{try{value?.delete();}catch{}};
const firstSharp=shape=>topologyDetails(shape).find(row=>row.sharp===true);
function measuredEndRadii(shape,sourceEdge){
  const vector=p=>{try{return p.toTuple();}finally{p.delete();}},start=vector(sourceEdge.startPoint),end=vector(sourceEdge.endPoint),delta=end.map((v,i)=>v-start[i]),length=Math.hypot(...delta),unit=delta.map(v=>v/length),radii=[[],[]],edges=shape.edges;
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),norm=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  try{for(const edge of edges){
    const points=[.2,.5,.8].map(t=>vector(edge.pointAt(t))),[a,b,c]=points,area2=norm(cross(sub(b,a),sub(c,a)));if(area2<1e-10)continue;
    const radius=norm(sub(a,b))*norm(sub(b,c))*norm(sub(c,a))/(2*area2);
    [start,end].forEach((endpoint,i)=>{if(points.every(p=>Math.abs(dot(sub(p,endpoint),unit))<1e-5))radii[i].push(radius);});
  }}finally{edges.forEach(dispose);}
  return radii;
}

test('constant radius and variable endpoint radii create valid OCCT solids on the same edge',()=>{
  const source=cad.makeBox([0,0,0],[20,10,6]),target=firstSharp(source),selector={edgeIds:[target.edgeId]};let constant,variable;
  try{
    constant=buildBlendRadius(source,{selector,radiusMm:.5});
    assert.equal(constant.solids.length,1);assert(cad.measureVolume(constant)>0);
    assert.equal(constant.blendRadiusReport.mode,'constant');
    variable=buildBlendRadius(source,{selector,blendLaw:{startRadiusMm:.6,endRadiusMm:.2}});
    assert.equal(variable.solids.length,1);assert(cad.measureVolume(variable)>0);
    assert.equal(variable.blendRadiusReport.mode,'variable');
    assert.deepEqual(variable.blendRadiusReport.blendLaw,{startRadiusMm:.6,endRadiusMm:.2,interpolation:'OCCT linear edge endpoint radii'});
    const sourceEdges=source.edges;let endRadii;try{endRadii=measuredEndRadii(variable,sourceEdges[target.edgeId]);}finally{sourceEdges.forEach(dispose);}
    assert.equal(endRadii[0].length,1);assert.equal(endRadii[1].length,1);const sorted=endRadii.flat().sort((a,b)=>a-b);assert(Math.abs(sorted[0]-.2)/.2<.05);assert(Math.abs(sorted[1]-.6)/.6<.05);
    console.log('OCCT blend measurements',JSON.stringify({sourceVolumeMm3:cad.measureVolume(source),constantVolumeMm3:cad.measureVolume(constant),variableVolumeMm3:cad.measureVolume(variable),endRadiiMm:endRadii,solidCount:constant.solids.length,variableSolidCount:variable.solids.length}));
  }finally{dispose(constant);dispose(variable);dispose(source);}
});

test('failed requested blend reports BLEND_SKIPPED and preserves base Boolean geometry',()=>{
  const source=cad.makeBox([0,0,0],[20,10,6]),target=firstSharp(source),selector={edgeIds:[target.edgeId]},volume=cad.measureVolume(source);let fallback;
  try{
    fallback=attemptBlendRadius(source,{selector,radiusMm:100});
    assert.equal(fallback.shape,null);assert.equal(fallback.warning.code,'BLEND_SKIPPED');
    assert.equal(fallback.report.status,'skipped');assert.equal(cad.measureVolume(source),volume);
  }finally{dispose(fallback?.shape);dispose(source);}
});

test('variable law rejects malformed or unsupported sample laws without running OCCT',()=>{
  const source=cad.makeBox([0,0,0],[20,10,6]),target=firstSharp(source);
  try{
    assert.throws(()=>buildBlendRadius(source,{selector:{edgeIds:[target.edgeId]},blendLaw:{startRadiusMm:-1,endRadiusMm:.2}}),/正的 startRadiusMm/);
  }finally{dispose(source);}
});
