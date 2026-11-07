const number={type:'number'};
const point2={type:'array',items:number,minItems:2,maxItems:2};
const point3={type:'array',items:number,minItems:3,maxItems:3};
const tolerance={type:'number',minimum:1e-5,maximum:.5,description:'Millimetres; default 0.01'};
const positive={type:'number',exclusiveMinimum:0};
const faceId={type:'integer',minimum:0};
const define=(description,refs,properties,required,notes)=>({description,refs,paramsSchema:{type:'object',additionalProperties:false,properties,required},notes});

export function advancedOperations(regions) {
  const cap={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['flat','point','round']},pointMm:point3,lengthMm:positive},required:['kind']};
  const profile={oneOf:[
    {type:'object',additionalProperties:false,properties:{kind:{const:'ellipse'}}},
    {type:'object',additionalProperties:false,properties:{kind:{const:'superellipse'},exponent:{type:'number',minimum:2,maximum:8}},required:['kind','exponent']},
    {type:'object',additionalProperties:false,properties:{kind:{const:'asymmetric'},depthUpMm:positive,depthDownMm:positive,widthLeftMm:positive,widthRightMm:positive},required:['kind']},
    {type:'object',additionalProperties:false,properties:{kind:{const:'airfoil'},naca:{oneOf:[{type:'string',pattern:'^[0-9]{4}$'},{type:'object',additionalProperties:false,properties:{thicknessPct:{type:'number',exclusiveMinimum:0,maximum:40},camberPct:{type:'number',minimum:0,maximum:20},camberPosPct:{type:'number',minimum:0,maximum:100}},required:['thicknessPct']}]},chordAlong:{type:'string',const:'width'}},required:['kind','naca']},
    {type:'object',additionalProperties:false,properties:{kind:{const:'spline'},coordinateMode:{type:'string',enum:['millimeters','normalized'],description:'Default millimeters preserves points2d; normalized fits the profile bounds to station widthMm/depthMm.'},interpolation:{type:'string',enum:['polyline','periodicSpline'],description:'Explicit polyline preserves all ordered vertices and corners without perimeter resampling; a repeated closing vertex is ignored. Omission retains legacy 64-sample behavior. periodicSpline constructs a closed periodic interpolating B-spline.'},points2d:{type:'array',minItems:3,maxItems:128,items:point2},closed:{const:true}},required:['kind','points2d','closed']},
  ]};
  const law={oneOf:[number,{type:'object',additionalProperties:false,properties:{kind:{const:'spline'},samples:{type:'array',minItems:2,maxItems:64,items:{type:'array',minItems:2,maxItems:2,items:number}}},required:['kind','samples']}]};
  const operations = {
    curveSweep:define('Sweep a constant section along a curve, loft up to 64 ordered custom sections, or generate sections on a rotation-minimizing spine',0,{
      pathType:{type:'string',enum:['arc','spline','segments','sections','spine']},points:{type:'array',items:point3,minItems:3,maxItems:30},
      stations:{oneOf:[{type:'array',minItems:2,maxItems:64,items:{type:'object',additionalProperties:false,required:['centerMm','normal','widthDirection','widthMm','depthMm'],properties:{centerMm:point3,normal:point3,widthDirection:point3,widthMm:positive,depthMm:positive,startAngleDeg:number,profile}}},{type:'object',additionalProperties:false,properties:{count:{type:'integer',minimum:2,maximum:64,default:32},distribution:{type:'string',enum:['uniform','curvature'],default:'uniform'}},required:['count']}]},
      loftDegree:{type:'integer',minimum:2,maximum:8,default:8},
      seamAngleDeg:number,autoAlign:{type:'boolean',default:true},volumeCheck:{type:'string',enum:['error','warn','off'],default:'warn'},startCap:cap,endCap:cap,
      spine:{type:'object',additionalProperties:false,properties:{pointsMm:{type:'array',items:point3,minItems:2,maxItems:128},kind:{type:'string',enum:['polyline','bspline']}},required:['pointsMm']},widthLaw:law,depthLaw:law,rollLawDeg:law,profileLaw:{type:'array',minItems:2,maxItems:64,items:{type:'array',minItems:2,maxItems:2}},upHint:point3,
      guides:{type:'array',minItems:1,maxItems:2,items:{type:'object',additionalProperties:false,properties:{pointsMm:{type:'array',items:point3,minItems:2,maxItems:128},role:{type:'string',enum:['dorsal','ventral','lateral']}},required:['pointsMm']}},startCondition:{type:'string',enum:['G0','G1','G2'],default:'G0'},endCondition:{type:'string',enum:['G0','G1','G2'],default:'G0'},matchTo:{type:'object',additionalProperties:false,properties:{featureId:{type:'string'},end:{type:'string',enum:['start','end']}},required:['featureId','end']},
      segments:{type:'array',minItems:2,maxItems:64,items:{type:'object',additionalProperties:false,required:['type','points'],properties:{type:{type:'string',enum:['line','arc']},points:{type:'array',items:point3,minItems:2,maxItems:3}}}},
      radius:{...positive,description:'Required for a round section on arc/spline/segments; radius in mm, not diameter. sectionSize does not replace radius.'},section:{type:'string',enum:['round','chamferedSquare','ellipse','roundedRectangle']},sectionSize:{...positive,description:'Square side length for chamferedSquare only; round sections use radius.'},sectionChamfer:positive,
      sectionWidth:positive,sectionDepth:positive,sectionCornerRadius:positive,
      closed:{type:'boolean',description:'true 只用于 pathType:segments。sections 不接受 closed:true；伪闭用首尾重合且 closed:false。'},
      transitionMode:{type:'string',enum:['transformed','right','round'],description:'Corner transition. Open segment paths default to transformed. Closed paths default to right. A closed path with sharp corners rejects transformed and tells the caller to use right, round, or tangent arc segments.'},
      tolerance,
    },['pathType'],'Arc needs exactly 3 noncollinear points. Spline approximates 3–30 ordered points. Segments use line endpoints or arc start/middle/end, with exact shared endpoints. Sections mode accepts 2–64 explicit stations, custom ellipse/superellipse/asymmetric/NACA airfoil/closed spline profiles, seamAngleDeg and station startAngleDeg. Legacy profiles are sampled into 64 corresponding points. Explicit spline interpolation:polyline instead preserves each ordered input vertex and corner; use consistent vertex correspondence across stations. loftReport.stationsResolved reports profileSampleCount and preservesPolylineVertices. Custom spline points2d default to literal millimetres and legacy polyline interpolation; station widthMm/depthMm do not rescale that mode. Set coordinateMode:normalized to fit the profile bounds to the station width/depth. Set interpolation:periodicSpline for a true smooth closed periodic B-spline; default polyline retains historical geometry. Normalized profiles must have nonzero extent on both axes. autoAlign defaults true; false disables OCCT compatibility reordering. volumeCheck defaults warn and reports measured/estimated volume and suspect stations; error rejects ratios outside 0.85–1.15. Flat caps are the default; point caps use OCCT AddVertex; round caps insert three shrinking sections. Spine mode accepts pointsMm, count 2–64, uniform/curvature distribution, spline width/depth/roll laws and upHint; it constructs a discrete rotation-minimizing frame. Current ThruSections OCCT build cannot constrain guide curves or G1/G2 continuity; those requests fail explicitly. Result must be one valid positive-volume solid. pathType:sections does not accept closed:true；开放 stations 可以，首尾重合且 closed:false 是伪闭，闭合变径用 segments 加 widthLaw。闭合非平面折线若在折角处切向不连续，会拒绝并说明分段扫掠拓扑无效；同一平面、对边整体抬起、以及圆滑非平面闭合可以。单段 segments 不能配 widthLaw，至少 2 段。Round sections are centered on the path: before placement, a planar path at constant Z=z and radius r spans z±r. profileSweep does not move a saved section onto the path.'),
    advancedLoft:define('Solid or open shell through hand-defined XY sections',0,{
      sections:{type:'array',minItems:2,maxItems:12,items:{type:'object',additionalProperties:false,required:['z','points'],properties:{z:number,points:{type:'array',minItems:3,maxItems:64,items:point2}}}},
      ruled:{type:'boolean'},output:{type:'string',enum:['solid','shell']},
    },['sections'],'Z must increase. Same vertex count, winding and corresponding start vertex. Default smooth solid. Shell has no caps and is not a closed solid.'),
    fittedSurface:define('Fit a single B-spline face to a structured point grid',0,{
      points:{type:'array',minItems:3,maxItems:12,items:{type:'array',minItems:3,maxItems:12,items:point3}},tolerance,interpolation:{type:'string',enum:['approximate','uniformCubic'],default:'approximate',description:'approximate preserves the legacy chord-length fit. uniformCubic interpolates equally spaced row/column parameters with a clamped tensor B-spline of degree up to three.'},
    },['points'],'Rectangular grid with consistent row/column correspondence, not unordered point-cloud reconstruction. Verifies point-to-face residuals. uniformCubic requires samples at equally spaced source parameters; it preserves polynomial coordinate fields of degree up to three, but does not promise arbitrary prescribed boundary tangents, absence of overshoot or global error. Output is one face, zero solids; thicken a selected face to obtain a solid.'),
    thickenFace:define('Normal offset of one face into a new solid',1,{faceId,thickness:number},['faceId','thickness'],'Nonzero signed thickness. Replaces source object with the selected face thickness only. Not a whole-object shell operation. Invalid offsets fail. Planar faces require adaptive volume to match source area times absolute thickness (relative consistency allowance 1e-5, absolute floor 1e-7 mm^3); inconsistent trimming or footprint change rejects the operation without commit.'),
    curvedLogo:define('Legacy curved LOGO operation retained for historical project compatibility; use unified logo placementVersion 2 for new work',1,{
      faceId,point:point3,depth:positive,scale:positive,angle:number,offsetX:number,offsetY:number,mirrorX:{type:'boolean'},regions,
      mode:{type:'string',enum:['engrave']},draftAngle:{type:'number',const:0},source:{type:'object'},name:{type:'string'},sizeMm:{type:'array',items:number},areaMm2:number,
    },['faceId','point','depth','regions'],'Single closed solid. Pick a point on the face; tangent frame uses projected world X or Y. Orthographic projection of reviewed polygonal contours, then actual normal offset. Reject boundaries, holes, seams, grazing, invalid offsets and breakthrough. No emboss/draft/multi-face wrap. Imported contour approximation is retained.'),
  };
  operations.curveSweep.paramsSchema.not={
    description:'多截面模式不支持 closed:true。开放 stations 可以提交。近似闭环请让首尾截面重合且 closed:false（伪闭）。闭合变径圆线用 pathType:segments 与 widthLaw，不要给 sections 设闭环。',
    required:['pathType','closed'],
    properties:{pathType:{const:'sections'},closed:{const:true}},
  };
  operations.curveSweep.paramsSchema.allOf=[{anyOf:[
    {properties:{pathType:{enum:['sections','spine']}}},
    {required:['section'],properties:{section:{enum:['chamferedSquare','ellipse','roundedRectangle']}}},
    {required:['radius']},
  ]}];
  return operations;
}

