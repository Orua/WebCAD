import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give twinWindowPlate independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'twinWindowPlate' }, cad, options, context.definitions, context.buildNested);
}
