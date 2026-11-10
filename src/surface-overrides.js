// R7-014: per-body design-finish surface overrides stored in the document
// (document.surface[bodyId] = {roughness}). Metal finishes ignore them, and the
// design preset defaults (metalness 0.15 / roughness 0.42) stay unchanged for
// every body without an override.
export function sanitizeSurface(surface) {
  if (!surface || typeof surface !== 'object' || Array.isArray(surface)) return {};
  return Object.fromEntries(Object.entries(surface).flatMap(([id, value]) =>
    value && typeof value === 'object' && Number.isFinite(value.roughness) && value.roughness >= 0 && value.roughness <= 1 ? [[id, { roughness: value.roughness }]] : []));
}

export function applyDesignSurface(material, finishKey, override) {
  if (finishKey !== 'design' || !override || !Number.isFinite(override.roughness) || !material) return false;
  material.roughness = override.roughness;
  return true;
}

// R7-010: one visible non-design finish switches the whole scene to metal
// lighting (ACES + metal light levels). Report it instead of hiding it.
export function sceneLightingState(globalKey, partFinishes = {}, ids = []) {
  const finishes = ids.map(id => partFinishes[id] || globalKey);
  const metal = globalKey !== 'design' || finishes.some(finish => finish !== 'design');
  const designBodies = finishes.filter(finish => finish === 'design').length;
  return { mode: metal ? 'metal-global' : 'design', designBodiesUnderMetalLighting: metal ? designBodies : 0 };
}
