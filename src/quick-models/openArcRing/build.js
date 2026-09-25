import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give openArcRing independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'openArcRing' }, cad, options, context.definitions, context.buildNested);
}
