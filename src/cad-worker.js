import initOpenCascade from 'replicad-opencascadejs';
import wasmURL from 'replicad-opencascadejs/wasm?url';
import { CadKernel } from './cad-kernel.js';
import {boundedDiagnosticReport} from './modeling/diagnostic-report.js';

const kernel = initOpenCascade({ locateFile: () => wasmURL }).then(oc => new CadKernel(oc));
// Serialize requests: imports await file reads, so onmessage alone is not a lock.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    const { requestId, type } = data;
    try {
      const engine = await kernel;
      engine.onProgress=progress=>self.postMessage({requestId,kind:'progress',progress});
      let result;
      if(type==='ready')result={ready:true};
      else if(type==='rebuild')result=await engine.rebuild(data.document);
      else if(type==='remesh')result=engine.remesh(data.quality);
      else if(type==='export')result=await engine.export(data.format,data.ids,data.appearance);
      else if(type==='technicalDrawing')result={drawing:engine.technicalDrawing(data.input)};
      else if(type==='faceInfo')result=engine.faceInfo(data.bodyId,data.faceId);
      else if(type==='logoTarget')result=await engine.logoTarget(data.bodyId,data.faceId);
      else if(type==='queryGeometry')result=await engine.queryGeometry(data.bodyId,data.kind,data.filter);
      else if(type==='resolveProfileEdges')result=engine.resolveProfileEdges(data.bodyId,data.edgeIds,data.features);
      else if(type==='dragSnap')result=engine.dragSnap(data.input);
      else if(type==='nearestGeometry')result=await engine.nearestGeometry(data.bodyId,data.kind,data.point,data.options);
      else if(type==='inspectDesign')result=engine.inspectDesign(data.input);
      else if(type==='inspectFit')result=engine.inspectFit(data.bodyAId,data.bodyBId,data.toleranceMm,data.volumeThresholdMm3);
      else if(type==='inspectThickness')result=engine.inspectThickness(data.input);
      else if(type==='inspectDraft')result=engine.inspectDraft(data.input);
      else if(type==='inspectRound')result=engine.inspectRound(data.input);
      else if(type==='serializeFeature')result=engine.serializeFeatureShape(data.featureId);
      else if(type==='sourceComplexity')result=engine.sourceComplexity(data.featureId,data.faceId);
      else if(type==='prepareReliefPlan')result=engine.prepareReliefPlan(data.sourceFeatureId,data.params);
      else if(type==='shoulderPlan')result=engine.shoulderPlan(data.sourceFeatureId,data.params);
      else if(type==='faceRoundPlan')result=engine.faceRoundPlan(data.sourceFeatureId,data.params,data.prepare);
      else if(type==='measureRelation')result=engine.measureRelation(data.input);
      else if(type==='measure'){
        if(Array.isArray(data.ids)){
          const items=data.ids.map(id=>engine.measure(data.bodyId,data.selectionType||data.topologyType,id));
          result={items,length:items.reduce((n,v)=>n+(v.length||0),0),area:items.reduce((n,v)=>n+(v.area||0),0)};
        } else result=engine.measure(data.bodyId,data.topologyType,data.topologyId);
      } else throw new Error(`未知请求 ${type}`);
      self.postMessage({ requestId, ok: true, ...result });
    } catch (error) { const report=boundedDiagnosticReport(error?.report);self.postMessage({ requestId, ok: false, error: error?.message || String(error), featureId: error?.featureId, code: error?.code, path: error?.path, recoveryAction: error?.recoveryAction,report }); }
  });
};
