import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give ellipseOpenWire independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'ellipseOpenWire' }, cad, options, context.definitions, context.buildNested);
}
