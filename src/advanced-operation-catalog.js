const number={type:'number'};
const point2={type:'array',items:number,minItems:2,maxItems:2};
const point3={type:'array',items:number,minItems:3,maxItems:3};
const tolerance={type:'number',minimum:1e-5,maximum:.5,description:'Millimetres; default 0.01'};
const positive={type:'number',exclusiveMinimum:0};
const faceId={type:'integer',minimum:0};
const define=(description,refs,properties,required,notes)=>({description,refs,paramsSchema:{type:'object',additionalProperties:false,properties,required},notes});

export function advancedOperations(regions) {
  return {
    curveSweep:define('Sweep a round, chamfered-square or elliptical section along an arc, approximated spline or connected line/arc segments',0,{
      pathType:{type:'string',enum:['arc','spline','segments']},points:{type:'array',items:point3,minItems:3,maxItems:30},
      segments:{type:'array',minItems:2,maxItems:64,items:{type:'object',additionalProperties:false,required:['type','points'],properties:{type:{type:'string',enum:['line','arc']},points:{type:'array',items:point3,minItems:2,maxItems:3}}}},
      radius:positive,section:{type:'string',enum:['round','chamferedSquare','ellipse']},sectionSize:positive,sectionChamfer:positive,
      sectionWidth:positive,sectionDepth:positive,
      closed:{type:'boolean'},tolerance,
    },['pathType'],'Arc needs exactly 3 noncollinear points. Spline approximates 3–30 ordered points. Segments use line endpoints or arc start/middle/end, with exact shared endpoints. Set closed:true only for a closed segment chain. Round requires radius; chamferedSquare needs sectionSize and sectionChamfer; ellipse needs unequal sectionWidth and sectionDepth. Non-round sections need an XY-planar path. Topology must be valid.'),
    advancedLoft:define('Solid or open shell through hand-defined XY sections',0,{
      sections:{type:'array',minItems:2,maxItems:12,items:{type:'object',additionalProperties:false,required:['z','points'],properties:{z:number,points:{type:'array',minItems:3,maxItems:64,items:point2}}}},
      ruled:{type:'boolean'},output:{type:'string',enum:['solid','shell']},
    },['sections'],'Z must increase. Same vertex count, winding and corresponding start vertex. Default smooth solid. Shell has no caps and is not a closed solid.'),
    fittedSurface:define('Fit a single B-spline face to a structured point grid',0,{
      points:{type:'array',minItems:3,maxItems:12,items:{type:'array',minItems:3,maxItems:12,items:point3}},tolerance,
    },['points'],'Rectangular grid with consistent row/column correspondence, not unordered point-cloud reconstruction. Verifies point-to-face residuals. Output is one face, zero solids; thicken a selected face to obtain a solid.'),
    thickenFace:define('Normal offset of one face into a new solid',1,{faceId,thickness:number},['faceId','thickness'],'Nonzero signed thickness. Replaces source object with the selected face thickness only. Not a whole-object shell operation. Invalid offsets fail. Planar faces require adaptive volume to match source area times absolute thickness (relative consistency allowance 1e-5, absolute floor 1e-7 mm^3); inconsistent trimming or footprint change rejects the operation without commit.'),
    curvedLogo:define('Legacy curved LOGO operation retained for historical project compatibility; use unified logo placementVersion 2 for new work',1,{
      faceId,point:point3,depth:positive,scale:positive,angle:number,offsetX:number,offsetY:number,mirrorX:{type:'boolean'},regions,
      mode:{type:'string',enum:['engrave']},draftAngle:{type:'number',const:0},source:{type:'object'},name:{type:'string'},sizeMm:{type:'array',items:number},areaMm2:number,
    },['faceId','point','depth','regions'],'Single closed solid. Pick a point on the face; tangent frame uses projected world X or Y. Orthographic projection of reviewed polygonal contours, then actual normal offset. Reject boundaries, holes, seams, grazing, invalid offsets and breakthrough. No emboss/draft/multi-face wrap. Imported contour approximation is retained.'),
  };
}
