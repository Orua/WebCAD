import { canonicalJson } from './contracts/operation-schema.js';

// Numeric selectors are revision-local. Follow actual source refs, not history order.
const selectors = new Set(['faceId', 'faceIds', 'edgeId', 'edgeIds', 'neutralFaceId']);
function hasIndexedTopology(value) {
  return !!value && typeof value === 'object' && Object.entries(value).some(([key, item]) =>
    selectors.has(key) || hasIndexedTopology(item));
}
const geometry = feature => ({op: feature.op, params: feature.params, refs: feature.refs || [], placement: feature.placement});

export function assertHistoryEditSafe(previous, next) {
  const prior = new Map(previous.features.map(feature => [feature.id, feature]));
  const changed = next.features.filter(feature => prior.has(feature.id) &&
    canonicalJson(geometry(prior.get(feature.id))) !== canonicalJson(geometry(feature)));
  const children = new Map();
  for (const feature of next.features) for (const ref of feature.refs || []) {
    if (!children.has(ref)) children.set(ref, []);
    children.get(ref).push(feature);
  }
  const affected = new Set(), roots = [];
  for (const root of changed) {
    const seen = new Set([root.id]), queue = [...(children.get(root.id) || [])];
    let unsafe = false;
    while (queue.length) {
      const feature = queue.shift();
      if (seen.has(feature.id)) continue;
      seen.add(feature.id);
      if (hasIndexedTopology(feature.params)) {
        affected.add(feature.id); unsafe = true;
      }
      queue.push(...(children.get(feature.id) || []));
    }
    if (unsafe) roots.push(root.id);
  }
  const descriptions=[...affected].map(id=>next.features.find(feature=>feature.id===id)?.name||id);
  if (affected.size) throw Object.assign(new Error(`上游修改会使下游面/边编号失效：${descriptions.join(', ')}。请重新选择对应几何。`), {
    code: 'UNSAFE_LEGACY_REFERENCE', path: 'features', recoveryAction: 'RESELECT_TOPOLOGY',
    featureId: roots[0], changedFeatureIds: roots, affectedFeatureIds: [...affected],
  });
}
