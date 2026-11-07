import {cpus,totalmem,platform,release,arch} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {createArtifactWriter} from './artifact-writer.mjs';
import {createBrowserBenchmarkAdapter,createPlaywrightPageFactory} from './browser-host.mjs';
import {redact} from '../runner.mjs';

// Call from the authorized Playwright CLI run-code host with page.context().browser().
// The existing page is never navigated, refreshed, read for project data or modified.
// All geometry goes to a new browser context, on the existing localhost site only.
export async function createPlaywrightBenchmarkHost({browser,knowledgeDirectory,evidenceDirectory,runtime={},modelTransport,referenceValidator,independentReader}={}){
 if(!knowledgeDirectory||!evidenceDirectory||typeof browser?.newContext!=='function')throw Error('AUTHORIZED_BROWSER_AND_EXPLICIT_STORAGE_REQUIRED');
 const persist=await createArtifactWriter(evidenceDirectory);
 const record=async event=>{
  const bytes=Buffer.from(JSON.stringify(redact(event)),'utf8');
  return persist({scope:'events',name:randomUUID()+'.json',bytes,sha256:createHash('sha256').update(bytes).digest('hex')});
 };
 return createBrowserBenchmarkAdapter({openPage:createPlaywrightPageFactory(browser),knowledge:{baseUrl:'http://localhost/webcad/',directory:knowledgeDirectory},
  runtime:{browser:browser.version(),os:platform()+' '+release(),device:{architecture:arch(),cpuModel:cpus()[0]?.model??null,logicalCPUs:cpus().length,totalMemoryBytes:totalmem()},...runtime},
  modelTransport,referenceValidator,independentReader,persist,record,
 });
}
