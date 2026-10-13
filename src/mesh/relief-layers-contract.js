import {reliefFieldSchema} from './relief-field.js';
import {reliefProfileSchema} from './relief-profile.js';
const number={type:'number'},positive={...number,exclusiveMinimum:0},point={type:'array',minItems:2,maxItems:2,items:number};
const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
const disk=obj({centerMm:point,radiusMm:positive});
export const reliefLayersSchema={type:'array',minItems:1,maxItems:16,items:{oneOf:[
 obj({id:{type:'string',minLength:1,maxLength:80},enabled:{type:'boolean'},kind:{const:'freeze'},regions:{type:'array',minItems:1,maxItems:64,items:disk}}),
 {...obj({id:{type:'string',minLength:1,maxLength:80},enabled:{type:'boolean'},kind:{const:'surface'},role:{enum:['macro','detail']},attachment:{enum:['followHeight','absolute']},blend:{enum:['add','remove','replace']},region:obj({centerMm:point,coreRadiusMm:positive,transitionMm:{...number,minimum:0}}),heightMm:number,field:reliefFieldSchema,profile:reliefProfileSchema},['id','enabled','kind','role','attachment','blend','region']),oneOf:[
  {properties:{blend:{enum:['add','remove']},attachment:{const:'followHeight'},heightMm:positive},required:['heightMm'],not:{anyOf:[{required:['field']},{required:['profile']}]}},
  ...['heightMm','field','profile'].map(key=>({properties:{blend:{const:'replace'},attachment:{const:'absolute'}},required:[key],not:{anyOf:['heightMm','field','profile'].filter(k=>k!==key).map(k=>({required:[k]}))}}))
 ]}
]}};
