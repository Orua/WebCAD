// Shared discovery and routing metadata. No geometry or browser dependency.
import {profileSolidOperations,profileSolidLabels,profileSolidExamples,profileSolidFields,profileSolidRefCounts} from './modeling/profiles/profile-solid-contracts.js';
import {directModelingOperations,directModelingNames,directModelingExamples,directModelingFields,directModelingNotes} from './modeling/manufacturing/direct-modeling-contracts.js';
import {helicalOperations,helicalNames,helicalExamples,helicalFields,helicalNotes,helicalDefaults} from './modeling/manufacturing/helical-contracts.js';
import {profileConstraintOperations,profileConstraintLabels,profileConstraintExamples,profileConstraintFields} from './modeling/profiles/profile-constraint-contracts.js';
import {faceMachiningOperations,faceMachiningNames,faceMachiningExamples,faceMachiningFields} from './modeling/manufacturing/face-machining-contracts.js';
import {refineShapeOperations,refineShapeErrors} from './modeling/manufacturing/refine-shape-contracts.js';
import {surfaceFairingOperation,surfaceFairingExample,surfaceFairingErrors} from './modeling/manufacturing/surface-fairing-contract.js';
import {surfaceSculptOperation,surfaceSculptExample,surfaceSculptErrors} from './modeling/manufacturing/surface-sculpt-contract.js';
import {surfaceFillOperation,surfaceFillExample,surfaceFillErrors} from './modeling/manufacturing/surface-fill-contract.js';
import {freeformOperations,freeformNames,freeformExamples,freeformResultTypes,freeformIds,freeformErrors} from './modeling/freeform/freeform-contracts.js';
import {reliefOperations,reliefExample,reliefErrors,reliefFields} from './modeling/manufacturing/relief-contracts.js';
export const mechanicalOperations={...profileSolidOperations,...directModelingOperations,...helicalOperations,...profileConstraintOperations,...faceMachiningOperations,...refineShapeOperations,surfaceFairing:surfaceFairingOperation,surfaceSculpt:surfaceSculptOperation,surfaceFill:surfaceFillOperation,...freeformOperations,...reliefOperations};
export const mechanicalIds=Object.freeze(Object.keys(mechanicalOperations));
export const mechanicalNames={...profileSolidLabels,...directModelingNames,...helicalNames,...profileConstraintLabels,...faceMachiningNames,refineShape:'清理分割线',surfaceFairing:'曲面保形修顺',surfaceSculpt:'局部曲面变形',surfaceFill:'约束填充曲面',...freeformNames,relief:'浮雕'};
export const mechanicalExamples={...profileSolidExamples,...directModelingExamples,...helicalExamples,...profileConstraintExamples,...faceMachiningExamples,refineShape:{},surfaceFairing:surfaceFairingExample,surfaceSculpt:surfaceSculptExample,surfaceFill:surfaceFillExample,...freeformExamples,relief:reliefExample};
export const mechanicalFields={...profileSolidFields,...directModelingFields,...helicalFields,...profileConstraintFields,...faceMachiningFields,refineShape:[],surfaceFairing:[['smoothingMm','修顺尺度（mm）',0.75,'positive']],surfaceSculpt:[['amountMm','位移（mm）',0.8,'nonzero'],['influenceMm','影响范围（mm）',4,'positive']],surfaceFill:[['toleranceMm','位置公差（mm）',0.01,'positive']],relief:reliefFields};
Object.assign(mechanicalFields,Object.fromEntries(freeformIds.map(id=>[id,[]])));
export const mechanicalNotes={...Object.fromEntries(Object.entries({...profileSolidOperations,...profileConstraintOperations,...freeformOperations}).map(([id,op])=>[id,op.notes])),...directModelingNotes,...helicalNotes};
Object.assign(mechanicalNotes,{
 refineShape:'选一个实体，清理同一平面或曲面上多余的分割线。无需输入参数。预览核对后应用；完成后重新选边、选面。没有可清理内容时保留原件。',
 surfaceFill:surfaceFillOperation.notes,
 faceGroove:'先选一个平面，输入长、宽、深度。槽以选中面的中心定位，垂直于该面向实体内部掏空。',
 innerTurn:'先选一个平面截面，设置内孔直径和深度，从该截面向实体内部切削。',
 outerTurn:'先选一个平面截面，设置保留的外径和深度，将这一深度内外径之外的材料车掉。',
});
export const mechanicalDefaults={...Object.fromEntries(mechanicalIds.map(id=>[id,{}])),profileRevolve:{operation:'newBody'},profileSweep:{operation:'newBody',transitionMode:'transformed',frenet:false},profileLoft:{operation:'newBody',ruled:false},...helicalDefaults};
export const profileSolidIds=Object.freeze(Object.keys(profileSolidOperations));
export const mechanicalCreationIds=Object.freeze(['helix','coil']);
export const mechanicalPreservedIds=Object.freeze(['offsetSurface','profileConstraints','surfaceFill',...freeformIds]);
export const mechanicalResultTypes={...Object.fromEntries(mechanicalIds.map(id=>[id,['solid']])),helix:['wire'],offsetSurface:['face'],profileConstraints:['wire','planar face'],surfaceSculpt:['solid','face'],surfaceFill:['solid','face'],...freeformResultTypes};
export const mechanicalRefCounts=profileSolidRefCounts;
export const mechanicalErrorCodes={profileRevolve:['PROFILE_REVOLVE_INVALID'],profileSweep:['PROFILE_SWEEP_INVALID'],profileLoft:['PROFILE_LOFT_INVALID'],profileConstraints:['PROFILE_CONSTRAINT_INVALID','PROFILE_CONSTRAINT_UNSUPPORTED','PROFILE_CONSTRAINT_LIMIT','PROFILE_CONSTRAINT_NUMERICAL','PROFILE_CONSTRAINT_UNSATISFIED','PROFILE_CONSTRAINT_GEOMETRY_INVALID']};
for(const id of Object.keys(faceMachiningOperations))mechanicalErrorCodes[id]=['NO_MATERIAL_REMOVED'];
mechanicalErrorCodes.refineShape=refineShapeErrors;
mechanicalErrorCodes.surfaceFairing=surfaceFairingErrors;
mechanicalErrorCodes.surfaceSculpt=surfaceSculptErrors;
mechanicalErrorCodes.surfaceFill=surfaceFillErrors;
Object.assign(mechanicalErrorCodes,freeformErrors);
mechanicalErrorCodes.relief=reliefErrors;
export function mechanicalRefRange(id,params={}) {
 const conditional=profileSolidRefCounts[id];
 if(conditional)return (params.operation??'newBody')==='newBody'?conditional.newBody:conditional.modification;
 const spec=mechanicalOperations[id]?.refs;
 return typeof spec==='object'?spec:Number.isInteger(spec)?{min:spec,max:spec}:null;
}
