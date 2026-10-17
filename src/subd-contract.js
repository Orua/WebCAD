const p3={type:'array',items:{type:'number'},minItems:3,maxItems:3},positive={type:'number',exclusiveMinimum:0};
export const SUBD_EXAMPLE={cage:{vertices:[[-10,-10,-10],[10,-10,-10],[10,10,-10],[-10,10,-10],[-10,-10,10],[10,-10,10],[10,10,10],[-10,10,10]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]},sampleDepth:4,fitGrid:9,fittingTolerance:.03,sewingTolerance:.05};
const cage={type:'object',additionalProperties:false,required:['vertices','faces'],properties:{
  vertices:{type:'array',items:p3,minItems:4,maxItems:256},
  faces:{type:'array',minItems:4,maxItems:64,items:{type:'array',items:{type:'integer',minimum:0,maximum:255},minItems:4,maxItems:4}},
  creases:{type:'array',maxItems:256,items:{type:'object',additionalProperties:false,required:['edge','sharpness'],properties:{
    edge:{type:'array',minItems:2,maxItems:2,items:{type:'integer',minimum:0,maximum:255}},sharpness:{type:'number',minimum:0,maximum:1}
  }}}
}};
const brushes={type:'array',maxItems:64,items:{type:'object',additionalProperties:false,required:['centerMm','radiusMm','strength'],properties:{
  centerMm:p3,radiusMm:positive,strength:{type:'number'},mode:{type:'string',enum:['push','smooth','inflate']},falloff:{type:'string',enum:['smooth','linear']}
}}};
export const SUBD_OPERATION={
  description:'细分曲面体 / Catmull–Clark cage to sewn B-spline solid',refs:0,
  paramsSchema:{type:'object',additionalProperties:false,required:['cage'],properties:{cage,brushes,
    sampleDepth:{type:'integer',minimum:3,maximum:6},fitGrid:{type:'integer',minimum:5,maximum:17},referenceGrid:{type:'integer',minimum:4,maximum:64},fittingTolerance:{...positive,maximum:.5},sewingTolerance:{...positive,maximum:.5}
  }},
  notes:'Replays the original closed oriented quad cage and optional spatial brushes. Persistent crease weight 1 keeps sharp edges. Catmull-Clark limit samples are fitted to real B-spline faces and sewn into a valid solid; extraordinary regions use bounded approximation, with convergence/volume evidence in subdApproximation. Refined-face budget 200000, volume deviation from independent refined reference must be <2%. No faceted mesh substitute or universal curvature guarantee.'
};
