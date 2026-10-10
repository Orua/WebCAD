import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReliefSculpt,effectiveReliefParams,reliefHeights,createReliefStroke,sampleReliefHeight} from '../src/relief-sculpt.js';
import {cubicBasis,sampleReliefSurface} from '../src/relief-sculpt-surface.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {reliefOperations} from '../src/modeling/manufacturing/relief-contracts.js';
import {validateRegions} from '../src/logo-model.js';
import {showReliefSculptDialog} from '../src/ui/forms/relief-sculpt-dialog.js';
test('layered sculpt dialog switches independent drafts and commits only the chosen layer',async()=>{
 const oldStorage=globalThis.sessionStorage,oldRAF=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;
 const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 class E{
  constructor(tag,attrs={},text=''){Object.assign(this,attrs);this.tag=tag;this.style={};this.children=[];this.listeners={};this.textContent=text;this.value=attrs.value??'';}
  append(...items){for(const item of items){item.previousElementSibling=this.children.at(-1);item.parentElement=this;this.children.push(item);if(this.tag==='select'&&!this.value)this.value=item.value;}}
  get options(){return this.children;}
  querySelector(){return null;}
  querySelectorAll(){return this.children.flatMap(c=>[...(['input','select'].includes(c.tag)?[c]:[]),...c.querySelectorAll()]);}
  addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
  async fire(k,event={}){for(const f of this.listeners[k]??[])await f({preventDefault(){},stopPropagation(){},...event});}
  focus(){} setPointerCapture(){}
 }
 const elements=[],element=(...a)=>{const e=new E(...a);elements.push(e);return e;},button=(text,click)=>{const e=element('button',{},text);e.click=click;return e;};
 const layer={heightMm:.5,regions:[{outer:[[-.4,-.4],[.4,-.4],[.4,.4],[-.4,.4]]}]},params={faceId:0,widthMm:12,heightMm:12,depthMm:1,layers:[{...layer,name:'first'},{...layer,name:'second'}]};
 let state={revision:1,document:{documentId:'sculpt-ui-test',features:[{id:'relief',op:'relief',name:'source',params,refs:[]}]}},viewDraft,edited,previewPatch;
 const dialog=element('dialog');
 try{
  const edit=async(id,patch)=>{edited=patch;state={...state,revision:state.revision+1,document:{...state.document,features:state.document.features.map(f=>({...f,params:{...f.params,...patch}}))}};return true;};
  showReliefSculptDialog({featureId:'relief',getState:()=>state,openDialog:()=>dialog,element,button,close(){},createView:()=>({update(p,d){viewDraft=structuredClone(d);},cursor(){},fit(){},dispose(){},point:()=>[0,0],sample:()=>.5}),onEdit:edit,onPreview:async(id,patch)=>{previewPatch=patch;state.preview=true;},onCancelPreview:async()=>{previewPatch=null;state.preview=false;},onCommitPreview:async()=>{state.preview=false;return edit('relief',previewPatch);}});
  const select=elements.find(e=>e['aria-label']==='浮雕图层'),canvas=elements.find(e=>e['aria-label']==='浮雕精修画布'),apply=elements.find(e=>e.textContent==='应用当前图层');
  assert.equal(select.options.length,2);await canvas.fire('pointerdown',{button:0,pointerId:1});await canvas.fire('pointerup',{pointerId:1});const first=structuredClone(viewDraft);assert(first.deltaMm.flat().some(v=>v>0));
  select.value='relief|layer:1';await select.fire('change');assert(viewDraft.deltaMm.flat().every(v=>v===0));await canvas.fire('pointerdown',{button:0,pointerId:1});await canvas.fire('pointerup',{pointerId:1});await apply.click();
  assert.deepEqual(edited.layers[0],params.layers[0]);assert.equal(edited.layers[1].values.length,33);assert(edited.layers[1].sculpt.deltaMm.flat().some(v=>v>0));assert.equal(state.revision,2);
  select.value='relief|layer:0';await select.fire('change');assert.deepEqual(viewDraft,first);
  await elements.find(e=>e.textContent==='放弃本层修改').click();const scope=elements.find(e=>e['aria-label']==='精修范围');scope.value='local';await scope.fire('change');assert.equal(viewDraft.deltaMm.length,17);
  await canvas.fire('pointerdown',{button:0,pointerId:1});await canvas.fire('pointerup',{pointerId:1});const actualPreview=elements.find(e=>e.textContent==='在原柱面与邻层中预览');await actualPreview.click();assert.equal(state.revision,2);assert(previewPatch.layers[0].localPatches[0].deltaMm.flat().some(v=>v>0));assert.equal(apply.disabled,false);await apply.click();assert.equal(state.revision,3);assert.equal(state.document.features[0].params.layers[0].values,undefined);assert.equal(state.document.features[0].params.layers[0].localPatches[0].id,'local-0');assert.equal(state.document.features[0].params.layers[1].values.length,33);dialog._onClose();
 }finally{globalThis.sessionStorage=oldStorage;globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});
const source=()=>({faceId:0,widthMm:16,heightMm:16,depthMm:1,surfaceMode:'smooth',values:Array.from({length:17},()=>Array(17).fill(.5)),regions:[{outer:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],holes:[[[-.4,-.4],[-.2,-.4],[-.2,-.2],[-.4,-.2]]]}]});
const brush=(mode,extra={})=>({mode,radiusMm:3,amountMm:.4,points:[[0,0]],...extra});
test('explicit layer sculpt preserves other layers, contours, holes and serialized increments',()=>{
 const base=source(),params={faceId:0,widthMm:16,heightMm:16,depthMm:1,layers:[{name:'base',heightMm:.2,regions:base.regions},{name:'detail',heightMm:1,regions:base.regions}]},before=structuredClone(params);
 assert.throws(()=>prepareReliefSculpt(params,[brush('raise')]),{code:'PARAM_SCHEMA_INVALID'});
 const result=prepareReliefSculpt(params,[brush('raise')],{layerIndex:1,samples:17});
 assert.ok(result.report.changedControls>0);assert.equal(result.report.layerIndex,1);assert.deepEqual(result.params.layers[0],params.layers[0]);assert.deepEqual(result.params.layers[1].regions,params.layers[1].regions);assert.deepEqual(params,before);
 const reopened=JSON.parse(JSON.stringify({...params,...result.params}));validateSchema(reliefOperations.relief.paramsSchema,reopened);
 assert.equal(sampleReliefHeight(reopened,[0,0],{layerIndex:1}).targetMm,1.4);
 assert.throws(()=>sampleReliefHeight(reopened,[-.3,-.3],{layerIndex:1}),{code:'RELIEF_SAMPLE_OUTSIDE'});
 assert.throws(()=>prepareReliefSculpt(reopened,[],{layerIndex:1,samples:33}),{code:'PARAM_SCHEMA_INVALID'});
});
test('relief accepts independent ornament collections above the old 150-region cap while logo retains its own limit',()=>{
 const regions=Array.from({length:165},(_,i)=>{const x=-.45+(i%15)*.06,y=-.4+Math.floor(i/15)*.07;return {outer:[[x,y],[x+.025,y],[x+.025,y+.025],[x,y+.025]]};});
 validateSchema(reliefOperations.relief.paramsSchema,{...source(),regions});
 assert.equal(validateRegions({regions},{maxRegions:1024,maxVertices:64000}).length,165);
 assert.throws(()=>validateRegions({regions}),/150/);
});
test('eyedropper samples flat, sculpted and sloped controls without mutating them; rejects holes and invalid points',()=>{
 const p=source();delete p.regions;
 p.values=p.values.map((row,j)=>row.map((_,i)=>(i+2*j)/48));
 const point=[.03125,.09375],sample=sampleReliefHeight(p,point);
 assert.ok(Math.abs(sample.targetMm-(8.5+2*9.5)/48)<1e-12);
 assert.equal(sample.units,'mm');assert.equal(sample.quantity,'height');
 assert.equal(sampleReliefHeight(p,[.5,.5]).targetMm,1);
 const flat={...p,surfaceMode:'flat',mode:'engrave'},edited=apply(flat,[brush('lower')]),copy=structuredClone(edited);
 assert.equal(sampleReliefHeight(flat,point).targetMm,1);
 assert.equal(sampleReliefHeight(edited,[0,0]).targetMm,1.4);
 assert.equal(sampleReliefHeight(edited,[0,0]).quantity,'depth');assert.deepEqual(edited,copy);
 assert.throws(()=>sampleReliefHeight(source(),[-.3,-.3]),{code:'RELIEF_SAMPLE_OUTSIDE'});
 for(const pt of [[1,0],[NaN,0],[0],null])assert.throws(()=>sampleReliefHeight(p,pt),{code:'PARAM_RANGE_INVALID'});
});
function apply(p,strokes){return {...p,...prepareReliefSculpt(p,strokes).params};}
test('local millimetre brushes preserve source, holes and distant controls across flat/smooth and emboss/engrave',()=>{
 for(const surfaceMode of ['flat','smooth'])for(const mode of ['emboss','engrave']){
  const p={...source(),surfaceMode,mode},copy=structuredClone(p),base=surfaceMode==='flat'?1:.5;
  const next=apply(p,[brush('raise')]);assert.deepEqual(p,copy);validateSchema(reliefOperations.relief.paramsSchema,next);
  const h=reliefHeights(next);assert.equal(h[8][8],base+(mode==='engrave'?-.4:.4));assert.equal(h[1][15],base);
  const cut=apply(p,[brush('raise',{points:[[-.3,-.3]],radiusMm:4})]);assert.equal(reliefHeights(cut)[3][3],base,'hole controls untouched');
  const result=effectiveReliefParams(next);assert.equal(result.values[1][15]*result.depthMm,base,'renormalization keeps physical heights');
 }
});
test('brush is independent of mouse event density and covers the entire dragged line',()=>{
 const p=source(),a=apply(p,[brush('lower',{points:[[-.3,0],[.3,0]]})]),b=apply(p,[brush('lower',{points:[[-.3,0],[-.15,0],[0,0],[.15,0],[.3,0]]})]);
 a.sculpt.deltaMm.forEach((row,j)=>row.forEach((v,i)=>assert.ok(Math.abs(v-b.sculpt.deltaMm[j][i])<1e-12)));assert.ok(reliefHeights(a)[8][8]<.2);
});
test('mask, unmask, smooth, flatten and restore compose and survive serialization',()=>{
 const p=source(),masked=apply(p,[brush('mask'),brush('raise')]);assert.equal(reliefHeights(masked)[8][8],.5);
 const raised=apply(masked,[brush('unmask'),brush('raise')]);assert.equal(reliefHeights(raised)[8][8],.9);
 const smooth=apply(raised,[brush('smooth')]);assert.ok(reliefHeights(smooth)[8][8]<.9);
 const flat=apply(smooth,[brush('flatten',{targetMm:.2})]);assert.ok(Math.abs(reliefHeights(flat)[8][8]-.2)<1e-12);
 const restored=apply(JSON.parse(JSON.stringify(flat)),[brush('restore')]);assert.equal(reliefHeights(restored)[8][8],.5);
 assert.deepEqual(restored.values,p.values);
});
test('invalid radii and corrupt edit grids fail; legacy rectangular relief remains editable',()=>{
 const p=source();assert.throws(()=>apply(p,[brush('raise',{radiusMm:.01})]),e=>e.code==='PARAM_RANGE_INVALID');
 assert.throws(()=>effectiveReliefParams({...p,sculpt:{deltaMm:[[1]],mask:[[0]]}}),e=>e.code==='RELIEF_INVALID');
 delete p.regions;delete p.surfaceMode;assert.ok(reliefHeights(apply(p,[brush('raise')]))[8][8]>.5);
});

test('incremental strokes equal batch preparation, visit local bounds and validate before editing',()=>{
 const p=source(),points=Array.from({length:80},(_,i)=>[-.25+i/160,.12*Math.sin(i/10)]),options={mode:'raise',radiusMm:2,hardness:.5,symmetry:'xy',strength:.7};
 const engine=createReliefStroke(p,options);for(const point of points)engine.append([point]);
 assert.deepEqual(engine.state,prepareReliefSculpt(p,[{...options,points}]).params.sculpt);
 assert.ok(engine.stats.visitedControls<80*17*17,'each pointer segment visits only brush bounds');
 const before=structuredClone(engine.state);assert.throws(()=>engine.append([[0,0],[NaN,0]]));assert.deepEqual(engine.state,before);
 const hard=apply(p,[brush('raise',{hardness:1})]),soft=apply(p,[brush('raise')]);assert.ok(reliefHeights(hard)[8][9]>reliefHeights(soft)[8][9]);
});

test('fill and scrape move only the requested physical side; sharpen increases local contrast and obeys masks',()=>{
 for(const mode of ['emboss','engrave']){
  const sign=mode==='engrave'?-1:1,p={...source(),mode};p.values[8][8]=.5-sign*.3;
  const low=reliefHeights(p)[8][8];
  assert.ok((reliefHeights(apply(p,[brush('fill')]))[8][8]-low)*sign>0);
  assert.equal(reliefHeights(apply(p,[brush('scrape')]))[8][8],low);
  assert.ok((reliefHeights(apply(p,[brush('sharpen')]))[8][8]-low)*sign<0);
  p.values[8][8]=.5+sign*.3;const peak=reliefHeights(p)[8][8];
  assert.ok((reliefHeights(apply(p,[brush('scrape')]))[8][8]-peak)*sign<0);
  assert.equal(reliefHeights(apply(p,[brush('fill')]))[8][8],peak);
  assert.equal(reliefHeights(apply(p,[brush('mask'),brush('sharpen')]))[8][8],peak);
 }
 const p=source();delete p.regions;
 const h=reliefHeights(apply(p,[brush('raise',{symmetry:'xy',points:[[.25,.25]]})]));
 assert.equal(h[4][4],h[12][12]);assert.equal(h[4][12],h[12][4]);assert.equal(h[4][4],.9);
});

test('preview cubic sampling preserves flat surfaces, endpoints and control bounds',()=>{
 for(const count of [4,17,65])for(const t of [0,.01,.3,.99,1]){const b=cubicBasis(count,t);assert.ok(Math.abs(b.reduce((s,v)=>s+v.weight,0)-1)<1e-12);assert.ok(b.every(v=>v.weight>=0&&v.index>=0&&v.index<count));}
 const p=source(),flat=sampleReliefSurface(reliefHeights(p),21);assert.equal(flat.xs[0],-.5);assert.equal(flat.xs.at(-1),.5);assert.ok(flat.values.flat().every(v=>Math.abs(v-.5)<1e-12));
 p.values[8][8]=1;const smooth=sampleReliefSurface(reliefHeights(p),33);assert.ok(smooth.values[16][16]>.5&&smooth.values[16][16]<1);assert.ok(smooth.values.flat().every(v=>v>=.5-1e-12&&v<=1));
});

test('local-patch eyedropper rejects malformed coordinates before dereferencing the point',()=>{
 const patch={id:'detail',domainMm:[-2,-2,2,2],deltaMm:Array.from({length:7},()=>Array(7).fill(0)),mask:Array.from({length:7},()=>Array(7).fill(0)),guardMm:.1};
 const params={widthMm:16,heightMm:16,layers:[{heightMm:.5,localPatches:[patch]}]};
 for(const point of [null,undefined,[0],[NaN,0],[1,0]])assert.throws(()=>sampleReliefHeight(params,point,{layerIndex:0,patchId:'detail'}),{code:'PARAM_RANGE_INVALID'});
});
