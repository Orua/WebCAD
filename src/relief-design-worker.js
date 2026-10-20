import {solveReliefDesign} from './relief-design-field.js';
self.onmessage=event=>{try{self.postMessage({ok:true,result:solveReliefDesign(event.data.draft,event.data.options)});}catch(error){self.postMessage({ok:false,error:{code:error.code||'FIELD_FAILED',message:error.message,details:error.details??null}});}};
