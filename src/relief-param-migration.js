const aliases={relief:{widthMm:'sizeXMm',heightMm:'sizeYMm',depthMm:'reliefHeightMm',baseMm:'cylinderBaseMm'},meshReliefPlate:{widthMm:'sizeXMm',depthMm:'sizeYMm',thicknessMm:'baseThicknessMm'},meshHeightfieldRelief:{widthMm:'sizeXMm',depthMm:'sizeYMm',heightMm:'reliefHeightMm',baseMm:'baseThicknessMm'}};
export const reliefParamOperations=Object.freeze(Object.keys(aliases));
const clone=p=>structuredClone(p);
function rename(p,map){const out=clone(p);for(const [old,key]of Object.entries(map)){if(Object.hasOwn(out,old)){if(Object.hasOwn(out,key)&&JSON.stringify(out[key])!==JSON.stringify(out[old]))throw Object.assign(new Error(`Conflicting ${old}/${key}`),{code:'PARAM_SCHEMA_INVALID',path:'params.'+key});out[key]=out[old];delete out[old];}}return out;}
export function migrateReliefParams(op,p){if(!aliases[op])return p;let out=rename(p,aliases[op]);if(op!=='relief')out.version=2;else out.schemaVersion=2;
 if(out.layers)out.layers=out.layers.map(layer=>rename(layer,{heightMm:'reliefHeightMm'}));if(out.bumps)out.bumps=out.bumps.map(b=>rename(b,{heightMm:'reliefHeightMm'}));return out;
}
export function legacyReliefParams(op,p){if(!aliases[op])return p;let out=rename(p,Object.fromEntries(Object.entries(aliases[op]).map(([a,b])=>[b,a])));delete out.schemaVersion;if(op!=='relief')out.version=1;
 if(out.layers)out.layers=out.layers.map(layer=>rename(layer,{reliefHeightMm:'heightMm'}));if(out.bumps)out.bumps=out.bumps.map(b=>rename(b,{reliefHeightMm:'heightMm'}));return out;
}
export function canonicalReliefSchema(op,schema){if(!aliases[op])return schema;const out=clone(schema),map=aliases[op];
 function keys(s,m){s.properties=Object.fromEntries(Object.entries(s.properties).map(([key,v])=>[m[key]||key,structuredClone(v)]));if(s.required)s.required=s.required.map(key=>m[key]||key);}
 keys(out,map);if(op==='relief')out.properties.schemaVersion={type:'integer',const:2};else out.properties.version.const=2;
 const descriptions={sizeXMm:'X 方向图案/平板宽度 (mm)',sizeYMm:'Y 方向图案/平板长度 (mm)',reliefHeightMm:'相对支撑面最大起伏高度 (mm)',baseThicknessMm:'平板底部厚度 (mm)',cylinderBaseMm:'仅外凸圆柱的基底层厚度 (mm)'};
 for(const [key,description]of Object.entries(descriptions))if(out.properties[key])Object.assign(out.properties[key],{description,unit:'mm'});
 for(const field of ['layers','bumps'])if(out.properties[field]){const s=out.properties[field].items;keys(s,{heightMm:'reliefHeightMm'});Object.assign(s.properties.reliefHeightMm,{description:'当前层/起伏点的起伏高度 (mm)',unit:'mm'});}return out;
}
