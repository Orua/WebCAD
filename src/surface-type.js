// OCCT reports analytic cylinders as cylindre/CYLINDRE. Page contracts and
// targetSurfaceType use the English class name. Comparison is by class, so
// spelling or case alone is not a surface change.
const CLASSES=Object.freeze({
  plane:'plane',
  cylinder:'cylinder',cylindre:'cylinder',
  cone:'cone',
  sphere:'sphere',
  torus:'torus',
  bezier:'bezier',bezier_surface:'bezier',
  bspline:'bspline',bspline_surface:'bspline',
  revolution:'revolution',revolution_surface:'revolution',
  extrusion:'extrusion',extrusion_surface:'extrusion',
  offset:'offset',offset_surface:'offset',
  other:'other',other_surface:'other',
});
export function canonicalSurfaceType(value){
  if(typeof value!=='string')return null;
  const key=value.trim().toLowerCase();
  return Object.hasOwn(CLASSES,key)?CLASSES[key]:null;
}
export function sameSurfaceType(a,b){
  const left=canonicalSurfaceType(a),right=canonicalSurfaceType(b);
  if(left&&right)return left===right;
  return String(a??'').trim().toLowerCase()===String(b??'').trim().toLowerCase();
}
