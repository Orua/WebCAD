import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give gableOpenFrame independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'gableOpenFrame' }, cad, options, context.definitions, context.buildNested);
}
