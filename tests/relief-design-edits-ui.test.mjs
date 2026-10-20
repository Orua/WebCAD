import test from 'node:test';
import assert from 'node:assert/strict';
import {changeDesignEdit,authoredDesignEdit} from '../src/ui/forms/relief-design-edits-ui.js';
import {showReliefDesignDialog} from '../src/ui/forms/relief-design-dialog.js';
import {updateReliefDesigns} from '../src/relief-design-drafts.js';
import {recordTimeline,restoreTimeline} from '../src/document-timeline.js';
import {encodeProjectV4,decodeProject} from '../src/project-container.js';
const draft=()=>({schemaVersion:1,name:'设计',support:{kind:'circle',centerMm:[2,3],radiusMm:10},heightRangeMm:[0,3],throughHoles:[],protectedZones:[],points:[],fieldSettings:{columns:33,rows:17,smoothWeight:2,maxIterations:800,toleranceMm:.01,edits:[{mode:'raise',centerMm:[2,3],radiusMm:2,amountMm:.1,strength:.5}]}});
const brush={mode:'flatten',centerMm:[3,4],radiusMm:1,targetMm:1.2,strength:.8};
test('stroke changes preserve authored settings and reject incomplete values without mutating source',()=>{
 const original={...draft(),reference:{importKey:'ref-original',assetHash:'a'.repeat(64),name:'original.png',mime:'image/png',sizeBytes:10,width:1,height:1}},d=changeDesignEdit(original,{operation:'append',edit:brush});assert.equal(original.fieldSettings.edits.length,1);assert.equal(d.fieldSettings.edits.length,2);assert.equal(d.fieldSettings.rows,17);assert.equal(d.fieldSettings.smoothWeight,2);assert.deepEqual(d.reference,original.reference);
 const changed=changeDesignEdit(d,{operation:'replace',index:0,edit:{...brush,mode:'lower',amountMm:.2}});assert.equal(changed.fieldSettings.edits[0].mode,'lower');assert.deepEqual(changed.fieldSettings.edits[1],d.fieldSettings.edits[1]);assert.equal(changeDesignEdit(changed,{operation:'remove',index:0}).fieldSettings.edits.length,1);
 for(const edit of [{...brush,targetMm:NaN},{...brush,radiusMm:0},{...brush,strength:2},{...brush,mode:'raise'}])assert.throws(()=>authoredDesignEdit(edit),{code:'PARAM_SCHEMA_INVALID'});
});
test('persisted stroke list survives v4 reopen and undo deletion without geometry',async()=>{
 const empty={version:4,documentId:'doc',name:'编辑工程',features:[],imports:{},binaryAssets:{},compiledArtifacts:{}};
 const saved={...empty,reliefDesigns:updateReliefDesigns([],{id:'design',expectedDraftRevision:0,draft:changeDesignEdit(draft(),{operation:'append',edit:brush})})};recordTimeline(empty,saved,{label:'保存笔画'});const id=saved.timeline.entries.at(-1).id;
 const removed={...saved,reliefDesigns:[]};recordTimeline(saved,removed,{label:'删除草稿'});const opened=await decodeProject(encodeProjectV4(removed));assert.deepEqual(restoreTimeline(opened,id).reliefDesigns,saved.reliefDesigns);
});
class Node {
 constructor(tag,attrs={},text=''){this.tag=tag;this.attrs=attrs;this.style={};this.dataset={};this.children=[];this.listeners={};this.disabled=false;this._value=attrs.value??'';this.textContent=text;}
 set value(v){this._value=String(v);}get value(){return this._value;}
 append(...xs){for(const x of xs){x.parent=this;this.children.push(x);}}
 replaceChildren(...xs){this.children=[];this.append(...xs);}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 removeAttribute(k){delete this.attrs[k];}
 querySelectorAll(){return this.children.flatMap(n=>[...(['input','select','textarea','button'].includes(n.tag)?[n]:[]),...n.querySelectorAll()]);}
 getContext(){return new Proxy({},{get:()=>()=>{},set:()=>true});}
 async fire(type){if(this.disabled)return;const e={target:this};await this['on'+type]?.(e);for(const fn of this.listeners[type]??[])await fn(e);if(type==='input')for(let p=this.parent;p;p=p.parent)for(const fn of p.listeners[type]??[])await fn(e);}
}
function harness(){
 const root=new Node('dialog'),all=[],element=(tag,attrs,text)=>{const n=new Node(tag,attrs,text);all.push(n);return n;};
 let state={revision:1,document:{documentId:'doc',reliefDesigns:[{id:'design',revision:1,draft:draft()}]}},calls=0,gate=null;
 globalThis.getComputedStyle=()=>({color:'#fff'});globalThis.window={webcad:{api:{getState:()=>({context:{}}),reliefDesignField:()=>{throw Error('no solve allowed');}}}};
 const onSave=async args=>{calls++;if(gate)await gate;state={...state,revision:state.revision+1,document:{...state.document,reliefDesigns:updateReliefDesigns(state.document.reliefDesigns,args)}};return {status:'committed'};};
 showReliefDesignDialog({getState:()=>state,openDialog:()=>root,element,button:(text,fn)=>{const n=element('button',{},text);n.onclick=fn;return n;},onSave,onGenerate:()=>{throw Error('no geometry');},close:()=>{}});
 return {all,state:()=>state,calls:()=>calls,gate:v=>gate=v,byLabel:s=>all.find(n=>n.attrs['aria-label']===s),button:s=>all.find(n=>n.tag==='button'&&n.textContent.includes(s)),name:()=>all.find(n=>n.tag==='input'&&n.attrs.type==='text')};
}
test('dialog merges unsaved form with add/update/remove and preserves asymmetric resolution',async()=>{
 const h=harness(),input=async(label,v)=>{const n=h.byLabel(label);n.value=v;await n.fire('input');};
 h.name().value='同时改名';await h.name().fire('input');await input('笔画中心 X mm',3);await input('笔画增减量 mm',.3);await h.button('加入并保存').fire('click');
 let d=h.state().document.reliefDesigns[0].draft;assert.equal(h.calls(),1);assert.equal(d.name,'同时改名');assert.equal(d.fieldSettings.rows,17);assert.equal(d.fieldSettings.edits.length,2);assert.equal(d.fieldSettings.edits[1].amountMm,.3);
 await input('笔画增减量 mm',.4);await h.button('更新第2笔').fire('click');d=h.state().document.reliefDesigns[0].draft;assert.equal(d.fieldSettings.edits[1].amountMm,.4);assert.equal(d.fieldSettings.edits[0].amountMm,.1);
 await h.button('移除此笔并保存').fire('click');assert.equal(h.state().document.reliefDesigns[0].draft.fieldSettings.edits.length,1);
});
test('unfinished stroke blocks unrelated save/list switch and explicit discard preserves other form input',async()=>{
 const h=harness();h.name().value='未保存名称';await h.name().fire('input');const x=h.byLabel('笔画中心 X mm');x.value=4;await x.fire('input');await h.button('保存草稿到工程').fire('click');assert.equal(h.calls(),0);
 const list=h.byLabel('局部编辑笔画列表');list.value='0';await list.fire('change');assert.equal(list.value,'');assert.equal(x.value,'4');
 await h.button('放弃本笔输入').fire('click');assert.equal(h.name().value,'未保存名称');await h.button('保存草稿到工程').fire('click');assert.equal(h.calls(),1);assert.equal(h.state().document.reliefDesigns[0].draft.name,'未保存名称');assert.equal(h.state().document.reliefDesigns[0].draft.fieldSettings.edits.length,1);
});
test('in-flight stroke save freezes form controls until transaction settles',async()=>{
 const h=harness();let release;h.gate(new Promise(r=>release=r));const pending=h.button('加入并保存').fire('click');assert.equal(h.name().disabled,true);assert.equal(h.byLabel('笔画中心 X mm').disabled,true);release();await pending;assert.equal(h.name().disabled,false);assert.equal(h.state().document.reliefDesigns[0].draft.fieldSettings.edits.length,2);
});
