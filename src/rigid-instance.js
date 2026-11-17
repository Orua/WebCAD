import * as cad from 'replicad';

export const identityMatrix=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export const multiplyMatrix=(a,b)=>Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);let v=0;for(let k=0;k<4;k++)v+=a[k*4+r]*b[c*4+k];return v;});
export function validateRigidMatrix(m){
  const fail=()=>{throw Object.assign(new Error('Invalid exact rigid instance transform'),{code:'ARTIFACT_CORRUPT'});};
  if(!Array.isArray(m)||m.length!==16||m.some(v=>!Number.isFinite(v)))fail();
  if([3,7,11].some(i=>m[i]!==0)||m[15]!==1)fail();
  for(let a=0;a<3;a++)for(let b=0;b<3;b++){let dot=0;for(let k=0;k<3;k++)dot+=m[a*4+k]*m[b*4+k];if(Math.abs(dot-(a===b?1:0))>1e-9)fail();}
  const det=m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);
  if(Math.abs(det-1)>1e-9)fail();return m;
}
export const transformPoint=(m,p,vector=false)=>[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+(vector?0:m[12+i]));
export function locateBrep(shape,m,oc){
  validateRigidMatrix(m);const trsf=new oc.gp_Trsf();let builder;
  try{trsf.SetValues(...[0,1,2].flatMap(r=>[m[r],m[4+r],m[8+r],m[12+r]]));builder=new oc.BRepBuilderAPI_Transform(shape.wrapped,trsf,false,false);return cad.cast(builder.Shape());}
  finally{builder?.delete();trsf.delete();}
}
export function rigidCopyMatrix(params,bounds){
  if(params.mode||params.sizeMm||params.align||(params.scale??1)!==1)return null;
  if(!['relative','absolute'].includes(params.positionMode??'relative'))return null;
  let m=identityMatrix();
  for(const [k,axis]of [['rx',[1,0,0]],['ry',[0,1,0]],['rz',[0,0,1]]]){
    const a=(params[k]??0)*Math.PI/180;if(!Number.isFinite(a))return null;if(!a)continue;
    const [x,y,z]=axis,c=Math.cos(a),s=Math.sin(a),t=1-c;
    m=multiplyMatrix([t*x*x+c,t*x*y+s*z,t*x*z-s*y,0,t*x*y-s*z,t*y*y+c,t*y*z+s*x,0,t*x*z+s*y,t*y*z-s*x,t*z*z+c,0,0,0,0,1],m);
  }
  const target=['x','y','z'].map(k=>params[k]??0);if(target.some(v=>typeof v!=='number'||!Number.isFinite(v)))return null;
  // Absolute position uses the exact transformed BRep bounds at the call site.
  for(let i=0;i<3;i++)m[12+i]=target[i]-(params.positionMode==='absolute'?(bounds.min[i]+bounds.max[i])/2:0);
  return m;
}
export function locatedBody(body,m,feature){
  const arrays=(values,vector=false,Type=Float32Array)=>{if(!values)return values;const out=new Type(values.length);for(let i=0;i<values.length;i+=3){const x=values[i],y=values[i+1],z=values[i+2];for(let j=0;j<3;j++)out[i+j]=m[j]*x+m[4+j]*y+m[8+j]*z+(vector?0:m[12+j]);}return out;};
  const corners=[];for(const x of [body.bounds.min[0],body.bounds.max[0]])for(const y of [body.bounds.min[1],body.bounds.max[1]])for(const z of [body.bounds.min[2],body.bounds.max[2]])corners.push(transformPoint(m,[x,y,z]));
  return {...body,id:feature.id,name:feature.name||feature.id,positions:arrays(body.positions),normals:arrays(body.normals,true),
    edges:body.edges.map(e=>({...e,positions:Array.from(arrays(e.positions,false,Float64Array))})),
    snapPoints:body.snapPoints?.map(p=>({...p,point:transformPoint(m,p.point)})),
    bounds:{min:[0,1,2].map(i=>Math.min(...corners.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...corners.map(p=>p[i])))},
    boundsSource:'transformed-display-bounds',measurementStatus:'exact BRep available on demand',instanceDisplay:{sourceBodyId:body.id,rigid:true,sourceChanged:false},
    // Refinement must query this instance, not a source body's old face handles.
    adaptiveDisplay:body.adaptiveDisplay?{...body.adaptiveDisplay}:undefined};
}
