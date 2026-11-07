export const PERFORMANCE_SETTINGS_SCHEMA={type:'object',additionalProperties:false,anyOf:['mode','preferredQuality','manualLock','allowAgentGrouping'].map(key=>({required:[key]})),properties:{
  mode:{enum:['auto','manual']},preferredQuality:{enum:['draft','standard','fine','ultra']},manualLock:{type:'boolean'},allowAgentGrouping:{type:'boolean'}
}};
export const PERFORMANCE_RESPONSE_STATUSES=['deferred','no-safe-candidates','declined','stale'];
