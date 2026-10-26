const sourceKeys=['values','layers','regions','surfaceMode','curveToleranceMm','contourSnapMm','source'];
const fail=(code,message,field)=>{throw Object.assign(new Error(message),{code,field});};
export function materializeReliefReference(args,cached,documentInstanceId){
 if(args?.op!=='relief'||args.params?.reliefId===undefined)return args;
 if(!cached||cached.documentInstanceId!==documentInstanceId)fail('RESOURCE_EXPIRED','浮雕编号不在当前页面/工程实例，请读取原件。','params.reliefId');
 const {reliefId,...params}=args.params;
 for(const key of sourceKeys)if(params[key]!==undefined)fail('PARAM_SCHEMA_INVALID','使用reliefId时不要混入高度、轮廓或来源数据。',`params.${key}`);
 const source=Object.fromEntries(sourceKeys.filter(k=>cached[k]!==undefined).map(k=>[k,structuredClone(cached[k])]));
 return {...args,params:{...source,...params}};
}
export function reliefReadResult(data,{includeData=true}={}){
 if(typeof includeData!=='boolean')fail('PARAM_SCHEMA_INVALID','includeData必须为布尔值。','includeData');
 if(includeData)return data;
 const {values,regions,layers,...summary}=data;
 return {...summary,...(data.source?.sourceInterpretation==='authoredHeightMap'?{recommendedWorkflow:{method:'reliefWizard',action:'createDesign',source:'original image',reason:'连续高度图使用图片拟合链路；通用Services轮廓桥接不支持连续灰度曲面。'}}:{}),dataIncluded:false,layerCount:layers?.length??0,regionCount:regions?.length??null,holeCount:regions?.reduce((n,r)=>n+(r.holes?.length??0),0)??null,
  nextAction:'将reliefId交给prepareOperation(op:relief)，补齐毫米尺寸、方向和高度后applyPreparedOperation一次；执行端和提交结果从getServicesRouting及reliefReport读取。'};
}
