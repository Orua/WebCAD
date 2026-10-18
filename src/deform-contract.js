export const DEFORM_SCHEMA_VERSION = '1.0';
export const DEFORM_SEMANTIC_VERSION = 'deform.nurbs-1.0';
export const DEFORM_STRATEGY = 'nurbs-control-point-map';

export const DEFORM_KINDS = Object.freeze([
  'scaleXYZ', 'ellipsoid', 'bend', 'twist', 'taper', 'ffd'
]);

export const TRANSFORM_SCALE_XYZ_EXTENSION = 'transform.scaleXYZ';

const boundedNumber = { type: 'number', minimum: -100000, maximum: 100000 };
const vector3 = { type: 'array', items: boundedNumber, minItems: 3, maxItems: 3 };
const range = { type: 'array', items: boundedNumber, minItems: 2, maxItems: 2 };
const axis = { enum: ['x', 'y', 'z'] };
const kindSchema = (kind, required, properties) => ({
  type: 'object', required: ['kind', ...required], additionalProperties: false,
  properties: { kind: { const: kind }, ...properties }
});

export const DEFORM_SCHEMA = Object.freeze({
  oneOf: [
    kindSchema('scaleXYZ', ['scaleXYZ'], { scaleXYZ: { ...vector3, items: { type: 'number', exclusiveMinimum: 0, maximum: 1000 } } }),
    kindSchema('ellipsoid', ['radiiMm'], { radiiMm: { ...vector3, items: { type: 'number', exclusiveMinimum: 0, maximum: 100000 } } }),
    ...['bend', 'twist'].map(kind => kindSchema(kind, ['axis', 'angleDeg', 'rangeMm'], {
      axis, angleDeg: { type: 'number', minimum: -170, maximum: 170 }, rangeMm: range, center: vector3
    })),
    kindSchema('taper', ['axis', 'scaleStart', 'scaleEnd'], {
      axis, scaleStart: { type: 'number', minimum: 0.05, maximum: 20 }, scaleEnd: { type: 'number', minimum: 0.05, maximum: 20 }, rangeMm: range, center: vector3
    }),
    kindSchema('ffd', ['lattice', 'displacements'], {
      lattice: { type: 'object', required: ['dims', 'boundsMm'], additionalProperties: false, properties: {
        dims: { type: 'array', items: { type: 'integer', minimum: 2, maximum: 8 }, minItems: 3, maxItems: 3 },
      boundsMm: { type: 'array', items: vector3, minItems: 2, maxItems: 2 }
      }},
      displacements: { type: 'array', minItems: 1, maxItems: 512, items: { type: 'object', required: ['i', 'j', 'k', 'dMm'], additionalProperties: false, properties: {
        i: { type: 'integer', minimum: 0, maximum: 7 }, j: { type: 'integer', minimum: 0, maximum: 7 }, k: { type: 'integer', minimum: 0, maximum: 7 }, dMm: vector3
      }}}
    })
  ]
});

export const DEFORM_EXAMPLE = Object.freeze({
  operation: 'deform',
  schemaVersion: DEFORM_SCHEMA_VERSION,
  semanticVersion: DEFORM_SEMANTIC_VERSION,
  strategy: DEFORM_STRATEGY,
  selectionIntent: { kind: 'whole-source' },
  params: { kind: 'bend', axis: 'x', rangeMm: [0, 40], angleDeg: 15, center: [0, 0, 0] }
});
