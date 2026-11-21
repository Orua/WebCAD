import {identityMatrix,transformPoint,validateRigidMatrix} from './rigid-instance.js';
import {rotateVector} from './work-frame.js';

export const isAssembly=shape=>shape?.geometryType==='assembly';
const modelFormats=new Set(['brep','brep-instance','step','stl','mesh','assembly']);
export const isModelImport=item=>modelFormats.has(item?.format);
const invalid=()=>Object.assign(new Error('工程装配成员、位置或资产引用无效。'),{code:'ARTIFACT_CORRUPT'});

export class AssemblyShape {
  constructor(members){this.geometryType='assembly';this.members=members;}
  map(mapShape){
    const members=[];
    try{
      for(const member of this.members)members.push({...member,shape:mapShape(member.shape)});
      return new AssemblyShape(members);
    }catch(error){
      for(const member of members)member.shape.delete();
      throw error;
    }
  }
  delete(){for(const member of this.members)member.shape.delete();}
}

export function unionBounds(boxes){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const bounds of boxes)for(let i=0;i<3;i++){min[i]=Math.min(min[i],bounds.min[i]);max[i]=Math.max(max[i],bounds.max[i]);}
  return {min,max};
}

export function frameMatrix(frame,sourcePoint=[0,0,0],scale=1){
  const rotated=[0,1,2].flatMap(i=>{
    const axis=[0,0,0];axis[i]=1;
    return [...rotateVector(frame.quaternion,axis),0];
  });
  const matrix=[...rotated,0,0,0,1],anchor=transformPoint(matrix,sourcePoint);
  for(let i=0;i<3;i++)matrix[12+i]=frame.origin[i]-scale*anchor[i];
  return matrix;
}

export const isIdentityLocation=matrix=>matrix.every((v,i)=>v===identityMatrix()[i]);

export function importDependencies(imports,key){
  const used=new Set(),pending=[key];
  while(pending.length){
    const current=pending.pop();
    if(used.has(current))continue;
    used.add(current);
    if(imports[current]?.format==='assembly')for(const member of imports[current].members??[]){
      pending.push(member.key);
      if(member.surface?.texture?.assetHash)pending.push('texture-'+member.surface.texture.assetHash);
    }
  }
  return used;
}

export function validateAssemblies(imports={}){
  const validated=new Map(),visiting=new Set();
  function visit(key){
    if(validated.has(key))return validated.get(key);
    if(visiting.has(key)||visiting.size>=20||!Object.hasOwn(imports,key)||!isModelImport(imports[key]))throw invalid();
    const item=imports[key];
    if(item.importTransform){
      const {matrix,scale}=item.importTransform;
      validateRigidMatrix(matrix);
      if(!Number.isFinite(scale)||scale<=0)throw invalid();
    }
    if(item.format!=='assembly')return 1;
    visiting.add(key);
    if(!Array.isArray(item.members)||!item.members.length||item.members.length>2000||item.data!==undefined||item.assetHash!==undefined)throw invalid();
    const ids=new Set();
    let count=0;
    for(const member of item.members){
      if(!member||typeof member.id!=='string'||!member.id||member.id.length>150||ids.has(member.id)||typeof member.name!=='string'||typeof member.key!=='string')throw invalid();
      if(member.hidden!==undefined&&typeof member.hidden!=='boolean'||member.color!==undefined&&!/^#[a-f0-9]{6}$/i.test(member.color))throw invalid();
      ids.add(member.id);count+=visit(member.key);
      if(count>2000)throw invalid();
    }
    visiting.delete(key);validated.set(key,count);
    return count;
  }
  for(const [key,item] of Object.entries(imports))if(item?.format==='assembly'||item?.importTransform)visit(key);
}
