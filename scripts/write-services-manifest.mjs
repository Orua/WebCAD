import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readBuildIdentity} from './build-identity.mjs';
const [buildRoot,frontendRoot,output,nativeWorker,nativeProof]=process.argv.slice(2);if(!buildRoot||!frontendRoot||!output)throw new Error('Usage: node scripts/write-services-manifest.mjs <BuildRoot> <FrontendRoot> <output.json> [native-exe kernel-pair-proof.json]');
const root=path.resolve(import.meta.dirname,'..'),source=readBuildIdentity(root),index=JSON.parse(await fs.readFile(path.join(frontendRoot,'automation/index.json')));
if(index.metadata.buildId!==source.buildId)throw new Error('Frontend is not built from the current joint source');
const hashes={};for(const [name,file]of Object.entries({host:'WebCADServices.Host.exe',runtime:'WebCADServices.Runtime.dll',gateway:'WebCADServices.Gateway.dll',logo:'LogoVector.Worker.exe'})){const project=name==='host'?'WebCADServices.Host':name==='runtime'?'WebCADServices.Runtime':name==='gateway'?'WebCADServices.Gateway':'LogoVector.Worker';const bytes=await fs.readFile(path.join(buildRoot,'bin',project,'Release/net48',file));hashes[name]=createHash('sha256').update(bytes).digest('hex');}
let native={enabled:false,testedKernelPairs:[],status:'proof-not-supplied'};
if(nativeWorker||nativeProof){
 if(!nativeWorker||!nativeProof)throw new Error('Supply both the actual native binary and evidence');
 const proof=JSON.parse((await fs.readFile(nativeProof,'utf8')).replace(/^\uFEFF/,'')),sha=createHash('sha256').update(await fs.readFile(nativeWorker)).digest('hex');
 if(proof.producerKernelBuildId!==`native-occt@7.8.1:sha256:${sha}`||proof.codec!=='occt-text-brep-v1'||proof.brepVersion!==3)throw new Error('Native evidence does not match this binary/codec');
 hashes.native=sha;native={enabled:proof.geometryBridgeStatus==='passed'||proof.status==='passed',binarySha256:sha,proofSha256:createHash('sha256').update(await fs.readFile(nativeProof)).digest('hex'),sourceClaim:'accepted binary frozen by the supplied proof; joint source hash is not a Native rebuild claim',testedKernelPairs:[proof],status:proof.status,acceptedSemantics:proof.acceptedSemantics??[],scope:proof.localProjectAcceptance??null};
}
const manifest={format:'webcad-joint-build-v1',source,frontendBuildId:index.metadata.buildId,protocolVersion:'1.0',pageApiVersion:index.metadata.pageApiVersion,logoSemanticVersion:'logo-1.0',binarySha256:hashes,native,documentVersions:[1,2,3],geometryCodecAccepted:native.enabled,deploymentReady:false,acceptance:{consoleHost:'see test evidence',realLogoPdf:'see real fixture evidence',native:native.status,IIS:'not-tested',restrictedServiceIdentity:'not-tested'},createdAt:new Date().toISOString()};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(manifest,null,2));console.log(`Joint local build manifest written to ${output}; deploymentReady=false`);
