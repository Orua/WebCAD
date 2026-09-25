import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give roundedFlatFrame independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'roundedFlatFrame' }, cad, options, context.definitions, context.buildNested);
}
