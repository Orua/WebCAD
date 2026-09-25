import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give ellipseSectionRing independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'ellipseSectionRing' }, cad, options, context.definitions, context.buildNested);
}
