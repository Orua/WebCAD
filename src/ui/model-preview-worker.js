import init from 'replicad-opencascadejs';
import wasmURL from 'replicad-opencascadejs/wasm?url';
import {CadKernel} from '../cad-kernel.js';
const ready=init({locateFile:()=>wasmURL}).then(oc=>new CadKernel(oc));
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{
  try{const kernel=await ready;const result=await kernel.rebuild({version:1,features:[{id:'preview',op:'quickModel',params:data.params,refs:[]}],imports:{},hidden:[]});
    self.postMessage({id:data.id,bodies:result.bodies});
  }catch(error){self.postMessage({id:data.id,error:error.message});}
});};
