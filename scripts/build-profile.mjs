import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const edition=process.argv[2];
if(!['public','integrated'].includes(edition))throw new Error('Expected public or integrated');
const root=resolve(import.meta.dirname,'..');
const env={...process.env,WEBCAD_EDITION:edition,
  WEBCAD_DIST_DIR:process.env.WEBCAD_DIST_DIR||resolve(root,'dist',edition)};
// Reuse the canonical generation and integrity pipeline. This never deploys or pushes.
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],
  {cwd:root,env,stdio:'inherit',shell:process.platform==='win32',windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status??1;
