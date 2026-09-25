import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import { CadKernel } from '../src/cad-kernel.js';
import { getOperation } from '../src/operation-registry.js';
import { readDocs } from '../src/page-api-docs.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const outerWidth=26.8,innerWidth=21,outerHeight=36,outerCrownRadius=11,sectionDepth=4.3;
const sectionWidth=(outerWidth-innerWidth)/2,legX=(outerWidth-sectionWidth)/2;
const shoulderX=outerWidth/2-outerCrownRadius,centerRadius=outerCrownRadius-sectionWidth/2;
const shoulderY=outerHeight-sectionWidth/2-centerRadius,topY=shoulderY+centerRadius;
const p=(x,y)=>[x,y,0],q=Math.SQRT1_2;
const segments=[
  {type:'line',points:[p(legX,0),p(legX,shoulderY)]},
  {type:'arc',points:[p(legX,shoulderY),p(shoulderX+centerRadius*q,shoulderY+centerRadius*q),p(shoulderX,topY)]},
  {type:'line',points:[p(shoulderX,topY),p(-shoulderX,topY)]},
  {type:'arc',points:[p(-shoulderX,topY),p(-shoulderX-centerRadius*q,shoulderY+centerRadius*q),p(-legX,shoulderY)]},
  {type:'line',points:[p(-legX,shoulderY),p(-legX,0)]},
];
const params={pathType:'segments',segments,section:'ellipse',sectionWidth,sectionDepth};
const rebuild=async patch=>kernel.rebuild({version:1,features:[{id:'u',op:'curveSweep',refs:[],params:{...params,...patch}}],imports:{},hidden:[]});
const near=(a,b,tol=1e-4)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

const result=await rebuild({});
assert.equal(result.stats.solids,1);
result.bodies[0].bounds.max.forEach((v,i)=>near(v-result.bodies[0].bounds.min[i],[outerWidth,outerHeight,sectionDepth][i]));
const centerline=2*shoulderY+Math.PI*centerRadius+2*shoulderX;
near(result.stats.volume,centerline*Math.PI*sectionWidth*sectionDepth/4,1e-3);
const step=await kernel.export('step');
assert.ok(step?.data?.byteLength>0);
assert.ok(getOperation('curveSweep').inputSchema.properties.section.enum.includes('ellipse'));
assert.match(readDocs({docId:'recipes.ellipse-u-wire'}).text,/api\.run/);
for(const bad of [{sectionDepth:sectionWidth},{sectionWidth:0},{segments:[...segments.slice(0,-1),{type:'line',points:[p(-legX,shoulderY+0.1),p(-legX,0)]}]}]){
  await assert.rejects(rebuild(bad));
}
kernel.dispose();
console.log('PASS PG10537 elliptical open U: source dimensions, volume, STEP and parameter guards');
