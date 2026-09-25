import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give dBuckle independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'dBuckle' }, cad, options, context.definitions, context.buildNested);
}
