// Saved ordinal face/edge selections depend on the original ordered Boolean
// recipe. Do not enable the experimental multi-argument optimization for them.
export function usesOrdinalTopology(features=[]) {
  return features.some(feature=>['faceIds','edgeIds'].some(key=>feature.params?.[key]?.length));
}
