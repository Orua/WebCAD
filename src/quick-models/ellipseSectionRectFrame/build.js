import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give ellipseSectionRectFrame independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'ellipseSectionRectFrame' }, cad, options, context.definitions, context.buildNested);
}
