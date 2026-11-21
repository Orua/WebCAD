import {frameMatrix,importDependencies,isModelImport,isIdentityLocation} from './assembly.js';
import {identityMatrix,multiplyMatrix,transformPoint} from './rigid-instance.js';
import {getMetalMaterials,validateMetalMaterials} from './metal-presets.js';
import {binaryHash} from './contracts/operation-schema.js';

export function isFinalProject(document){
  return document.version===4&&document.features.every(feature=>
    feature.op==='import'&&!feature.refs?.length&&!feature.placement&&!feature.compiledCheckpoint&&isModelImport(document.imports[feature.params?.key]));
}

const anchor=(bounds,kind)=>bounds.min.map((v,i)=>kind==='bottom-center'&&i===2?v:(v+bounds.max[i])/2);
const materialFor=(source,id)=>source.materialSettings?.bodyMaterials?.[id];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const shortHash=value=>binaryHash(new TextEncoder().encode(JSON.stringify(value))).slice(7,23);
const compose=(a,b)=>{
  const [x,y,z,w]=a,[u,v,t,s]=b;
  return [w*u+x*s+y*t-z*v,w*v-x*t+y*s+z*u,w*t+x*v-y*u+z*s,w*s-x*u-y*v-z*t];
};

function finishImporter(target,source){
  if(!source.renderMaterials)return finish=>finish;
  const incoming=source.renderMaterials,result=structuredClone(target.renderMaterials??getMetalMaterials()),ids=new Map();
  function copy(finish){
    if(!finish)return finish;
    if(ids.has(finish))return ids.get(finish);
    const material=incoming.materials.find(row=>row.id===finish);
    if(!material)return finish;
    const settings=incoming.styles[material.style];
    const style=!result.styles[material.style]||same(result.styles[material.style],settings)?material.style:'import-'+shortHash(settings);
    result.styles[style]??=settings;
    const existing=result.materials.find(row=>row.id===finish),desired={...material,style};
    const id=existing&&!same(existing,desired)?'import-'+shortHash(desired):finish;
    if(!result.materials.some(row=>row.id===id))result.materials.push({...desired,id});
    ids.set(finish,id);
    return id;
  }
  copy.finish=()=>{target.renderMaterials=validateMetalMaterials(result);};
  return copy;
}

// The candidate is derived from the target; no source-level settings or history
// become the target document's settings.
export function appendProject(target,source,{projectMode='assembly',placement,sourceBounds,scale=1,name,newId=()=>crypto.randomUUID()}){
  const beforeBytes=Object.values(target.binaryAssets||{}).reduce((n,bytes)=>n+bytes.byteLength,0);
  target.version=4;target.binaryAssets={...target.binaryAssets};
  target.appearance={...target.appearance};target.colors={...target.colors};target.surface={...target.surface};
  const imports=target.imports={...target.imports};
  const importedKeys=new Map(),importIds=new Map();
  const finish=finishImporter(target,source);
  const sourceFeatures=source.features;
  const sourcePoint=placement.sourcePoint??anchor(sourceBounds,placement.sourceAnchor.kind);
  const matrix=frameMatrix(placement.frameSnapshot,sourcePoint,scale);
  const transform={matrix,scale};
  const noTransform=scale===1&&isIdentityLocation(matrix);

  function copyImport(key){
    if(importedKeys.has(key))return importedKeys.get(key);
    const item=source.imports[key],newKey=item.format==='reference-image'?'texture-'+item.assetHash:newId();
    importedKeys.set(key,newKey);
    if(item.assetHash)target.binaryAssets[item.assetHash]??=source.binaryAssets[item.assetHash];
    imports[newKey]={...item,...(item.format==='assembly'?{members:item.members.map(part=>({...part,key:copyImport(part.key),finish:finish(part.finish)}))}:{})};
    return newKey;
  }
  for(const feature of sourceFeatures){
    for(const key of importDependencies(source.imports,feature.params.key))copyImport(key);
    const texture=source.surface?.[feature.id]?.texture;
    if(texture)copyImport('texture-'+texture.assetHash);
  }

  const members=sourceFeatures.map(feature=>{
    const id=newId();
    importIds.set(feature.id,id);
    return {id,name:feature.name||feature.id,key:importedKeys.get(feature.params.key),
      hidden:source.hidden?.includes(feature.id)??false,
      ...(source.colors?.[feature.id]?{color:source.colors[feature.id]}:{}),
      ...(source.surface?.[feature.id]?{surface:source.surface[feature.id]}:{}),
      finish:finish(source.appearance?.[feature.id]||(source.imports[feature.params.key].format!=='assembly'?(source.renderFinish||'design'):undefined)),
      ...(materialFor(source,feature.id)?{material:materialFor(source,feature.id)}:{})};
  });
  const created=[];
  function featureFor(id,key,name){target.features.push({id,op:'import',name,refs:[],params:{key}});created.push(id);}
  if(projectMode==='assembly'){
    const key=newId(),id=newId();
    imports[key]={format:'assembly',members,...(!noTransform?{importTransform:transform}:{})};
    featureFor(id,key,name);
  }else{
    for(const member of members){
      const original=imports[member.key];
      const key=newId(),item={...original};
      if(!noTransform){
        if(scale===1&&['brep','brep-instance'].includes(item.format)&&!item.importTransform)
          item.location=multiplyMatrix(matrix,item.location||identityMatrix());
        else if(item.importTransform){
          const previous=item.importTransform,offset=previous.matrix.map((v,i)=>i>=12&&i<=14?v*scale:v);
          item.importTransform={matrix:multiplyMatrix(matrix,offset),scale:scale*previous.scale};
        }else item.importTransform=transform;
      }
      imports[key]=item;
      if(member.hidden)target.hidden.push(member.id);
      if(member.color)target.colors[member.id]=member.color;
      if(member.surface)target.surface[member.id]=member.surface;
      if(member.finish)target.appearance[member.id]=member.finish;
      if(member.material&&target.materialSettings)target.materialSettings.bodyMaterials[member.id]=member.material;
      featureFor(member.id,key,member.name);
    }
  }
  finish.finish?.();
  for(const anchor of source.referenceSystem?.bodyAnchors||[]){
    const bodyId=importIds.get(anchor.bodyId);
    if(!bodyId)continue;
    const mapped={...anchor,bodyId,anchorId:newId(),anchorVersion:1,
      worldPoint:transformPoint(matrix,anchor.worldPoint.map(value=>value*scale)),
      quaternion:compose(placement.frameSnapshot.quaternion,anchor.quaternion),
      status:noTransform?anchor.status:'stale'};
    if(projectMode==='parts'&&target.referenceSystem)target.referenceSystem.bodyAnchors.push(mapped);
    else if(projectMode==='assembly'){
      const member=members.find(row=>row.id===bodyId);
      (member.anchors??=[]).push({...mapped,status:'stale'});
    }
  }
  const addedAssetBytes=Object.values(target.binaryAssets).reduce((n,bytes)=>n+bytes.byteLength,0)-beforeBytes;
  return {created,sourceObjects:sourceFeatures.length,addedAssetBytes,importIds};
}
