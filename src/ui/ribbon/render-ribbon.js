import {ribbonGroupPolicy} from '../config/ribbon-policy.js';

function describeViewport({q,button,emit}){
  const hints={body:'选择实体 · Ctrl / Shift 多选',face:'选择面 · 点击模型表面',edge:'选择边 · 点击模型边线'};
  for(const control of q('.selection-modes')?.querySelectorAll('[data-mode]')||[]){
    control.title=hints[control.dataset.mode];control.setAttribute('aria-label',hints[control.dataset.mode]);
  }
  const select=q('.selection-modes [data-action="selectTool"]');
  if(select){select.title='选择 (V)：左键拖框；左→右全包，右→左相交；Ctrl / Shift 多选；Alt＋左键旋转';select.setAttribute('aria-keyshortcuts','V');}
  for(const [action,hint]of [['gizmoTranslate','移动对象：先选一个实体，再拖动彩色轴或平面；精确输入可指定距离'],['gizmoRotate','旋转对象：先选一个实体，再拖动彩色圆环；精确输入可指定角度'],['fit','适合窗口 (F)'],['transform','精确移动 / 旋转：输入坐标、距离或角度']]){
    const control=q('.view-actions [data-action="'+action+'"]');
    if(control){control.title=hint;control.setAttribute('aria-label',hint);}
  }
  const hint=q('.viewport-hint');
  if(hint){hint.textContent='V 选择 · 左键框选 · Alt＋左键旋转视角 · 右键平移 · 滚轮缩放 · F 适合';hint.title=hint.textContent;}
  const nav=q('.viewport-nav');
  if(nav&&!nav.querySelector('[data-direction="iso"]')){
    const iso=button('等轴',()=>emit('view',{direction:'iso'}),'secondary');
    iso.dataset.commandId='view';iso.dataset.direction='iso';iso.title='等轴视角 · 更多方向在「视图」菜单';iso.setAttribute('aria-label','等轴视角');nav.prepend(iso);
  }
}

export function renderWorkspaceRibbon({q,toolButtons,activeCategory,UI_LAYOUT,group,element,button,run,emit,names,selectionIcon,actionIcon,quickModelFavorites=[],quickModelLabels={},quickModelIcon,updateDisabled,updateViewControls}){
  const ribbon=q('.ribbon');ribbon.replaceChildren();toolButtons.length=0;
  for(const tab of q('.tab-list').children){const active=tab.dataset.category===activeCategory;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  const tab=UI_LAYOUT.tabs.find(item=>item.label===activeCategory);
  for(const [label,actions,options]of tab.groups){
    const policy=ribbonGroupPolicy(UI_LAYOUT,tab,actions,options),row=group(label);
    row.setAttribute('role','group');row.setAttribute('aria-label',label);
    const more=policy.folded?element('details',{class:'ribbon-more'}):null;
    const menu=more?element('div',{class:'ribbon-more-items','aria-label':label}):null;
    for(const [index,action]of actions.entries()){
      if(action==='quickModelFavorites'){
        for(const kind of quickModelFavorites){
          const model=quickModelLabels[kind],b=button('',()=>run('quickModel@'+kind),'tool-button');
          b.dataset.action='quickModel';b.dataset.commandId='quickModel';b.dataset.quickModelKind=kind;b.dataset.group=label;b.dataset.fullLabel=model.label;b.setAttribute('aria-label',model.label);
          b.append(quickModelIcon(kind),element('span',{},model.label));row.append(b);toolButtons.push(b);
        }
        continue;
      }
      const fullLabel=names[action]||UI_LAYOUT.shortLabels?.[action]||action;
      const b=button('',()=>{if(more)more.open=false;run(action);},'tool-button');
      b.dataset.action=action;b.dataset.commandId=action;b.dataset.group=label;b.dataset.fullLabel=fullLabel;b.setAttribute('aria-label',fullLabel);
      if(action==='selectTool')b.setAttribute('aria-keyshortcuts','V');
      b.append(action==='selectTool'?selectionIcon():actionIcon(action),element('span',{},UI_LAYOUT.shortLabels?.[action]||fullLabel));
      (more&&(policy.overflowActions?policy.overflowActions.includes(action):index>=policy.visibleActions)?menu:row).append(b);toolButtons.push(b);
    }
    if(more){
      const summary=element('summary',{'aria-label':label+'：更多工具'},policy.overflowLabel);
      more.append(summary,menu);
      more.addEventListener('toggle',()=>{
        if(!more.open)return;
        for(const other of ribbon.querySelectorAll('.ribbon-more[open]'))if(other!==more)other.open=false;
        const box=summary.getBoundingClientRect(),width=menu.getBoundingClientRect().width;
        menu.style.left=Math.max(8,Math.min(box.left,innerWidth-width-8))+'px';menu.style.top=box.bottom+4+'px';
        menu.style.maxHeight=Math.max(56,innerHeight-box.bottom-16)+'px';
      });
      more.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();more.open=false;summary.focus();}});
      more.addEventListener('focusout',event=>{if(event.relatedTarget&&!more.contains(event.relatedTarget))more.open=false;});
      row.append(more);
    }
  }
  for(const id of tab.controls||[]){
    const control=UI_LAYOUT.controls[id],row=group(control.label);row.classList.add('view-grid');row.setAttribute('role','group');row.setAttribute('aria-label',control.label);
    for(const [label,value]of control.items){
      const action=control.action||value,b=button('',()=>emit(action,control.key?{[control.key]:value}:undefined),'view-tool');
      b.append(actionIcon(value),element('span',{},UI_LAYOUT.shortLabels?.[value]||label));b.dataset.action=action;b.dataset.fullLabel=label;b.dataset.group=control.label;b.setAttribute('aria-label',label);
      if(control.setting){b.dataset.setting=control.setting;b.dataset.value=value;}row.append(b);toolButtons.push(b);
    }
  }
  describeViewport({q,button,emit});
  updateDisabled();updateViewControls();
}
