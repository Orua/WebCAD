// Evaluator-only mathematical references; never import from a model adapter.
export const oracleVersion='1.0.0';
export const volume = {
 B01:4800-32*Math.PI, B02:400*Math.PI, B03:5*(596+Math.PI), M01:476*Math.PI,
 M02:4*Math.PI*(80+12*Math.PI), M03:50*Math.PI**2, M04:12000-103*Math.PI,
 S01:9600, S02:4720*Math.PI/3, S03:1960*Math.PI/3, S05:530*Math.PI/3,
 S10:1600+1312/15, S11:205*Math.PI,
};
export function section(caseId,t){
 if(caseId==='S01')return {z:40*t,width:20,height:12,angleDeg:60*t};
 if(caseId==='S02')return {z:40*t,a:10-4*t,b:4+2*t};
 if(caseId==='S03')return {z:40*t,x:6*Math.sin(Math.PI*t),y:0,radius:5-2*t};
 if(caseId==='S05')return {angleDeg:90*t,radius:20,width:4+2*t,height:3+t};
 throw Error('SECTION_REFERENCE_MISSING');
}
export function surface(caseId,u,v){
 if(caseId==='S06')return [(2*u-1)*(10+2*Math.sin(Math.PI*v)),40*v,5*Math.sin(Math.PI*v)+2*(2*u-1)**2];
 if(caseId==='S07'){const x=20*u-10,y=20*v-10;return x*x+y*y<9?null:[x,y,(x*x-y*y)/100];}
 if(caseId==='S08')return [20*u,20*v,3*v*Math.sin(Math.PI*u)+2*Math.sin(Math.PI*v)];
 if(caseId==='S09')return [10*u,12*v-6,8*(3*u*u-2*u*u*u)];
 if(caseId==='S10'){const x=20*u-10,y=16*v-8;return [x,y,5+(x*x+y*y)/200];}
 throw Error('SURFACE_REFERENCE_MISSING');
}
export const required = {
 B01:['envelope','holes','through','retainedMaterial'],B02:['diameters','coaxial','height','through'],
 B03:['radius','edgeScope','thickness','undo'],M01:['shoulders','bore','connected'],
 M02:['closedPath','wireDiameter','centerline','selfIntersection'],M03:['diameters','endNormals','through','wall'],
 M04:['diameters','counterboreDepth','retainedMaterial'],M05:['holeCount','radialAxes','cutScope','retainedMaterial'],
 S01:['sections','smoothSides'],S02:['sections','endCircle'],S03:['sections','sectionPlanes'],
 S04:['path','sections','endNormals','selfIntersection'],S05:['sections','connected'],
 S06:['surfaceSamples','boundaries'],S07:['surfaceSamples','holeBoundary','trimSide'],
 S08:['surfaceSamples','boundaries','folds'],S09:['surfaceSamples','seamG0','seamG1','supports'],
 S10:['surfaceSamples','closedBoundaries'],S11:['radii','thicknessDirection','closedBoundaries'],
 S12:['radius','rimScope','bottomPreserved','continuity'],
};
export const sectionCases=['S01','S02','S03','S05'];
export const surfaceCases=['S06','S07','S08','S09','S10'];
// Mathematical values are implemented; this is not a reference-geometry receipt.
export function readiness(caseId){
 if(!required[caseId])throw Error('UNKNOWN_REFERENCE_CASE');
 const numericAssertions=[...(volume[caseId]!==undefined?['volume']:[]),...(sectionCases.includes(caseId)?['sections']:[]),...(surfaceCases.includes(caseId)?['surfaceSamples']:[]),...(caseId==='B01'?['envelope','holes']:[]),...(caseId==='M04'?['counterboreDepth']:[])];
 return {status:'UNVERIFIED',reason:caseId==='S12'?'REFERENCE_FILLET_FEASIBILITY_NOT_VALIDATED':'REFERENCE_GEOMETRY_NOT_VALIDATED',numericAssertions,
  pendingIndependentChecks:['referenceConstructibility','calibratedTolerances','brepValidity','targetType','units','stepRoundTrip',...required[caseId]],
  missingSpecializedCheckers:required[caseId].filter(id=>!numericAssertions.includes(id))};
}
