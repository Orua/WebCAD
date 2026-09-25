import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give ovalBuckle independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'ovalBuckle' }, cad, options, context.definitions, context.buildNested);
}
