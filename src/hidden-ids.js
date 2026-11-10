// R7-013: documentModel.hidden only lists bodies that still exist.
export function pruneHiddenIds(hidden = [], bodies = []) {
  const live = new Set(bodies.map(body => body.id));
  return hidden.filter(id => live.has(id));
}
