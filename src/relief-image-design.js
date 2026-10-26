import {decodeImageFile} from './ui/forms/relief-design-height-panel.js';
import {autoGridSize} from './relief-source/convert.js';
import {createReliefHeightSource} from './relief-source/source.js';
import {validateReliefDesign} from './relief-design-drafts.js';
import {sourceConvertWorkerParams,sourceConvertLocal,convertSourceOnServices,reliefServicesReady} from './services/relief-pipeline.js';

// Explicit original-image -> authored design route. This never changes executor
// after a geometry failure, reduces sampling to escape routing, or creates BRep.
export async function readReliefImageDesign(file,options,context){
 const {widthMm,heightMm,depthMm,precisionMm=.05,invert=false,name='图片浮雕'}=options;
 for(const [key,value,max]of [['widthMm',widthMm,10000],['heightMm',heightMm,10000],['depthMm',depthMm,20],['precisionMm',precisionMm,.5]])if(!Number.isFinite(value)||value<=0||value>max||key==='precisionMm'&&value<.01)throw Object.assign(new Error(`无效图片浮雕参数：${key}`),{code:'PARAM_RANGE_INVALID'});
 if(options.sourceInterpretation!=='authoredHeightMap')throw Object.assign(new Error('图片浮雕直接导入须明确声明作者制作的高度图；照片请在界面核对并确认。'),{code:'MACHINING_SOURCE_CONFLICT'});
 if(typeof invert!=='boolean')throw Object.assign(new Error('invert必须为布尔值'),{code:'PARAM_SCHEMA_INVALID'});
 const image=await decodeImageFile(file),size=autoGridSize({width:image.width,height:image.height,sizeMm:[widthMm,heightMm],precisionMm});
 const params=sourceConvertWorkerParams({width:image.width,height:image.height,settings:{...size,levels:{black:0,white:1},gamma:1,blurPx:0,invert},depthMm,machiningPrecisionMm:precisionMm});
 const remote=await reliefServicesReady('reliefSourceConvert');
 const converted=remote?await convertSourceOnServices({rgba:image.rgba,params,context,imageSha256:image.sha256,fileBytes:image.fileBytes,mime:image.mime,fileName:image.name}):sourceConvertLocal(image.rgba,params);
 const source=createReliefHeightSource({original:{sha256:image.sha256,name:image.name.slice(0,255)},interpretation:'authoredHeightMap',settings:converted.settings??params.settings,grid:converted.grid});
 const draft=validateReliefDesign({schemaVersion:1,name:name.slice(0,120),support:{kind:'rect',centerMm:[0,0],widthMm,heightMm},throughHoles:[],protectedZones:[],heightRangeMm:[0,depthMm],points:[],heightSource:{source,depthMm,edgeKeepoutMm:0,edgeFadeMm:0},fieldSettings:{machiningPrecisionMm:precisionMm,servicesQuality:{mode:'adaptive',maxControlSide:513}}});
 return {draft,conversion:{executedOn:remote?'services':'browser',sourceSha256:image.sha256,columns:converted.grid.columns,rows:converted.grid.rows}};
}
