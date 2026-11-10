// R7-005 / R6-019: a boolean result body keeps its target's display name.
// The boolean feature's own name labels only the history step. renameTarget:true
// restores the pre-1.65 behaviour (result body named after the boolean step).
export const BOOLEAN_NAMING_OPS = Object.freeze(['union', 'cut', 'intersect']);

export function resultDisplayNames(features = []) {
  const names = new Map();
  for (const feature of features) {
    const own = feature.name || feature.id, target = feature.refs?.[0];
    const inherit = BOOLEAN_NAMING_OPS.includes(feature.op) && feature.params?.renameTarget !== true && typeof target === 'string' && names.has(target);
    names.set(feature.id, inherit ? names.get(target) : own);
  }
  return names;
}
