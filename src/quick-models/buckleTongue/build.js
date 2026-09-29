export function build(params,cad,_options,{definitions}) {
  const p={...definitions.buckleTongue.defaults,...params};
  const keys=['lengthMm','widthMm','thicknessMm','pivotDiameterMm','clearanceMm'];
  for(const key of keys)if(!Number.isFinite(Number(p[key])))throw new Error(key+' 必须为有限数');
  const [l,w,t,d,g]=keys.map(k=>Number(p[k]));
  if(!(l>w&&w>0&&t>0&&d>0&&g>=0&&g<d))throw new Error('长度须大于针宽，厚度和轴径为正，0≤轴孔间隙<轴径');
  const ri=(d+g)/2,ro=ri+t;
  if(!(l>2*ro))throw new Error('针长不足以容纳环头');
  const held=[],hold=s=>{held.push(s);return s;},dispose=s=>{try{s?.delete()}catch{}};
  let result;
  try{
    const outer=hold(cad.makeCylinder(ro,w,[-w/2,0,0],[1,0,0]));
    const inner=hold(cad.makeCylinder(ri,w+2,[-w/2-1,0,0],[1,0,0]));
    const loop=hold(outer.cut(inner));
    const drawing=hold(cad.drawRoundedRectangle(w,l,w*.49));
    const sketch=hold(drawing.sketchOnPlane('XY'));
    const strip=hold(sketch.extrude(t).translate([0,l/2,-t/2]));
    const blank=hold(loop.fuse(strip));
    // Recut after joining so the flat strip never fills the pivot aperture.
    result=blank.cut(inner);
    const complete=result;result=null;return complete;
  }finally{dispose(result);held.reverse().forEach(dispose)}
}
