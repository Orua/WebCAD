import {getLogoConverterConfig,setLogoConverterConfig} from '../../logo-converter-settings.js';
export function showLogoConverterSettings({openDialog,element,button,closeDialog}){
 const d=openDialog('LOGO转化');
  const converter=element('section',{class:'logo-converter-settings'}),urlLabel=element('label',{class:'form-field'},'LOGO 格式转换 URL（含 userid）'),urlInput=element('input',{type:'url','aria-label':'LOGO 格式转换 URL'}),keyLabel=element('label',{class:'form-field'},'转换 Key（留空保持原值）'),keyInput=element('input',{type:'password',autocomplete:'new-password','aria-label':'LOGO 转换 Key'}),save=button('保存转换配置',()=>{save.disabled=true;try{setLogoConverterConfig({url:urlInput.value.trim(),key:keyInput.value});keyInput.value='';converterStatus.textContent='已保存到当前浏览器；重新打开后会自动载入。';}catch(error){converterStatus.textContent=error.message;}finally{save.disabled=false;}},'secondary'),converterStatus=element('p',{class:'property-footnote'},'');
  urlLabel.append(urlInput);keyLabel.append(keyInput);converter.append(element('h3',{},'LOGO 格式转换'),urlLabel,keyLabel,save,converterStatus);d.append(converter);
  try{const data=getLogoConverterConfig();urlInput.value=data.url;converterStatus.textContent=data.configured?'当前浏览器已保存 URL 和 Key。':'尚未保存转换配置。';}catch(error){converterStatus.textContent=error.message;}

 d.append(button('关闭',closeDialog,'secondary'));
}
