// Topology semantics (UP-20/29/33 legacy compatibility).
//
// Features created by this build carry an explicit marker. Anything without it
// (every project saved before the multi-argument Boolean optimisation) keeps the
// original ordered pairwise fuse, never takes the parallel reorder path, and
// never reuses a checkpoint produced under the other strategy: the marker is
// part of the feature signature and of the checkpoint recipe fingerprint.
export const TOPOLOGY_SEMANTICS='webcad-topology-20261018-v1';
export function hasTopologySemantics(feature){return feature?.topologySemantics===TOPOLOGY_SEMANTICS;}
export function markTopologySemantics(feature){return {...feature,topologySemantics:TOPOLOGY_SEMANTICS};}
// Union parameters added together with or after the multi-argument fuse
// (fuzzy/glue/blend) prove a union was authored under it. keepTools predates it
// (legacy unions may carry it), so it never selects the new strategy.
export const MULTI_FUSE_UNION_PARAMS=Object.freeze(['fuzzyMm','glue','blendRadiusMm','blendMode','blendLaw']);
export function unionStrategy(feature){
  const params=feature?.params||{};
  return hasTopologySemantics(feature)||MULTI_FUSE_UNION_PARAMS.some(key=>Object.hasOwn(params,key))?'multi-fuse':'ordered-pairwise';
}
// A project is legacy when any feature predates the marker. Legacy projects are
// rebuilt serially in recipe order.
export function isLegacyTopologyProject(features=[]){return features.some(feature=>!hasTopologySemantics(feature));}
// Saved ordinal face/edge selections depend on the original ordered Boolean
// recipe. Kept for diagnostics; the policy above is marker based.
export function usesOrdinalTopology(features=[]) {
  return features.some(feature=>['faceIds','edgeIds'].some(key=>feature.params?.[key]?.length));
}
