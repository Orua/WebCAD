// Local millimetre domains do not resample the original layer's global grid.
const fail=message=>{throw Object.assign(new Error(message),{code:'RELIEF_PATCH_INVALID'});};
const rowSchema={type:'array',minItems:7,maxItems:65,items:{type:'number',minimum:-20,maximum:20}};
export const localPatchSchema={type:'object',additionalProperties:false,required:['id','domainMm','deltaMm','protectionMm'],properties:{id:{type:'string',minLength:1,maxLength:120,pattern:'^[a-zA-Z0-9_-]+$'},domainMm:{type:'array',minItems:4,maxItems:4,items:{type:'number',minimum:-500,maximum:500}},deltaMm:{type:'array',minItems:7,maxItems:65,items:rowSchema},mask:{type:'array',minItems:7,maxItems:65,items:{...rowSchema,items:{type:'number',minimum:0,maximum:1}}},protectionMm:{type:'number',minimum:.02,maximum:20}}};
export const localPatchesSchema={type:'array',minItems:1,maxItems:1,items:localPatchSchema};
export function validateLocalPatch(patch,params){
 if(!patch||Object.keys(patch).some(k=>!['id','domainMm','deltaMm','mask','protectionMm'].includes(k))||typeof patch.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(patch.id))fail('局部精修需要稳定 patch ID');
 const d=patch.domainMm;if(!Array.isArray(d)||d.length!==4||d.some(v=>!Number.isFinite(v))||d[0]>=d[2]||d[1]>=d[3]||d[0]<-params.widthMm/2||d[2]>params.widthMm/2||d[1]<-params.heightMm/2||d[3]>params.heightMm/2)fail('局部毫米域必须完整位于原图案内');
 if(!Number.isFinite(patch.protectionMm)||patch.protectionMm<Math.max(.02,2*(params.curveToleranceMm??0))||patch.protectionMm>20)fail('保护带至少为 0.02mm 和两倍轮廓拟合公差中的较大值');
 const values=patch.deltaMm,rows=values?.length,cols=values?.[0]?.length;
 if(rows<7||rows>65||cols<7||cols>65||!Array.isArray(values)||values.some(row=>!Array.isArray(row)||row.length!==cols||row.some(v=>!Number.isFinite(v)||Math.abs(v)>20)))fail('局部精修网格须为 7–65 行列的毫米增量');
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)if((i<2||j<2||i>=cols-2||j>=rows-2)&&values[j][i]!==0)fail('局部边界两排控制点须为零，保持原柱面边界和切向');
 if(patch.mask&&(!Array.isArray(patch.mask)||patch.mask.length!==rows||patch.mask.some(row=>!Array.isArray(row)||row.length!==cols||row.some(v=>!Number.isFinite(v)||v<0||v>1))))fail('局部保护网格须与局部增量网格一致');
 return patch;
}
export function localPatchBrushParams(params,patch){
 validateLocalPatch(patch,params);const [a,b,c,d]=patch.domainMm;
 return {widthMm:c-a,heightMm:d-b,depthMm:params.depthMm,mode:'emboss',surfaceMode:'smooth',values:patch.deltaMm.map(row=>row.map(()=>1)),sculpt:{deltaMm:patch.deltaMm,mask:patch.deltaMm.map((row,j)=>row.map((_,i)=>i<2||j<2||i>=row.length-2||j>=patch.deltaMm.length-2?1:patch.mask?.[j]?.[i]??0))}};
}
