import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give bossPlate independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'bossPlate' }, cad, options, context.definitions, context.buildNested);
}
