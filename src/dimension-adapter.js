const diameterOperations = new Set(['cylinder','hole','multiHole','faceHole','multiBoss']);
export function usesDiameter(op, key) { return key === 'radius' && diameterOperations.has(op); }
export function displayDimension(op, key, value) { return usesDiameter(op,key) && typeof value === 'number' ? value * 2 : value; }
export function geometryDimensions(op, values) {
  if (!usesDiameter(op,'radius') || values?.radius === undefined) return values;
  return {...values,radius:values.radius / 2};
}
