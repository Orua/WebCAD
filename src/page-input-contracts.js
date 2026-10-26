import {LIMITS} from './limits.js';
import {PLACEMENT_SCHEMA,vectorSchema} from './placement-schema.js';
import {validateSchema,contractError} from './contracts/operation-schema.js';
// Allocate plain JSON in this page's JavaScript realm. Browser structuredClone
// can retain the embedding realm; identity checks must not reject host requests.
export function pageInput(value,path='args',seen=new Set()){
 if(value===null||['string','boolean'].includes(typeof value))return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||seen.has(value)||seen.size>32)contractError('PARAM_SCHEMA_INVALID',path,'Expected finite plain JSON.');
 const proto=Object.getPrototypeOf(value);
 if(!Array.isArray(value)&&proto!==null&&Object.getPrototypeOf(proto)!==null)contractError('PARAM_SCHEMA_INVALID',path,'Expected a plain JSON object.');
 seen.add(value);const result=Array.isArray(value)?[]:{};
 for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))contractError('PARAM_SCHEMA_INVALID',path+'.'+key,'Unsafe JSON key.');result[key]=pageInput(value[key],path+'.'+key,seen);}
 seen.delete(value);return result;
}
const str={type:'string',minLength:1};
const object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
export const IDENTITY_CONTEXT_SCHEMA=object({sessionId:str,documentId:str,documentInstanceId:str,revision:{type:'integer',minimum:0},expectedRevision:{type:'integer',minimum:0}},['sessionId','documentId','documentInstanceId']);
const revisionContext={...IDENTITY_CONTEXT_SCHEMA,required:['sessionId','documentId','documentInstanceId','expectedRevision']};
export const ADD_STEP_SCHEMA=object({op:str,params:{type:'object'},refs:{type:'array',items:str},name:{type:'string',minLength:1,maxLength:120},placement:PLACEMENT_SCHEMA},['op','params']);
const planFeature={...ADD_STEP_SCHEMA,required:['key','op','params'],properties:{key:{type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,39}$'},...ADD_STEP_SCHEMA.properties,refs:{type:'array',items:{oneOf:[str,object({feature:str},['feature'])]}}}};
const STEP_SCHEMA=object({id:{type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,39}$'},method:str,args:{type:'object'},stage:{type:'string',minLength:1,maxLength:80}},['id','method']);
const boolean={type:'boolean'},vector=vectorSchema;
export const PAGE_METHOD_SCHEMAS={
 getDebugReport:object({source:{enum:['all','ui','api','agent','kernel','services','runtime']},level:{enum:['all','info','warn','error']},query:{type:'string',maxLength:160},afterSequence:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:1500},includeState:boolean}),
 setDebugPanel:object({context:IDENTITY_CONTEXT_SCHEMA,visible:boolean},['context','visible']),
 getMetalMaterials:object({}),
 getMaterials:object({}),
 setMetalMaterials:object({context:IDENTITY_CONTEXT_SCHEMA,configuration:{type:'object'}},['context','configuration']),
 add:ADD_STEP_SCHEMA,
 addMany:object({features:{type:'array',minItems:1,maxItems:64,items:planFeature}},['features']),
 run:object({context:revisionContext,idempotencyKey:{type:'string',minLength:1,maxLength:80},steps:{type:'array',minItems:1,maxItems:LIMITS.batch.maxSteps,items:STEP_SCHEMA}},['context','idempotencyKey','steps']),
 resolvePlacement:object({context:IDENTITY_CONTEXT_SCHEMA,op:str,params:{type:'object'},refs:{type:'array',items:str},placement:PLACEMENT_SCHEMA},['context','op','params','refs','placement']),
 capture:object({context:IDENTITY_CONTEXT_SCHEMA,maxWidth:{type:'integer',minimum:64,maximum:4096},format:{enum:['png','webp']},quality:{type:'number',exclusiveMinimum:0,maximum:1}},['context']),
 getEvidenceImage:object({context:revisionContext,evidenceId:{type:'string',pattern:'^ev_[a-f0-9]{32}$'},viewId:{enum:['iso','front','top','right']},maxWidth:{type:'integer',minimum:64,maximum:1024},format:{enum:['png','webp']},quality:{type:'number',exclusiveMinimum:0,maximum:1}},['context']),
 setView:object({context:IDENTITY_CONTEXT_SCHEMA,direction:{enum:['top','bottom','front','back','left','right','side','iso']},projection:{enum:['orthographic','perspective']},fit:boolean,
  interactionPhase:{enum:['start','update','end']},selectedIds:{type:'array',maxItems:200,uniqueItems:true,items:str},section:object({axis:{enum:['X','Y','Z']},position:{type:'number'},enabled:boolean},['axis','position','enabled']),
  display:{enum:['solid','edges','wire','transparentEdges']},grid:boolean,snap:boolean,gizmo:{enum:['off','translate','rotate']},selectionMode:{enum:['view','body','face','edge']},camera:object({position:vector,target:vector},['position','target']),
  language:{enum:['zh','en']},temporaryDisplay:{enum:['normal','selectedOnly','transparentOthers']},anchorVisible:boolean,panels:object({left:boolean,right:boolean}),toolbar:boolean,workspace:{enum:['modeling','library','agent']},libraryMode:{enum:['cards','list']},focus:boolean,modelLibraryChange:{type:'object'}},['context']),
 queryGeometry:object({context:IDENTITY_CONTEXT_SCHEMA,bodyId:str,kind:{enum:['face','edge']},filter:{type:'object'},requireUnique:boolean,expectedCount:{type:'integer',minimum:1,maximum:100000},limit:{type:'integer',minimum:1,maximum:100},cursor:{type:'string',minLength:1,maxLength:2048}},['context','bodyId','kind']),
 getState:object({include:{type:'array',items:{enum:['summary','features','bodies','bodiesLite','selection','capabilities','references','reliefDesigns']}},compact:boolean,fields:{type:'array',minItems:1,maxItems:32,items:{type:'string',minLength:1,maxLength:40}},sinceRevision:{type:'integer',minimum:0}})
};
export const METHOD_TOOL=name=>name==='run'?'webcad_submit':['capture','getEvidenceImage','setView','setMetalMaterials','setDebugPanel'].includes(name)?'webcad_view':['add','addMany'].includes(name)?'run-step':'webcad_read';
export function validatePageInput(method,input,path='args'){
 const schema=PAGE_METHOD_SCHEMAS[method];if(schema)validateSchema(schema,input,path);
}
