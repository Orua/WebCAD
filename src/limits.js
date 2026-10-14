const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
// Values copied from the executing source modules; no geometry policy change.
export const LIMITS=freeze({
 relief:{minSamples:4,maxSamples:65,maxLayers:32,maxFaces:20000},
 reliefSculpt:{minGrid:4,maxGrid:65,minLocalGrid:7,maxStrokes:128,maxPoints:4096,maxCacheEntries:20000},
 cylindricalRelief:{minBaseMm:.005,maxBaseMm:1,minRadiusMm:1,maxRadiusMm:10000,maxAngleDeg:90,maxHeightRadiusFraction:.2},
 heightfield:{minSide:2,maxSide:2049,maxSamples:1900000,maxSmoothing:8,maxHeightMm:100,maxStrokes:512,maxStrokePoints:20000},
 meshReliefPlate:{maxTriangles:200000},meshReliefEdit:{maxTriangles:200000},
 mesh:{maxSourceBytes:128*1024*1024,maxAssetBytes:384*1024*1024,maxProjectBytes:512*1024*1024,maxInputTriangles:2000000,maxResultTriangles:4000000,maxVertices:12000000},
 meshBoolean:{minRefs:2,maxRefs:16,minToleranceMm:.005,maxToleranceMm:1,defaultToleranceMm:.05},
 document:{maxFeatures:2000,maxBytes:20*1024*1024}
});
