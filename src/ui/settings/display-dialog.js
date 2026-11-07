import {metalMaterialList} from './metal-material-list.js';
import {DISPLAY_DEFAULTS,DISPLAY_PRESETS,DISPLAY_RANGES} from './display-preferences.js';
import {METAL_FINISHES} from '../../metal-materials.js';

export function showDisplaySettings({openDialog,element,button,state,emit,api,closeDialog,finishSelect,finishControl}){
  const d=openDialog('渲染设置','适用于当前浏览器，保存到 Cookie 并在下次打开时载入。单个实体的显式颜色、材质优先于全局默认。镜面等材质方式可指定自己的反射环境，优先于全局环境。灯光角度绕世界 Z 轴，俯仰从 XY 平面起算。');
  d.style.width='min(980px,94vw)';
  const form=element('form',{class:'parameter-form'}),controls={};form.style.gridTemplateColumns='repeat(auto-fit,minmax(180px,1fr))';
  const performanceSection=element('section',{class:'wide','aria-label':'交互显示性能'}),performanceStatus=element('p',{class:'property-footnote','aria-live':'polite'},'正在读取交互显示状态…');
  performanceSection.append(element('strong',{},'交互显示'),performanceStatus);
  const performanceControls={};
  for(const [key,label]of [['auto','自动降低交互显示精度'],['manualLock','锁定当前显示精度'],['allowAgentGrouping','允许已授权 Agent 考虑组合建议']]){
    const row=element('label',{class:'form-field'}),input=element('input',{type:'checkbox',name:'performance-'+key,'aria-label':label});row.append(input,element('span',{},label));performanceSection.append(row);performanceControls[key]=input;
  }
  const preferred=element('select',{'aria-label':'恢复显示上限',name:'performance-preferredQuality'}),preferredLabel=element('label',{class:'form-field'});
  for(const [value,label]of [['draft','草稿'],['standard','标准'],['fine','精细'],['ultra','高精']])preferred.append(element('option',{value},label));
  preferredLabel.append(element('span',{},'恢复显示上限'),preferred);performanceSection.append(preferredLabel);
  performanceSection.append(element('p',{class:'property-footnote'},'只调整显示网格，精确模型与导出精度保持不变。组合建议不会自动修改对象。此处设置仅用于当前页面。'));
  const performanceApply=button('应用交互显示设置',async()=>{
    const result=await emit('performanceSettings',{mode:performanceControls.auto.checked?'auto':'manual',manualLock:performanceControls.manualLock.checked,allowAgentGrouping:performanceControls.allowAgentGrouping.checked,preferredQuality:preferred.value});
    if(result?.status==='applied')await readPerformance();
  },'secondary');performanceApply.dataset.commandId='performanceSettings';performanceApply.disabled=true;performanceSection.append(performanceApply);
  async function readPerformance(){
    const result=await window.webcad.api.getPerformanceState();
    if(result.status!=='read'){performanceStatus.textContent='暂时无法读取交互显示状态。';return;}
    performanceControls.auto.checked=result.settings.mode==='auto';performanceControls.manualLock.checked=result.settings.manualLock;performanceControls.allowAgentGrouping.checked=result.settings.allowAgentGrouping;preferred.value=result.preferredQuality;
    const labels={draft:'草稿',standard:'标准',fine:'精细',ultra:'高精'};
    performanceStatus.textContent=`当前${labels[result.effectiveQuality]} · ${result.valid?'交互 P95 '+result.frameIntervalMs.p95.toFixed(1)+' ms':'等待足够的前台交互样本'} · ${result.window.sampleCount} 个样本`;
    performanceApply.disabled=false;
  }
  void readPerformance().catch(error=>{performanceStatus.textContent='无法读取交互显示状态：'+error.message;});form.append(performanceSection);
  const fields=[['defaultColor','默认设计颜色','color'],['defaultFinish','默认材质','finish'],['background','背景颜色','color'],['environmentMode','反射环境','environment'],['lightAzimuth','主光方位（°）'],['lightElevation','主光俯仰（°）'],['keyIntensity','主光亮度'],['fillIntensity','补光亮度'],['ambientIntensity','环境漫射亮度'],['environmentRotation','反射环境旋转（°）'],['environmentIntensity','反射强度'],['roughnessOffset','金属柔和度（粗糙度增量）'],['exposure','金属曝光']];
  for(const [key,title,type]of fields){const label=element('label',{class:'form-field'});label.append(element('span',{},title));let input;if(type==='environment'){input=element('select',{'aria-label':title});for(const [value,title]of [['studio','产品摄影棚（侧光）'],['hdr','原 HDR 工作室']])input.append(element('option',{value},title));}else if(type==='finish'){input=element('select',{'aria-label':title,'data-metal-finish':'direct'});for(const [value,preset]of Object.entries(METAL_FINISHES))input.append(element('option',{value},preset.label));}else {input=element('input',{type:type||'number','aria-label':title,required:''});if(DISPLAY_RANGES[key]){input.min=DISPLAY_RANGES[key][0];input.max=DISPLAY_RANGES[key][1];input.step='any';}}input.value=(state.displayPreferences||DISPLAY_DEFAULTS)[key];controls[key]=input;label.append(input);form.append(label);}
  const presets=element('div',{class:'dialog-footer wide'});for(const [key,title]of [['studio','标准工作室'],['soft','柔和金属'],['contrast','明暗对比']])presets.append(button(title,()=>{for(const [k,v]of Object.entries(DISPLAY_PRESETS[key]))if(controls[k])controls[k].value=v;},'secondary'));form.prepend(presets);
  const note=element('p',{class:'property-footnote wide'},'预设会填写整组默认值；点击应用后显示并保存。实体自身的颜色和材质在右侧属性修改。'),error=element('p',{class:'form-error wide',role:'alert'});form.append(note,error);
  const foot=element('div',{class:'dialog-footer wide'}),apply=element('button',{type:'submit',class:'primary'},'应用并记住');foot.append(button('恢复默认',()=>{for(const [k,v]of Object.entries(DISPLAY_DEFAULTS))if(controls[k])controls[k].value=v;},'secondary'),apply,button('关闭',closeDialog,'secondary'));form.append(foot);
  form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;apply.disabled=true;error.textContent='';try{const values=Object.fromEntries(fields.map(([k,,type])=>[k,type?controls[k].value:Number(controls[k].value)]));const result=await emit('displayPreferences',values);if(result===false)return;note.textContent=result.persisted?'已应用并记住，下次自动载入。':'';if(!result.persisted)api.showWarning('设置已应用，但浏览器未允许保存 Cookie；下次打开可能恢复默认。');}catch(ex){api.showError(ex);error.textContent='';}finally{apply.disabled=false;}});
  form.append(metalMaterialList({element,button,emit,api,finishSelect}));
  d.append(form);finishSelect.value=state.document?.renderFinish||'';d.append(finishControl);
}
