import {assertDocumentCapacity} from './document-limits.js';
import {validateMaterialSettings} from './material-density.js';
import {validateTimeline} from './document-timeline.js';
import {validateReferenceSystem,validateResolvedPlacement} from './work-frame.js';
import {validateOperationRefs,validateOperationExample} from './operation-registry.js';
export function validateProject(document){
  if(document?.materialSettings!==undefined)validateMaterialSettings(document.materialSettings);
  const checks={idsRefsPlacement:false,paramSchemas:false,capacity:false,timeline:false,referenceSystem:false};
  if(!document||![1,2,3,4].includes(document.version)||!Array.isArray(document.features)||!document.imports||typeof document.imports!=='object')throw Object.assign(new Error('不是有效的WebCAD工程'),{code:'DOCUMENT_INVALID',checks});
  assertDocumentCapacity(document);checks.capacity=true;
  const ids=new Set();
  for(const feature of document.features){
    try{
      if(!feature.id||ids.has(feature.id)||typeof feature.op!=='string'||!Array.isArray(feature.refs))throw new Error('特征ID重复或结构无效');
      validateOperationRefs(feature.op,feature.refs);
      for(const id of feature.refs)if(!ids.has(id))throw new Error('特征引用不存在或指向后续特征');
      if(feature.placement!==undefined)validateResolvedPlacement(feature.placement,feature.op);
      validateOperationExample(feature.op,feature.params);ids.add(feature.id);
    }catch(error){throw Object.assign(error,{featureId:feature.id,checks});}
  }
  checks.idsRefsPlacement=checks.paramSchemas=true;
  if(document.timeline)validateTimeline(document);checks.timeline=true;
  if(document.referenceSystem)validateReferenceSystem(document.referenceSystem);checks.referenceSystem=true;
  return checks;
}
