import {binaryHash} from './contracts/operation-schema.js';
const REPORTS=['alignmentReport','ellipsoidReport','loftReport','guidedLoftReport','variationReport','booleanReport','blendRadiusReport','radiusSearchReport','subdApproximation','warnings'];
const TOPOLOGY=new Set(['edgeId','edgeIds','faceId','faceIds','resolvedEdgeIds','resolvedFaceIds','limitingEdgeIds','selectedEdgeIds','selectedFaceIds']);
const digest=reports=>binaryHash(new TextEncoder().encode(JSON.stringify(reports)));
function clean(value,depth=0){
 if(depth>12)return undefined;
 if(Array.isArray(value))return value.slice(0,4096).map(item=>clean(item,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!TOPOLOGY.has(key)).map(([key,item])=>[key,clean(item,depth+1)]).filter(([,item])=>item!==undefined));
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string')return value.slice(0,4096);
 return value;
}
export function checkpointReports(shape){
 const reports=Object.fromEntries(REPORTS.filter(key=>shape[key]!==undefined).map(key=>[key,clean(shape[key])]));
 if(JSON.stringify(reports).length>128*1024)return undefined;
 return {version:1,reports,sha256:digest(reports),topologyIdentifiersOmitted:true};
}
export function restoreCheckpointReports(shape,bundle){
 if(bundle?.version===1&&bundle.reports&&bundle.sha256===digest(bundle.reports))for(const key of REPORTS)if(bundle.reports[key]!==undefined)shape[key]=clean(bundle.reports[key]);
 return shape;
}
