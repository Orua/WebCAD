import {rotateVector,worldPoint} from './work-frame.js';

const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a,n)=>a.map(v=>v*n);
const unit=(a,path)=>{const n=Math.hypot(...a);if(!Number.isFinite(n)||n<1e-9)throw Object.assign(new Error(`${path} must be nonzero`),{code:'ALIGN_UNDERCONSTRAINED',path});return scale(a,1/n);};
const basis=(axis,up,path)=>{const z=unit(axis,`${path}Axis`),projected=sub(up,scale(z,dot(up,z))),x=unit(projected,`${path}Up`);return {x,y:cross(z,x),z};};
function quaternionFromBasis(source,target){
  const s=[source.x,source.y,source.z],t=[target.x,target.y,target.z];
  const m=Array.from({length:3},(_,row)=>Array.from({length:3},(_,col)=>t.reduce((sum,v,i)=>sum+v[row]*s[i][col],0))),trace=m[0][0]+m[1][1]+m[2][2];let q;
  if(trace>0){const r=Math.sqrt(trace+1)*2;q=[(m[2][1]-m[1][2])/r,(m[0][2]-m[2][0])/r,(m[1][0]-m[0][1])/r,r/4];}
  else{const i=m[0][0]>m[1][1]&&m[0][0]>m[2][2]?0:m[1][1]>m[2][2]?1:2,j=(i+1)%3,k=(i+2)%3,r=Math.sqrt(1+m[i][i]-m[j][j]-m[k][k])*2,v=[0,0,0];v[i]=r/4;v[j]=(m[j][i]+m[i][j])/r;v[k]=(m[k][i]+m[i][k])/r;q=[...v,(m[k][j]-m[j][k])/r];}
  const length=Math.hypot(...q);return q.map(v=>v/length);
}
export function resolveAlignPose(params,frame){
  const required=['sourcePoint','sourceAxis','sourceUp','targetPoint','targetAxis','targetUp'];
  for(const key of required)if(!Array.isArray(params[key])||params[key].length!==3||params[key].some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Object.assign(new Error(`${key} needs finite XYZ`),{code:'PARAM_SCHEMA_INVALID',path:`args.params.${key}`});
  if(!['same','opposite'].includes(params.axisRelation)||!Number.isFinite(params.twistAngleDeg)||!Number.isFinite(params.gapMm))throw Object.assign(new Error('Explicit axis relation, gap and twist are required'),{code:'ALIGN_UNDERCONSTRAINED',path:'args.params'});
  const source=basis(params.sourceAxis,params.sourceUp,'source'),targetAxis=rotateVector(frame.quaternion,params.targetAxis),targetUp=rotateVector(frame.quaternion,params.targetUp),normal=unit(targetAxis,'targetAxis');
  const z=params.axisRelation==='same'?normal:scale(normal,-1),theta=params.twistAngleDeg*Math.PI/180;
  const twisted=targetUp.map((v,i)=>v*Math.cos(theta)+cross(z,targetUp)[i]*Math.sin(theta)+z[i]*dot(z,targetUp)*(1-Math.cos(theta)));
  const target=basis(z,twisted,'target'),quaternion=quaternionFromBasis(source,target);
  const worldTarget=worldPoint(frame,params.targetPoint).map((v,i)=>v+normal[i]*params.gapMm);
  return {sourcePoint:[...params.sourcePoint],targetPoint:worldTarget,worldAxis:z,rotationQuaternion:quaternion,fullyConstrained:true};
}
