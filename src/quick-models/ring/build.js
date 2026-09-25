import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give ring independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'ring' }, cad, options, context.definitions, context.buildNested);
}
