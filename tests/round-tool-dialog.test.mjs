import test from 'node:test';
import assert from 'node:assert/strict';
import {showRoundTool} from '../src/ui/forms/round-tool-dialog.js';

// UI state machine only; this is not a browser or rendering acceptance test.
class Element{
 constructor(tag,attrs={},text=''){Object.assign(this,attrs);this.tag=tag;this.dataset={};this.style={};this.children=[];this.textContent=text;this.value=attrs.value??'';this.listeners={};this.attrs={...attrs};}
 append(...children){for(const child of children){this.children.push(child);child.parentElement=this;if(this.tag==='select'&&!this.value)this.value=child.value;}}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
 fire(k){return Promise.all((this.listeners[k]||[]).map(f=>f({})));}
}
const pause=()=>new Promise(r=>setTimeout(r,165));
function setup(preview,commit=true){
 const elements=[],calls=[];let state={bodies:[{id:'source',name:'test rod'}]},refresh,guide,closed=false;
 const element=(...a)=>{const e=new Element(...a);elements.push(e);return e;};
 const button=(name,f)=>{const b=element('button',{},name);b.click=f;return b;};
 const d=element('dialog');
 showRoundTool({getState:()=>state,openDialog:()=>d,element,button,close:()=>{closed=true;d._onClose();},setTaskTargetRefresh:f=>refresh=f,setGuide:(report,h)=>{guide=h;},emit:async(action,p)=>{calls.push({action,p});if(action==='preview')return preview(p);if(action==='commitPreview')return commit;}});
 const byName=n=>elements.find(e=>e.textContent===n),range=elements.find(e=>e.type==='range');
 return {d,calls,byName,range,get guide(){return guide;},get closed(){return closed;},pick:(ids,type='edge')=>{state={...state,selectedTopology:{bodyId:'source',type,ids}};refresh();}};
}
const report={roundReport:{mode:'end',control:{kind:'depth',min:1.5,max:3,value:1.5,step:.01},scope:{axis:'Y',direction:1,end:20,center:[0,18.5,0],crossAxes:['X','Z'],sectionSize:[3,1.5],depthMm:1.5},endRoundingReport:{residualSeams:[]}}};
test('picking source after opening and Shift additions coalesce; drag only previews on release',async()=>{
 const s=setup(()=>report);try{
  assert(s.d._acceptSelection);s.pick([3]);s.pick([3,4]);await pause();
  assert.equal(s.calls.filter(c=>c.action==='preview').length,1);assert.deepEqual(s.calls.find(c=>c.action==='preview').p.params.edgeIds,[3,4]);
  assert.equal(s.byName('应用').disabled,false);
  for(let i=0;i<5;i++)s.guide.onInput(1.5+i*.01);
  assert.equal(s.byName('应用').disabled,true);assert.equal(s.calls.filter(c=>c.action==='preview').length,1);
  s.guide.onRelease();await pause();assert.equal(s.calls.filter(c=>c.action==='preview').length,2);assert.equal(s.calls.at(-1).p.params.depthMm,1.54);
  await s.byName('应用').click();assert(s.calls.some(c=>c.action==='commitPreview'));
 }finally{s.d._onClose();}
});
test('parameter change during a pending preview cannot enable apply; close stops pending work',async()=>{
 let resolve;const s=setup(()=>new Promise(r=>resolve=r));try{
  s.pick([1]);await pause();assert(resolve);s.range.value='0.8';await s.range.fire('input');await s.range.fire('change');
  resolve(report);await new Promise(r=>setTimeout(r,10));assert.equal(s.byName('应用').disabled,true);
  s.d._onClose();await pause();assert.equal(s.calls.filter(c=>c.action==='preview').length,1);
 }finally{s.d._onClose();}
});
test('viewing original cancels a queued range preview until returning to preview',async()=>{
 const s=setup(()=>report);try{
  s.pick([1]);await pause();s.guide.onInput(1.55);s.guide.onRelease();
  await s.byName('查看原形').click();await pause();
  assert.equal(s.calls.filter(c=>c.action==='preview').length,1);assert(s.byName('应用').disabled);
  await s.byName('返回预览').click();await pause();
  assert.equal(s.calls.filter(c=>c.action==='preview').length,2);assert.equal(s.calls.at(-1).p.params.depthMm,1.55);
 }finally{s.d._onClose();}
});
test('failed commit keeps task open and does not claim completion',async()=>{
 const s=setup(()=>report,false);try{
  s.pick([1]);await pause();await s.byName('应用').click();
  assert.equal(s.closed,false);assert(s.byName('应用').disabled);
  assert(s.byName('应用未完成，请重新预览后再应用。'));
 }finally{s.d._onClose();}
});
test('planar face selection sends full-face scope and keeps exact radius controls',async()=>{
 const r={roundReport:{mode:'edge',control:{kind:'strength',min:.1,max:1,value:.5},radiusMm:.2,scope:{kind:'face-boundaries',faceIds:[12],edgeIds:[1,2,3]}}};
 const s=setup(()=>r);try{
  s.pick([12],'face');await pause();
  const p=s.calls.find(c=>c.action==='preview').p.params;
  assert.deepEqual(p.faceIds,[12]);assert.equal(p.edgeIds,undefined);assert.equal(p.mode,'edge');
  assert(s.byName('已圆润平面完整边界（含孔边），实际 R 0.200 mm。'));
  await s.byName('更换位置').click();assert.equal(s.calls.at(-1).p.mode,'face');
 }finally{s.d._onClose();}
});
