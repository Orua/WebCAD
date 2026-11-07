import {createPlan} from './runner.mjs';
// Preparation only: never dispatches model inference or opens a browser.
// Freeze the build and execution limits. Token caps apply only when supplied.
export function createSingleBasicPlan({caseId='B01',build,applicationCommit,totalTokens=null,authorizationSource,wallClockMs=180000,maxRounds=6,maxToolCalls=12}={}){
 if(!['B01','B02','B03'].includes(caseId)||!applicationCommit||totalTokens!==null&&(!Number.isInteger(totalTokens)||totalTokens<1)||!authorizationSource||maxRounds>20||maxToolCalls>80||wallClockMs>600000)throw Error('EXPLICIT_SINGLE_BASIC_BUDGET_AND_BUILD_REQUIRED');
 return {...createPlan({caseId,build,sourceCommit:applicationCommit,layer:'L2',repeat:1,group:'B',budget:{maxRounds,maxToolCalls,wallClockMs,totalTokens,totalCost:null,accountingMode:totalTokens===null?'native-account-usage-only':'native-account-token-cap',authorizationSource}}),recordType:'BOUNDED_SINGLE_BASIC_TRIAL_NOT_FULL_BASELINE'};
}
