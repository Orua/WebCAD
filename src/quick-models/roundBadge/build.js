import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give roundBadge independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'roundBadge' }, cad, options, context.definitions, context.buildNested);
}
