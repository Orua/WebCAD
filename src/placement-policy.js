import {listOperations} from './operation-registry.js';
import {mechanicalIds,mechanicalCreationIds} from './mechanical-tool-contracts.js';

// Every registered modeling operation has one explicit spatial policy.
// C: independent creation; T: tool/additive material; S: target face;
// X: axis/plane/vector; N: existing topology/location; L: legacy only.
const category={
  C:['box','cylinder','sphere','cone','torus','extrude','revolve','sweep','loft','quickModel','vectorProfile','arcProfile','sketchProfile','curveSweep','advancedLoft','fittedSurface','import'],
  T:['hole','holeWizard','multiHole','slot','multiPocket','multiBoss'],
  S:['faceHole','logo'],
  X:['transform','copy','mirror','linearPattern','circularPattern','split','planeSection','referenceExtrude'],
  N:['referenceLoft','faceExtrude','thickenFace','fillet','chamfer','shell','draftFaces','autoRound','smoothTransition','union','cut','intersect','group','extractSolid','extractShell','extractFaces','faceBoundary','sewFaces','surfaceTrim','profileOffset','profileRepair','profileExtrude','remove'],
  L:['curvedLogo'],
};
export const PLACEMENT_POLICIES=Object.freeze({...Object.fromEntries(Object.entries(category).flatMap(([policy,ids])=>ids.map(id=>[id,policy]))),...Object.fromEntries(mechanicalIds.map(id=>[id,mechanicalCreationIds.includes(id)?'C':'N']))});
export function placementPolicy(id){return PLACEMENT_POLICIES[id];}
const defaultAnchor={box:'bottom-center',cylinder:'bottom-center',cone:'bottom-center',sphere:'bounds-center',torus:'bounds-center',import:'model-origin',quickModel:'model-origin'};
export function placementContract(id){
  const code=placementPolicy(id);if(!code)return null;
  const supported=code!=='N'&&code!=='L';
  const originUsage={C:'new-object-insertion',T:'cutter-start-reference',S:'target-face-point',X:'axis-plane-pivot-or-vector',N:'target-topology-unchanged',L:'legacy-geometry-only'}[code];
  const orientationUsage={C:'new-object-orientation',T:'cutter-direction-and-cross-section',S:'face-compatible-direction',X:'declared-transform-or-direction',N:'none',L:'legacy-only'}[code];
  return {mode:{C:'creation-frame',T:'tool-frame',S:'target-face',X:'spatial-operation',N:'not-applicable',L:'legacy-only'}[code],placementSupported:supported,...(!supported?{notApplicableReason:code==='N'?'Operation acts on existing topology without relocating it':'Existing curved-logo entry retains legacy semantics'}:{}),originUsage,orientationUsage,legacyCoordinates:'world',newCoordinates:supported?'frame-local':'not-applicable',sourceAnchorRequired:code==='C',defaultInsertionAnchor:code==='C'?(defaultAnchor[id]||'model-origin'):null,historyBinding:supported?'snapshot':'legacy',previewSupported:id==='import'?'registered-file-only':true};
}
export function assertPlacementCoverage(){const registered=listOperations().map(op=>op.id);const missing=registered.filter(id=>!placementPolicy(id));const obsolete=Object.keys(PLACEMENT_POLICIES).filter(id=>!registered.includes(id));if(missing.length||obsolete.length)throw new Error(`Placement policy coverage: missing ${missing.join(', ')}; obsolete ${obsolete.join(', ')}`);return registered.length;}
