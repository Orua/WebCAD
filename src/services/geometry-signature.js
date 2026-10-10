// Geometry cache identities omit only metadata proven not to affect geometry.
// Retain unknown/new fields so a new operation cannot accidentally reuse a
// shape before its impact is understood.
export function geometryFeatureRecord(feature){
 const {name,...physical}=feature;
 if(feature.op==='relief'&&feature.params?.layers)physical.params={...feature.params,layers:feature.params.layers.map(({name,...layer})=>layer)};
 if(physical.compiledCheckpoint){const {jobId,inputFingerprint,planReport,nativeReport,...checkpoint}=physical.compiledCheckpoint;physical.compiledCheckpoint=checkpoint;}
 return physical;
}
export const geometryFeatureSignature=feature=>JSON.stringify(geometryFeatureRecord(feature));
