import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePageInput} from '../src/page-input-contracts.js';
const ctx={sessionId:'s',documentId:'d',documentInstanceId:'i',expectedRevision:1};
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

test('setView accepts camera.up and header; capture accepts detail (R7-012/R7-008/R7-003)',()=>{
  validatePageInput('setView',{context:ctx,camera:{position:[1,2,3],target:[0,0,0],up:[0,0,1]}});
  validatePageInput('setView',{context:ctx,camera:{position:[1,2,3],target:[0,0,0],up:'inherit'}});
  validatePageInput('setView',{context:ctx,header:false});
  validatePageInput('capture',{context:ctx,detail:'current'});
  assert.throws(()=>validatePageInput('capture',{context:ctx,detail:'fine'}));
  assert.throws(()=>validatePageInput('setView',{context:ctx,camera:{position:[1,2,3],target:[0,0,0],up:'roll'}}));
});

test('capture reports synchronous render time and never forces settled detail when detail:current',()=>{
  const viewport=read('../src/viewport.js'),api=read('../src/page-api.js');
  assert.match(viewport,/settled=opts\.detail!=='current';\s*this\.renderFrame\(settled\)/);
  assert.match(viewport,/renderMs,detailSource:settled\?'settled-full-display-detail':'current-display-state'/);
  assert.match(api,/code:'CAPTURE_SLOW'/);
  assert.match(api,/displayWaitMs:prepared\.displayWaitMs\?\?0/,'displayWaitMs split stays');
});

test('header is hidden only by explicit header:false; front/left vectors unchanged (R7-004/R7-008)',()=>{
  const css=read('../src/workspace-upgrade.css'),ui=read('../src/ui.js'),viewport=read('../src/viewport.js');
  assert.match(css,/\.webcad-app\.header-hidden>\.app-header\{display:none\}/);
  assert.match(ui,/app\.classList\.toggle\('header-hidden',workspaceLayout\.header===false\)/);
  assert.ok(!/saved\.header/.test(ui),'header:false is not persisted');
  assert.match(viewport,/front:\[0,-1,0\],back:\[0,1,0\],top:\[0,0,1\],bottom:\[0,0,-1\],left:\[-1,0,0\],right:\[1,0,0\]/);
});
