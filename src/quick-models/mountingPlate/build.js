import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give mountingPlate independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'mountingPlate' }, cad, options, context.definitions, context.buildNested);
}
