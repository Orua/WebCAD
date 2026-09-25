import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give ellipseBar independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'ellipseBar' }, cad, options, context.definitions, context.buildNested);
}
