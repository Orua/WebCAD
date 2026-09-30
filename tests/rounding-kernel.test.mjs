import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildRounding} from '../src/modeling/rounding/index.js';
import {topologyDetails} from '../src/modeling/rounding/topology.js';
import {extractPlaneSection} from '../src/reference-curves.js';
import {measureBlendSectionRadius} from './helpers/rounding-section-metrics.mjs';

const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const dispose=value=>{try{value?.delete?.();}catch{}};
const params=(edgeId,radiusMm)=>({specVersion:1,mode:'constant',scope:{kind:'edges',edgeIds:[edgeId]},propagation:'selected-only',radiusMm,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}});

function sectionRadius(shape,x,corner){
  const section=extractPlaneSection(shape,{plane:'YZ',offset:x},cad),edges=section.edges;
  try{
    const matches=edges.filter(edge=>edge.geomType!=='LINE').map(edge=>{
      const box=edge.boundingBox;
      try{return {edge,bounds:box.bounds};}finally{dispose(box);}
    }).filter(item=>Math.abs(item.bounds[0][1]-corner[0])<1e-4&&Math.abs(item.bounds[0][2]-corner[1])<1e-4);
    assert.equal(matches.length,1,'one exact curved section at selected source corner');
    const points=[.1,.5,.9].map(t=>{const value=matches[0].edge.pointAt(t);try{return value.toTuple().slice(1)}finally{dispose(value)}});
    const [[x1,y1],[x2,y2],[x3,y3]]=points;
    const d=2*(x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2));
    const ux=((x1*x1+y1*y1)*(y2-y3)+(x2*x2+y2*y2)*(y3-y1)+(x3*x3+y3*y3)*(y1-y2))/d;
    const uy=((x1*x1+y1*y1)*(x3-x2)+(x2*x2+y2*y2)*(x1-x3)+(x3*x3+y3*y3)*(x2-x1))/d;
    return Math.hypot(x1-ux,y1-uy);
  }finally{edges.forEach(dispose);dispose(section);}
}

test('T1 real WASM constant R rounds synthetic convex edge at requested radius',()=>{
  const source=cad.makeBox([0,0,0],[20,10,8]);let result;
  try{
    const row=topologyDetails(source).find(item=>item.midpoint[1]===0&&item.midpoint[2]===0&&Math.abs(item.endPoint[0]-item.startPoint[0])===20);
    result=buildRounding(source,params(row.edgeId,1));
    assert.equal(result.roundingReport.validation.solid,'passed');
    assert(Math.abs(sectionRadius(result,10,[0,0])-1)<1e-5);
    assert(cad.measureVolume(result)<cad.measureVolume(source));
  }finally{dispose(result);dispose(source);}
});

test('T1 real WASM constant R rounds synthetic concave pocket edge and adds material',()=>{
  const outer=cad.makeBox([0,0,0],[20,10,8]),tool=cad.makeBox([5,2,5],[15,8,9]),source=outer.cut(tool);let result;
  try{
    const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1]-2)<1e-6&&Math.abs(item.midpoint[2]-5)<1e-6&&Math.abs(item.endPoint[0]-item.startPoint[0])>9.9);
    result=buildRounding(source,params(row.edgeId,.5));
    assert.equal(result.roundingReport.validation.solid,'passed');
    assert(cad.measureVolume(result)>cad.measureVolume(source));
  }finally{dispose(result);dispose(source);dispose(tool);dispose(outer);}
});

test('automatic candidates preserve the source and report every failed construction',()=>{
  const source=cad.makeBox([0,0,0],[20,10,8]),before=source.serialize();
  try{
    const row=topologyDetails(source).find(item=>item.sharp&&Math.abs(item.endPoint[0]-item.startPoint[0])>19);
    assert(row);
    assert.throws(()=>buildRounding(source,params(row.edgeId,100)),error=>{
      assert.equal(error.code,'KERNEL_BUILD_FAILED');
      assert.deepEqual(error.report.candidateAttempts.map(attempt=>attempt.strategy),['native','unified-native','analytic']);
      return true;
    });
    assert.equal(source.serialize(),before);
  }finally{dispose(source);}
});

test('A1 adjacent constant R uses an approved tangent contour and preserves the earlier R away from the junction',()=>{
  const source=cad.makeBox([0,0,0],[20,10,8]),before=source.serialize();let first,second,removed,added;
  try{
    const original=topologyDetails(source).find(row=>Math.abs(row.midpoint[1])<1e-8&&Math.abs(row.midpoint[2])<1e-8&&Math.abs(row.endPoint[0]-row.startPoint[0])>19);
    first=buildRounding(source,params(original.edgeId,.5));
    const next=topologyDetails(first).find(row=>row.sharp&&Math.abs(row.midpoint[0]-20)<1e-6&&Math.abs(row.midpoint[1])<1e-6&&Math.abs(row.endPoint[2]-row.startPoint[2])>7);
    assert(next);
    let expandedIds;
    assert.throws(()=>buildRounding(first,params(next.edgeId,.5)),error=>{expandedIds=error.report?.expandedEdgeIds;return error.code==='SCOPE_EXPANSION_REQUIRED'&&expandedIds.length===2;});
    assert.throws(()=>buildRounding(first,params(10000,.5)),error=>error.code==='STALE_REFERENCE');
    assert.throws(()=>buildRounding(first,{...params(next.edgeId,.5),scope:{kind:'edges',edgeIds:[next.edgeId],excludeEdgeIds:[expandedIds[0]]},propagation:'tangent-chain'}),error=>error.code==='SCOPE_EXPANSION_REQUIRED');
    assert.throws(()=>buildRounding(first,{...params(next.edgeId,.5),scope:{kind:'edges',edgeIds:[next.edgeId],excludeEdgeIds:[next.edgeId]},propagation:'tangent-chain'}),error=>error.code==='SELECTION_CONFLICT');
    second=buildRounding(first,{...params(next.edgeId,.5),propagation:'tangent-chain'});
    const report=second.roundingReport;
    assert.equal(report.expandedSelection.length,2);
    assert.equal(report.processedEdgeIds.length,3);
    assert.equal(report.generatedFaceMap.length,3);
    assert(report.generatedFaceMap.every(row=>row.status==='passed'&&Math.abs(row.measuredRadiusMm-.5)<1e-5));
    assert.equal(report.validation.seams,'G1-contact-sampled');
    assert.notEqual(report.validation.endpoints,'natural-verified');
    assert(report.validation.maxTangentAngleDeg<.1);
    const vertical=report.generatedFaceMap.find(row=>row.edgeId===next.edgeId);
    const verticalSection=measureBlendSectionRadius(second,{plane:'XY',offset:4,faceId:vertical.faceId},cad);
    assert(Math.abs(verticalSection.radiusMm-.5)<1e-5&&verticalSection.sectionFitResidualMm<1e-5);
    const resultFaces=second.faces;let oldFaceId;
    try{oldFaceId=resultFaces.findIndex(face=>{const c=face.center;try{return face.geomType==='CYLINDRE'&&Math.abs(c.toTuple()[0]-10)<1;}finally{dispose(c);}});}finally{resultFaces.forEach(dispose);}
    const oldSection=measureBlendSectionRadius(second,{plane:'YZ',offset:10,faceId:oldFaceId},cad);
    assert(Math.abs(oldSection.radiusMm-.5)<1e-5&&oldSection.sectionFitResidualMm<1e-5);
    removed=first.cut(second);added=second.cut(first);
    const box=removed.boundingBox;try{assert(box.bounds[0][0]>=19.5-1e-5,'material changed only next to authorized contour');}finally{dispose(box);}
    assert(cad.measureVolume(removed)>.9&&cad.measureVolume(added)<1e-7);
    assert.equal(source.serialize(),before,'original input was not mutated');
  }finally{[added,removed,second,first,source].forEach(dispose);}
});

test('A1 adjacent tangent contour works at fixed scales, after rotation, and in reverse order',()=>{
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  for(const {scale,rotate,reverse,firstR,secondR} of [{scale:.1},{scale:1},{scale:10},{scale:1,rotate:true},{scale:1,reverse:true,firstR:.5,secondR:.4}]){
    const base=cad.makeBox([0,0,0],[20*scale,10*scale,8*scale]),source=rotate?base.rotate(23,[0,0,0],[0,0,1]):base;
    let first,second;
    try{
      const rows=topologyDetails(source),targetLength=(reverse?8:20)*scale,r1=(firstR??.5)*scale,r2=(secondR??.5)*scale;
      const start=rows.find(row=>row.sharp&&Math.abs(distance(row.startPoint,row.endPoint)-targetLength)<1e-5);
      assert(start);
      first=buildRounding(source,params(start.edgeId,r1));
      const adjacentLength=(reverse?20:8)*scale-r1;
      const next=topologyDetails(first).find(row=>row.sharp&&Math.abs(distance(row.startPoint,row.endPoint)-adjacentLength)<1e-5&&[row.startPoint,row.endPoint].some(point=>[start.startPoint,start.endPoint].some(end=>distance(point,end)<r1+1e-5)));
      assert(next,`adjacent edge after first R at scale ${scale}, reverse=${!!reverse}`);
      try{second=buildRounding(first,{...params(next.edgeId,r2),propagation:'tangent-chain'});}catch(error){error.message+=` [scale=${scale}, reverse=${!!reverse}, rotated=${!!rotate}]`;throw error;}
      assert.equal(second.roundingReport.validation.solid,'passed');
      assert.equal(second.roundingReport.validation.seams,'G1-contact-sampled');
      assert(second.roundingReport.generatedFaceMap.every(row=>Math.abs(row.measuredRadiusMm-r2)<1e-5));
    }finally{[second,first,source].forEach(dispose);if(rotate)dispose(base);}
  }
});

test('T2 independent ruled circular sections enforce two-end linear R on real WASM',()=>{
  const source=cad.makeBox([0,0,0],[20,10,8]);
  try{
    const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8&&Math.abs(item.endPoint[0]-item.startPoint[0])>19);
    assert(row);
    for(const direction of ['forward','reverse']){
      const request={specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',laws:[{chainId:`edge:${row.edgeId}`,direction,interpolation:'linear',stations:[{s:0,radiusMm:.5},{s:1,radiusMm:1.5}]}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}};
      const result=buildRounding(source,request);
      try{
        const report=result.roundingReport;
        assert.equal(report.mode,'variable');assert.equal(report.validation.solid,'passed');assert.equal(report.validation.radius,'sampled-passed');
        assert.equal(report.variable.samples.length,9);assert(report.variable.maxRadiusErrorMm<1e-5);assert(report.variable.maxSectionFitResidualMm<1e-5);assert(report.variable.maxTangentAngleDeg<.1);
        for(const s of [2,10,18]){
          const sample=report.variable.samples.find(item=>Math.abs(item.sourceArcLengthMm-s)<1e-9);
          assert(sample);assert(Math.abs(sample.expectedRadiusMm-(.5+.05*s))<1e-9);assert(Math.abs(sample.measuredSectionRadiusMm-(.5+.05*s))<1e-5);
        }
        assert(cad.measureVolume(result)<cad.measureVolume(source));
      }finally{dispose(result);}
    }
  }finally{dispose(source);}
});

test('T2 unequal collinear source segments use one accumulated linear law across their seam',()=>{
  const source=cad.draw([0,0]).lineTo([7,0]).lineTo([20,0]).lineTo([20,10]).lineTo([0,10]).close().sketchOnPlane('XY').extrude(8);
  const volume=cad.measureVolume(source);
  try{
    const rows=topologyDetails(source).filter(item=>Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8&&Math.abs(item.endPoint[0]-item.startPoint[0])>1).sort((a,b)=>a.midpoint[0]-b.midpoint[0]);
    assert.equal(rows.length,2);assert(Math.abs(Math.hypot(...rows[0].endPoint.map((v,i)=>v-rows[0].startPoint[i]))-7)<1e-8);
    for(const {direction,reverseOrder} of [{direction:'forward',reverseOrder:false},{direction:'reverse',reverseOrder:false},{direction:'forward',reverseOrder:true}]){
      const ids=(reverseOrder?[...rows].reverse():rows).map(row=>row.edgeId),request={specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:ids},propagation:'selected-only',laws:[{chainId:`edges:${ids.join(',')}`,direction,interpolation:'linear',stations:[{s:0,radiusMm:.5},{s:1,radiusMm:1.5}]}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}};
      const result=buildRounding(source,request);
      try{
        const report=result.roundingReport;
        assert.equal(report.strategy,'analytic-variable-collinear-chain-ruled-v1');assert.equal(report.validation.solid,'passed');assert.deepEqual(report.processedEdgeIds,ids);
        assert.deepEqual(report.variable.sourceSegments.map(item=>item.lengthMm),reverseOrder?[13,7]:[7,13]);
        assert.equal(report.variable.sourceLengthMm,20);
        assert(report.variable.maxRadiusErrorMm<1e-5);assert(report.variable.maxSectionFitResidualMm<1e-5);assert(report.variable.maxTangentAngleDeg<.1);
        for(const s of direction==='forward'&&!reverseOrder?[2,6.9,7.1,10,18]:[2,10,12.9,13.1,18]){
          const sample=report.variable.samples.find(item=>Math.abs(item.sourceArcLengthMm-s)<1e-8);
          assert(sample,`source station ${s} mm`);assert(Math.abs(sample.expectedRadiusMm-(.5+.05*s))<1e-9);assert(Math.abs(sample.measuredSectionRadiusMm-(.5+.05*s))<1e-5);
        }
        assert(cad.measureVolume(result)<volume);
      }finally{dispose(result);}
    }
    assert(Math.abs(cad.measureVolume(source)-volume)<1e-8);
  }finally{dispose(source);}
});

test('T2 collinear chain route rejects a connected corner without changing its source',()=>{
  const source=cad.draw([0,0]).lineTo([7,0]).lineTo([20,0]).lineTo([20,10]).lineTo([0,10]).close().sketchOnPlane('XY').extrude(8);
  try{
    const rows=topologyDetails(source),first=rows.find(item=>Math.abs(item.midpoint[0]-13.5)<1e-8&&Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8),second=rows.find(item=>Math.abs(item.midpoint[0]-20)<1e-8&&Math.abs(item.midpoint[1]-5)<1e-8&&Math.abs(item.midpoint[2])<1e-8);
    assert(first&&second);const ids=[first.edgeId,second.edgeId],before=cad.measureVolume(source);
    const request={specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:ids},propagation:'selected-only',laws:[{chainId:`edges:${ids.join(',')}`,direction:'forward',interpolation:'linear',stations:[{s:0,radiusMm:.5},{s:1,radiusMm:1.5}]}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}};
    assert.throws(()=>buildRounding(source,request),error=>error.code==='VARIABLE_FAMILY_UNMATCHED');
    assert(Math.abs(cad.measureVolume(source)-before)<1e-8);
  }finally{dispose(source);}
});

test('T2 three-station law spans unequal collinear segments without resetting s',()=>{
  const source=cad.draw([0,0]).lineTo([7,0]).lineTo([20,0]).lineTo([20,10]).lineTo([0,10]).close().sketchOnPlane('XY').extrude(8);
  try{
    const ids=topologyDetails(source).filter(item=>Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8&&Math.abs(item.endPoint[0]-item.startPoint[0])>1).sort((a,b)=>a.midpoint[0]-b.midpoint[0]).map(item=>item.edgeId);
    assert.equal(ids.length,2);
    for(const middle of [.25,.35,.6]){
      const stations=[{s:0,radiusMm:.5},{s:middle,radiusMm:1.2},{s:1,radiusMm:1.5}];
      const request={specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:ids},propagation:'selected-only',laws:[{chainId:`edges:${ids.join(',')}`,direction:'forward',interpolation:'linear',stations}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}};
      const result=buildRounding(source,request);
      try{
        const report=result.roundingReport;
        assert.equal(report.validation.solid,'passed');assert.equal(report.newSurfaceCount,2);
        assert(report.variable.maxRadiusErrorMm<1e-5);assert(report.variable.maxSectionFitResidualMm<1e-5);
        for(const s of [2,6.9,7.1,10,18]){
          const sample=report.variable.samples.find(item=>Math.abs(item.sourceArcLengthMm-s)<1e-8);
          assert(sample,`middle ${middle}, s ${s}`);
          const f=s/20,expected=f<middle?.5+.7*f/middle:1.2+.3*(f-middle)/(1-middle);
          assert(Math.abs(sample.measuredSectionRadiusMm-expected)<1e-5);
        }
      }finally{dispose(result);}
    }
  }finally{dispose(source);}
});

test('T2 single straight edge preserves a three-station piecewise-linear radius law',()=>{
  const source=cad.makeBox([0,0,0],[20,10,8]);
  try{
    const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8&&Math.abs(item.endPoint[0]-item.startPoint[0])>19);
    const stations=[{s:0,radiusMm:.5},{s:.4,radiusMm:1.2},{s:1,radiusMm:1.5}];
    const request={specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',laws:[{chainId:`edge:${row.edgeId}`,direction:'forward',interpolation:'linear',stations}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}};
    const result=buildRounding(source,request);
    try{
      const report=result.roundingReport;
      assert.equal(report.validation.solid,'passed');assert.equal(report.newSurfaceCount,2);
      assert(report.variable.maxRadiusErrorMm<1e-5);assert(report.variable.maxSectionFitResidualMm<1e-5);assert(report.variable.maxTangentAngleDeg<.1);
      for(const s of [2,10,18]){
        const sample=report.variable.samples.find(item=>Math.abs(item.sourceArcLengthMm-s)<1e-9);
        assert(sample,`sample at ${s} mm`);
        const expected=s<8?.5+.7*s/8:1.2+.3*(s-8)/12;
        assert(Math.abs(sample.measuredSectionRadiusMm-expected)<1e-5);
      }
    }finally{dispose(result);}
  }finally{dispose(source);}
});

test('T2 ruled linear R follows concave and rigidly transformed source edges',()=>{
  const outer=cad.makeBox([0,0,0],[20,10,8]),pocket=cad.makeBox([5,2,5],[15,8,9]);
  const concave=outer.cut(pocket),box=cad.makeBox([0,0,0],[20,10,8]);
  const transformed=box.translate([3,4,5]).rotate(90,[3,4,5],[0,0,1]);
  try{
    const cases=[
      {source:concave,find:row=>Math.abs(row.midpoint[1]-2)<1e-6&&Math.abs(row.midpoint[2]-5)<1e-6&&Math.abs(row.endPoint[0]-row.startPoint[0])>9.9,start:.3,end:.8,material:'add'},
      {source:transformed,find:row=>Math.hypot(...row.midpoint.map((v,i)=>v-[3,14,5][i]))<1e-5,start:.5,end:1.5,material:'remove'},
    ];
    for(const {source,find,start,end,material} of cases){
      const row=topologyDetails(source).find(find);assert(row,'original sharp source edge');
      const request={specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',laws:[{chainId:`edge:${row.edgeId}`,direction:'forward',interpolation:'linear',stations:[{s:0,radiusMm:start},{s:1,radiusMm:end}]}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}};
      const result=buildRounding(source,request);
      try{
        const report=result.roundingReport;
        assert.equal(report.validation.solid,'passed');assert.equal(report.variable.material,material);
        assert(report.variable.maxRadiusErrorMm<1e-5);assert(report.variable.maxSectionFitResidualMm<1e-5);assert(report.variable.maxTangentAngleDeg<.1);
        const middle=report.variable.samples.find(item=>Math.abs(item.sourceArcLengthMm-report.variable.sourceLengthMm/2)<1e-8);
        assert(middle);assert(Math.abs(middle.measuredSectionRadiusMm-(start+end)/2)<1e-5);
        assert.equal(Math.sign(cad.measureVolume(result)-cad.measureVolume(source)),material==='add'?1:-1);
      }finally{dispose(result);}
    }
  }finally{dispose(transformed);dispose(box);dispose(concave);dispose(pocket);dispose(outer);}
});

test('T2 reversed three-station law retains accumulated positions across scales',()=>{
  for(const scale of [.1,1,10]){
    const source=cad.makeBox([0,0,0],[20*scale,10*scale,8*scale]);
    try{
      const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8&&Math.abs(item.endPoint[0]-item.startPoint[0])>19*scale);
      assert(row);
      const stations=[{s:0,radiusMm:.5*scale},{s:.4,radiusMm:1.2*scale},{s:1,radiusMm:1.5*scale}];
      const request={specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',laws:[{chainId:`edge:${row.edgeId}`,direction:'reverse',interpolation:'linear',stations}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}};
      const result=buildRounding(source,request);
      try{
        const report=result.roundingReport;
        assert.equal(report.validation.solid,'passed');assert.equal(report.variable.direction,'reverse');
        assert(report.variable.maxRadiusErrorMm<1e-5);assert(report.variable.maxSectionFitResidualMm<1e-5);
        for(const fraction of [.1,.5,.9]){
          const sample=report.variable.samples.find(item=>Math.abs(item.sourceArcLengthMm-20*scale*fraction)<1e-8);
          assert(sample,`source station ${fraction} at scale ${scale}`);
          const expected=(fraction<.4?.5+.7*fraction/.4:1.2+.3*(fraction-.4)/.6)*scale;
          assert(Math.abs(sample.expectedRadiusMm-expected)<1e-9);
          assert(Math.abs(sample.measuredSectionRadiusMm-expected)<1e-5);
        }
      }finally{dispose(result);}
    }finally{dispose(source);}
  }
});

test('T2 oversized end radius reaches geometric conflict without altering the source',()=>{
  const source=cad.makeBox([0,0,0],[20,10,8]);
  try{
    const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8&&Math.abs(item.endPoint[0]-item.startPoint[0])>19);
    assert(row);
    const sourceVolume=cad.measureVolume(source);
    const request={specVersion:1,mode:'variable',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',laws:[{chainId:`edge:${row.edgeId}`,direction:'forward',interpolation:'linear',stations:[{s:0,radiusMm:.5},{s:1,radiusMm:100}]}],boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}};
    assert.throws(()=>buildRounding(source,request),error=>error.code==='GEOMETRY_CONFLICT');
    assert(Math.abs(cad.measureVolume(source)-sourceVolume)<1e-8);
  }finally{dispose(source);}
});

test('T3 analytic two-plane prism makes exact convex and concave R without native fillet',()=>{
  for(const scale of [.1,1,10]){
    const source=cad.makeBox([0,0,0],[20*scale,10*scale,8*scale]);let result;
    try{
      const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8&&Math.abs(item.endPoint[0]-item.startPoint[0])>19*scale);
      result=buildRounding(source,params(row.edgeId,scale),{strategy:'analytic'});
      const section=measureBlendSectionRadius(result,{plane:'YZ',offset:10*scale},cad);
      assert.equal(result.roundingReport.strategy,'analytic-two-plane-prism-v1');
      assert.equal(result.roundingReport.analytic.material,'remove');
      assert(Math.abs(section.radiusMm-scale)<1e-5);
      assert(section.sectionFitResidualMm<1e-5);
      assert(cad.measureVolume(result)<cad.measureVolume(source));
    }finally{dispose(result);dispose(source);}
  }
  const outer=cad.makeBox([0,0,0],[20,10,8]),tool=cad.makeBox([5,2,5],[15,8,9]),source=outer.cut(tool);let result;
  try{
    const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1]-2)<1e-6&&Math.abs(item.midpoint[2]-5)<1e-6&&Math.abs(item.endPoint[0]-item.startPoint[0])>9.9);
    result=buildRounding(source,params(row.edgeId,.5),{strategy:'analytic'});
    const section=measureBlendSectionRadius(result,{plane:'YZ',offset:10},cad);
    assert.equal(result.roundingReport.analytic.material,'add');
    assert(Math.abs(section.radiusMm-.5)<1e-5);
    assert(section.sectionFitResidualMm<1e-5);
    assert(cad.measureVolume(result)>cad.measureVolume(source));
  }finally{dispose(result);dispose(source);dispose(tool);dispose(outer);}
});

test('T3 analytic two-plane prism respects non-right angle and rigid transform',()=>{
  const angle=Math.PI/3;
  const plane=new cad.Plane([0,0,0],[0,1,0],[1,0,0]);
  const base=cad.draw([0,0]).lineTo([10,0]).lineTo([10*Math.cos(angle),10*Math.sin(angle)]).close().sketchOnPlane(plane).extrude(20);
  const source=base.translate([3,4,5]).rotate(90,[3,4,5],[0,0,1]);
  let result;
  try{
    const row=topologyDetails(source).find(item=>item.sharp&&Math.hypot(...item.midpoint.map((v,i)=>v-[3,14,5][i]))<1e-5);
    assert(row,'transformed common straight edge');
    result=buildRounding(source,params(row.edgeId,1),{strategy:'analytic'});
    const section=measureBlendSectionRadius(result,{plane:'XZ',offset:14},cad);
    assert(Math.abs(section.radiusMm-1)<1e-5);
    assert(section.sectionFitResidualMm<1e-5);
    assert(Math.abs(result.roundingReport.analytic.dihedralSectionDeg-60)<1e-5);
    assert(cad.measureVolume(result)<cad.measureVolume(source));
  }finally{dispose(result);dispose(source);dispose(base);}
});

test('T3 forced native and analytic strategies agree on the same convex source edge',()=>{
  const source=cad.makeBox([0,0,0],[20,10,8]);let nativeResult,analyticResult;
  try{
    const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8&&Math.abs(item.endPoint[0]-item.startPoint[0])>19);
    assert(row);
    nativeResult=buildRounding(source,params(row.edgeId,.5),{strategy:'native'});
    analyticResult=buildRounding(source,params(row.edgeId,.5),{strategy:'analytic'});
    assert.equal(nativeResult.roundingReport.strategy,'native');
    assert.equal(analyticResult.roundingReport.strategy,'analytic-two-plane-prism-v1');
    assert.equal(nativeResult.roundingReport.validation.solid,'passed');
    assert.equal(analyticResult.roundingReport.validation.solid,'passed');
    const nativeSection=measureBlendSectionRadius(nativeResult,{plane:'YZ',offset:10},cad);
    const analyticSection=measureBlendSectionRadius(analyticResult,{plane:'YZ',offset:10},cad);
    assert(Math.abs(nativeSection.radiusMm-.5)<1e-5);
    assert(Math.abs(analyticSection.radiusMm-.5)<1e-5);
    assert(nativeSection.sectionFitResidualMm<1e-5);
    assert(analyticSection.sectionFitResidualMm<1e-5);
    assert(Math.abs(cad.measureVolume(nativeResult)-cad.measureVolume(analyticResult))<1e-5);
    assert(Math.abs(cad.measureVolume(source)-1600)<1e-8);
  }finally{dispose(analyticResult);dispose(nativeResult);dispose(source);}
});

test('T3 controlled same-domain cleanup preserves the source and maps an unchanged target edge',()=>{
  const source=cad.draw([0,0]).lineTo([10,0]).lineTo([20,0]).lineTo([20,10]).lineTo([0,10]).close().sketchOnPlane('XY').extrude(8);
  let result;
  try{
    const rows=topologyDetails(source),full=rows.find(row=>Math.abs(row.midpoint[1]-10)<1e-8&&Math.abs(row.midpoint[2]-8)<1e-8&&Math.abs(row.endPoint[0]-row.startPoint[0])>19.9);
    assert(full,'unaffected full-length source edge');
    const sourceVolume=cad.measureVolume(source),sourceEdges=source.edges,sourceEdgeCount=sourceEdges.length;sourceEdges.forEach(dispose);
    result=buildRounding(source,params(full.edgeId,.5),{strategy:'unified-native'});
    const report=result.roundingReport,section=measureBlendSectionRadius(result,{plane:'YZ',offset:10},cad);
    assert.equal(report.strategy,'unified-native');
    assert.equal(report.validation.solid,'passed');
    assert.deepEqual(report.processedEdgeIds,[full.edgeId]);
    assert(report.cleanup.after.edgeCount<report.cleanup.before.edgeCount);
    assert.equal(report.cleanup.sourceMinusCandidateMm3,0);
    assert.equal(report.cleanup.candidateMinusSourceMm3,0);
    assert(Math.abs(section.radiusMm-.5)<1e-5);assert(section.sectionFitResidualMm<1e-5);
    const afterEdges=source.edges;assert.equal(afterEdges.length,sourceEdgeCount);afterEdges.forEach(dispose);
    assert(Math.abs(cad.measureVolume(source)-sourceVolume)<1e-8);
    const split=rows.find(row=>Math.abs(row.midpoint[1])<1e-8&&Math.abs(row.midpoint[2]-8)<1e-8&&Math.abs(row.endPoint[0]-row.startPoint[0]-10)<1e-8);
    assert(split,'redundant split source edge');
    assert.throws(()=>buildRounding(source,params(split.edgeId,.5),{strategy:'unified-native'}),error=>error.code==='CLEANUP_NOT_APPLICABLE');
    assert(Math.abs(cad.measureVolume(source)-sourceVolume)<1e-8);
  }finally{dispose(result);dispose(source);}
});

test('T3 analytic closed circular sidewall uses exact revolved R on real WASM',()=>{
  for(const scale of [.1,1,10]){
    const source=cad.makeCylinder(5*scale,10*scale),originalVolume=cad.measureVolume(source);let result;
    try{
      const row=topologyDetails(source).find(item=>item.sharp&&Math.abs(item.midpoint[2]-10*scale)<1e-7);
      result=buildRounding(source,params(row.edgeId,scale),{strategy:'analytic'});
      const section=measureBlendSectionRadius(result,{plane:'XZ',offset:0,faceType:'TORUS',curveNear:[4.3*scale,0,9.3*scale]},cad);
      assert.equal(result.roundingReport.strategy,'analytic-planar-circle-revolve-v1');
      assert(Math.abs(section.radiusMm-scale)<1e-5);
      assert(section.sectionFitResidualMm<1e-5);
      assert(cad.measureVolume(result)<originalVolume);
      assert(Math.abs(cad.measureVolume(source)-originalVolume)<1e-8);
    }finally{dispose(result);dispose(source);}
  }
});

test('T3 analytic open arc terminates on radial planes and keeps exact R',()=>{
  for(const scale of [.1,1,10])for(const reverse of [false,true]){
    const tip=5*scale,mid=tip/Math.sqrt(2),drawing=reverse
      ?cad.draw([0,0]).lineTo([0,tip]).threePointsArcTo([tip,0],[mid,mid]).close()
      :cad.draw([0,0]).lineTo([tip,0]).threePointsArcTo([0,tip],[mid,mid]).close();
    const source=drawing.sketchOnPlane('XY').extrude(10*scale);let result;
    try{
      const edges=source.edges,rows=topologyDetails(source),row=rows.find(item=>edges[item.edgeId].geomType==='CIRCLE'&&Math.abs(item.midpoint[2]-10*scale)<1e-7);
      edges.forEach(dispose);assert(row,'open top circular source edge');
      result=buildRounding(source,params(row.edgeId,.5*scale),{strategy:'analytic'});
      const report=result.roundingReport,section=measureBlendSectionRadius(result,{plane:'XZ',offset:0,faceType:'TORUS',curveNear:[4.6*scale,0,9.6*scale]},cad);
      assert.equal(report.strategy,'analytic-planar-arc-revolve-v1');
      assert.equal(report.analytic.termination,'radial-plane-caps');
      assert(Math.abs(Math.abs(report.analytic.sweepAngleDeg)-90)<1e-5);
      assert.equal(report.validation.solid,'passed');
      assert(Math.abs(section.radiusMm-.5*scale)<1e-5);assert(section.sectionFitResidualMm<1e-5);
      assert(cad.measureVolume(result)<cad.measureVolume(source));
    }finally{dispose(result);dispose(source);dispose(drawing);}
  }
});

test('T4 two-plane width transition preserves requested unequal widths and G1 section tangents',()=>{
  for(const [scale,widthA,widthB] of [[.1,.1,.2],[1,1,1],[1,1,2],[10,10,20]]){
    const source=cad.makeBox([0,0,0],[20*scale,10*scale,8*scale]);let result,section;
    try{
      const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1])<1e-8&&Math.abs(item.midpoint[2])<1e-8&&Math.abs(item.endPoint[0]-item.startPoint[0])>19*scale);
      result=buildRounding(source,{specVersion:1,mode:'width',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',widthAMm:widthA,widthBMm:widthB});
      assert.equal(result.roundingReport.strategy,'width-two-plane-bezier-v1');
      assert.equal(result.roundingReport.validation.solid,'passed');
      assert(cad.measureVolume(result)<cad.measureVolume(source));
      const faces=result.faces,blend=faces.find(face=>face.geomType==='EXTRUSION_SURFACE');
      assert(blend,'generated width transition surface');
      section=extractPlaneSection(blend,{plane:'YZ',offset:10*scale},cad);
      const curves=section.edges;assert.equal(curves.length,1);
      const edge=curves[0],a=edge.startPoint.toTuple(),b=edge.endPoint.toTuple();
      const endpoints=[a,b];
      const byZ=endpoints.findIndex(p=>Math.abs(p[1])<1e-6),byY=1-byZ;
      assert(byZ>=0,'first support seam identified');
      assert(Math.abs(endpoints[byZ][2]-widthA)<1e-5);
      assert(Math.abs(endpoints[byY][1]-widthB)<1e-5);
      const normalA=blend.normalAt(endpoints[byZ]).toTuple(),normalB=blend.normalAt(endpoints[byY]).toTuple();
      const angle=(n,axis)=>Math.acos(Math.min(1,Math.abs(n[axis])/Math.hypot(...n)))*180/Math.PI;
      assert(angle(normalA,1)<.1,'A seam surface normal matches support plane');
      assert(angle(normalB,2)<.1,'B seam surface normal matches support plane');
      curves.forEach(dispose);faces.forEach(dispose);
    }finally{dispose(section);dispose(result);dispose(source);}
  }
});

test('T4 closed planar/cylindrical circle builds an asymmetric width transition',()=>{
  for(const scale of [.1,1,10]){
    const source=cad.makeCylinder(5*scale,10*scale),sourceVolume=cad.measureVolume(source);let result,section;
    try{
      const row=topologyDetails(source).find(item=>item.sharp&&Math.abs(item.midpoint[2]-10*scale)<1e-7);
      const support=source.faces,planeId=row.adjacentFaceIds.find(id=>support[id].geomType==='PLANE'),wallId=row.adjacentFaceIds.find(id=>support[id].geomType==='CYLINDRE');support.forEach(dispose);
      const request={specVersion:1,mode:'width',scope:{kind:'shared-faces',faceAIds:[planeId],faceBIds:[wallId]},propagation:'selected-only',widthAMm:.5*scale,widthBMm:1.5*scale};
      result=buildRounding(source,request);
      assert.equal(result.roundingReport.strategy,'width-planar-circle-revolve-v1');
      assert.equal(result.roundingReport.width.supportFaceAId,planeId);
      assert.equal(result.roundingReport.width.supportFaceBId,wallId);
      assert(cad.measureVolume(result)<sourceVolume);
      const faces=result.faces,blend=faces.find(face=>face.geomType==='REVOLUTION_SURFACE');
      assert(blend,'generated revolved Bezier face');
      section=extractPlaneSection(blend,{plane:'XZ',offset:0},cad);
      const edges=section.edges,curve=edges.find(edge=>edge.startPoint.toTuple()[0]>0&&edge.endPoint.toTuple()[0]>0);
      assert(curve,'positive-radius section of generated face');
      const points=[curve.startPoint.toTuple(),curve.endPoint.toTuple()];
      const top=points.find(p=>Math.abs(p[2]-10*scale)<1e-5),wall=points.find(p=>Math.abs(p[0]-5*scale)<1e-5);
      assert(top&&wall,'both support seams found');
      assert(Math.abs(top[0]-4.5*scale)<1e-5);
      assert(Math.abs(wall[2]-8.5*scale)<1e-5);
      const normalTop=blend.normalAt(top).toTuple(),normalWall=blend.normalAt(wall).toTuple();
      const angle=(n,axis)=>Math.acos(Math.min(1,Math.abs(n[axis])/Math.hypot(...n)))*180/Math.PI;
      assert(angle(normalTop,2)<.1,'planar seam G1');
      assert(angle(normalWall,0)<.1,'cylindrical seam G1');
      edges.forEach(dispose);faces.forEach(dispose);
      assert(Math.abs(cad.measureVolume(source)-sourceVolume)<1e-8);
    }finally{dispose(section);dispose(result);dispose(source);}
  }
});

test('T4 open circular extrusion arc preserves asymmetric widths and sampled G1',()=>{
  for(const scale of [.1,1,10])for(const reverse of [false,true]){
    const tip=5*scale,mid=tip/Math.sqrt(2),drawing=reverse
      ?cad.draw([0,0]).lineTo([0,tip]).threePointsArcTo([tip,0],[mid,mid]).close()
      :cad.draw([0,0]).lineTo([tip,0]).threePointsArcTo([0,tip],[mid,mid]).close();
    const source=drawing.sketchOnPlane('XY').extrude(10*scale);let result;
    try{
      const edges=source.edges,row=topologyDetails(source).find(item=>edges[item.edgeId].geomType==='CIRCLE'&&Math.abs(item.midpoint[2]-10*scale)<1e-7);edges.forEach(dispose);
      assert(row,'open top circular source edge');
      const widthA=.5*scale,widthB=scale;
      result=buildRounding(source,{specVersion:1,mode:'width',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',widthAMm:widthA,widthBMm:widthB,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}});
      const report=result.roundingReport;
      assert.equal(report.strategy,'width-planar-arc-revolve-v1');
      assert.equal(report.width.termination,'radial-plane-caps');
      assert(Math.abs(Math.abs(report.width.sweepAngleDeg)-90)<1e-5);
      assert.equal(report.validation.solid,'passed');
      assert(Math.abs(report.width.actualWidthAMm-widthA)<1e-5);
      assert(Math.abs(report.width.actualWidthBMm-widthB)<1e-5);
      assert(report.width.maxTangentAngleDeg<.1);
      assert(cad.measureVolume(result)<cad.measureVolume(source));
    }finally{dispose(result);dispose(source);dispose(drawing);}
  }
});

test('T3/T4 open circular arc construction follows a rigidly transformed source',()=>{
  const base=cad.draw([0,0]).lineTo([5,0]).threePointsArcTo([0,5],[5/Math.sqrt(2),5/Math.sqrt(2)]).close().sketchOnPlane('XY').extrude(10);
  const source=base.rotate(30,[0,0,0],[0,1,0]).translate([3,4,5]);
  const radians=Math.PI/6,c=Math.cos(radians),s=Math.sin(radians),transform=p=>[3+c*p[0]+s*p[2],4+p[1],5-s*p[0]+c*p[2]];
  const frame={origin:[3,4,5],quaternion:[0,Math.sin(radians/2),0,Math.cos(radians/2)]};
  let rounded,wide;
  try{
    const edges=source.edges,row=topologyDetails(source).find(item=>edges[item.edgeId].geomType==='CIRCLE'&&Math.abs((item.midpoint[0]-3)*s+(item.midpoint[2]-5)*c-10)<1e-5);
    edges.forEach(dispose);assert(row,'transformed top circular source edge');
    rounded=buildRounding(source,params(row.edgeId,.5),{strategy:'analytic'});
    wide=buildRounding(source,{specVersion:1,mode:'width',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',widthAMm:.5,widthBMm:1,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}});
    const section=measureBlendSectionRadius(rounded,{plane:'XZ',offset:0,frame,faceType:'TORUS',curveNear:transform([4.6,0,9.6])},cad);
    assert.equal(rounded.roundingReport.validation.solid,'passed');
    assert.equal(wide.roundingReport.validation.solid,'passed');
    assert(Math.abs(section.radiusMm-.5)<1e-5);assert(section.sectionFitResidualMm<1e-5);
    assert(Math.abs(wide.roundingReport.width.actualWidthAMm-.5)<1e-5);
    assert(Math.abs(wide.roundingReport.width.actualWidthBMm-1)<1e-5);
    assert(wide.roundingReport.width.maxTangentAngleDeg<.1);
  }finally{dispose(wide);dispose(rounded);dispose(source);dispose(base);}
});

test('T3/T4 partial arc does not treat a tangent continuation as a radial end cap',()=>{
  const source=cad.drawRoundedRectangle(10,8,2).sketchOnPlane('XY').extrude(10);
  try{
    const edges=source.edges,row=topologyDetails(source).find(item=>edges[item.edgeId].geomType==='CIRCLE'&&Math.abs(item.midpoint[2]-10)<1e-7);edges.forEach(dispose);
    assert(row,'rounded-rectangle top arc');
    const volume=cad.measureVolume(source);
    assert.throws(()=>buildRounding(source,params(row.edgeId,.5),{strategy:'analytic'}),error=>error.code==='ANALYTIC_FAMILY_UNMATCHED');
    assert.throws(()=>buildRounding(source,{specVersion:1,mode:'width',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',widthAMm:.5,widthBMm:1,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}}),error=>error.code==='WIDTH_FAMILY_UNMATCHED');
    assert(Math.abs(cad.measureVolume(source)-volume)<1e-8);
  }finally{dispose(source);}
});

test('T4 width material follows convex and concave support sides after rotation',()=>{
  const outer=cad.makeBox([0,0,0],[20,10,8]),pocket=cad.makeBox([5,2,5],[15,8,9]),base=outer.cut(pocket),source=base.rotate(90,[0,0,0],[0,0,1]);let result;
  try{
    const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[0]+2)<1e-6&&Math.abs(item.midpoint[2]-5)<1e-6&&Math.abs(item.endPoint[1]-item.startPoint[1])>9.9);
    assert(row,'rotated concave straight edge');
    result=buildRounding(source,{specVersion:1,mode:'width',scope:{kind:'edges',edgeIds:[row.edgeId]},propagation:'selected-only',widthAMm:.4,widthBMm:.7});
    assert.equal(result.roundingReport.width.material,'add');
    assert(cad.measureVolume(result)>cad.measureVolume(source));
    assert.equal(result.roundingReport.validation.solid,'passed');
  }finally{dispose(result);dispose(source);dispose(base);dispose(pocket);dispose(outer);}
});

test('T6 whole-body constant R preserves an explicitly excluded sharp edge',()=>{
  const source=cad.makeBox([0,0,0],[20,10,8]);let result,section;
  try{
    const row=topologyDetails(source).find(item=>Math.abs(item.midpoint[1])<1e-7&&Math.abs(item.midpoint[2])<1e-7&&Math.abs(item.endPoint[0]-item.startPoint[0])>19.9);
    result=buildRounding(source,{specVersion:1,mode:'constant',scope:{kind:'body',excludeEdgeIds:[row.edgeId]},propagation:'selected-only',radiusMm:.5,boundaryRequirement:'standard',endpoints:{defaultMode:'natural'}});
    assert.equal(result.roundingReport.validation.solid,'passed');
    assert.deepEqual(result.roundingReport.excludedEdgeIds,[row.edgeId]);
    assert(!result.roundingReport.processedEdgeIds.includes(row.edgeId));
    section=extractPlaneSection(result,{plane:'YZ',offset:10},cad);
    const edges=section.edges,corner=[10,0,0],distance=p=>Math.hypot(...p.map((v,i)=>v-corner[i]));
    const incident=edges.filter(edge=>edge.geomType==='LINE'&&Math.min(distance(edge.startPoint.toTuple()),distance(edge.endPoint.toTuple()))<1e-5);
    assert(incident.length>=2,'excluded central corner stays sharp in the actual BRep section');
    edges.forEach(dispose);
  }finally{dispose(section);dispose(result);dispose(source);}
});
