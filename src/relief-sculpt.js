// Relief edits stay separate from the source height controls. Both the UI and
// the public preparation API use this deterministic, millimetre-based brush.
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const zero=values=>values.map(row=>row.map(()=>0));
export function reliefLayerParams(params,layerIndex,{samples}={}){
 if(!Array.isArray(params.layers)||!Number.isInteger(layerIndex)||layerIndex<0||layerIndex>=params.layers.length)fail('PARAM_SCHEMA_INVALID','分层浮雕需要明确的当前 layerIndex（从 0 开始）');
 const {layers,regions,strokes,sculpt,values,...common}=params,layer=layers[layerIndex];
 if(samples!==undefined&&(!Number.isInteger(samples)||samples<4||samples>65||layer.values||layer.sculpt))fail('PARAM_SCHEMA_INVALID','samples 仅用于尚无 values/sculpt 的等高层，范围 4–65');
 return {...common,depthMm:layer.heightMm,mode:layer.mode??'emboss',surfaceMode:'smooth',regions:layer.regions,strokes:layer.strokes,values:layer.values??Array.from({length:samples??4},()=>Array(samples??4).fill(1)),...(layer.sculpt?{sculpt:layer.sculpt}:{})};
}
export const sculptSchema={type:'object',additionalProperties:false,required:['deltaMm','mask'],properties:{
 deltaMm:{type:'array',minItems:4,maxItems:65,items:{type:'array',minItems:4,maxItems:65,items:{type:'number',minimum:-20,maximum:20}}},
 mask:{type:'array',minItems:4,maxItems:65,items:{type:'array',minItems:4,maxItems:65,items:{type:'number',minimum:0,maximum:1}}}
}};
export function sculptState(params){
 const v=params.values;
 if(!Array.isArray(v)||v.length<4||v.length>65||!Array.isArray(v[0])||v[0].length<4||v[0].length>65||v.some(r=>r.length!==v[0].length||r.some(n=>!Number.isFinite(n)||n<0||n>1)))fail('RELIEF_INVALID','高度网格无效');
 if(!Number.isFinite(params.depthMm)||params.depthMm<.01||params.depthMm>20)fail('RELIEF_INVALID','浮雕高度须为 0.01–20 mm');
 const out=params.sculpt?structuredClone(params.sculpt):{deltaMm:zero(v),mask:zero(v)};
 for(const [key,min,max]of [['deltaMm',-20,20],['mask',0,1]])if(!Array.isArray(out[key])||out[key].length!==v.length||out[key].some(r=>!Array.isArray(r)||r.length!==v[0].length||r.some(n=>!Number.isFinite(n)||n<min||n>max)))fail('RELIEF_INVALID','精修网格必须与来源网格一致');
 for(let j=0;j<v.length;j++)for(let i=0;i<v[0].length;i++){const h=(params.surfaceMode==='flat'?1:v[j][i])*params.depthMm+out.deltaMm[j][i];if(h< -1e-9||h>20+1e-9)fail('RELIEF_LIMIT','精修后的控制高度须为 0–20 mm');}
 return out;
}
function inRing(x,y,ring){let hit=false;for(let i=0,k=ring.length-1;i<ring.length;k=i++){const a=ring[i],b=ring[k];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
const contourCache=new WeakMap();
export function insideRelief(params,x,y){
 if(!params.regions)return true;
 let cache=contourCache.get(params.regions);if(!cache){cache=new Map();contourCache.set(params.regions,cache);}
 const key=x+','+y;if(cache.has(key))return cache.get(key);
 const inside=params.regions.some(r=>inRing(x,y,r.outer)&&!(r.holes||[]).some(h=>inRing(x,y,h)));
 if(cache.size<20000)cache.set(key,inside);return inside;
}
export function reliefHeights(params){const s=sculptState(params);return params.values.map((r,j)=>r.map((v,i)=>(params.surfaceMode==='flat'?1:v)*params.depthMm+s.deltaMm[j][i]));}
// Eyedropper for the flatten brush: interpolate editable control heights,
// not world-space BRep coordinates or the display surface's spline sample.
export function sampleReliefHeight(params,point,{layerIndex}={}){
 if(params.layers)return {...sampleReliefHeight(reliefLayerParams(params,layerIndex),point),layerIndex};
 if(layerIndex!==undefined)fail('PARAM_SCHEMA_INVALID','单层浮雕不接受 layerIndex');
 if(!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isFinite(n)||n<-.5||n>.5))fail('PARAM_RANGE_INVALID','吸取点须为 [-0.5,0.5] 的局部坐标 [x,y]');
 const heights=reliefHeights(params);
 if(!insideRelief(params,...point))fail('RELIEF_SAMPLE_OUTSIDE','吸取点在浮雕轮廓外或孔洞内，请选择图案内部');
 const x=(point[0]+.5)*(heights[0].length-1),y=(point[1]+.5)*(heights.length-1),i=Math.min(heights[0].length-2,Math.floor(x)),j=Math.min(heights.length-2,Math.floor(y)),u=x-i,v=y-j;
 const targetMm=(1-v)*((1-u)*heights[j][i]+u*heights[j][i+1])+v*((1-u)*heights[j+1][i]+u*heights[j+1][i+1]);
 return {point:[...point],targetMm,quantity:params.mode==='engrave'?'depth':'height',units:'mm',source:'bilinear-height-controls'};
}
export function effectiveReliefParams(params){
 if(!params.sculpt)return params;
 const heights=reliefHeights(params),depthMm=Math.max(.01,...heights.flat());
 const {sculpt,...base}=params;
 return {...base,surfaceMode:'smooth',depthMm,values:heights.map(row=>row.map(h=>clamp(h/depthMm,0,1)))};
}

// A stroke keeps its initial surface and nearest segment distance. Appending
// a pointer segment visits only its brush bounds, never replays the whole path.
// The batch API and interactive UI deliberately share this exact engine.
export function createReliefStroke(params,options){
 if(![params.widthMm,params.heightMm].every(n=>Number.isFinite(n)&&n>0&&n<=1000))fail('RELIEF_INVALID','图案尺寸无效');
 if(!options||Object.keys(options).some(k=>!['mode','radiusMm','strength','amountMm','targetMm','hardness','symmetry'].includes(k)))fail('PARAM_SCHEMA_INVALID','未知笔刷参数');
 const {mode,radiusMm,strength=1,amountMm=.1,targetMm=0,hardness=0,symmetry='none'}=options;
 const state=sculptState(params),before=reliefHeights(params),rows=before.length,cols=before[0].length,step=Math.max(params.widthMm/(cols-1),params.heightMm/(rows-1));
 if(!['raise','lower','smooth','flatten','restore','mask','unmask','fill','scrape','sharpen'].includes(mode)||!Number.isFinite(radiusMm)||radiusMm<step||radiusMm>1000||!Number.isFinite(strength)||strength<=0||strength>1||!Number.isFinite(amountMm)||amountMm<0||amountMm>20||!Number.isFinite(targetMm)||targetMm<0||targetMm>20||!Number.isFinite(hardness)||hardness<0||hardness>1||!['none','x','y','xy'].includes(symmetry))fail('PARAM_RANGE_INVALID',`笔刷半径至少 ${step.toFixed(3)} mm；强度须为 0–1，硬度须为 0–1，控制高度须为 0–20 mm`);
 const originalState=structuredClone(state),distances=new Float64Array(rows*cols).fill(Infinity),targets=new Map(),inside=Array.from({length:rows},(_,j)=>Array.from({length:cols},(_,i)=>insideRelief(params,i/(cols-1)-.5,j/(rows-1)-.5)));
 const mirrors=[[1,1],...(['x','xy'].includes(symmetry)?[[-1,1]]:[]),...(['y','xy'].includes(symmetry)?[[1,-1]]:[]),...(symmetry==='xy'?[[-1,-1]]:[])];
 let previous=null,count=0,visited=0;
 function target(j,i){
  const key=j*cols+i;if(targets.has(key))return targets.get(key);
  let value=before[j][i];
  if(mode==='restore')value=(params.surfaceMode==='flat'?1:params.values[j][i])*params.depthMm;
  if(mode==='flatten')value=targetMm;
  if(['smooth','fill','scrape','sharpen'].includes(mode)){
   let sum=0,n=0;for(let y=Math.max(0,j-1);y<=Math.min(rows-1,j+1);y++)for(let x=Math.max(0,i-1);x<=Math.min(cols-1,i+1);x++)if(inside[y][x]){sum+=before[y][x];n++;}
   const average=n?sum/n:value,sign=params.mode==='engrave'?-1:1;
   value=mode==='sharpen'?2*value-average:mode==='fill'?(average-value)*sign>0?average:value:mode==='scrape'?(average-value)*sign<0?average:value:average;
  }
  targets.set(key,value);return value;
 }
 function segment(a,b){
  const minI=clamp(Math.ceil(((Math.min(a[0],b[0])-radiusMm)/params.widthMm+.5)*(cols-1)),0,cols-1),maxI=clamp(Math.floor(((Math.max(a[0],b[0])+radiusMm)/params.widthMm+.5)*(cols-1)),0,cols-1);
  const minJ=clamp(Math.ceil(((Math.min(a[1],b[1])-radiusMm)/params.heightMm+.5)*(rows-1)),0,rows-1),maxJ=clamp(Math.floor(((Math.max(a[1],b[1])+radiusMm)/params.heightMm+.5)*(rows-1)),0,rows-1);
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  for(let j=minJ;j<=maxJ;j++)for(let i=minI;i<=maxI;i++){
   visited++;if(!inside[j][i])continue;
   const x=(i/(cols-1)-.5)*params.widthMm,y=(j/(rows-1)-.5)*params.heightMm,t=length?clamp(((x-a[0])*dx+(y-a[1])*dy)/length,0,1):0,d=Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy),key=j*cols+i;
   if(d>=radiusMm||d>=distances[key])continue;distances[key]=d;
   const falloff=hardness===1||d/radiusMm<=hardness?1:1-(d/radiusMm-hardness)/(1-hardness),weight=falloff*falloff*(3-2*falloff)*strength;
   if(mode==='mask'||mode==='unmask'){state.mask[j][i]=clamp(originalState.mask[j][i]+(mode==='mask'?weight:-weight),0,1);continue;}
   const w=weight*(1-originalState.mask[j][i]),old=before[j][i];if(!w)continue;
   const height=mode==='raise'||mode==='lower'?old+(mode==='raise'?1:-1)*(params.mode==='engrave'?-1:1)*amountMm*w:old+(target(j,i)-old)*w;
   state.deltaMm[j][i]=clamp(height,0,20)-(params.surfaceMode==='flat'?1:params.values[j][i])*params.depthMm;
  }
 }
 return {state,append(points){
  if(!Array.isArray(points)||!points.length||count+points.length>4096||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<-.5||n>.5)))fail('PARAM_SCHEMA_INVALID','笔画点须为 [-0.5,0.5] 的局部坐标，每笔最多 4096 点');
  for(const point of points){const a=previous||point;for(const [mx,my]of mirrors)segment([a[0]*params.widthMm*mx,a[1]*params.heightMm*my],[point[0]*params.widthMm*mx,point[1]*params.heightMm*my]);previous=point;count++;}
  return state;
 },get stats(){return {pointCount:count,visitedControls:visited};}};
}

export function prepareReliefSculpt(params,strokes,{layerIndex,samples}={}){
 if(params.layers){
  const selected=reliefLayerParams(params,layerIndex,{samples}),result=prepareReliefSculpt(selected,strokes),{layers}=reliefSculptPatch(params,result.params.sculpt,{layerIndex,samples});
  return {params:{layers},report:{...result.report,layerIndex,layerName:layers[layerIndex].name??null,transition:'selected-layer-heightfield; adjacent layer steps are not removed',unmodifiedLayerCount:layers.length-1}};
 }
 if(layerIndex!==undefined||samples!==undefined)fail('PARAM_SCHEMA_INVALID','单层浮雕不接受 layerIndex/samples');
 if(!Array.isArray(strokes)||strokes.length>128)fail('RELIEF_LIMIT','每次最多 128 个笔画');
 let state=sculptState(params),total=0;
 for(const stroke of strokes){
  if(!stroke||typeof stroke!=='object')fail('PARAM_SCHEMA_INVALID','笔刷参数无效');
  const {points,...options}=stroke;
  if(!Array.isArray(points)||(total+=points.length)>4096)fail('RELIEF_LIMIT','每次最多 4096 个笔画点');
  const brush=createReliefStroke({...params,sculpt:state},options);state=brush.append(points);
 }
 const prior=sculptState(params),rows=params.values.length,columns=params.values[0].length;
 return {params:{sculpt:state},report:{changedControls:state.deltaMm.flat().filter((v,k)=>Math.abs(v-prior.deltaMm[Math.floor(k/columns)][k%columns])>1e-12).length,rows,columns,minRadiusMm:Math.max(params.widthMm/(columns-1),params.heightMm/(rows-1)),background:'unchanged-contours',preview:'height-control-approximation'}};
}

// UI drafts and page API strokes commit the same layer-aware parameter patch.
export function reliefSculptPatch(params,draft,{layerIndex,samples}={}){
 if(!params.layers){if(layerIndex!==undefined||samples!==undefined)fail('PARAM_SCHEMA_INVALID','单层浮雕不接受 layerIndex/samples');return {sculpt:sculptState({...params,sculpt:draft})};}
 const selected=reliefLayerParams(params,layerIndex,{samples}),sculpt=sculptState({...selected,sculpt:draft}),layers=structuredClone(params.layers);
 if(samples!==undefined)layers[layerIndex].values=selected.values;
 if(Math.min(...reliefHeights({...selected,sculpt}).flat())<(layers[layerIndex].startHeightMm??0))fail('RELIEF_LIMIT','精修高度不能低于本层起点；请先明确调整 startHeightMm');
 layers[layerIndex].sculpt=sculpt;return {layers};
}
