import {validateSchema} from './contracts/operation-schema.js';
import {reliefOperations} from './modeling/manufacturing/relief-contracts.js';

export function readVectorRelief(text){
 const data=JSON.parse(text);
 if(data?.version!==1||!Array.isArray(data.layers))throw Object.assign(new Error('分层文件需要 version:1、widthMm、heightMm 和 layers'),{code:'RELIEF_IMAGE_INVALID'});
 const params={faceId:0,widthMm:data.widthMm,heightMm:data.heightMm,depthMm:1,layers:data.layers,curveToleranceMm:data.curveToleranceMm??.005,contourSnapMm:data.contourSnapMm??0};
 validateSchema(reliefOperations.relief.paramsSchema,params);
 return {widthMm:data.widthMm,heightMm:data.heightMm,layers:data.layers,curveToleranceMm:params.curveToleranceMm,contourSnapMm:params.contourSnapMm,values:Array.from({length:4},()=>Array(4).fill(1)),rows:4,columns:4,aspectRatio:data.widthMm/data.heightMm,surfaceMode:'smooth',interpretation:`${data.layers.length} 个矢量层；高度及刻线宽度以毫米明确指定，背景保留原面`};
}
