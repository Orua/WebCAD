const dispose=value=>{try{value?.delete?.();}catch{}};

/** Copies remain separate unless the operator explicitly requests one solid. */
export function patternOutput(instances,mode,cad) {
  if(mode===undefined||mode==='compound')return cad.makeCompound(instances);
  if(mode!=='fuse')throw Object.assign(new Error('阵列输出须为复合体或融合实体'),{code:'PARAM_SCHEMA_INVALID'});
  let result=instances[0].clone();
  try {
    for(const instance of instances.slice(1)) {
      const next=result.fuse(instance);dispose(result);result=next;
    }
    const solids=result.solids;
    try {
      if(solids.length!==1)throw Object.assign(new Error('阵列副本未连成单一实体；请调整间距或选择复合体输出'),{code:'GEOMETRY_INVALID'});
    } finally {solids.forEach(dispose);}
    const output=result;result=null;return output;
  } finally {dispose(result);}
}
