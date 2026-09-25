import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give sliderBuckle independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'sliderBuckle' }, cad, options, context.definitions, context.buildNested);
}
