import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve,isAbsolute,relative,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
const {values}=parseArgs({options:{cmake:{type:'string',default:'cmake'},'build-dir':{type:'string'},sdk:{type:'string'},'json-include':{type:'string'},compiler:{type:'string'},generator:{type:'string'},'make-program':{type:'string'},jobs:{type:'string',default:'2'}}});
try{
 if(!isAbsolute(values['build-dir']??'')||!isAbsolute(values.sdk??'')||!isAbsolute(values['json-include']??''))throw Error('EXPLICIT_EXTERNAL_BUILD_AND_SDK_PATHS_REQUIRED');
 const source=fileURLToPath(new URL('.',import.meta.url)),repository=fileURLToPath(new URL('../../../..',import.meta.url)),build=resolve(values['build-dir']);
 const r=relative(repository,build);if(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep))throw Error('BUILD_MUST_BE_OUTSIDE_REPOSITORY');
 const jobs=Number(values.jobs);if(!Number.isInteger(jobs)||jobs<1||jobs>8)throw Error('BUILD_JOBS_MUST_BE_1_TO_8');
 const args=['-S',source,'-B',build,'-DCMAKE_BUILD_TYPE=Release','-DOpenCASCADE_DIR='+resolve(values.sdk,'cmake'),'-DJSON_INCLUDE_DIR='+resolve(values['json-include'])];
 if(values.compiler)args.push('-DCMAKE_CXX_COMPILER='+values.compiler);
 if(values.generator)args.push('-G',values.generator);
 if(values['make-program'])args.push('-DCMAKE_MAKE_PROGRAM='+values['make-program']);
 execFileSync(values.cmake,args,{stdio:'inherit',windowsHide:true});
 execFileSync(values.cmake,['--build',build,'--config','Release','--parallel',String(jobs)],{stdio:'inherit',windowsHide:true});
}catch(error){console.error(error.message);process.exitCode=2;}
