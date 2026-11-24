import definition from './definition.js';
import {buttonBody, backingPlate} from './geometry.js';
import {numericParams, dispose} from '../installation-geometry.js';

function build(params,cad) {
  const p = numericParams(params,definition,'磁钮');
  for (const field of definition.fields) {
    if (field.type === 'number' && p[field.key] < field.min) throw Error(field.label+'超出尺寸范围');
    if (field.type === 'boolean' && typeof p[field.key] !== 'boolean') throw Error(field.label+'须为勾选项');
  }
  p.scale = p.diameter / 20;
  p.pitch = p.legPitch || 11.2*p.scale;
  p.plateOD = p.plateDiameter || 18*p.scale;
  const hasPlate = p.malePlate || p.femalePlate;
  if (!hasPlate && !p.male && !p.female) throw Error('请至少选择一个磁钮配件');
  if (p.female && p.socketDepth >= p.femaleThickness) throw Error('凹窝深度须小于母件盘厚');
  if ((p.male || p.female) && (p.pitch <= .5*p.scale ||
      Math.hypot(p.pitch/2+.25*p.scale,2.25*p.scale) >= 9.4*p.scale)) throw Error('双脚须分开且脚根完整落在盘底');
  if (hasPlate && (p.pitch/2 <= 2.675*p.scale ||
      Math.hypot(p.pitch/2+.575*p.scale,2.525*p.scale) >= p.plateOD/2)) throw Error('底片需完整容纳两个长槽与中心孔');
  const dx = Math.max(p.diameter,hasPlate ? p.plateOD : 0)+6*p.scale;
  const dy = (p.diameter+p.plateOD)/2+4*p.scale;
  const selected = [
    [p.male,0,0,()=>buttonBody(cad,p,true)], [p.female,dx,0,()=>buttonBody(cad,p,false)],
    [p.malePlate,0,-dy,()=>backingPlate(cad,p)], [p.femalePlate,dx,-dy,()=>backingPlate(cad,p)],
  ].filter(([enabled])=>enabled);
  if (selected.length === 1) return selected[0][3]();
  const shapes = [];
  try {
    for (const [,x,y,make] of selected) shapes.push(make().translate([x,y,0]));
    return cad.makeCompound(shapes);
  } finally { shapes.forEach(dispose); }
}

export default {kind:'magneticButton',definition,build,iconUrl:new URL('../button.svg',import.meta.url).href};
