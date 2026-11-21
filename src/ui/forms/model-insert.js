export function askModelInsertion({name,extension,inspectSource}, {openDialog,closeDialog,element,button}){
  return new Promise(resolve=>{
    const dialog=openDialog('插入到当前设计',name);
    const form=element('form',{class:'property-form'});
    function select(label,options,{required=false}={}){
      const field=element('label',{class:'form-field wide'});
      const input=element('select',required?{required:''}:{});
      for(const [value,text] of options)input.append(element('option',{value},text));
      field.append(element('span',{},label),input);form.append(field);
      return input;
    }
    const units=extension==='stl'?select('STL 源单位',[
      ['','请选择单位'],['mm','毫米 (mm)'],['cm','厘米 (cm)'],['m','米 (m)'],['in','英寸 (in)']
    ],{required:true}):null;
    const frame=select('放置方式',[['world','保留源坐标'],['work','工作基准 · 源包围盒中心']]);
    let projectMode,scale,angleDeg,inspect;
    if(extension==='webcad'){
      projectMode=select('对象组织',[['assembly','整体装配'],['parts','保留分件']]);
      const number=(label,value)=>{
        const field=element('label',{class:'form-field'});
        const input=element('input',{type:'number',step:'any',required:'',value});
        field.append(element('span',{},label),input);form.append(field);return input;
      };
      scale=number('统一比例','1');angleDeg=number('绕放置 Z 轴旋转 (°)','0');
      scale.addEventListener('input',()=>scale.setCustomValidity(scale.valueAsNumber>0?'':'比例须大于零'));
      const size=element('p',{class:'property-callout wide','aria-live':'polite'});
      inspect=button('查看来源尺寸',async()=>{
        inspect.disabled=true;apply.disabled=true;size.textContent='正在读取来源几何…';
        try{
          const result=await inspectSource(),lengths=result.bounds.max.map((v,i)=>Number((v-result.bounds.min[i]).toFixed(3)));
          size.textContent=`${result.objectCount} 个来源对象 · ${lengths.join(' × ')} mm`;
        }catch(error){size.textContent=error.message;}
        finally{inspect.disabled=false;apply.disabled=false;}
      },'secondary wide');
      form.append(inspect,size);
    }
    const footer=element('div',{class:'dialog-footer wide'});
    const apply=element('button',{type:'submit',class:'primary'},'插入');
    footer.append(button('取消',()=>closeDialog(false),'secondary'),apply);
    form.append(footer);dialog.append(form);
    dialog._onClose=()=>resolve(null);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const options={frame:frame.value,units:units?.value??(extension==='mesh'?'mm':undefined),
        ...(projectMode?{projectMode:projectMode.value,scale:scale.valueAsNumber,angleDeg:angleDeg.valueAsNumber}:{angleDeg:0})};
      dialog._onClose=null;closeDialog(false);resolve(options);
    });
  });
}
