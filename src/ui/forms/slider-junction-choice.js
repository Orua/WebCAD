const pictures=[new URL('../../quick-models/sliderBuckle/junction-1.svg',import.meta.url).href,new URL('../../quick-models/sliderBuckle/junction-2.svg',import.meta.url).href,new URL('../../quick-models/sliderBuckle/junction-3.svg',import.meta.url).href];
const choices=[
 {value:'rollingBall',label:'定 R 接头',picture:pictures[0],detail:'模型1 · 独立设置三维 R'},
 {value:'profileRound',label:'轮廓圆润接头',picture:pictures[1],detail:'模型2 · 可调平面 R'},
 {value:'sourceFree',label:'顺滑接头',picture:pictures[2],detail:'模型3 · 自由曲面过渡'}
];

export function configureSliderJunctionChoice(form,{element}){
 const select=form.elements.namedItem('jointStyle');
 if(!select)return;
 const oldLabel=select.closest('label'),fieldset=element('fieldset',{class:'slider-junction-choice wide'}),grid=element('div',{class:'slider-junction-pictures'}),hint=element('p',{class:'property-callout',role:'status'});
 oldLabel.hidden=true;
 fieldset.append(element('legend',{},'中梁接头'),grid);
 const inputs=[];
 const choose=(choice,pictured)=>{
  const label=element('label',{class:pictured?'slider-junction-option':'slider-junction-original'}),radio=element('input',{type:'radio',name:'junctionStyleChoice',value:choice.value});
  radio.checked=select.value===choice.value;inputs.push(radio);label.append(radio);
  if(pictured){label.append(element('img',{src:choice.picture,alt:choice.label+' · 原模型接头局部',width:200,height:170,loading:'lazy'}),element('strong',{},choice.label),element('small',{},choice.detail));grid.append(label);}
  else{label.append(element('span',{},choice.label));fieldset.append(label);}
  radio.addEventListener('change',()=>{if(!radio.checked)return;select.value=radio.value;select.dispatchEvent(new Event('change',{bubbles:true}));select.dispatchEvent(new Event('input',{bubbles:true}));refresh();});
 };
 for(const choice of choices)choose(choice,true);
 choose({value:'intersection',label:'相交接缝（原方式）'},false);
 fieldset.append(hint);oldLabel.after(fieldset);
 const section=form.elements.namedItem('section'),wire=form.elements.namedItem('sectionSize'),bar=form.elements.namedItem('barDiameter'),radius=form.elements.namedItem('jointRadius');
 function refresh(){
  const style=select.value,newStyle=style!=='intersection',d=Number(wire.value);
  for(const radio of inputs)radio.checked=radio.value===style;
  if(newStyle){section.value='round';bar.value=wire.value;}
  section.disabled=newStyle;bar.disabled=newStyle;radius.disabled=!['rollingBall','profileRound'].includes(style);radius.closest('label').hidden=radius.disabled;
  hint.textContent=style==='rollingBall'?`三维接头 R${Number(radius.value)} mm，与线径 ${d} mm 分别设置；修改 R 保持线径不变。`:style==='sourceFixedR'?'旧工程保持原来的 R=线径/4；选择上方定 R 接头可改用独立半径。':style==='profileRound'?'先圆润接头的平面轮廓，再形成圆线外形；在下方设置接头平面 R。':style==='sourceFree'?`保留模型3的真实自由曲面，局部最大厚度约 ${Number((d*1.03689061240803).toFixed(4))} mm。接头随线径等比缩放。`:'保留原来的圆杆相交接缝。';
  if(newStyle)hint.textContent+=' 框线与横杆使用同一直径；生成时一起完成接头。';
 }
 wire.addEventListener('input',refresh);radius.addEventListener('input',refresh);select.addEventListener('change',refresh);refresh();
 // Generic form reading intentionally skips disabled controls. Carry the shown
 // coupled values explicitly so an old default bar diameter cannot be submitted.
 return params=>select.value==='intersection'?params:{...params,section:'round',barDiameter:Number(wire.value)};
}
