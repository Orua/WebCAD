import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildSectionCurveLoft} from '../src/section-curve-loft.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const stations=profile=>Array.from({length:3},(_,i)=>({centerMm:[0,0,i*5],normal:[0,0,1],widthDirection:[1,0,0],widthMm:2,depthMm:2,profile}));
test('UP-23 superellipse, asymmetric, NACA airfoil and closed spline loft as one solid',()=>{
 const nacaArea=(()=>{const n=20000,th=.12;let sum=0;for(let i=0;i<=n;i++){const x=i/n,y=5*th*(.2969*Math.sqrt(x)-.1260*x-.3516*x*x+.2843*x**3-.1015*x**4);sum+=(i===0||i===n?1:i%2?4:2)*y;}return (sum/(3*n))*2*2*2;})();
 const profiles=[
  [{kind:'superellipse',exponent:2},Math.PI],
  [{kind:'asymmetric',depthUpMm:1,depthDownMm:.5,widthLeftMm:1.2,widthRightMm:.8},Math.PI/4*2*1.5],
  [{kind:'airfoil',naca:'0012'},nacaArea],
  [{kind:'airfoil',naca:'2412'},nacaArea],
  [{kind:'spline',points2d:[[-1,0],[0,1],[1,0],[0,-1]],closed:true},2],
 ];
 for(const [profile,expectedArea] of profiles){
  const shape=buildSectionCurveLoft({stations:stations(profile),loftDegree:2,volumeCheck:'off'},cad);
  try{const solids=shape.solids;try{assert.equal(solids.length,1);}finally{solids.forEach(s=>s.delete?.());}assert.ok(cad.measureVolume(shape)>0);const area=shape.loftReport.estimatedVolumeMm3/10;assert.ok(Math.abs(area-expectedArea)/expectedArea<.01,`${profile.kind} area error=${Math.abs(area-expectedArea)/expectedArea}`);}finally{shape.delete();}
 }
});
