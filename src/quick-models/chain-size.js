export const CHAIN_KINDS=Object.freeze(['oChain','twistedChain','groundChain']);
export const CHAIN_SIZE_DEFAULTS=Object.freeze({sizeMode:'count',linkCount:4,maxLengthMm:0});
export const CHAIN_SIZE_KEYS=Object.freeze(Object.keys(CHAIN_SIZE_DEFAULTS));
export const isChain=kind=>CHAIN_KINDS.includes(kind);
export const hasChainSize=params=>CHAIN_SIZE_KEYS.some(key=>Object.hasOwn(params||{},key));
const fail=message=>{throw Object.assign(Error('链条：'+message),{code:'PARAM_SCHEMA_INVALID'});};
export function normalizeChainSize(params,{creation=true}={}){
 if(!isChain(params?.kind))return {...params};
 if(!creation&&!hasChainSize(params))return {...params,sizeMode:'count',linkCount:1,maxLengthMm:0};
 const mode=params.sizeMode??((params.maxLengthMm??0)>0?'length':'count');
 if(!['count','length'].includes(mode))fail('长度方式须选择节数或总长');
 if(mode==='count'){
  if((params.maxLengthMm??0)!==0)fail('节数和总长二选一；按节数时不传总长或传0');
  const count=params.linkCount??4;if(!Number.isInteger(count)||count<1||count>100)fail('节数须为1–100的整数');
  return {...params,sizeMode:mode,linkCount:count,maxLengthMm:0};
 }
 if((params.linkCount??0)!==0)fail('节数和总长二选一；按总长时不传节数或传0');
 if(!(typeof params.maxLengthMm==='number'&&Number.isFinite(params.maxLengthMm)&&params.maxLengthMm>0&&params.maxLengthMm<=10000))fail('总长须在0–10000 mm之间');
 return {...params,sizeMode:mode,linkCount:0,maxLengthMm:params.maxLengthMm};
}
export function chainLayout(params,definition,{legacy=false,contact}={}){
 const p={...definition.defaults,...normalizeChainSize(params,{creation:!legacy})},l=p.outerLengthMm,d=p.wireDiameterMm;
 const pitch=contact?.pitchMm??(params.kind==='oChain'?l-2*d-.2:l*.56);
 if(!(Number.isFinite(pitch)&&pitch>0))fail('单节尺寸不能形成有效节距');
 let count=p.linkCount;
 if(p.sizeMode==='length'){
  if(p.maxLengthMm<l)fail('总长小于一节外长，不能容纳完整链节');
  count=1+Math.floor((p.maxLengthMm-l)/pitch+1e-12);
  if(l+(count-1)*pitch>p.maxLengthMm)count--;
  if(count>100)fail('该总长需要超过100节，请缩短总长或放大单节');
 }
 const lengthMm=l+(count-1)*pitch;
 if(count>1&&!(p.outerWidthMm>3*d+.2&&pitch>l/2))fail('多节链要求外宽>3×线径+0.2，节距大于半节外长，避免相邻或隔节碰撞');
 const rollStepDeg=params.kind==='oChain'?90:0,twistFactor=params.kind==='oChain'||count===1?1:1.6,validation=count>1?(contact?.initialValidation??chainClearance(params.kind,p.outerWidthMm,l,d,pitch,rollStepDeg,twistFactor)):null;
 if(validation&&((!contact&&!(validation.clearanceLowerBoundMm>0))||Math.abs(Math.abs(validation.linkingNumber)-1)>.05))fail('这些单节比例不能安全穿接，请调整外宽、外长或线径');
 return {sizeMode:p.sizeMode,linkCount:count,pitchMm:pitch,lengthMm,maxLengthMm:p.sizeMode==='length'?p.maxLengthMm:null,rollStepDeg,rollPatternDeg:params.kind==='oChain'?[0,90]:[0],twistFactor,layoutVersion:contact?'taut-contact-2':'nested-curb-1',assembly:'one-compound-independent-interlocked-links',lengthAxis:'local +Y',legacySingleLink:legacy,...(validation?{validation:{...validation,...(contact?{initialClearanceLowerBoundMm:validation.clearanceLowerBoundMm,clearanceLowerBoundMm:contact.gapMm,contactGapMm:contact.gapMm,contactToleranceMm:CHAIN_CONTACT_TOLERANCE_MM,method:'exact-brep-conservative-advancement'}:{})}}: {})};
}
export const CHAIN_CONTACT_TOLERANCE_MM=1e-5;
import {chainClearance} from './chain-clearance.js';
