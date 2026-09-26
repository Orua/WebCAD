// Quantize user lengths and angles, never topology IDs, counts, ratios or normals.
const lengths=new Set('x y z dx dy dz cx cy cz width depth height length radius radius1 radius2 majorRadius minorRadius cornerRadius thickness distance offset gapMm tolerance diameter holeDiameter holeDepth counterboreDiameter counterboreDepth countersinkDiameter pitch wallThickness'.split(' '));
const vectors=new Set(['origin','delta','pivot','point','points','targetPoint','sourcePoint','source','target','placementSourceAnchor']);
export function precisionKind(key){
  if(/^(rx|ry|rz)$/.test(key)||/(angle|angleDeg|Angle|AngleDeg)$/.test(key))return 'angle';
  if(lengths.has(key)||/^(point|delta|pivot|source|target)(X|Y|Z)$/.test(key)||/(Radius|Diameter|Depth|Width|Height|Length|Thickness|Offset|Distance|Gap|Pitch)$/.test(key))return 'length';
  return null;
}
export function roundToPrecision(value,step){
  if(!Number.isFinite(value)||!Number.isFinite(step)||step<=0)return value;
  const units=Math.abs(value/step);
  return Number((Math.sign(value)*Math.round(units+Number.EPSILON*Math.max(1,units))*step).toFixed(10))||0;
}
export function quantizeModelParams(params,prefs={}){
  const length=prefs.dimensionPrecisionMm??0.01,angle=prefs.anglePrecisionDeg??0.1;
  const walk=(value,key='',coordinates=false)=>{
    if(typeof value==='number'){const kind=precisionKind(key);return roundToPrecision(value,coordinates||kind==='length'?length:kind==='angle'?angle:NaN);}
    if(Array.isArray(value))return value.map(v=>walk(v,key,coordinates||vectors.has(key)));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,k,coordinates||vectors.has(key)&&k==='point')]));
    return value;
  };
  return walk(params);
}
