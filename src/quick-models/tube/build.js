import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give tube independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'tube' }, cad, options, context.definitions, context.buildNested);
}
