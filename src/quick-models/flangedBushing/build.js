import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give flangedBushing independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'flangedBushing' }, cad, options, context.definitions, context.buildNested);
}
