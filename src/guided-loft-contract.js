const point3 = {
  type: 'array', minItems: 3, maxItems: 3,
  items: { type: 'number' },
};
const finitePoint = [[0, 0, 0], [0, 0, 1]];
const section = {
  type: 'object', additionalProperties: false, required: ['frame', 'profile'],
  properties: {
    frame: {
      type: 'object', additionalProperties: false,
      required: ['centerMm', 'normal', 'widthDirection'],
      properties: { centerMm: point3, normal: point3, widthDirection: point3 },
    },
    profile: {
      oneOf: [
        {
          type: 'object', additionalProperties: false,
          required: ['kind', 'widthMm', 'depthMm'],
          properties: {
            kind: { const: 'ellipse' },
            widthMm: { type: 'number', exclusiveMinimum: 0 },
            depthMm: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        {
          type: 'object', additionalProperties: false,
          required: ['kind', 'edges'],
          properties: {
            kind: { const: 'quad' },
            edges: {
              type: 'array', minItems: 4, maxItems: 4,
              items: { type: 'array', minItems: 4, maxItems: 4,
                items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } } },
            },
          },
        },
      ],
    },
  },
};

export const guidedLoftContract = Object.freeze({
  id: 'guidedLoft',
  description: 'Create a closed four-patch B-rep loft from framed quad profiles, one or two exact boundary rails, and G0/G1/G2 endpoint jets. matchTo.end names the referenced source feature end; the single constrained target end is inferred from startCondition/endCondition.',
  refs: { min: 0, max: 1 },
  inputSchema: {
    type: 'object', additionalProperties: false,
    required: ['sections', 'guides'],
    properties: {
      sections: { type: 'array', minItems: 2, maxItems: 32, items: section },
      guides: { type: 'array', minItems: 1, maxItems: 2, items: {
        type: 'object', additionalProperties: false, required: ['role', 'pointsMm'],
        properties: {
          role: { type: 'string', enum: ['dorsal', 'ventral', 'lateral'] },
          pointsMm: { type: 'array', minItems: 2, maxItems: 32, items: point3 },
        },
      } },
      startCondition: { type: 'string', enum: ['G0', 'G1', 'G2'] },
      endCondition: { type: 'string', enum: ['G0', 'G1', 'G2'] },
      matchTo: { type: 'object', additionalProperties: false, required: ['featureId', 'end'],
        properties: {
          featureId: { type: 'string', minLength: 1 },
          end: { type: 'string', enum: ['start', 'end'] },
        },
      },
      matchToleranceMm: { type: 'number', exclusiveMinimum: 0, maximum: 0.5 },
      fitToleranceMm: { type: 'number', exclusiveMinimum: 0, maximum: 0.5 },
      guideToleranceMm: { type: 'number', exclusiveMinimum: 0, maximum: 0.5 },
    },
  },
  finiteExample: {
    sections: [
      { frame: { centerMm: [0, 0, 0], normal: [0, 0, 1], widthDirection: [1, 0, 0] }, profile: { kind: 'ellipse', widthMm: 4, depthMm: 2 } },
      { frame: { centerMm: [0, 0, 10], normal: [0, 0, 1], widthDirection: [1, 0, 0] }, profile: { kind: 'ellipse', widthMm: 3, depthMm: 1.5 } },
    ],
    guides: [
      { role: 'dorsal', pointsMm: [[0, 1, 0], [0, 0.75, 10]] },
      { role: 'ventral', pointsMm: [[0, -1, 0], [0, -0.75, 10]] },
    ],
    startCondition: 'G1', endCondition: 'G0', matchTo: { featureId: 'source-loft', end: 'end' }, fitToleranceMm: 0.01,
  },
  functionContract: {
    signature: 'buildGuidedLoft(params, cad, context = { matchFeature, matchShape }); parent helper: buildBoundGuidedLoft(feature, shapes, historyFeatures, cad)',
    result: 'Replicad solid in the feature local creation frame; guidedLoftReport exposes volume, measured rail deviation, fit error, and actual start/end endpoint jets. The parent kernel applies C-class placement once after this helper returns.',
    matchTo: 'matchTo.featureId must equal the sole refs entry and identify a preceding guidedLoft feature. matchTo.end is the SOURCE endpoint (start or end). The current target endpoint is inferred from the unique non-G0 startCondition/endCondition; two constrained ends are rejected. D1/D2 are read from the actual source B-spline terminal patch poles. Same-end pairing reverses D1 only. Use buildBoundGuidedLoft(feature, shapes, historyFeatures, cad) for frozen creation-frame and refs binding.',
  },
});

export const guidedLoftFiniteExample = guidedLoftContract.finiteExample;

export function getGuidedLoftOperation() {
  return {
    id: guidedLoftContract.id,
    description: guidedLoftContract.description,
    inputSchema: guidedLoftContract.inputSchema,
    example: guidedLoftContract.finiteExample,
    refs: guidedLoftContract.refs,
    functionContract: guidedLoftContract.functionContract,
    strict: true,
  };
}

export function getOperation(id) {
  return id === guidedLoftContract.id ? getGuidedLoftOperation() : null;
}
