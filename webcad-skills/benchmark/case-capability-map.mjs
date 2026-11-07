import {cases} from './input/cases.mjs';
import {readiness,required} from './oracle/reference.mjs';
const routes={
 B01:['box','transform','multiHole'],B02:['cylinder','cut'],B03:['box','transform','fillet'],
 M01:['cylinder','transform','union','cut'],M02:['sketchProfile','profileSweep'],M03:['torus','cut','box','transform','intersect'],M04:['box','transform','hole'],M05:['cylinder','transform','cut'],
 S01:['curveSweep'],S02:['curveSweep'],S03:['curveSweep'],S04:['curveSweep'],S05:['curveSweep'],
 S06:['fittedSurface'],S07:['fittedSurface','surfaceTrim'],S08:['fittedSurface'],S09:['fittedSurface','sewFaces'],S10:['fittedSurface','sewFaces'],S11:['thickenFace'],S12:['sphere','cut','hole','fillet'],
};
const conditions={
 M02:'Closed rounded-rectangle centerline and circular section; verify centerline envelope separately from solid bounds.',
 M03:'Annular section must stay normal to circular centerline; measure both open ends.',
 M05:'Each radial tool spans only radius 9..13; do not drill through the opposite wall.',
 S01:'Horizontal rectangular stations must keep constant dimensions and prescribed linear twist; finite stations alone do not prove smooth sides.',
 S02:'Freeze correspondence and interpolation between ellipse/circle sections; check interior semiaxes.',
 S03:'Sections stay parallel to XY, not normal to the displaced center path.',
 S04:'Bezier controls are not interpolation points; exact conversion or frozen fitting error and self-intersection checks required.',
 S05:'Station frames follow arc tangent with radial width and Z height, without added twist.',
 S06:'Boundary and interior distance samples required; fittedSurface presence does not prove required error.',
 S07:'Trim projected radius-3 hole on the saddle; verify trim side and nonplanar hole boundary.',
 S08:'Interior is specified; arbitrary boundary-only patch is insufficient.',
 S09:'Both seam normals need independent G1 checks; sewing does not prove continuity.',
 S10:'All six boundaries must close; verify curved top and one valid solid.',
 S11:'First supply exact cylindrical patch; thickness must be outward from R20 to R21.',
 S12:'Independent reference R0.5 feasibility is still unvalidated; do not dispatch product geometry yet.',
};
// Read-only capability inventory. Tool-card availability never changes NOT_RUN to PASS.
export async function collectCaseCapabilityMap({getTool}){
 if(typeof getTool!=='function')throw Error('CURRENT_TOOL_CARD_READER_REQUIRED');
 const cards=new Map();
 for(const id of [...new Set(Object.values(routes).flat())]){
  try{const card=await getTool(id);cards.set(id,card?.id===id?card:null);}catch{cards.set(id,null);}
 }
 return {recordType:'READ_ONLY_TOOL_ROUTES_NOT_GEOMETRY_ACCEPTANCE',cases:cases.map(input=>{
  const ids=routes[input.caseId],missingTools=ids.filter(id=>!cards.get(id));
  return {caseId:input.caseId,status:'NOT_RUN',candidateTools:ids,missingTools,contractStatus:missingTools.length?'BLOCKED':'REGISTERED_NOT_EXECUTED',
   deterministicRecipe:['B01','B02','B03','M01','M02','M03','M04','M05','S01','S02','S03','S04','S05','S06'].includes(input.caseId)?'browser-host':'NOT_IMPLEMENTED',
   independentStepReader:['B01','B02','B03','M01','M02','M03','M04','M05','S01','S02','S03','S04','S05','S06'].includes(input.caseId)?'OCP-reader':'NOT_IMPLEMENTED',requiredAssertions:required[input.caseId],reference:readiness(input.caseId),condition:conditions[input.caseId]??'Use exact input dimensions and independent STEP readback; live assertions remain separate.'};
 })};
}
