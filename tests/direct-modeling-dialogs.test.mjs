import {showDirectModelingDialog} from '../src/ui/forms/direct-modeling-dialogs.js';

// Import this module in an isolated browser and call this function. It checks
// actual DOM form events; Node import alone is not counted as DOM validation.
export function runDirectModelingDialogDomTests(){
  if(typeof document==='undefined')throw new Error('This suite requires an actual browser DOM');
  const checks=[],check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);},equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const throws=(fn,pattern)=>{try{fn();return false;}catch(error){return pattern.test(error.message);}};
  const fixture=document.createElement('div');fixture.style.cssText='position:fixed;left:-10000px;top:0;width:480px';document.body.append(fixture);
  const element=(name,attributes={},text)=>{const node=document.createElement(name);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
  const button=(label,callback,className='')=>{const node=element('button',{type:'button',class:className},label);node.addEventListener('click',callback);return node;};
  const addField=(host,[name,label,value])=>{const wrap=element('label',{'data-field':name}),input=element('input',{name,type:'number',step:'any'});input.value=String(value);wrap.append(element('span',{},label),input);host.append(wrap);return input;};
  const readParams=(form,specs)=>{const values={};for(const [name] of specs){const input=form.elements.namedItem(name);if(input.disabled)continue;if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw new Error('需要有效数字');values[name]=Number(input.value);}return values;};
  const create=(op,selectedIds=['source-a'],selectedTopology=null)=>{
    const state={selectedIds,selectedTopology,busy:false,bodies:[{id:'source-a',name:'来源 A',solidCount:1,faceCount:6,geometryFingerprint:'a-1',bounds:{min:[10,20,30],max:[20,28,36]}},{id:'source-b',name:'来源 B',solidCount:1,faceCount:6,geometryFingerprint:'b-1',bounds:{min:[40,50,60],max:[50,58,66]}},{id:'surface',name:'曲面',solidCount:0,faceCount:1,bounds:{min:[0,0,0],max:[1,1,0]}}]};
    let callback,reader,inputEvents=0;
    const controller=showDirectModelingDialog(op,{state,element,button,addField,readParams,openDialog:()=>{const dialog=element('div');fixture.append(dialog);return dialog;},bindParameterForm:(form,boundOp,read)=>{form.dataset.boundOperation=boundOp;reader=read;form.append(element('button',{type:'button','data-preview':'true'},'预览'),element('button',{type:'submit'},'应用'));form.addEventListener('input',()=>inputEvents++);},setTaskTargetRefresh:refresh=>{callback=refresh;}});
    return {...controller,state,refreshCallback:()=>callback(),readCallback:()=>reader(),inputEvents:()=>inputEvents};
  };
  const enabled=form=>[...form.querySelectorAll('button[type="submit"],button[data-preview]')].every(control=>!control.disabled);
  const set=(form,name,value)=>{const input=form.elements.namedItem(name);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));return input;};
  const reselect=controller=>[...controller.form.querySelectorAll('button')].find(control=>control.textContent==='重新选择').click();
  try{
    const solid=create('offsetSolid');
    check(solid.form.dataset.boundOperation==='offsetSolid'&&solid.dialog.querySelectorAll('textarea').length===0,'solid offset uses the shared preview form and ordinary controls');
    check(equal(solid.readCallback(),{distanceMm:1,join:'intersection',_targetRefs:['source-a']}),'solid offset initializes one explicit source and numerical distance');
    solid.state.selectedIds=['source-b'];solid.refreshCallback();check(solid.read()._targetRefs[0]==='source-a','ordinary inspection does not silently change the solid source');
    set(solid.form,'distanceMm','-0.5');set(solid.form,'join','round');check(solid.read().distanceMm===-.5&&solid.read().join==='round','signed distance and chosen corner join are packed explicitly');
    reselect(solid);check(solid.read()._targetRefs[0]==='source-b','only the explicit reselect button updates the source');
    solid.state.bodies=solid.state.bodies.filter(body=>body.id!=='source-b');solid.refreshCallback();check(!enabled(solid.form)&&throws(()=>solid.read(),/消失/),'disappeared source blocks preview and apply');
    check(solid.inputEvents()>0,'invalid source clears shared preview readiness with an input event');

    const surface=create('offsetSurface',['source-a'],{type:'face',bodyId:'source-a',ids:[4]});
    check(equal(surface.read(),{faceId:4,distanceMm:1,_targetRefs:['source-a']}),'surface offset locks the selected actual face without numeric face entry');
    surface.state.selectedIds=['source-b'];surface.state.selectedTopology={type:'face',bodyId:'source-b',ids:[1]};surface.refreshCallback();check(surface.read().faceId===4&&surface.read()._targetRefs[0]==='source-a','ordinary face inspection never changes the captured face scope');
    reselect(surface);check(surface.read().faceId===1&&surface.read()._targetRefs[0]==='source-b','surface reselect updates both source and actual face');
    const result=surface.read();result._targetRefs[0]='mutated';check(surface.read()._targetRefs[0]==='source-b','readback references are isolated copies');
    surface.state.bodies.find(body=>body.id==='source-b').geometryFingerprint='b-2';surface.refreshCallback();check(!enabled(surface.form)&&throws(()=>surface.read(),/几何已变化/),'same body id with changed exact geometry invalidates captured face indices');
    const wrongFaces=create('offsetSurface',['source-a'],{type:'face',bodyId:'source-a',ids:[0,1]});check(!enabled(wrongFaces.form)&&throws(()=>wrongFaces.read(),/一张面/),'surface offset refuses multiple selected faces');
    const wrongBody=create('offsetSurface',['source-a'],{type:'face',bodyId:'source-b',ids:[0]});check(!enabled(wrongBody.form),'a face selected on another object cannot substitute for the explicit source');

    const tapered=create('draftByPlane',['source-a'],{type:'face',bodyId:'source-a',ids:[0,1,2,3]});
    check(equal(tapered.read(),{faceIds:[0,1,2,3],neutralPoint:[10,20,30],neutralNormal:[0,0,1],pullDirection:[0,0,1],angleDeg:2,_targetRefs:['source-a']}),'draft uses actual selected faces, current bounds minimum and numerical world Z direction');
    check(tapered.form.querySelector('[data-custom-direction]').hidden&&tapered.dialog.querySelectorAll('textarea').length===0,'draft starts with a simple axis choice and no JSON inputs');
    set(tapered.form,'pullAxis','X');set(tapered.form,'neutralPointX','11');check(equal(tapered.read().pullDirection,[1,0,0])&&equal(tapered.read().neutralNormal,[1,0,0])&&tapered.read().neutralPoint[0]===11,'principal direction also defines the neutral normal and world point remains editable');
    set(tapered.form,'pullAxis','custom');set(tapered.form,'pullDirectionX','1');set(tapered.form,'pullDirectionY','2');set(tapered.form,'pullDirectionZ','3');set(tapered.form,'angleDeg','-5');
    check(equal(tapered.read().pullDirection,[1,2,3])&&equal(tapered.read().neutralNormal,[1,2,3])&&tapered.read().angleDeg===-5,'custom numeric vector and signed draft angle form explicit API arrays');
    set(tapered.form,'pullDirectionX','0');set(tapered.form,'pullDirectionY','0');set(tapered.form,'pullDirectionZ','0');check(!enabled(tapered.form)&&throws(()=>tapered.read(),/零向量/),'zero custom direction prevents preview and apply');
    set(tapered.form,'pullAxis','Z');set(tapered.form,'angleDeg','45');check(!enabled(tapered.form),'out-of-range draft angle disables the form');set(tapered.form,'angleDeg','2');
    tapered.state.selectedIds=['source-b'];tapered.state.selectedTopology={type:'face',bodyId:'source-b',ids:[2]};reselect(tapered);check(equal(tapered.read().faceIds,[2])&&tapered.read().neutralPoint[0]===11,'explicit reselect updates scope while preserving an edited neutral plane');
    check(tapered.dialog.textContent.includes('目标锥角'),'cone target-angle semantics are visible in the task form');
    tapered.state.busy=true;tapered.refreshCallback();check(!enabled(tapered.form),'busy state disables preview and apply');tapered.state.busy=false;tapered.refreshCallback();check(enabled(tapered.form),'form becomes available when the kernel is no longer busy');

    const waiting=create('draftByPlane',[],null);check(!enabled(waiting.form),'missing initial selection leaves a useful blocked form');waiting.state.selectedIds=['source-a'];waiting.state.selectedTopology={type:'face',bodyId:'source-a',ids:[0]};reselect(waiting);check(equal(waiting.read().neutralPoint,[10,20,30])&&enabled(waiting.form),'selecting a source later initializes neutral coordinates from its actual bounds');
    const invalidSource=create('offsetSolid',['surface']);check(!enabled(invalidSource.form),'solid offset rejects a surface source in the form');
    return {status:'passed',checks:checks.length,labels:checks};
  }finally{fixture.remove();}
}
