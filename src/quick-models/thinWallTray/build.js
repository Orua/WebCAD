import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give thinWallTray independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'thinWallTray' }, cad, options, context.definitions, context.buildNested);
}
