export const sewnSurfaceCaseIds=['S09','S10'];
export const sewnSurfaceToolIds={S09:['fittedSurface','sewFaces'],S10:['fittedSurface','sewFaces']};
const placement={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
export function sewnSurfaceRecipe(caseId){
 const grid=fn=>Array.from({length:12},(_,i)=>Array.from({length:12},(_,j)=>fn(j/11,i/11)));
 let patches;
 if(caseId==='S09')patches=[grid((u,v)=>[-10+10*u,12*v-6,0]),grid((u,v)=>[10*u,12*v-6,8*(3*u*u-2*u*u*u)]),grid((u,v)=>[10+10*u,12*v-6,8])];
 else if(caseId==='S10'){
  const top=(x,y)=>5+(x*x+y*y)/200;
  patches=[grid((u,v)=>{const x=20*u-10,y=16*v-8;return [x,y,top(x,y)];}),grid((u,v)=>[20*u-10,16*v-8,0])];
  for(const x of [-10,10])patches.push(grid((u,v)=>{const y=16*u-8;return [x,y,v*top(x,y)];}));
  for(const y of [-8,8])patches.push(grid((u,v)=>{const x=20*u-10;return [x,y,v*top(x,y)];}));
 }else throw Error('SEWN_SURFACE_CASE_UNKNOWN');
 return [...patches.map((points,i)=>({id:'patch'+i,method:'add',args:{op:'fittedSurface',params:{points,tolerance:.01,...(caseId==='S09'?{interpolation:'uniformCubic'}:{})},refs:[],placement}})),
  {id:'sewn',method:'add',args:{op:'sewFaces',params:{tolerance:.01,makeSolid:caseId==='S10'},refs:patches.map((_,i)=>({$ref:'patch'+i+'.createdBodyIds.0'}))}}];
}
export async function observeSewnSurface({caseId,session,context,record}){
 const current=await context(session),state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('SEWN_SURFACE_SINGLE_RESULT_REQUIRED');
 const bodyId=state.bodies[0].id,measured=await session.client.call('measure',{context:current,bodyId}),faces=await session.client.call('queryGeometry',{context:current,bodyId,kind:'face',filter:{},requireUnique:false,limit:50});
 if(measured.status!=='read'||faces.status!=='read')throw Error('SEWN_SURFACE_READBACK_FAILED');
 await record({event:'sewn-surface-page-readback',caseId,context:current,bodyId,measured,faces});
 return {geometry:{reader:{independent:false,source:'public-page-sewn-surface-readback'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume??null,checks:{}},exportBodyIds:[bodyId],revision:current.expectedRevision,raw:{measured,faces}};
}
