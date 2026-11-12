import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledSemanticVersion,reliefLayerSemanticVersion,RELIEF_SEMANTIC_VERSION,RELIEF_STROKE_SEMANTIC_VERSION,RELIEF_PATCH_SEMANTIC_VERSION} from '../src/services/geometry-exchange.js';
import {getOperation} from '../src/operation-registry.js';

const region={outer:[[-.2,-.2],[.2,-.2],[.2,.2],[-.2,.2]],holes:[]};
const stroke={points:[[-.2,0],[.2,0]],widthMm:.5};

test('engrave contour layers are not classified as the TBD strokes semantic',()=>{
  const engrave={layers:[{name:'dragon',mode:'engrave',heightMm:1.5,regions:[region]},{name:'clouds',mode:'engrave',heightMm:.8,regions:[region]}]};
  assert.equal(reliefLayerSemanticVersion(engrave),RELIEF_SEMANTIC_VERSION);
  assert.equal(compiledSemanticVersion({op:'relief',params:engrave}),RELIEF_SEMANTIC_VERSION);
  const emboss={layers:[{name:'body',mode:'emboss',heightMm:1.2,regions:[region]}]};
  assert.equal(compiledSemanticVersion({op:'relief',params:emboss}),RELIEF_SEMANTIC_VERSION);
  const strokes={layers:[{name:'whiskers',mode:'emboss',heightMm:1,strokes:[stroke]}]};
  assert.equal(compiledSemanticVersion({op:'relief',params:strokes}),RELIEF_STROKE_SEMANTIC_VERSION);
  const mixed={layers:[{name:'body',mode:'engrave',heightMm:1,regions:[region]},{name:'whiskers',mode:'emboss',heightMm:1,strokes:[stroke]}]};
  assert.equal(compiledSemanticVersion({op:'relief',params:mixed}),RELIEF_STROKE_SEMANTIC_VERSION);
  const patch={layers:[{name:'patch',mode:'emboss',heightMm:1,regions:[region],localPatches:[{id:'p'}]}]};
  assert.equal(compiledSemanticVersion({op:'relief',params:patch}),RELIEF_PATCH_SEMANTIC_VERSION);
});

test('relief tool card marks layer strokes as unfinished TBD',()=>{
  const card=getOperation('relief'),text=JSON.stringify(card);
  assert.match(text,/密集刻线/);
  assert.match(text,/尚未完成验收/);
  assert.match(text,/relief\.compiled-contours-strokes-1\.2/);
  assert.match(JSON.stringify(card.inputSchema||card.paramsSchema||{}), /TBD/);
  assert.ok((card.knownUnsupportedCases||[]).some(note=>/密集刻线/.test(note)));
});
