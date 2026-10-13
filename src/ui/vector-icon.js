// All UI icons use the same 24px grid, stroke weight and inherited theme colour.
import {ACTION_ICONS} from './config/action-icons.js';
export function vectorIcon(paths,className=''){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'ui-vector-icon '+className}))svg.setAttribute(key,value);
  for(const d of paths){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);svg.append(path);}
  return svg;
}
export function iconButtonContent(button,kind,label=''){
  button.replaceChildren(vectorIcon(ACTION_ICONS[kind]));
  if(label){const text=document.createElement('span');text.textContent=label;button.append(text);}
  return button;
}
