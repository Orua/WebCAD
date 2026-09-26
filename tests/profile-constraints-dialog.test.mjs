import {showProfileConstraintsDialog} from '../src/ui/forms/profile-constraints-dialog.js';
import {resolveProfileRecipe,constrainProfileRecipe} from '../src/modeling/profiles/profile-constraint-history.js';

// Native browser DOM suite. No DOM shim and no mocked solver.
// await import('/tests/profile-constraints-dialog.test.mjs').then(m=>m.runProfileConstraintsDialogDomTests())
export function runProfileConstraintsDialogDomTests() {
  if(typeof document==='undefined')throw new Error('This suite requires an actual browser DOM');
  const checks=[],check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b)),throws=(callback,pattern)=>{try{callback();return false;}catch(error){return pattern.test(error.message);}};
  const fixture=document.createElement('div');fixture.style.cssText='position:fixed;left:-10000px;top:0;width:480px';document.body.append(fixture);
  const element=(name,attributes={},text)=>{const node=document.createElement(name);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
  const button=(label,callback,className='')=>{const node=element('button',{type:'button',class:className},label);node.addEventListener('click',callback);return node;};
  const addField=(host,[name,label,value,kind])=>{const wrap=element('label',{'data-field':name}),input=element('input',{type:'number',name,step:'any',required:''});if(kind==='positive')input.min='0.000001';input.value=String(value);wrap.append(element('span',{},label),input);host.append(wrap);return input;};
  const rectangle={profileVersion:1,output:'face',entities:[{id:'base',type:'rectangle',originMm:[0,0],widthMm:30,heightMm:20}],loops:[{id:'outer',edges:[{entityId:'base',reversed:false}]}],chains:[],regions:[{id:'r',outerLoopId:'outer',holeLoopIds:[]}]};
  const circles={profileVersion:1,output:'wire',entities:[{id:'firstCircle',type:'circle',centerMm:[0,0],diameterMm:10},{id:'secondCircle',type:'circle',centerMm:[20,0],diameterMm:8}],loops:[{id:'c1',edges:[{entityId:'firstCircle',reversed:false}]},{id:'c2',edges:[{entityId:'secondCircle',reversed:false}]}],chains:[],regions:[]};
  const features=[{id:'profile',op:'sketchProfile',params:rectangle,refs:[]},{id:'circles',op:'sketchProfile',params:circles,refs:[]},{id:'driven',op:'profileConstraints',refs:['profile'],params:{constraints:[{type:'length',entityId:'base_0',lengthMm:40}]}},{id:'solid',op:'box',params:{width:10,depth:10,height:10},refs:[]}];
  const report=resolveProfileRecipe(features,'driven').diagnostics;
  const bodies=[{id:'profile',name:'默认矩形',solidCount:0,renderVersion:'profile-v1'},{id:'circles',name:'两个圆',solidCount:0,renderVersion:'circles-v1'},{id:'driven',name:'已有约束',solidCount:0,renderVersion:'driven-v1',constraintReport:report},{id:'solid',name:'实体',solidCount:1,renderVersion:'solid-v1'}];
  const create=(selectedIds=['profile'])=>{
    const state={document:{features:structuredClone(features)},bodies:structuredClone(bodies),selectedIds:[...selectedIds],busy:false};let readCallback,refreshCallback,inputEvents=0;
    const result=showProfileConstraintsDialog({state,element,button,addField,openDialog:title=>{const dialog=element('section',{role:'dialog'});dialog.append(element('h2',{},title));fixture.append(dialog);return dialog;},bindParameterForm:(form,op,read)=>{readCallback=read;form.dataset.boundOperation=op;form.append(element('button',{type:'button','data-preview':'true'},'预览'),element('button',{type:'submit'},'应用'));form.addEventListener('input',()=>inputEvents++);},setTaskTargetRefresh:callback=>refreshCallback=callback});
    return {...result,state,readCallback:()=>readCallback(),refreshCallback:()=>refreshCallback(),inputEvents:()=>inputEvents};
  };
  const set=(form,name,value)=>{const input=form.elements.namedItem(name);if(!input)throw new Error(`Missing control ${name}`);input.value=String(value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));return input;};
  const enabled=form=>[...form.querySelectorAll('button[type="submit"],button[data-preview]')].every(node=>!node.disabled);
  const click=(host,label)=>{const node=[...host.querySelectorAll('button')].find(button=>button.textContent===label);if(!node)throw new Error(`Missing button ${label}`);node.click();};
  try {
    const plain=create(),initial=plain.readCallback();
    check(plain.form.dataset.boundOperation==='profileConstraints'&&plain.dialog.querySelectorAll('textarea,details').length===0,'single dimension uses native controls and shared preview/apply form without JSON or folds');
    check(equal(initial,{constraints:[{type:'length',entityId:'base_0',lengthMm:40}],_targetRefs:['profile']}),'default rectangle immediately exposes actual derived edge IDs and one line length');
    check(equal([...plain.form.elements.namedItem('entityId').options].map(item=>item.value),['base_0','base_1','base_2','base_3']),'rectangle primitive is represented by its four stable derived lines');
    check(![...plain.form.elements.namedItem('sourceId').options].some(item=>item.value==='solid'),'solid objects are excluded from profile source choices');
    const sourceBefore=JSON.stringify(plain.state.document.features);plain.state.selectedIds=['circles'];plain.refreshCallback();
    check(plain.read()._targetRefs[0]==='profile'&&sourceBefore===JSON.stringify(plain.state.document.features),'ordinary selection does not replace the locked source or mutate its recipe');
    set(plain.form,'lengthMm',55);plain.state.document.features.push({id:'unrelated',op:'box',params:{width:3,depth:4,height:5},refs:[]});plain.refreshCallback();
    check(plain.form.elements.namedItem('lengthMm').value==='55'&&plain.read().constraints[0].lengthMm===55,'unrelated feature changes preserve the locked source and edited dimension draft');
    const eventsBefore=plain.inputEvents();plain.state.bodies.find(body=>body.id==='profile').renderVersion='profile-v2';plain.state.document.features[0].params.entities[0].widthMm=35;plain.refreshCallback();
    check(!enabled(plain.form)&&throws(plain.read,/确认/) &&plain.inputEvents()>eventsBefore,'source geometry changes expire preview/apply and require explicit confirmation');
    click(plain.dialog,'重新确认来源');check(enabled(plain.form)&&plain.read()._targetRefs[0]==='profile','explicit confirmation rebinds the same current source');
    plain.state.busy=true;plain.refreshCallback();check(!enabled(plain.form),'busy source blocks preview and apply');plain.state.busy=false;plain.refreshCallback();
    plain.state.bodies=plain.state.bodies.filter(body=>body.id!=='profile');plain.refreshCallback();check(!enabled(plain.form)&&throws(plain.read,/确认/),'removed source blocks use without silently choosing another profile');

    const controls=create();set(controls.form,'constraintType','horizontal');check(!controls.form.elements.namedItem('lengthMm')&&equal(controls.read().constraints,[{type:'horizontal',entityId:'base_0'}]),'relationship changes remove unused dimension fields');
    set(controls.form,'constraintType','angle');check(controls.form.elements.namedItem('firstId')&&controls.form.elements.namedItem('secondId')&&controls.form.elements.namedItem('angleDeg')&&controls.form.elements.namedItem('direction'),'angle shows two lines, degree value and directed side only');
    set(controls.form,'angleDeg',45);set(controls.form,'direction','cw');check(equal(controls.read().constraints,[{type:'angle',firstId:'base_0',secondId:'base_1',angleDeg:45,direction:'cw'}]),'angle choices pack the actual explicit constraint schema');
    set(controls.form,'constraintType','distance');set(controls.form,'axis','x');set(controls.form,'distanceMm',-5);check(equal(controls.read().constraints,[{type:'distance',first:{entityId:'base_0',point:'start'},second:{entityId:'base_0',point:'end'},axis:'x',distanceMm:-5}]),'point dimensions pack explicit endpoint refs and signed coordinate difference');
    set(controls.form,'constraintType','fixPoint');set(controls.form,'point','end');check(Number(controls.form.elements.namedItem('positionX').value)===30&&Number(controls.form.elements.namedItem('positionY').value)===0,'fixed endpoint controls are seeded from the real source coordinate');
    set(controls.form,'positionX',6);set(controls.form,'positionY',8);check(equal(controls.read().constraints,[{type:'fixPoint',point:{entityId:'base_0',point:'end'},positionMm:[6,8]}]),'fixed coordinates use separate numeric fields and one point reference');
    set(controls.form,'sourceId','circles');set(controls.form,'constraintType','radius');check(equal([...controls.form.elements.namedItem('entityId').options].map(item=>item.value),['firstCircle','secondCircle'])&&!controls.form.elements.namedItem('angleDeg'),'radius limits choices to actual circles and removes unrelated angle controls');
    set(controls.form,'radiusMm',7);check(equal(controls.read().constraints,[{type:'radius',entityId:'firstCircle',radiusMm:7}]),'one circle radius reads directly without a condition list or JSON');
    set(controls.form,'constraintType','fixPoint');check(controls.form.elements.namedItem('point').value==='center'&&controls.form.elements.namedItem('point').options.length===1,'circle fixed-point selector exposes only its center');

    const queued=create();set(queued.form,'lengthMm',40);click(queued.form,'添加到约束列表');set(queued.form,'entityId','base_1');set(queued.form,'lengthMm',25);click(queued.form,'添加到约束列表');
    check(equal(queued.read().constraints,[{type:'length',entityId:'base_0',lengthMm:40},{type:'length',entityId:'base_1',lengthMm:25}]),'multiple explicit constraints accumulate in a reviewable list');
    const copy=queued.read();copy.constraints[0].lengthMm=999;copy._targetRefs[0]='mutated';check(queued.read().constraints[0].lengthMm===40&&queued.read()._targetRefs[0]==='profile','readback constraints and refs are isolated copies');
    click(queued.form,'移除');check(queued.read().constraints.length===1&&queued.read().constraints[0].entityId==='base_1','removing a condition updates the actual submitted list');
    set(queued.form,'sourceId','circles');set(queued.form,'constraintType','diameter');check(queued.read().constraints.length===1&&queued.read().constraints[0].type==='diameter','explicitly changing source clears the prior source condition list');

    const accumulated=create(['driven']);check(accumulated.dialog.querySelector('.task-target').textContent.includes(`剩余自由度 ${report.degreesOfFreedom}`),'source status displays the actual solver-reported remaining degrees of freedom');
    set(accumulated.form,'entityId','base_1');set(accumulated.form,'lengthMm',25);const fresh=accumulated.read(),source=resolveProfileRecipe(accumulated.state.document.features,fresh._targetRefs[0]),solved=constrainProfileRecipe(source,fresh.constraints);
    check(solved.constraints.length===2&&solved.diagnostics.degreesOfFreedom===2&&Math.abs(solved.profile.entities[0].endMm[0]-solved.profile.entities[0].startMm[0]-40)<2e-6,'new GUI dimension preserves existing width relation and gets real updated DOF from history solver');
    accumulated.state.bodies.find(body=>body.id==='driven').constraintReport=solved.diagnostics;accumulated.refreshCallback();check(accumulated.dialog.querySelector('.task-target').textContent.includes('剩余自由度 2'),'current body report is read back in the task status');
    const waiting=create([]);check(!enabled(waiting.form)&&throws(waiting.read,/确认/),'missing initial source leaves a blocked form');set(waiting.form,'sourceId','profile');check(enabled(waiting.form),'explicitly selecting a valid source unlocks the form');
    return {status:'passed',checks:checks.length,labels:checks};
  } finally {fixture.remove();}
}
