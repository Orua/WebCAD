// Contract annotations, never a runtime geometry rounding heuristic.
const lengths = new Set(('x y z dx dy dz cx cy cz width depth height length radius radius1 radius2 majorRadius minorRadius cornerRadius thickness distance distance2 offset offsetMm gapMm tolerance diameter holeDiameter holeDepth counterboreDiameter counterboreDepth countersinkDiameter pitch wallThickness endWidth endDepth endRadius startRadius distanceMm radiusMm diameterMm depthMm heightMm widthMm lengthMm thicknessMm allowanceMm maxEndpointMoveMm wireDiameterMm pitchMm recessDiameterMm recessDepthMm toleranceMm origin originMm centerMm startMm endMm throughMm point points pointWorld axisPoint planePoint controlPoints').split(' '));
const angles = new Set(('rx ry rz angle angleDeg startAngle endAngle draftAngle angleLimitDeg includedAngleDeg drillPointAngleDeg').split(' '));
const vectors = new Set(('axisDirection axisVector planeNormal pullDirection normal direction quaternion').split(' '));
const indices = new Set(('faceId faceIds edgeId edgeIds neutralFaceId referenceFaceId solidIndex shellIndex').split(' '));
const scalars = new Set(('scale ratio turns count segments samples').split(' '));

export const numericInputPolicy = Object.freeze({
  explicitValues: 'exact', interactiveValues: 'pointer-step',
  quantizationPolicy: 'none', displayPreferencesAffectGeometry: false,
  kernelTolerance: 'operation-specific; independent of display and pointer steps',
});

export function annotateParameterSchema(schema, key='') {
  if (!schema || typeof schema !== 'object') return schema;
  const out=structuredClone(schema);
  const dimensional=lengths.has(key)?['mm','length']:angles.has(key)?['deg','angle']:vectors.has(key)?['1','direction']:indices.has(key)?['1','index']:scalars.has(key)?['1','scalar']:null;
  if(dimensional)Object.assign(out,{unit:dimensional[0],quantityKind:dimensional[1],quantizationPolicy:'none'});
  if(out.properties)for(const [name,value]of Object.entries(out.properties))out.properties[name]=annotateParameterSchema(value,name);
  if(out.items)out.items=annotateParameterSchema(out.items,key);
  for(const name of ['oneOf','anyOf','allOf'])if(out[name])out[name]=out[name].map(value=>annotateParameterSchema(value,key));
  return out;
}
