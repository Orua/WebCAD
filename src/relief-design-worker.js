import {solveReliefDesign} from './relief-design-field.js';
import {fitReliefDesignField} from './relief-design-fit.js';
self.onmessage=event=>{
 const {kind='field',draft,options,solved}=event.data;
 try{
  if(!['field','fit'].includes(kind))throw Object.assign(new Error('Unknown numerical design task'),{code:'PARAM_SCHEMA_INVALID'});
  const result=kind==='fit'?fitReliefDesignField(draft,solved,options):solveReliefDesign(draft,options);
  self.postMessage({ok:true,kind,result});
 }catch(error){self.postMessage({ok:false,kind,error:{code:error.code||(kind==='fit'?'FIT_FAILED':'FIELD_FAILED'),message:error.message,details:error.details??null}});}
};
