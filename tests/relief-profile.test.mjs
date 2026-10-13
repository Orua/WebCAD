import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReliefProfile} from '../src/mesh/relief-profile.js';
import {makeReliefPlate} from '../src/mesh/relief-plate.js';
import {editMeshRelief,meshGeometryHash} from '../src/mesh/relief-edit.js';
import {reliefEditExample,reliefEditOperation} from '../src/mesh/relief-edit-contract.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {sampleMeshRelief} from '../src/mesh/relief-sample.js';
import {reliefHoleFixture} from './fixtures/relief-hole.mjs';
import {branchTarget,branchField} from './fixtures/relief-branches.mjs';
const profile=(width=1,height=-.4)=>({segments:[[[-4,0],[-2,0],[2,0],[4,0]]],stations:[{at:0,sectionMm:[[-width/2,0],[0,height],[width/2,0]]},{at:1,sectionMm:[[-width/2,0],[0,height],[width/2,0]]}],endTaperMm:[1,1],baseHeightMm:0,curveToleranceMm:.005,maxSourceSpacingMm:.1});
test('physical cross/longitudinal sections and end taper are controlled without overshoot',()=>{
 const p=profile(),f=prepareReliefProfile(p);assert.equal(f.sample(0,0),-.4);assert.equal(f.sample(0,.5),0);assert.equal(f.sample(0,.25),-.2);assert.equal(f.sample(-3.5,0),-.2);assert.equal(f.sample(-4.1,0),0);
 const ridge=profile(2,.6);ridge.stations.splice(1,0,{at:.5,sectionMm:[[-1,0],[-.5,.2],[.1,.6],[.3,.4],[1,0]]});const r=prepareReliefProfile(ridge);assert.ok(Math.abs(r.sample(0,.1)-.6)<1e-12);assert.ok(Math.abs(r.sample(0,.3)-.4)<1e-12);for(let x=-4;x<=4;x+=.25)for(let y=-1;y<=1;y+=.1)assert.ok(r.sample(x,y)<=.6+1e-12);
});
test('invalid sections, self-crossing path, joint tangent conflict and overlapping taper reject',()=>{
 const p=profile();for(const patch of [{endTaperMm:[5,5]},{stations:[{at:0,sectionMm:[[0,0],[1,1],[.5,0]]},p.stations[1]]},{segments:[[[0,0],[1,1],[2,2],[3,3]],[[3,3],[2,3],[1,3],[0,3]]]},{segments:[[[0,0],[10,10],[-10,10],[1,0]],[[1,0],[2,-10],[3,-10],[0,5]]]}])assert.throws(()=>prepareReliefProfile({...p,...patch}));
});
test('three joined cubic ridge segments replace the wrong middle path without leaving a double ridge; rotated reuse',()=>{
 const segments=[[[-3,0],[-7/3,0],[-5/3,1],[-1,1]],[[-1,1],[-1/3,1],[1/3,-1],[1,-1]],[[1,-1],[5/3,-1],[7/3,0],[3,0]]];
 for(const rotated of [false,true]){
  const rotate=p=>rotated?[-p[1],p[0]]:p;
  const target={...profile(.5,.6),segments:segments.map(c=>c.map(rotate)),endTaperMm:[.3,.3]},wrong={...target,segments:segments.map((c,i)=>c.map((p,j)=>rotate([p[0],p[1]+(i===0&&j<2||i===2&&j>1?0:1)])))};
  const old=prepareReliefProfile(wrong),source=makeReliefPlate({version:1,widthMm:10,depthMm:10,thicknessMm:2,spacingMm:.1,bumps:[]});
  for(let i=0;i<source.positions.length;i+=3)if(source.positions[i+2]===0)source.positions[i+2]=old.sample(source.positions[i],source.positions[i+1]);
  const {value,...base}=reliefEditExample,p={...base,inputGeometryHash:meshGeometryHash(source),seedMm:[-4,-4,0],region:{centerMm:[0,0],coreRadiusMm:4,transitionMm:.5},mode:'replace',profile:target,minThicknessMm:1};
  const result=editMeshRelief(source,p),heightAt=(x,y)=>{const q=rotate([x,y]);for(let i=0;i<result.mesh.positions.length/2;i+=3)if(Math.abs(result.mesh.positions[i]-q[0])<1e-9&&Math.abs(result.mesh.positions[i+1]-q[1])<1e-9)return result.mesh.positions[i+2];throw Error('Missing fixture sample');};
  assert.ok(Math.abs(heightAt(0,0)-.6)<1e-9);assert.equal(heightAt(0,1),0);assert.ok(Math.abs(heightAt(-1,1)-.6)<1e-9);assert.ok(Math.abs(heightAt(1,-1)-.6)<1e-9);
 }
});
test('generic replace corrects an existing groove width and depth, preserving back and outside ROI',()=>{
 const source=makeReliefPlate({version:1,widthMm:12,depthMm:8,thicknessMm:2,spacingMm:.1,bumps:[]}),wrong=prepareReliefProfile(profile(1.4,-.7));
 // Create an imported wrong surface before the editing operation, no recipe link.
 for(let i=0;i<source.positions.length;i+=3)if(source.positions[i+2]===0)source.positions[i+2]=wrong.sample(source.positions[i],source.positions[i+1]);
 const {value,...base}=reliefEditExample,p={...base,inputGeometryHash:meshGeometryHash(source),seedMm:[0,0,-.7],region:{centerMm:[0,0],coreRadiusMm:4.5,transitionMm:.5},mode:'replace',profile:profile(),minThicknessMm:1};validateSchema(reliefEditOperation.paramsSchema,p);
 const result=editMeshRelief(source,p);let top=0;
 for(let i=0;i<source.positions.length;i+=3){const [x,y,z]=source.positions.slice(i,i+3);if(z===-2||Math.hypot(x,y)>=5)assert.deepEqual(result.mesh.positions.slice(i,i+3),source.positions.slice(i,i+3));if(z!==-2&&Math.abs(x)<1e-10){assert.ok(Math.abs(result.mesh.positions[i+2]+.4*Math.max(0,1-Math.abs(y)/.5))<1e-12);top++;}}
 assert.ok(top>20);assert.ok(result.report.minThicknessMm>=1.6-1e-12);assert.equal(result.report.profile.composition,'absolute-replacement');
 const measured=sampleMeshRelief(result.mesh,{bodyId:'mesh',inputGeometryHash:result.report.geometryHash,support:p.support,pointsMm:[[0,0],[0,.5],[20,20]]});assert.ok(Math.abs(measured.samples[0].heightsMm[0]+2)<1e-12);assert.ok(Math.abs(measured.samples[0].heightsMm[1]+.4)<1e-12);assert.deepEqual(measured.samples[2].heightsMm,[]);
 const saved=source.positions.slice();assert.throws(()=>editMeshRelief(source,{...p,profile:{...p.profile,maxSourceSpacingMm:.025}}),{code:'RELIEF_RESOLUTION_INSUFFICIENT'});assert.deepEqual(source.positions,saved);
});
test('local pullback corrects misplaced oversized ellipse without moving the plate or nearby protected peak',()=>{
 const source=makeReliefPlate({version:1,widthMm:16,depthMm:10,thicknessMm:2,spacingMm:.1,bumps:[]}),dome=(x,y,cx,rx)=>Math.max(0,1-((x-cx)/rx)**2-y*y)**2;
 for(let i=0;i<source.positions.length;i+=3)if(source.positions[i+2]===0){const x=source.positions[i],y=source.positions[i+1];source.positions[i+2]=dome(x,y,1,2.4)+(Math.hypot(x-6,y)<=.5?.8:0);}
 const {value,...base}=reliefEditExample,p={...base,inputGeometryHash:meshGeometryHash(source),seedMm:[1,0,1],region:{centerMm:[.5,0],coreRadiusMm:3.5,transitionMm:.5},protectedRegions:[{centerMm:[6,0],radiusMm:1}],mode:'replace',deformation:{pivotMm:[1,0],translationMm:[-1,0],scale:[1/1.2,1],angleDeg:0,sourceRegion:{centerMm:[1,0],radiusMm:2.5},baseHeightMm:0,maxSourceSpacingMm:.15},minThicknessMm:1};validateSchema(reliefEditOperation.paramsSchema,p);
 const result=editMeshRelief(source,p);let error=0;
 for(let i=0;i<source.positions.length;i+=3){const [x,y,z]=source.positions.slice(i,i+3);if(z===-2||Math.hypot(x-6,y)<=1||Math.hypot(x-.5,y)>=4)assert.deepEqual(result.mesh.positions.slice(i,i+3),source.positions.slice(i,i+3));else error=Math.max(error,Math.abs(result.mesh.positions[i+2]-dome(x,y,0,2)));}
 assert.ok(error<.005,`observed sample error ${error}`);assert.throws(()=>editMeshRelief(source,{...p,deformation:{...p.deformation,scale:[0,1]}}),{code:'RELIEF_DEFORMATION_INVALID'});
 assert.throws(()=>editMeshRelief(source,{...p,deformation:{...p.deformation,scale:[1,1],sourceRegion:{centerMm:[100,0],radiusMm:5},translationMm:[-100,0]}}),{code:'RELIEF_SAMPLE_OUTSIDE'});
});
test('hole connectivity and all wall coordinates survive local editing; crossing a fixed hole rim rejects',()=>{
 const mesh=reliefHoleFixture(),p={...reliefEditExample,inputGeometryHash:meshGeometryHash(mesh),seedMm:[-2,0,.8],region:{centerMm:[-2,0],coreRadiusMm:1.3,transitionMm:.2},value:.5,minThicknessMm:1};
 const r=editMeshRelief(mesh,p);assert.deepEqual(r.mesh.indices,mesh.indices);
 const query={bodyId:'hole',inputGeometryHash:r.report.geometryHash,support:p.support,pointsMm:[[2,0],[-2,0]]};const samples=sampleMeshRelief(r.mesh,query).samples;assert.deepEqual(samples[0].heightsMm,[]);assert.deepEqual(samples[1].heightsMm,[-2,.4]);
 for(let i=0;i<mesh.positions.length;i+=3)if(mesh.positions[i]>1||mesh.positions[i+2]<0)assert.deepEqual(mesh.positions.slice(i,i+3),r.mesh.positions.slice(i,i+3));
 assert.throws(()=>editMeshRelief(mesh,{...p,region:{centerMm:[2,0],coreRadiusMm:1,transitionMm:.25},mode:'offset',value:.3}),{code:'RELIEF_BOUNDARY_CONFLICT'});
});
test('local replacement removes a spike while a nearby sharp groove remains bitwise protected',()=>{
 const mesh=makeReliefPlate({version:1,widthMm:10,depthMm:8,thicknessMm:2,spacingMm:.25,bumps:[]}),height=(x,y)=>Math.max(0,1-(x*x+y*y)/4)*.5;
 for(let i=0;i<mesh.positions.length;i+=3)if(mesh.positions[i+2]===0){const x=mesh.positions[i],y=mesh.positions[i+1];mesh.positions[i+2]=height(x,y)+(Math.abs(x-.5)<1e-9&&Math.abs(y)<1e-9?.8:0)-(x>=1&&x<=1.25&&Math.abs(y)<1?.2:0);}
 const {value,...base}=reliefEditExample,field={originMm:[-1,-1],sizeMm:[2,2],heightsMm:Array.from({length:9},(_,j)=>Array.from({length:9},(_,i)=>height(-1+i*.25,-1+j*.25)))},p={...base,inputGeometryHash:meshGeometryHash(mesh),seedMm:[0,0,.5],region:{centerMm:[.5,0],coreRadiusMm:.3,transitionMm:.2},protectedRegions:[{centerMm:[1.125,0],radiusMm:1}],mode:'replace',field,minThicknessMm:1};
 // Protect a narrow groove without accidentally protecting the spike itself.
 p.protectedRegions=[{centerMm:[1.125,0],radiusMm:.2}];const r=editMeshRelief(mesh,p);
 for(let i=0;i<mesh.positions.length;i+=3){const [x,y,z]=mesh.positions.slice(i,i+3);if(Math.abs(x-.5)<1e-9&&Math.abs(y)<1e-9&&z>0)assert.equal(r.mesh.positions[i+2],height(x,y));if(x>=1||z<0)assert.deepEqual(r.mesh.positions.slice(i,i+3),mesh.positions.slice(i,i+3));}
});
test('one common-root replacement forms three connected branches with independent target heights',()=>{
 const mesh=makeReliefPlate({version:1,widthMm:12,depthMm:14,thicknessMm:2,spacingMm:.0625,bumps:[{centerMm:[0,2],heightMm:1.2,plateauRadiusMm:1,outerRadiusMm:4.5}]}),{value,...base}=reliefEditExample,p={...base,inputGeometryHash:meshGeometryHash(mesh),seedMm:[0,2,1.2],region:{centerMm:[0,2],coreRadiusMm:5,transitionMm:.25},mode:'replace',field:branchField(),minThicknessMm:1};
 const r=editMeshRelief(mesh,p);let vertexError=0,centroidError=0;
 for(let i=0;i<mesh.positions.length/2;i+=3)vertexError=Math.max(vertexError,Math.abs(r.mesh.positions[i+2]-branchTarget(r.mesh.positions[i],r.mesh.positions[i+1])));
 for(let i=0;i<mesh.indices.length;i+=3){const q=Array.from(mesh.indices.slice(i,i+3),j=>Array.from(r.mesh.positions.slice(j*3,j*3+3)));if(q.some(v=>v[2]<0))continue;const x=q.reduce((s,v)=>s+v[0],0)/3,y=q.reduce((s,v)=>s+v[1],0)/3,z=q.reduce((s,v)=>s+v[2],0)/3;centroidError=Math.max(centroidError,Math.abs(z-branchTarget(x,y)));}
 assert.ok(vertexError<1e-12);assert.ok(centroidError<.02,`observed triangle-centroid deviation ${centroidError}`);
 assert.ok(branchTarget(-.9,.5)>0);assert.equal(branchTarget(.9,3),0);assert.ok(branchTarget(1.8,3)>.89);assert.equal(branchTarget(1.8,6),0);
});
