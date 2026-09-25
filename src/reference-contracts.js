import {identityFrame,validateFrame,validateReferenceSystem} from './work-frame.js';

const fail=(code,path,message)=>{throw Object.assign(new Error(message),{code,path,recoveryAction:'READ_STATE_AND_REPLAN'});};
const exact=(value,keys,path='args')=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail('PARAM_SCHEMA_INVALID',path,'Unexpected reference action fields');};
const name=value=>{if(typeof value!=='string'||!value.trim()||value.length>100)fail('PARAM_SCHEMA_INVALID','args.name','Name must be 1–100 characters');return value.trim();};
const version=value=>{if(!Number.isSafeInteger(value)||value<1)fail('PARAM_SCHEMA_INVALID','args.expectedFrameVersion','Positive frame version required');};
export const REFERENCE_ACTIONS=Object.freeze(['reference.setWorkFrame','reference.resetWorkFrame','reference.setLocked','reference.saveFrame','reference.activateFrame','reference.renameFrame','reference.deleteFrame','reference.setBodyAnchor','reference.deleteBodyAnchor']);
export function applyReferenceAction(referenceSystem,action,args,proof){
  const next=validateReferenceSystem(referenceSystem),work=next.workFrame;
  if(!REFERENCE_ACTIONS.includes(action))fail('PARAM_SCHEMA_INVALID','action','Unknown reference action');
  if(action==='reference.setWorkFrame'){
    exact(args,['origin','quaternion','sourceLabel']);if(work.locked)fail('REFERENCE_LOCKED','args','Work frame is locked');
    const frame=validateFrame({origin:args.origin,quaternion:args.quaternion},'args');
    Object.assign(work,frame,{frameVersion:work.frameVersion+1,sourceLabel:args.sourceLabel===undefined?'手动设置':name(args.sourceLabel),provenance:{kind:'manual'}});
  }else if(action==='reference.resetWorkFrame'){
    exact(args,['scope']);if(work.locked)fail('REFERENCE_LOCKED','args','Work frame is locked');
    if(!['position','orientation','all'].includes(args.scope))fail('PARAM_SCHEMA_INVALID','args.scope','Use position, orientation, or all');
    const id=identityFrame();if(args.scope!=='orientation')work.origin=id.origin;if(args.scope!=='position')work.quaternion=id.quaternion;
    work.frameVersion++;work.sourceLabel=work.origin.every(value=>value===0)&&work.quaternion.every((value,index)=>value===[0,0,0,1][index])?'世界原点':'手动设置';work.provenance={kind:'manual'};
  }else if(action==='reference.setLocked'){
    exact(args,['locked']);if(typeof args.locked!=='boolean')fail('PARAM_SCHEMA_INVALID','args.locked','Boolean required');
    if(work.locked!==args.locked){work.locked=args.locked;work.frameVersion++;}
  }else if(action==='reference.saveFrame'){
    exact(args,['name','frame','frameId','expectedFrameVersion']);const label=name(args.name),frame=validateFrame(args.frame,'args.frame');
    if(args.frameId===undefined){if(args.expectedFrameVersion!==undefined)fail('PARAM_SCHEMA_INVALID','args.expectedFrameVersion','Version only applies to update');next.savedFrames.push({frameId:crypto.randomUUID(),frameVersion:1,name:label,...frame});}
    else{const saved=next.savedFrames.find(x=>x.frameId===args.frameId);version(args.expectedFrameVersion);if(!saved||saved.frameVersion!==args.expectedFrameVersion)fail('STALE_REFERENCE','args.frameId','Saved frame changed');Object.assign(saved,frame,{name:label,frameVersion:saved.frameVersion+1});}
  }else if(action==='reference.activateFrame'){
    exact(args,['frameId','expectedFrameVersion']);if(work.locked)fail('REFERENCE_LOCKED','args','Work frame is locked');version(args.expectedFrameVersion);
    const saved=next.savedFrames.find(x=>x.frameId===args.frameId);if(!saved||saved.frameVersion!==args.expectedFrameVersion)fail('STALE_REFERENCE','args.frameId','Saved frame changed');
    work.origin=[...saved.origin];work.quaternion=[...saved.quaternion];work.frameVersion++;work.sourceLabel=saved.name;work.provenance={kind:'saved',frameId:saved.frameId,frameVersion:saved.frameVersion};
  }else if(action==='reference.renameFrame'||action==='reference.deleteFrame'){
    exact(args,action==='reference.renameFrame'?['frameId','expectedFrameVersion','name']:['frameId','expectedFrameVersion']);version(args.expectedFrameVersion);
    const index=next.savedFrames.findIndex(x=>x.frameId===args.frameId);if(index<0||next.savedFrames[index].frameVersion!==args.expectedFrameVersion)fail('STALE_REFERENCE','args.frameId','Saved frame changed');
    if(action==='reference.deleteFrame')next.savedFrames.splice(index,1);else{next.savedFrames[index].name=name(args.name);next.savedFrames[index].frameVersion++;}
  }else if(action==='reference.setBodyAnchor'){
    exact(args,['bodyId','anchorId','name','referenceId','quaternion','expectedAnchorVersion']);
    if(typeof args.bodyId!=='string'||!args.bodyId||typeof args.referenceId!=='string'||!args.referenceId)fail('PARAM_SCHEMA_INVALID','args','Current body and reference token required');
    const label=name(args.name),quaternion=validateFrame({origin:[0,0,0],quaternion:args.quaternion},'args').quaternion;
    if(!proof||proof.bodyId!==args.bodyId||!proof.geometryFingerprint?.startsWith('brep-sha256:')||!Array.isArray(proof.worldPoint))fail('STALE_REFERENCE','args.referenceId','Verified body reference required');
    if(args.anchorId===undefined){if(args.expectedAnchorVersion!==undefined)fail('PARAM_SCHEMA_INVALID','args.expectedAnchorVersion','Version only applies to an update');next.bodyAnchors.push({anchorId:crypto.randomUUID(),anchorVersion:1,bodyId:args.bodyId,name:label,worldPoint:[...proof.worldPoint],quaternion,geometryFingerprint:proof.geometryFingerprint,status:'valid'});}
    else{version(args.expectedAnchorVersion);const anchor=next.bodyAnchors.find(item=>item.anchorId===args.anchorId&&item.bodyId===args.bodyId);if(!anchor||anchor.anchorVersion!==args.expectedAnchorVersion)fail('STALE_REFERENCE','args.anchorId','Body anchor changed');Object.assign(anchor,{anchorVersion:anchor.anchorVersion+1,name:label,worldPoint:[...proof.worldPoint],quaternion,geometryFingerprint:proof.geometryFingerprint,status:'valid'});}
  }else if(action==='reference.deleteBodyAnchor'){
    exact(args,['bodyId','anchorId','expectedAnchorVersion']);version(args.expectedAnchorVersion);
    const index=next.bodyAnchors.findIndex(item=>item.anchorId===args.anchorId&&item.bodyId===args.bodyId);
    if(index<0||next.bodyAnchors[index].anchorVersion!==args.expectedAnchorVersion)fail('STALE_REFERENCE','args.anchorId','Body anchor changed');next.bodyAnchors.splice(index,1);
  }else fail('PARAM_SCHEMA_INVALID','action','Unknown reference action');
  return next;
}
