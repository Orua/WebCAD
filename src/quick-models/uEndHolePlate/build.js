import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give uEndHolePlate independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'uEndHolePlate' }, cad, options, context.definitions, context.buildNested);
}
