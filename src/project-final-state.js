import {binaryHash} from './contracts/operation-schema.js';

// Disk projects deliberately have no modelling recipe or undo timeline. The
// running document remains editable and keeps its bounded session history.
export function finalStateProject(document,sources){
  if(!Array.isArray(sources))throw Object.assign(new Error('最终形态快照尚未准备好；请恢复内核后保存。'),{code:'PROJECT_SNAPSHOT_UNAVAILABLE'});
  const imports={},binaryAssets={},features=[];
  for(const {id,format,data} of sources){
    if(!(data instanceof Uint8Array)||!['brep','mesh'].includes(format))throw new Error('Invalid final geometry snapshot');
    const assetHash=binaryHash(data).slice(7),key=`final:${id}`;
    imports[key]={format,assetHash,name:document.features.find(f=>f.id===id)?.name||id,...(format==='mesh'?{units:'mm'}:{})};
    binaryAssets[assetHash]=data;
    features.push({id,name:imports[key].name,op:'import',params:{key},refs:[]});
  }
  const {timeline,compiledArtifacts,reliefDesigns,parameters,...metadata}=document;
  const ids=new Set(features.map(f=>f.id));
  return {...metadata,version:4,features,imports,binaryAssets,
    ...(document.materialSettings?{materialSettings:{...document.materialSettings,bodyMaterials:Object.fromEntries(Object.entries(document.materialSettings.bodyMaterials||{}).filter(([id])=>ids.has(id)))}}:{}),
    ...(document.referenceSystem?{referenceSystem:{...document.referenceSystem,bodyAnchors:(document.referenceSystem.bodyAnchors||[]).filter(anchor=>ids.has(anchor.bodyId))}}:{}),
    hidden:(document.hidden||[]).filter(id=>ids.has(id)),
    appearance:Object.fromEntries(Object.entries(document.appearance||{}).filter(([id])=>ids.has(id))),
    colors:Object.fromEntries(Object.entries(document.colors||{}).filter(([id])=>ids.has(id)))};
}
