import {PAGE_METHOD_SCHEMAS,IDENTITY_CONTEXT_SCHEMA} from './page-input-contracts.js';
import {FILE_ARGUMENT_KEYS} from './browser-file-contracts.js';

const str={type:'string',minLength:1},num={type:'number'},bool={type:'boolean'},integer={type:'integer',minimum:0},obj={type:'object'},array={type:'array'},ids={type:'array',minItems:1,uniqueItems:true,items:str};
const vector={type:'array',minItems:3,maxItems:3,items:num},point2={type:'array',minItems:2,maxItems:2,items:num};
const fields=keys=>Object.fromEntries(keys.map(key=>[key,{}]));
const schema=(properties={},required=[])=>({type:'object',additionalProperties:false,properties,required});
const context=(properties={},required=[])=>schema({context:IDENTITY_CONTEXT_SCHEMA,...properties},['context',...required]);
const shape=(keys,required='')=>schema(fields(keys.split(' ').filter(Boolean)),required.split(' ').filter(Boolean));
const scoped=(keys,required='')=>context(fields(keys.split(' ').filter(Boolean)),required.split(' ').filter(Boolean));
const body=(properties={},required=[])=>context({bodyId:str,...properties},['bodyId',...required]);

// These are read-only preparation contracts, not replacements for the original
// runtime validators. Complex source, geometry, permissions and conditional
// lifecycle checks still run at the real target. Never ask for host credentials.
export const METHOD_PREPARATION_SCHEMAS={
 ...Object.fromEntries(['getModelLibrary','getHistory','getQuickModelUsage','info','getAgentPanel','getServices','getServicesCapabilities','getServicesRouting','getLogoConverter'].map(name=>[name,schema()])),
 recoverKernel:context({stopRunning:bool}),
 updateModelLibrary:context({expectedLibraryRevision:{type:'integer',minimum:-1},operation:{enum:['move','restore']},id:str,index:integer},['expectedLibraryRevision','operation']),
 resolveModelLibrary:context({id:str,expectedLibraryRevision:integer,params:obj},['id','expectedLibraryRevision']),
 sampleReliefHeight:context({featureId:str,point:point2,draft:obj,layerIndex:integer,samples:integer,patchId:str},['featureId','point']),
 prepareReliefSculpt:scoped('featureId strokes draft layerIndex samples patch','featureId strokes'),
 readRelief:{...context({includeData:bool,reliefId:str,resourceId:str,name:str,samples:{type:'integer',minimum:4,maximum:65},whiteHigh:bool,style:{enum:['grayscale','rounded','flat']},threshold:{type:'number',exclusiveMinimum:0,exclusiveMaximum:1},sourceInterpretation:{enum:['authoredHeightMap','rasterArtwork','reviewedVectors','shadedReference']}}),oneOf:[{required:['reliefId'],not:{required:['resourceId']}},{required:['resourceId','name','sourceInterpretation'],not:{required:['reliefId']}}]},
 planAlignment:context({bodyIds:ids,target:obj,axes:{type:'array',minItems:1,maxItems:3,uniqueItems:true,items:{enum:['X','Y','Z']}},sourceSide:{enum:['min','center','max']},targetSide:{enum:['min','center','max']},group:bool,gapMm:vector},['bodyIds','target']),
 selectRectangle:context({rect:{type:'array',minItems:4,maxItems:4,items:{type:'number',minimum:0,maximum:1}},mode:{enum:['window','crossing']},additive:bool},['rect']),
 createDrawing:context({bodyIds:{...ids,maxItems:40},projection:{enum:['first','third']},sections:{type:'array',maxItems:3,items:schema({plane:{enum:['XY','XZ','YZ']},offset:num},['plane','offset'])},hiddenLines:bool},['bodyIds']),
 copySelection:context({bodyIds:{...ids,maxItems:200}},['bodyIds']),pasteSelection:context({idempotencyKey:str},['idempotencyKey']),
 getUILayout:schema({includeModelLibrary:bool}),setRenderQuality:context({quality:{enum:['draft','standard','fine','ultra']}},['quality']),
 connect:shape('queries toolIds limit includeContracts knownCatalogHash knownDocsHash knownHashes'),
 searchTools:schema({query:{type:'string',maxLength:500},limit:{type:'integer',minimum:1,maximum:50},category:str,cursor:str},['query']),getTools:schema({ids:{...ids,maxItems:20},knownHashes:obj},['ids']),getTool:schema({id:str,version:str},['id']),
 readDocs:shape('docId section cursor maxChars','docId'),
 queryReferences:scoped('bodyIds kind filter limit offset requireUnique'),
 execute:context({idempotencyKey:str,action:str,args:obj},['idempotencyKey','action','args']),
 measure:context({bodyId:str,kind:{enum:['body','face','edge']},topologyId:integer,points:{type:'array',minItems:2,maxItems:2,items:vector}}),
 measureRelation:context({mode:{enum:['shortest','centerDistance','axisAlignment','pointFace','parallelFaces']},first:obj,second:obj,face:obj,pointWorld:vector},['mode']),
 inspectPrintability:body({angleLimitDeg:{type:'number',exclusiveMinimum:0,exclusiveMaximum:90}}),inspectProfile:body(),inspectConstraints:body(),
 prepareProfileEdit:body({mode:{enum:['intersections','trim','extend','trimCircle','fillet']},...fields(['entityId','targetId','edgeIds','endpoint','candidateId','startCandidateId','endCandidateId','keepSide','radiusMm','arcId','output'])},['mode']),
 projectProfile:context({bodyId:str,edgeIds:{type:'array',minItems:1,maxItems:100,uniqueItems:true,items:integer},pointWorld:vector,frame:obj},[]),
 inspectFit:context({bodyAId:str,bodyBId:str,toleranceMm:num,volumeThresholdMm3:num},['bodyAId','bodyBId']),
 inspectThickness:body({mode:{enum:['ray','faces']},point:vector,direction:vector,faceAId:integer,faceBId:integer,toleranceMm:num},['point']),
 inspectDraft:body({pullDirection:vector,thresholdDeg:{type:'number',minimum:0,exclusiveMaximum:90}},['pullDirection','thresholdDeg']),inspectRound:body({params:obj},['params']),
 readVector:scoped('resourceId name text scaleMm targetWidthMm entityIds bounds layers offset limit','name'),
 connectVector:context({entities:array,toleranceMm:num,origin:point2,flipY:bool},['entities']),
 fitProfile:context({kind:{enum:['circle','line']},plane:{enum:['XY','XZ','YZ']},points:array,maxResidualMm:num},['kind','points']),
 traceTwinWindow:scoped('outerLeft outerRight innerLeft innerRight barTopY barBottomY simplifyToleranceMm','outerLeft outerRight innerLeft innerRight barTopY barBottomY'),
 setDisplayPreferences:context({values:obj},['values']),redraw:context(),
 // Host-owned methods remain visible for diagnosis, and are explicitly blocked
 // before parameter inspection. Their credentials/handles are never requested.
 ...Object.fromEntries(['decideServicesWait','recoverServicesJob','prepareReliefTopologyUpgrade','createRequestContext','invoke','submit','getJob','cancelJob','waitFor','awaitJob','executeText','configureAgentPanel','setAgentPanel','setServices','clearServicesCredential','getServicesJob','getServicesRequest','cancelServicesJob','setLogoConverter','convertLogoPdf'].map(name=>[name,schema()])),
 ...PAGE_METHOD_SCHEMAS,
};
// Unlike transport wrappers, waitFor is model-readable and has an explicit XOR.
METHOD_PREPARATION_SCHEMAS.waitFor={...schema({afterRevision:integer,jobId:str,timeoutMs:{type:'integer',minimum:0,maximum:25000},documentInstanceId:str}),oneOf:[{required:['afterRevision'],not:{required:['jobId']}},{required:['jobId'],not:{required:['afterRevision']}}]};

const commandDefinitions={
 'document.materials':['settings','settings'],'feature.compileServices':['featureId allowUpload','featureId allowUpload'],
 'body.align':['bodyIds target axes sourceSide targetSide group gapMm','bodyIds target'],
 'history.restore':['stateId','stateId'],'document.reliefDesign':['id expectedDraftRevision draft remove','id expectedDraftRevision'],
 'document.rename':['name','name'],'feature.rename':['featureId name','featureId name'],'body.visibility':['bodyIds visible','bodyIds visible'],
 'body.appearance':['bodyIds finish color','bodyIds'],'document.appearance':['finish','finish'],'body.explode':['bodyId','bodyId'],
 'reference.setWorkFrame':['origin quaternion sourceLabel','origin quaternion'],'reference.resetWorkFrame':['scope','scope'],
 'reference.setLocked':['locked','locked'],'reference.saveFrame':['name frame frameId expectedFrameVersion','name frame'],
 'reference.activateFrame':['frameId expectedFrameVersion','frameId expectedFrameVersion'],'reference.renameFrame':['frameId expectedFrameVersion name','frameId expectedFrameVersion name'],
 'reference.deleteFrame':['frameId expectedFrameVersion','frameId expectedFrameVersion'],
 'reference.setBodyAnchor':['bodyId name referenceId quaternion anchorId expectedAnchorVersion','bodyId name referenceId quaternion'],
 'reference.deleteBodyAnchor':['bodyId anchorId expectedAnchorVersion','bodyId anchorId expectedAnchorVersion'],
 'feature.add':['op opVersion schemaHash params refs name selectionToken placement','op params refs'],
 'feature.edit':['featureId opVersion schemaHash params name placement','featureId params'],
 'feature.remove':['bodyIds','bodyIds'],'history.undo':['',''],'history.redo':['',''],'document.refresh':['',''],
 'preview.start':['op opVersion schemaHash params refs name selectionToken placement featureEdit fileImport',''],
 'preview.update':['previewId expectedGeneration patch','previewId expectedGeneration patch'],
 'preview.commit':['previewId expectedGeneration','previewId expectedGeneration'],'preview.cancel':['previewId expectedGeneration','previewId expectedGeneration'],
};
export const COMMAND_PREPARATION_SCHEMAS=Object.fromEntries(Object.entries(commandDefinitions).map(([id,[keys,required]])=>[id,shape(keys,required)]));
Object.assign(COMMAND_PREPARATION_SCHEMAS['body.align'],METHOD_PREPARATION_SCHEMAS.planAlignment,{properties:{...METHOD_PREPARATION_SCHEMAS.planAlignment.properties},required:['bodyIds','target']});delete COMMAND_PREPARATION_SCHEMAS['body.align'].properties.context;
const fileRequired={capabilities:[],register:['name','data'],new:['context'],open:['context','resourceId','unsaved'],import:['context','resourceId'],save:['context'],export:['context','format'],reattach:['context','resourceId'],read:['resourceId'],download:['resourceId'],write:['resourceId','handle'],confirmWritten:['resourceId','size','sha256'],release:['resourceId']};
export const FILE_PREPARATION_SCHEMAS=Object.fromEntries(Object.entries(FILE_ARGUMENT_KEYS).map(([name,keys])=>[`files.${name}`,schema({...fields(keys),...(keys.includes('context')?{context:IDENTITY_CONTEXT_SCHEMA}:{}),...(name==='export'?{format:{enum:['step','stl','brep','png']}}:{}),...(name==='open'?{unsaved:{enum:['fail','discard']}}:{})},fileRequired[name])]));
export function preparationSchema(card){
 if(card.category==='command'&&card.inputSchema?.properties?.action?.const)return card.inputSchema.properties.args;
 return card.inputSchema||METHOD_PREPARATION_SCHEMAS[card.id]||FILE_PREPARATION_SCHEMAS[card.id]||COMMAND_PREPARATION_SCHEMAS[card.id]||null;
}
export function withPreparationContract(card){
 const operation=!!card.refsSchema&&!['import','remove'].includes(card.id),target=operation?'prepareOperation':'prepareToolCall';
 const input=preparationSchema(card);
 return {...card,...(input&&!card.inputSchema?{preparationSchema:input}:{}),preparation:{method:target,readOnly:true,geometryComputed:false,missingParameters:'needs_input/questions/answerPath',example:operation?{op:card.id,params:{}}:{toolId:card.id,args:{}},docs:'api.prepare-tools',validation:'Published input structure only; original target retains source, permission, lifecycle and geometry checks.'}};
}
