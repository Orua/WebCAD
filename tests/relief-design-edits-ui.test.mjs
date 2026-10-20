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
function harness(apiOverrides={}){
 const root=new Node('dialog'),all=[],element=(tag,attrs,text)=>{const n=new Node(tag,attrs,text);all.push(n);return n;};
 let state={revision:1,document:{documentId:'doc',reliefDesigns:[{id:'design',revision:1,draft:draft()}]}},calls=0,gate=null;
 globalThis.getComputedStyle=()=>({color:'#fff'});globalThis.window={webcad:{api:{getState:()=>({context:{}}),reliefDesignField:()=>{throw Error('no solve allowed');},...apiOverrides}}};
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

function fitFixture(){
 const requests=[];let release;const gate=new Promise(r=>release=r);
 const metric={count:4,maxMm:.01,rmsMm:.005};
 const h=harness({reliefDesignField:async r=>r.action==='solve'?{status:'solved',field:{columns:2,rows:2,widthMm:20,heightMm:20,heightsMm:[0,1,1,0],previewTriangles:[0,1,2],fixedMask:[1,0,0,1]},report:{solver:{projectedResidualMm:.001,iterations:5}}}:{status:'candidate'},reliefDesignFit:async r=>{requests.push(r);if(r.action==='cancel'){release();return {status:'cancelled'};}await gate;return {status:'fitted',fit:{report:{metrics:{training:metric,independent:metric,protection:{...metric,maxMm:0}},controlPoints:81,lockedControlPoints:40,projectedResidualMm:.001,protectionCertificate:{fixedCellCount:3,roundoffCheckMm:1e-10}}}};}});
 return {h,requests,release};
}
test('fit stays disabled before saved solved field; explicit parameters do not dirty draft or auto solve',async()=>{
 const {h,requests}=fitFixture();assert.equal(h.button('拟合当前数值场').disabled,true);await h.button('拟合当前数值场').fire('click');assert.equal(requests.length,0);
 const tolerance=h.byLabel('接受的采样误差 mm');tolerance.value=.02;await tolerance.fire('input');assert.equal(h.byLabel('选择设计草稿').disabled,false);assert.equal(h.calls(),0);
 await h.button('求解数值场').fire('click');assert.equal(h.button('拟合当前数值场').disabled,false);
 h.name().value='尚未保存';await h.name().fire('input');assert.equal(h.button('拟合当前数值场').disabled,true);assert.equal(requests.length,0);
});
test('fit sends exact explicit controls, freezes edits, reports independent and protection evidence without geometry',async()=>{
 const {h,requests,release}=fitFixture();await h.button('求解数值场').fire('click');h.byLabel('控制列数').value=7;await h.byLabel('控制列数').fire('input');h.byLabel('拟合模式').value='engrave';await h.byLabel('拟合模式').fire('input');
 const pending=h.button('拟合当前数值场').fire('click');assert.deepEqual(requests[0].options,{mode:'engrave',controlColumns:7,controlRows:9,controlMaxMm:3,acceptanceToleranceMm:.05});assert.equal(h.name().disabled,true);assert.equal(h.button('停止拟合').disabled,false);release();await pending;
 const text=h.all.find(n=>n.attrs['aria-live']==='polite'&&n.textContent.includes('训练采样')).textContent;assert.match(text,/独立采样/);assert.match(text,/保护采样/);assert.match(text,/锁定控制点 40 \/ 81/);assert.match(text,/非全局公差/);assert.match(text,/尚未生成 BRep/);assert.equal(h.calls(),0);assert.equal(requests.length,1);assert.equal(h.byLabel('控制列数').value,'7');
});
test('fit cancel uses same draft identity without auto retries and unfinished stroke blocks fit',async()=>{
 const {h,requests}=fitFixture();await h.button('求解数值场').fire('click');const x=h.byLabel('笔画中心 X mm');x.value=3;await x.fire('input');assert.equal(h.button('拟合当前数值场').disabled,true);await h.button('放弃本笔输入').fire('click');assert.equal(h.button('拟合当前数值场').disabled,false);
 const pending=h.button('拟合当前数值场').fire('click');await h.button('停止拟合').fire('click');await pending;assert.deepEqual(requests.map(r=>r.action),['fit','cancel']);assert.equal(requests[0].designId,requests[1].designId);assert.equal(requests[0].expectedDraftRevision,1);
});
