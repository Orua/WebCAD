// Deterministic public-operation recipes. They are not verified geometry results.
const placement={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
const add=(id,op,params,refs=[])=>({id,method:'add',args:{op,params,refs,...(!refs.length?{placement}:{})}});
const ref=id=>({$ref:id+'.createdBodyIds.0'});
export const compositeCaseIds=['M01','M04'];
export const compositeToolIds={M01:['cylinder','transform','union','cut'],M04:['box','transform','hole']};
export function compositeRecipe(caseId){
 if(caseId==='M01')return [
  add('base','cylinder',{radius:8,height:4}),
  add('upper','cylinder',{radius:5,height:16}),
  add('positioned','transform',{x:0,y:0,z:4},[ref('upper')]),
  add('joined','union',{},[ref('base'),ref('positioned')]),
  add('bore','cylinder',{radius:3,height:20}),
  add('result','cut',{},[ref('joined'),ref('bore')]),
 ];
 if(caseId==='M04')return [
  add('stock','box',{width:40,depth:30,height:10}),
  add('centered','transform',{x:-20,y:-15,z:0},[ref('stock')]),
  add('bore','hole',{radius:2,depth:10,x:0,y:0,z:10,axis:'Z',direction:-1},[ref('centered')]),
  add('result','hole',{radius:5,depth:3,x:0,y:0,z:10,axis:'Z',direction:-1},[ref('bore')]),
 ];
 throw Error('COMPOSITE_RECIPE_NOT_IMPLEMENTED');
}
export async function observeCompositeCase({caseId,session,context,record}){
 if(!compositeCaseIds.includes(caseId))throw Error('COMPOSITE_CASE_UNKNOWN');
 const current=await context(session),state=await session.client.getState();
 if(state.bodies.length!==1)throw Error('BASIC_SINGLE_BODY_REQUIRED');
 const bodyId=state.bodies[0].id;
 const measured=await session.client.call('measure',{context:current,bodyId});
 const surfaces=await session.client.call('queryGeometry',{context:current,bodyId,kind:'face',filter:{surfaceType:'cylinder'},requireUnique:false,limit:30});
 if(measured.status!=='read'||surfaces.status!=='read')throw Error('COMPOSITE_READBACK_FAILED');
 const cylinders=(surfaces.items??[]).map(item=>item.cylinder).filter(Boolean);
 const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<=.01;
 const check=(pass,evidence)=>({checkerId:'page-composite-readback-1',pass,evidence});
 const evidence={kind:'drawing',reference:'Synthetic '+caseId+' specification 1.0.0'};
 const requirements=caseId==='M01'?[
  {id:'lowerWall',bodyId,kind:'material',points:[[6,0,2]],expected:'inside',evidence},
  {id:'upperClearance',bodyId,kind:'material',points:[[6,0,10]],expected:'outside',evidence},
  {id:'bore',bodyId,kind:'material',points:[[0,0,.1],[0,0,3.9],[0,0,4.1],[0,0,19.9]],expected:'outside',evidence},
  {id:'continuousWall',bodyId,kind:'material',points:[[4,0,.1],[4,0,3.9],[4,0,4.1],[4,0,19.9]],expected:'inside',evidence},
 ]:[
  {id:'retained',bodyId,kind:'material',points:[[-19,-14,5],[19,14,5],[4,0,6]],expected:'inside',evidence},
  {id:'holeVoids',bodyId,kind:'material',points:[[0,0,.1],[0,0,6.9],[0,0,9.9],[4,0,8]],expected:'outside',evidence},
 ];
 const material=await session.client.call('inspectDesign',{context:current,requirements});
 if(material.status!=='read')throw Error('COMPOSITE_READBACK_FAILED');
 const result=id=>material.results?.find(item=>item.id===id);
 const passed=id=>result(id)?.verdict==='pass';
 const checks={};let rings=null,counterboreBottomZ=null,counterboreDepth=null;
 if(caseId==='M01'){
  // Cylinder positions do not expose axial extents; leave precise shoulder planes to the independent reader.
  checks.shoulders=check(passed('lowerWall')&&passed('upperClearance'),{lowerWall:result('lowerWall')??null,upperClearance:result('upperClearance')??null,cylinders});
  checks.bore=check(passed('bore')&&cylinders.some(c=>near(c.radiusMm,3)),{sample:result('bore')??null,cylinders});
  checks.connected=check(passed('continuousWall')&&measured.solidCount===1,{sample:result('continuousWall')??null,solidCount:measured.solidCount});
 }else{
  const coaxial=cylinders.length>0&&cylinders.every(c=>near(c.origin[0],0)&&near(c.origin[1],0)&&Math.abs(c.axis[2])>1-1e-7);
  checks.diameters=check(coaxial&&cylinders.some(c=>near(c.radiusMm,2))&&cylinders.some(c=>near(c.radiusMm,5)),{cylinders});
  checks.retainedMaterial=check(passed('retained')&&passed('holeVoids'),{retained:result('retained')??null,voids:result('holeVoids')??null});
  rings=await session.client.call('queryGeometry',{context:current,bodyId,kind:'edge',filter:{curveType:'circle',radiusRangeMm:{min:4.99,max:5.01}},requireUnique:false,limit:20});
  if(rings.status!=='read')throw Error('COMPOSITE_READBACK_FAILED');
  const centers=(rings.items??[]).map(item=>item.center?.[2]).filter(Number.isFinite);
  if(centers.length>=2){counterboreBottomZ=Math.min(...centers);counterboreDepth=Math.max(...centers)-counterboreBottomZ;}
 }
 await record({event:'composite-page-readback',caseId,context:current,measured,surfaces,material,rings});
 return {geometry:{reader:{independent:false,source:'public-page-readback'},brepValid:null,units:'mm',targetType:measured.solidCount>0?'solid':'surface',solidCount:measured.solidCount,volume:measured.volume,checks,...(caseId==='M04'?{counterboreBottomZ,counterboreDepth}:{})},revision:current.expectedRevision,raw:{measured,surfaces,material,rings}};
}
