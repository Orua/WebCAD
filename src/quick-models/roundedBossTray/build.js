import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give roundedBossTray independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'roundedBossTray' }, cad, options, context.definitions, context.buildNested);
}
