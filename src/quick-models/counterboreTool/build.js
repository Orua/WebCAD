import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give counterboreTool independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'counterboreTool' }, cad, options, context.definitions, context.buildNested);
}
