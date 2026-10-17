// JSON is parameter data only. No expression/code evaluation is permitted.
export function addAdvancedField(form,spec,value,element) {
  if(!['json','jsonObject'].includes(spec[3]))return null;
  const [key,label,defaultValue]=spec;
  const wrap=element('label',{class:'form-field wide','data-field':key});
  const input=element('textarea',{name:key,rows:8,spellcheck:'false',maxlength:'40000','data-no-translate':''});
  wrap.append(element('span',{},label),input);
  input.value=typeof value==='string'?value:JSON.stringify(value??JSON.parse(defaultValue),null,2);
  form.append(wrap);
  return input;
}

export function readAdvancedJson(form,specs,base={}) {
  const out={...base};
  for(const [key,label,,kind] of specs) {
    if(!['json','jsonObject'].includes(kind))continue;
    const input=form.elements.namedItem(key);
    if(!input||input.disabled)continue;
    if(input.value.length>40000)throw new Error('JSON 输入不得超过 40000 个字符。');
    try {out[key]=JSON.parse(input.value);}
    catch {throw new Error(`${label}：JSON 格式无效，请检查方括号、逗号及数字。`);}
    if(kind==='json'?!Array.isArray(out[key]):!out[key]||typeof out[key]!=='object'||Array.isArray(out[key]))throw new Error(`${label} 必须是${kind==='json'?'数组':'对象'}数据。`);
  }
  return out;
}
