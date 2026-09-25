export const RENDER_QUALITIES = Object.freeze({
  draft: Object.freeze({label:'草稿',tolerance:0.2,angularTolerance:0.3}),
  standard: Object.freeze({label:'标准',tolerance:0.08,angularTolerance:0.15}),
  fine: Object.freeze({label:'精细',tolerance:0.025,angularTolerance:0.08}),
  ultra: Object.freeze({label:'高精',tolerance:0.008,angularTolerance:0.04}),
});
export function renderQuality(key){
  if(!Object.hasOwn(RENDER_QUALITIES,key))throw Object.assign(new Error('quality must be draft, standard, fine or ultra'),{code:'PARAM_SCHEMA_INVALID',path:'quality'});
  return RENDER_QUALITIES[key];
}
