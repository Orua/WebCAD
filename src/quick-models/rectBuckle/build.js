import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give rectBuckle independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'rectBuckle' }, cad, options, context.definitions, context.buildNested);
}
