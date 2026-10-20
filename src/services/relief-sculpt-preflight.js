import {classifyComplexity} from './execution-router.js';
import {assertCompilableFeature} from './geometry-exchange.js';
import {getServicesConfig} from './settings.js';

// Read-only early rejection of known recipe/route conflicts. Source snapshots,
// live server capabilities and task reconciliation remain execution-time gates.
export function reliefSculptPreflight(feature,{servicesConfigured,source={}}={}){
 if(servicesConfigured===undefined){
  try{servicesConfigured=getServicesConfig().configured;}
  catch(error){return {status:'not-checked',blockers:[],warning:{code:error.code??'SERVICES_CONFIG_INVALID',message:error.message}};}
 }
 const complexity=classifyComplexity({operation:feature.op,params:feature.params,source});
 if(!servicesConfigured||!complexity.complex)return {status:'prechecked',executor:'local',blockers:[],complexity,executionChecksPending:true};
 try{assertCompilableFeature(feature);}
 catch(error){
  return {status:'prechecked',executor:'blocked',complexity,executionChecksPending:true,blockers:[{
   code:'SERVICES_OPERATION_UNAVAILABLE',
   message:'当前精修配方达到后台计算门槛，但后台不支持此配方：'+error.message+'。草稿保留，不会自动降低精度或转本地重算。',
   causeCode:error.code,reason:'remote-sculpt-recipe-unsupported'
  }]};
 }
 return {status:'prechecked',executor:'remote-candidate',blockers:[],complexity,executionChecksPending:true};
}
