// Public synthetic definitions only. No geometry engine, page commands or runs.
// A future authorized host maps these specifications to current public tools.
export const pressureFixtureVersion='1.0.0';
export const pressureCounts=Object.freeze([100,300,500,800,1000]);
export const pressureFamilies=Object.freeze(['simple','curved','mixed-material','complex-edges']);
export function pressureFixture({objectCount=100,family='simple'}={}){
  if(!pressureCounts.includes(objectCount)||!pressureFamilies.includes(family))throw Error('INVALID_PRESSURE_FIXTURE');
  const columns=Math.ceil(Math.sqrt(objectCount)),members=Array.from({length:objectCount},(_,i)=>({
    id:`part-${i+1}`,semanticGroup:`row-${Math.floor(i/columns)+1}`,positionMm:[i%columns*16,Math.floor(i/columns)*16,0],visible:true,
    materialClass:family==='mixed-material'&&i%2?'steel':'brass',
    geometry:family==='curved'?{kind:'torus',majorRadiusMm:4,minorRadiusMm:1}:family==='complex-edges'?{
      kind:'profile-prism',heightMm:3,closed:true,pointsMm:Array.from({length:48},(_,n)=>{const a=n*Math.PI/24,r=n%2?4:6;return [Number((r*Math.cos(a)).toFixed(9)),Number((r*Math.sin(a)).toFixed(9))];})
    }:{kind:'box',sizeMm:[8,8,3]}
  }));
  return {schemaVersion:1,caseId:`pressure-${family}-${objectCount}`,caseVersion:pressureFixtureVersion,source:'public-synthetic',units:'mm',coordinateFrame:'world-XYZ',targetType:'independent-solids',objectCount,family,members};
}
/** Plan-shaped evidence placeholders follow benchmark schemaVersion/caseVersion/
 * sourceCommit/runId/status conventions. This is NOT a benchmark runner or G3
 * validation receipt. The host must hash the fixture and freeze identity/oracle,
 * trajectory, environment, budget and evidence storage before executing anything.
 */
export function pressureComparisonPlan({fixture,sourceCommit=null,build=null}={}){
  if(!fixture||fixture.caseVersion!==pressureFixtureVersion||!pressureCounts.includes(fixture.objectCount)||!pressureFamilies.includes(fixture.family))throw Error('INVALID_PRESSURE_FIXTURE');
  const canonical=pressureFixture({objectCount:fixture.objectCount,family:fixture.family});
  if(JSON.stringify(canonical)!==JSON.stringify(fixture))throw Error('MODIFIED_PRESSURE_FIXTURE');
  const groups={A:{organization:'independent',quality:'preferred'},B:{organization:'safe-compound',quality:'preferred'},C:{organization:'independent',quality:'draft'},D:{organization:'safe-compound',quality:'draft'}};
  // Three predeclared, interleaved orders; do not adapt ordering to observed wins.
  const orders=[['A','B','D','C'],['C','D','B','A'],['B','C','A','D']];
  return {schemaVersion:1,suite:'performance-2x2',caseId:fixture.caseId,caseVersion:fixture.caseVersion,sourceHash:null,sourceCommit,build,runId:null,
    status:'NOT_RUN',reason:'IDENTITY_FIXTURE_HASH_ORACLE_ENVIRONMENT_AND_BUDGET_NOT_FROZEN',identity:null,oracleVersion:null,oracleHash:null,
    environment:null,cameraTrajectory:null,budget:null,repeat:3,groups,
    runs:orders.flatMap((order,i)=>order.map(group=>({caseId:fixture.caseId,group,trial:i+1,status:'NOT_RUN',artifact:null,reason:null}))),
    metrics:['interactionP50Ms','interactionP95Ms','drawCalls','uniqueTriangles','submittedTriangles','cpuSubmitMs','availableMemoryBytes','selectionMs','meshingMs','groupingMs','stepExportMs','monitoringOverheadMs'],
    requiredInvariants:['solid-count','world-bounds','member-volume-area','appearance-visibility','fresh-topology','step-round-trip','source-mesh-unchanged'],
    contrasts:['B-A: grouping at preferred quality','C-A: draft with independent objects','(D-B)-(C-A): interaction; report grouping and remeshing cost separately']};
}
