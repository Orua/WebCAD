import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give archedTwinWindowPlate independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'archedTwinWindowPlate' }, cad, options, context.definitions, context.buildNested);
}
