import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const f=(id,op,params={},refs=[])=>({id,op,params,refs,name:id});
const run=features=>kernel.rebuild({version:1,features,imports:{},hidden:[]});
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<=Math.max(tolerance,Math.abs(b)*1e-7),`${a} != ${b}`);
const size=body=>body.bounds.max.map((v,i)=>v-body.bounds.min[i]);
const area=p=>p.section==='square'?p.sectionSize**2-(4-Math.PI)*p.sectionRadius**2:Math.PI*p.sectionSize**2/4;
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}
await test('bounded quick-model families: exact section area × analytic centerline length',async()=>{
  for(const kind of ['ring','dBuckle','rectBuckle','ovalBuckle'])for(const section of ['round','square']) {
    const p={...QUICK_MODELS[kind].defaults,kind,section};const s=p.sectionSize,w=p.innerWidth,h=p.innerHeight,r=p.innerRadius;
    let length,expected;
    if(kind==='ring'){length=Math.PI*(p.innerDiameter+s);expected=[p.innerDiameter+2*s,p.innerDiameter+2*s,s];}
    if(kind==='dBuckle'){const rc=(w+s)/2,cr=r+s/2,bottom=w/2-h-s/2,cy=bottom+cr,cx=rc-cr;length=Math.PI*rc-2*cy+Math.PI*cr+2*cx;expected=[w+2*s,h+2*s,s];}
    if(kind==='rectBuckle'){const cr=r+s/2;length=2*(w+h+2*s)-8*cr+2*Math.PI*cr;expected=[w+2*s,h+2*s,s];}
    if(kind==='ovalBuckle'){const cx=w/2-r,large=(cx*cx+(h/2)**2-r*r)/(2*(h/2-r)),cy=large-h/2,t=Math.atan2(cy,cx);length=4*t*(r+s/2)+2*(Math.PI-2*t)*(large+s/2);expected=[w+2*s,h+2*s,s];}
    const {bodies,stats}=await run([f('q','quickModel',p)]);assert.equal(stats.solids,1);near(stats.volume,length*area(p));size(bodies[0]).forEach((v,i)=>near(v,expected[i]));
  }
});
await test('bottom parallel flat cut is real removed material',async()=>{
  for(const kind of ['dBuckle','rectBuckle'])for(const section of ['round','square']){
    const p={...QUICK_MODELS[kind].defaults,kind,section};const closed=await run([f('q','quickModel',p)]);
    const opened=await run([f('q','quickModel',{...p,gapWidth:.5})]);assert.equal(opened.stats.solids,1);near(closed.stats.volume-opened.stats.volume,.5*area(p));
    const cutFaces=opened.bodies[0].faceGroups.filter(g=>{const info=(()=>{try{return kernel.faceInfo('q',g.faceId);}catch{return null;}})();return info&&Math.abs(Math.abs(info.origin[0])-.25)<1e-6;});assert.equal(cutFaces.length,2);
  }
});
await test('ring and four-arc oval real opening face spacing',async()=>{
  for(const kind of ['ring','ovalBuckle'])for(const section of ['round','square']){
    const p={...QUICK_MODELS[kind].defaults,kind,section,gapWidth:.4};const result=await run([f('q','quickModel',p)]);assert.equal(result.stats.solids,1);
    const axis=kind==='ring'?0:1,capCoordinates=[];
    for(const g of result.bodies[0].faceGroups){try{const info=kernel.faceInfo('q',g.faceId);if(Math.abs(Math.abs(info.normal[axis])-1)<1e-6)capCoordinates.push(info.origin[axis]);}catch{}}
    assert.equal(capCoordinates.length,2);near(Math.abs(capCoordinates[0]-capCoordinates[1]),.4);
  }
});
await test('wide-gap C ring has exact swept volume for round and rounded-square wire',async()=>{
  for(const section of ['round','square']){
    const p={...QUICK_MODELS.openArcRing.defaults,kind:'openArcRing',section,openingAngle:80};
    const result=await run([f('c','quickModel',p)]),radius=(p.innerDiameter+p.sectionSize)/2;
    near(result.stats.volume,(Math.PI*2-p.openingAngle*Math.PI/180)*radius*area(p));assert.equal(result.stats.solids,1);
  }
  for(const bad of [{openingAngle:4},{openingAngle:181},{innerDiameter:15},{section:'bad'},{section:'square',sectionRadius:2}])await assert.rejects(run([f('bad','quickModel',{...QUICK_MODELS.openArcRing.defaults,kind:'openArcRing',...bad})]));
});
await test('fixed bar templates preserve nominal dimensions and single fused solid',async()=>{
  for(const [kind,section,offset] of [['dBarBuckle','square',0],['sliderBuckle','round',0],['sliderBuckle','round',1],['sliderBuckle','square',-1.5]]){
    const p={...QUICK_MODELS[kind].defaults,kind,section};if(kind==='sliderBuckle')p.barOffset=offset;
    const result=await run([f('q','quickModel',p)]);assert.equal(result.stats.solids,1);
    const expected=[p.innerWidth+2*p.sectionSize,p.innerHeight+p.sectionSize+(kind==='dBarBuckle'?p.barDiameter:p.sectionSize),p.sectionSize];size(result.bodies[0]).forEach((v,i)=>near(v,expected[i]));
  }
});
await test('flat washer analytic volume and thickness',async()=>{
  const p={kind:'washer',innerDiameter:10,sectionSize:3,innerHeight:1.5};const result=await run([f('q','quickModel',p)]);near(result.stats.volume,Math.PI*(8**2-5**2)*1.5);size(result.bodies[0]).forEach((v,i)=>near(v,[16,16,1.5][i]));
});
await test('invalid template ranges are rejected, do not silently adjust dimensions',async()=>{
  for(const p of [{kind:'ring',section:'square',innerDiameter:5,sectionSize:3},{kind:'dBuckle',innerHeight:5},{kind:'sliderBuckle',barOffset:20},{kind:'ovalBuckle',innerRadius:8},{kind:'rectBuckle',section:'square',sectionRadius:2}])await assert.rejects(run([f('q','quickModel',p)]));
});
await test('all template STEP roundtrips retain volume and exact editable solids',async()=>{
  for(const kind of Object.keys(QUICK_MODELS)){
    const original=await run([f('q','quickModel',{kind})]);const out=await kernel.export('step');
    const roundtrip=await kernel.rebuild({version:1,features:[f('i','import',{key:'f'})],imports:{f:{format:'step',data:Buffer.from(out.data).toString('base64')}}});near(original.stats.volume,roundtrip.stats.volume);assert.equal(roundtrip.stats.solids,1);
  }
});
await test('sweep is exact along straight and three-dimensional mitered paths',async()=>{
  near((await run([f('s','sweep',{profile:'circle',radius:2,points:[[0,0,0],[0,0,20]]})])).stats.volume,80*Math.PI);
  const result=await run([f('s','sweep',{profile:'rectangle',width:2,depth:3,points:[[0,0,0],[0,0,20],[20,0,20],[20,15,20]]})]);assert.equal(result.stats.solids,1);near(result.stats.volume,55*6);
});
await test('circle and rectangle loft analytic frustum volume and offsets',async()=>{
  near((await run([f('l','loft',{profile:'circle',radius:4,endRadius:2,height:12,offsetX:3,offsetY:5})])).stats.volume,112*Math.PI);
  near((await run([f('l','loft',{profile:'rectangle',width:8,depth:6,endWidth:4,endDepth:3,height:12})])).stats.volume,336);
});
const box=f('b','box',{width:20,depth:16,height:10});
await test('split preserves both solids and extract keeps original by default',async()=>{
  const features=[box,f('split','split',{plane:'XY',offset:4},['b'])];const result=await run(features);assert.equal(result.stats.solids,2);near(result.stats.volume,3200);
  const extracted=await run([...features,f('one','extractSolid',{solidIndex:0},['split'])]);assert.equal(extracted.bodies.length,2);assert.equal(extracted.bodies[0].solidCount,2);assert.equal(extracted.bodies[1].solidCount,1);
  const consumed=await run([...features,f('one','extractSolid',{solidIndex:1,keepOriginal:false},['split'])]);assert.equal(consumed.bodies.length,1);
  await assert.rejects(run([box,f('bad','split',{plane:'XY',offset:40},['b'])]),/未穿过/);
});
await test('true planar normals, selected face hole inwards and face push/pull',async()=>{
  await run([box]);let top,side;
  for(let i=0;i<6;i++){const info=kernel.faceInfo('b',i);if(info.normal[2]>.99)top=i;if(info.normal[0]>.99)side=i;}
  assert.ok(Number.isInteger(top)&&Number.isInteger(side));near(kernel.faceInfo('b',top).origin[2],10);
  near((await run([box,f('h','faceHole',{faceId:top,point:[10,8,10],radius:2,depth:4},['b'])])).stats.volume,3200-16*Math.PI);
  near((await run([box,f('h','faceHole',{faceId:side,point:[20,8,5],radius:2,through:true},['b'])])).stats.volume,3200-80*Math.PI);
  near((await run([box,f('e','faceExtrude',{faceId:top,height:3},['b'])])).stats.volume,4160);
  near((await run([box,f('e','faceExtrude',{faceId:top,height:-3},['b'])])).stats.volume,2240);
  await assert.rejects(run([box,f('bad','faceHole',{faceId:top,radius:2,depth:3,point:[100,100,10]},['b'])]),/不在/);
});
await test('curved face rejection and analytic edge length/area/radius/snap centers',async()=>{
  const result=await run([f('c','cylinder',{radius:5,height:10})]);near(kernel.measure('c','face',0).area,100*Math.PI);
  assert.throws(()=>kernel.faceInfo('c',0),/真实平面/);
  const circles=[];for(const edge of result.bodies[0].edges){const m=kernel.measure('c','edge',edge.edgeId);if(m.geomType==='CIRCLE')circles.push(m);}
  assert.equal(circles.length,2);circles.forEach(c=>{near(c.radius,5);near(c.diameter,10);near(c.length,10*Math.PI);});
  const centers=result.bodies[0].snapPoints.filter(s=>s.type==='center');assert.equal(centers.length,2);centers.forEach(c=>{near(c.point[0],0);near(c.point[1],0);});
});
await test('rounded rectangle and arc profiles use analytic curves and volume',async()=>{
  near((await run([f('r','extrude',{profile:'roundedRectangle',width:20,depth:10,cornerRadius:2,height:3})])).stats.volume,(200-(4-Math.PI)*4)*3);
  for(const angle of [90,180,270])for(const closure of ['sector','segment']){
    const radians=angle*Math.PI/180,expected=(radians-(closure==='segment'?Math.sin(radians):0))*25/2*3;
    near((await run([f('a','extrude',{profile:'arc',radius:5,startAngle:0,endAngle:angle,closure,height:3})])).stats.volume,expected);
  }
});
kernel.dispose();console.log(`${passed} advanced kernel checks passed, ${failed} failed`);if(failed)process.exitCode=1;
