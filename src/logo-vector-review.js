import {validateRegions} from './logo-model.js';
import {logoDXF} from './logo-dxf.js';

const copy=value=>structuredClone(value);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function logoContourBounds(logo){
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const r of logo.regions)for(const [x,y] of r.outer){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 return [minX,minY,maxX,maxY];
}
function selectionRing(logo,selection){
 const {regionIndex,holeIndex}=selection||{};
 if(!Number.isInteger(regionIndex)||!logo.regions[regionIndex])fail('LOGO_SELECTION_INVALID','请选择存在的填充区域。');
 const r=logo.regions[regionIndex];
 if(holeIndex===null||holeIndex===undefined)return r.outer;
 if(!Number.isInteger(holeIndex)||!r.holes?.[holeIndex])fail('LOGO_SELECTION_INVALID','请选择存在的孔轮廓。');
 return r.holes[holeIndex];
}
/** One bounded, transactional contour editor shared by the UI and public Agent methods. */
export function createLogoReviewSession(input){
 validateRegions(input);
 let logo={...copy(input),regions:validateRegions(input)},revision=0,selection={regionIndex:0,holeIndex:null,pointIndex:0},undo=[];
 const snapshot=()=>({revision,logo:copy(logo),selection:copy(selection),canUndo:undo.length>0,reviewRequired:logo.source?.reviewed!==true,boundsMm:logoContourBounds(logo),units:'mm'});
 function act(request={}){
  const action=request.action||'get';
  if(action==='get')return snapshot();
  if(request.expectedRevision!==revision)fail('LOGO_REVIEW_STALE','轮廓草稿已变化，请读取最新 revision 后再操作。');
  if(action==='select'){
   const next={regionIndex:request.regionIndex,holeIndex:request.holeIndex??null,pointIndex:request.pointIndex??0},ring=selectionRing(logo,next);
   if(!Number.isInteger(next.pointIndex)||next.pointIndex<0||next.pointIndex>=ring.length)fail('LOGO_SELECTION_INVALID','请选择存在的节点。');
   selection=next;revision++;return snapshot();
  }
  if(action==='undo'){
   if(!undo.length)fail('LOGO_UNDO_EMPTY','没有可撤销的轮廓修改。');
   ({logo,selection}=undo.pop());revision++;return snapshot();
  }
  const next=copy(logo),nextSelection=copy(selection);
  if(action==='confirm'){
   if(request.confirmed!==true)fail('LOGO_REVIEW_REQUIRED','确认前须明确核对字形、孔洞和毫米尺寸。');
   validateRegions(next);
   next.source={...(next.source||{}),reviewed:true,reviewRequired:false,contourReview:{version:1,revision:revision+1,confirmed:true,edited:!!next.source?.contourEditing}};
  }else{
   const ring=selectionRing(next,selection),pointIndex=selection.pointIndex;
   if(action==='setPoint'){
    if(!Array.isArray(request.pointMm)||request.pointMm.length!==2||!request.pointMm.every(Number.isFinite))fail('PARAM_SCHEMA_INVALID','节点坐标必须为有限的 [x,y] 毫米数值。');
    ring[pointIndex]=[...request.pointMm];
   }else if(action==='deletePoint'){
    if(ring.length<=3)fail('LOGO_MIN_VERTICES','闭合轮廓至少需要三个节点；可改为删除整个轮廓。');
    ring.splice(pointIndex,1);nextSelection.pointIndex=Math.min(pointIndex,ring.length-1);
   }else if(action==='deleteContour'){
    if(selection.holeIndex===null){
     if(next.regions.length<=1)fail('LOGO_EMPTY','至少保留一个填充区域。');
     next.regions.splice(selection.regionIndex,1);
    }else next.regions[selection.regionIndex].holes.splice(selection.holeIndex,1);
    Object.assign(nextSelection,{regionIndex:0,holeIndex:null,pointIndex:0});
   }else fail('PARAM_SCHEMA_INVALID','支持 get/select/setPoint/deletePoint/deleteContour/undo/confirm。');
   try{validateRegions(next);}catch(error){fail('LOGO_CONTOUR_INVALID',`修改未应用：${error.message}`);}
   const [x0,y0,x1,y1]=logoContourBounds(next);next.sizeMm=[x1-x0,y1-y0];
   next.source={...(next.source||{}),reviewed:false,reviewRequired:true,...(next.source?.contourReview?{contourReview:{...next.source.contourReview,confirmed:false}}:{}),contourEditing:{version:1,units:'mm',lastAction:action,editRevision:revision+1,originalGeometryHash:next.source?.contourEditing?.originalGeometryHash??next.source?.conversion?.geometryHash??null}};
  }
  undo.push({logo:copy(logo),selection:copy(selection)});if(undo.length>30)undo.shift();
  logo=next;selection=nextSelection;revision++;return snapshot();
 }
 return {get:snapshot,act};
}

export function logoReviewSvg(logo){
 const [x0,y0,x1,y1]=logoContourBounds(logo),path=ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${x} ${-y}`).join(' ')+' Z';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${x1-x0}mm" height="${y1-y0}mm" viewBox="${x0} ${-y1} ${x1-x0} ${y1-y0}">${logo.regions.map(r=>`<path fill="#000000" fill-rule="evenodd" d="${[r.outer,...(r.holes||[])].map(path).join(' ')}"/>`).join('')}</svg>`;
}
/** The page resource store registers these bytes; this never reads arbitrary URLs or paths. */
export function logoReviewArtifacts(logo){
 validateRegions(logo);
 return [
  {kind:'contours',name:'logo.logo.json',mime:'application/json',text:JSON.stringify({...logo,type:'webcad-logo',version:1,units:'mm'})},
  {kind:'preview',name:'logo.svg',mime:'image/svg+xml',text:logoReviewSvg(logo)},
  {kind:'drawing',name:'logo.dxf',mime:'application/dxf',text:logoDXF(logo)},
  {kind:'report',name:'logo-conversion-report.json',mime:'application/json',text:JSON.stringify({source:logo.source,sizeMm:logo.sizeMm,reviewRequired:logo.source?.reviewed!==true,regions:logo.regions.length,holes:logo.regions.reduce((n,r)=>n+(r.holes?.length||0),0)})}
  ,...(logo.source?.rasterOriginalContours?[{kind:'original-contours',name:'logo-original-pixel-contours.logo.json',mime:'application/json',text:JSON.stringify(logo.source.rasterOriginalContours)}]:[])
  ,...(logo.source?.rasterSmoothing?[{kind:'smoothing',name:'logo-smoothing-report.json',mime:'application/json',text:JSON.stringify(logo.source.rasterSmoothing)}]:[])
  ,...(logo.source?.inspectionReport?[{kind:'inspection',name:'logo-inspection.json',mime:'application/json',text:JSON.stringify(logo.source.inspectionReport)}]:[])
 ];
}
