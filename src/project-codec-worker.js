import {serializeBoundedDocument} from './document-limits.js';
self.onmessage=({data})=>{
  try{const bytes=serializeBoundedDocument(data.document);self.postMessage({ok:true,bytes},[bytes.buffer]);}
  catch(error){self.postMessage({ok:false,error:error.message,code:error.code});}
};
