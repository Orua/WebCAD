import {binaryHash} from './contracts/operation-schema.js';
import {snapshotLeafSources} from './geometry-snapshot.js';

// Disk projects deliberately have no modelling recipe or undo timeline. The
// running document remains editable and keeps its bounded session history.
export function finalStateProject(document,sources){
  if(!Array.isArray(sources))throw Object.assign(new Error('最终形态快照尚未准备好；请恢复内核后保存。'),{code:'PROJECT_SNAPSHOT_UNAVAILABLE'});
  const imports={},binaryAssets={},features=[];
  const sourceHashes=new WeakMap(),locatedHashes=new Set();
  for(const {format,data,location}of snapshotLeafSources(sources))if(format==='brep'&&location){let hash=sourceHashes.get(data);if(!hash){hash=binaryHash(data).slice(7);sourceHashes.set(data,hash);}locatedHashes.add(hash);}
  function includeTexture(surface){
    if(!surface?.texture?.assetHash)return;
    const hash=surface.texture.assetHash,key='texture-'+hash;
    imports[key]=document.imports[key];binaryAssets[hash]=document.binaryAssets[hash];
  }
  function store({format,data,location,members},key,name){
    if(format==='assembly'){
      imports[key]={format,name,members:members.map(({source,...member},i)=>{
        const partKey=key+'/part-'+i;
        store(source,partKey,member.name);includeTexture(member.surface);
        return {...member,key:partKey};
      })};
      return;
    }
    if(!(data instanceof Uint8Array)||!['brep','mesh'].includes(format))throw new Error('Invalid final geometry snapshot');
    let assetHash=sourceHashes.get(data);if(!assetHash){assetHash=binaryHash(data).slice(7);sourceHashes.set(data,assetHash);}
    // A distinct typed ZIP entry makes older readers reject this representation
    // instead of ignoring locations and silently stacking copies at the origin.
    const storedFormat=format==='brep'&&locatedHashes.has(assetHash)?'brep-instance':format;
    imports[key]={format:storedFormat,assetHash,name,...(format==='mesh'?{units:'mm'}:{}),...(location?{location:[...location]}:{})};
    binaryAssets[assetHash]=data;
  }
  for(const source of sources){
    const {id}=source,key=`final:${id}`,name=document.features.find(f=>f.id===id)?.name||id;
    store(source,key,name);
    features.push({id,name,op:'import',params:{key},refs:[]});
  }
  const visibleIds=new Set(features.map(f=>f.id));
  for(const [id,surface]of Object.entries(document.surface||{}))if(visibleIds.has(id))includeTexture(surface);
  const {timeline,compiledArtifacts,reliefDesigns,parameters,...metadata}=document;
  const ids=new Set(features.map(f=>f.id));
  return {...metadata,version:4,features,imports,binaryAssets,
    ...(document.materialSettings?{materialSettings:{...document.materialSettings,bodyMaterials:Object.fromEntries(Object.entries(document.materialSettings.bodyMaterials||{}).filter(([id])=>ids.has(id)))}}:{}),
    ...(document.referenceSystem?{referenceSystem:{...document.referenceSystem,bodyAnchors:(document.referenceSystem.bodyAnchors||[]).filter(anchor=>ids.has(anchor.bodyId))}}:{}),
    hidden:(document.hidden||[]).filter(id=>ids.has(id)),
    appearance:Object.fromEntries(Object.entries(document.appearance||{}).filter(([id])=>ids.has(id))),
    colors:Object.fromEntries(Object.entries(document.colors||{}).filter(([id])=>ids.has(id))),
    ...(document.surface?{surface:Object.fromEntries(Object.entries(document.surface).filter(([id])=>ids.has(id)))}:{})};
}
