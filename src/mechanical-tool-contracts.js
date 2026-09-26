// Shared discovery and routing metadata. No geometry or browser dependency.
import {profileSolidOperations,profileSolidLabels,profileSolidExamples,profileSolidFields,profileSolidRefCounts} from './modeling/profiles/profile-solid-contracts.js';
import {directModelingOperations,directModelingNames,directModelingExamples,directModelingFields,directModelingNotes} from './modeling/manufacturing/direct-modeling-contracts.js';
import {helicalOperations,helicalNames,helicalExamples,helicalFields,helicalNotes,helicalDefaults} from './modeling/manufacturing/helical-contracts.js';
import {profileConstraintOperations,profileConstraintLabels,profileConstraintExamples,profileConstraintFields} from './modeling/profiles/profile-constraint-contracts.js';
import {faceMachiningOperations,faceMachiningNames,faceMachiningExamples,faceMachiningFields} from './modeling/manufacturing/face-machining-contracts.js';
export const mechanicalOperations={...profileSolidOperations,...directModelingOperations,...helicalOperations,...profileConstraintOperations,...faceMachiningOperations};
export const mechanicalIds=Object.freeze(Object.keys(mechanicalOperations));
export const mechanicalNames={...profileSolidLabels,...directModelingNames,...helicalNames,...profileConstraintLabels,...faceMachiningNames};
export const mechanicalExamples={...profileSolidExamples,...directModelingExamples,...helicalExamples,...profileConstraintExamples,...faceMachiningExamples};
export const mechanicalFields={...profileSolidFields,...directModelingFields,...helicalFields,...profileConstraintFields,...faceMachiningFields};
export const mechanicalNotes={...Object.fromEntries(Object.entries({...profileSolidOperations,...profileConstraintOperations}).map(([id,op])=>[id,op.notes])),...directModelingNotes,...helicalNotes};
Object.assign(mechanicalNotes,{
 faceGroove:'先选一个平面，输入长、宽、深度。槽以选中面的中心定位，垂直于该面向实体内部掏空。',
 innerTurn:'先选一个平面截面，设置内孔直径和深度，从该截面向实体内部切削。',
 outerTurn:'先选一个平面截面，设置保留的外径和深度，将这一深度内外径之外的材料车掉。',
});
export const mechanicalDefaults={...Object.fromEntries(mechanicalIds.map(id=>[id,{}])),profileRevolve:{operation:'newBody'},profileSweep:{operation:'newBody',transitionMode:'transformed',frenet:false},profileLoft:{operation:'newBody',ruled:false},...helicalDefaults};
export const profileSolidIds=Object.freeze(Object.keys(profileSolidOperations));
export const mechanicalCreationIds=Object.freeze(['helix','coil']);
export const mechanicalPreservedIds=Object.freeze(['offsetSurface','profileConstraints']);
export const mechanicalResultTypes={...Object.fromEntries(mechanicalIds.map(id=>[id,['solid']])),helix:['wire'],offsetSurface:['face'],profileConstraints:['wire','planar face']};
export const mechanicalRefCounts=profileSolidRefCounts;
export const mechanicalErrorCodes={profileRevolve:['PROFILE_REVOLVE_INVALID'],profileSweep:['PROFILE_SWEEP_INVALID'],profileLoft:['PROFILE_LOFT_INVALID'],profileConstraints:['PROFILE_CONSTRAINT_INVALID','PROFILE_CONSTRAINT_UNSUPPORTED','PROFILE_CONSTRAINT_LIMIT','PROFILE_CONSTRAINT_NUMERICAL','PROFILE_CONSTRAINT_UNSATISFIED','PROFILE_CONSTRAINT_GEOMETRY_INVALID']};
for(const id of Object.keys(faceMachiningOperations))mechanicalErrorCodes[id]=['NO_MATERIAL_REMOVED'];
export function mechanicalRefRange(id,params={}) {
 const conditional=profileSolidRefCounts[id];
 if(conditional)return (params.operation??'newBody')==='newBody'?conditional.newBody:conditional.modification;
 const n=mechanicalOperations[id]?.refs;return Number.isInteger(n)?{min:n,max:n}:null;
}
