import initOpenCascade from 'replicad-opencascadejs';
import wasmURL from 'replicad-opencascadejs/wasm?url';
import { CadKernel } from './cad-kernel.js';

const kernel = initOpenCascade({ locateFile: () => wasmURL }).then(oc => new CadKernel(oc));
// Serialize requests: imports await file reads, so onmessage alone is not a lock.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    const { requestId, type } = data;
    try {
      const engine = await kernel;
      let result;
      if(type==='ready')result={ready:true};
      else if(type==='rebuild')result=await engine.rebuild(data.document);
      else if(type==='export')result=await engine.export(data.format,data.ids);
      else if(type==='faceInfo')result=engine.faceInfo(data.bodyId,data.faceId);
      else if(type==='queryGeometry')result=await engine.queryGeometry(data.bodyId,data.kind,data.filter);
      else if(type==='measure'){
        if(Array.isArray(data.ids)){
          const items=data.ids.map(id=>engine.measure(data.bodyId,data.selectionType||data.topologyType,id));
          result={items,length:items.reduce((n,v)=>n+(v.length||0),0),area:items.reduce((n,v)=>n+(v.area||0),0)};
        } else result=engine.measure(data.bodyId,data.topologyType,data.topologyId);
      } else throw new Error(`未知请求 ${type}`);
      self.postMessage({ requestId, ok: true, ...result });
    } catch (error) { self.postMessage({ requestId, ok: false, error: error?.message || String(error), featureId: error?.featureId, code: error?.code, path: error?.path, recoveryAction: error?.recoveryAction }); }
  });
};
