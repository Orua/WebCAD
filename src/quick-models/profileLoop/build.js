import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give profileLoop independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'profileLoop' }, cad, options, context.definitions, context.buildNested);
}
