import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give dFlatFrame independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'dFlatFrame' }, cad, options, context.definitions, context.buildNested);
}
