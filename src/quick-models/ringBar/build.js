import { buildLegacyQuickModel } from '../legacy-geometry.js';

// Replace this implementation to give ringBar independent geometry.
export function build(params, cad, options, context) {
  return buildLegacyQuickModel({ ...params, kind: 'ringBar' }, cad, options, context.definitions, context.buildNested);
}
