import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give bowedTwinWindowPlate independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'bowedTwinWindowPlate' }, cad, options, context.definitions, context.buildNested);
}
