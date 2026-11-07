import {requireIntegratedCapability} from '../edition.js';
const state=Object.freeze({version:1,locked:false,connected:false,mouseMode:'editable',pageApiWritable:true});
// No storage reads, message listeners, host leases, uploads or iframe initialization.
export const createHostControl=()=>Object.freeze({get:()=>({...state})});
export const installHostInteractionGuard=()=>{};
export const createAssistantPanel=()=>Object.freeze({get:()=>({available:false,visible:false,phase:'unavailable',connected:false,locked:false}),
  sync:()=>{},configure:requireIntegratedCapability,enter:requireIntegratedCapability,exit:requireIntegratedCapability,
  setLayout:requireIntegratedCapability,insertLocation:requireIntegratedCapability});

export const agent=null;
export const connectLegacyAI=requireIntegratedCapability;
export const hostControlAllowed=()=>true;
