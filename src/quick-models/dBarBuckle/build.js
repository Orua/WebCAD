import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give dBarBuckle independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'dBarBuckle' }, cad, options, context.definitions, context.buildNested);
}
