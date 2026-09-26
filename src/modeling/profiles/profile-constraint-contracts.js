const id = {type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$',minLength:1,maxLength:64};
const pointRef = {type:'object',additionalProperties:false,required:['entityId','point'],properties:{entityId:id,point:{type:'string',enum:['start','end','center']}}};
const pointMm = {type:'array',minItems:2,maxItems:2,items:{type:'number',minimum:-1e6,maximum:1e6}};
const positiveMm = {type:'number',exclusiveMinimum:0,maximum:2e6};
const pair = {firstId:id,secondId:id};
const variant = (type,properties,required,description) => ({type:'object',additionalProperties:false,required:['type',...required],properties:{id,type:{type:'string',const:type},...properties},description});

/** Serializable JSON Schema. Semantic references/types are checked by the solver. */
export const constraintsSchema = {
  type:'array',minItems:0,maxItems:128,
  description:'Line/circle constraints in saved local 2D mm coordinates. IDs refer to existing entities, never topology indices. An empty array only diagnoses remaining degrees of freedom.',
  items:{oneOf:[
    variant('fixPoint',{point:pointRef,positionMm:pointMm},['point','positionMm'],'Fix one endpoint or circle center to explicit local coordinates.'),
    variant('fixEntity',{entityId:id},['entityId'],'Freeze the complete line or circle at its source coordinates and source radius.'),
    variant('coincident',{first:pointRef,second:pointRef},['first','second'],'Coincide two line endpoints or circle centers.'),
    variant('horizontal',{entityId:id},['entityId'],'Set a line parallel to the local X axis; never collapse its endpoints.'),
    variant('vertical',{entityId:id},['entityId'],'Set a line parallel to the local Y axis; never collapse its endpoints.'),
    variant('parallel',pair,['firstId','secondId'],'Two nonzero lines parallel in either direction.'),
    variant('perpendicular',pair,['firstId','secondId'],'Two nonzero lines perpendicular.'),
    variant('equalLength',pair,['firstId','secondId'],'Two lines have equal endpoint-to-endpoint lengths.'),
    variant('length',{entityId:id,lengthMm:positiveMm},['entityId','lengthMm'],'Positive line length in mm.'),
    variant('distance',{first:pointRef,second:pointRef,distanceMm:{type:'number',minimum:-2e6,maximum:2e6},axis:{type:'string',enum:['euclidean','x','y'],default:'euclidean'}},['first','second','distanceMm'],'Euclidean point distance must be nonnegative; x/y are signed second-minus-first coordinate differences, not absolute distances. Zero Euclidean distance coincides the points.'),
    variant('radius',{entityId:id,radiusMm:{...positiveMm,maximum:1e6}},['entityId','radiusMm'],'Positive circle radius.'),
    variant('diameter',{entityId:id,diameterMm:positiveMm},['entityId','diameterMm'],'Positive circle diameter.'),
    variant('equalRadius',pair,['firstId','secondId'],'Two circles have equal radii.'),
    variant('angle',{...pair,angleDeg:{type:'number',minimum:0,maximum:180},direction:{type:'string',enum:['ccw','cw'],default:'ccw'}},['firstId','secondId','angleDeg'],'Directed angle between line start-to-end vectors. ccw is positive, cw negative; 0–180 degrees. Endpoints define direction.'),
    variant('tangent',{lineId:id,circleId:id,side:{type:'string',enum:['left','right'],default:'left'}},['lineId','circleId'],'Circle tangent to the supporting infinite line. Side is relative to line start-to-end; contact may lie outside the finite segment.'),
  ]},
};

export const profileConstraintLabels = {profileConstraints:'约束尺寸'};
export const profileConstraintExamples = {profileConstraints:{constraints:[{type:'horizontal',entityId:'bottom'},{type:'length',entityId:'bottom',lengthMm:40}]}};
export const profileConstraintFields = {profileConstraints:[['constraints','约束与驱动尺寸（解析实体 ID、局部 mm）','[{"type":"horizontal","entityId":"bottom"},{"type":"length","entityId":"bottom","lengthMm":40}]','json']]};
export const profileConstraintOperations = {
  profileConstraints:{
    description:'Solve common saved line/circle profile constraints and derive a new profile while preserving the source, entity IDs and ordered paths',refs:1,
    paramsSchema:{type:'object',additionalProperties:false,required:['constraints'],properties:{constraints:constraintsSchema}},
    notes:'One saved sketchProfile-derived analytic profile source. Line/circle supported; rectangle is explicitly expanded only in the derived result into sourceId_0..3 line IDs, with primitiveConversion mapping and intrinsic horizontal/vertical relations. profile.constraintMetadata preserves those intrinsic relations for later solves; no origin or size is secretly fixed. At most 64 derived entities, 128 independent scalar variables, 128 user constraints and 64 intrinsic relations; minimum supported line length/radius 1e-7 mm. Coordinates and dimensions are in its frozen local plane, not current world/work-frame coordinates. Bounded local numerical solver; reports residuals, Jacobian rank and remaining degrees of freedom. Closed-loop/open-chain endpoint connections are preserved structurally. Underconstrained solutions are allowed and reported; redundant equations are reported. Axis/parallel/perpendicular constraints choose the nearest valid directed branch from initial geometry. Conflicting/unsatisfied, nonconvergent or invalid/degenerate geometry rejects without altering the source. No arc/spline/rounded-primitive solving, global uniqueness proof, automatic conflict minimization or full mainstream Sketcher claim.',
  },
};
