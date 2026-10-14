import test from 'node:test';import assert from 'node:assert/strict';
import {makeHeightfieldRelief,heightfieldReliefExample,heightfieldSamples} from '../src/mesh/heightfield-relief.js';
const b64=bytes=>Buffer.from(bytes).toString('base64');
function check(mesh){const p=mesh.positions,I=mesh.indices,edges=new Map();let vol=0;
 for(let i=0;i<I.length;i+=3){const [a,b,c]=[I[i],I[i+1],I[i+2]].map(k=>[p[k*3],p[k*3+1],p[k*3+2]]);
  vol+=(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  for(const [u,v] of [[I[i],I[i+1]],[I[i+1],I[i+2]],[I[i+2],I[i]]]){const k=u+','+v;edges.set(k,(edges.get(k)||0)+1);}}
 for(const [k,n] of edges){const [u,v]=k.split(',');assert.equal(n,1);assert.equal(edges.get(v+','+u),1,'every edge has one opposite twin');}
 return vol;}
test('example heightfield is closed and outward-oriented',()=>{assert.ok(check(makeHeightfieldRelief(heightfieldReliefExample))>400);});
test('flat field volume equals plate; resolution beyond 65 is accepted',()=>{
 const c=300,r=200,p={...heightfieldReliefExample,widthMm:30,depthMm:20,baseMm:2,heightMm:1,columns:c,rows:r,heights:{encoding:'u8',data:b64(new Uint8Array(c*r))}};
 assert.ok(Math.abs(check(makeHeightfieldRelief(p))-30*20*2)<1e-6);
 const full={...p,heights:{encoding:'u8',data:b64(new Uint8Array(c*r).fill(255))}};assert.ok(Math.abs(check(makeHeightfieldRelief(full))-30*20*3)<1e-6);
});
test('invert, smoothing, gamma and edge fade shape heights',()=>{
 const c=21,r=21,bytes=new Uint8Array(c*r);bytes[10*c+10]=255;const p={...heightfieldReliefExample,columns:c,rows:r,heightMm:2,heights:{encoding:'u8',data:b64(bytes)}};
 assert.equal(Math.max(...heightfieldSamples(p)),2);
 assert.ok(Math.max(...heightfieldSamples({...p,smoothing:2}))<1);
 assert.equal(heightfieldSamples({...p,invert:true})[0],2);
 assert.equal(heightfieldSamples({...p,invert:true,edgeFadeMm:3})[0],0);
});
test('rejects bad sample counts and oversize grids',()=>{
 assert.throws(()=>makeHeightfieldRelief({...heightfieldReliefExample,columns:4}),/HEIGHTFIELD_INVALID|Expected/);
 assert.throws(()=>makeHeightfieldRelief({...heightfieldReliefExample,columns:2049,rows:2049,heights:{encoding:'u8',data:''}}),/1900000/);
});
