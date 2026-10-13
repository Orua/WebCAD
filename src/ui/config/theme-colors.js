// Goldenluck Web default; persisted themeColor continues to take precedence.
export const DEFAULT_THEME_COLOR='#3a6eba';
const rgb=color=>[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16));
const luminance=color=>rgb(color).map(value=>{const channel=value/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
export function contrastRatio(a,b){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);}
export function workspaceThemeTokens(value=DEFAULT_THEME_COLOR){
  const color=/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():DEFAULT_THEME_COLOR;
  const readable=contrastRatio(color,'#ffffff')>=4.5;
  return {'--accent':color,'--accent-soft':`color-mix(in srgb, ${color} 10%, white)`,'--accent-dark':color,'--accent-ink':readable?color:'#1f2937','--accent-contrast':readable?'#ffffff':'#000000'};
}
