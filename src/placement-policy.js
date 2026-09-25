import {listOperations} from './operation-registry.js';

// Every registered modeling operation has one explicit spatial policy.
// C: independent creation; T: tool/additive material; S: target face;
// X: axis/plane/vector; N: existing topology/location; L: legacy only.
const category={
  C:['box','cylinder','sphere','cone','torus','extrude','revolve','sweep','loft','quickModel','vectorProfile','arcProfile','curveSweep','advancedLoft','fittedSurface','import'],
  T:['hole','multiHole','slot','multiPocket','multiBoss'],
  S:['faceHole','logo'],
  X:['transform','copy','mirror','linearPattern','circularPattern','split','planeSection','referenceExtrude'],
  N:['referenceLoft','faceExtrude','thickenFace','fillet','chamfer','shell','autoRound','smoothTransition','union','cut','intersect','group','extractSolid','extractShell','extractFaces','faceBoundary','sewFaces','surfaceTrim','remove'],
  L:['curvedLogo'],
};
export const PLACEMENT_POLICIES=Object.freeze(Object.fromEntries(Object.entries(category).flatMap(([policy,ids])=>ids.map(id=>[id,policy]))));
export function placementPolicy(id){return PLACEMENT_POLICIES[id];}
export function assertPlacementCoverage(){const registered=listOperations().map(op=>op.id);const missing=registered.filter(id=>!placementPolicy(id));const obsolete=Object.keys(PLACEMENT_POLICIES).filter(id=>!registered.includes(id));if(missing.length||obsolete.length)throw new Error(`Placement policy coverage: missing ${missing.join(', ')}; obsolete ${obsolete.join(', ')}`);return registered.length;}
