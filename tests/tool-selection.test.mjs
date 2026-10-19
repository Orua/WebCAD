import test from 'node:test';
import assert from 'node:assert/strict';
import {searchTools,getTool,readDocs} from '../src/page-api-docs.js';
import {TOOL_SELECTION_GROUPS,TOOL_SELECTION_GUIDANCE} from '../src/tool-selection.js';
import {KNOWLEDGE_GUIDANCE} from '../src/agent-knowledge.js';

function catalog(){let cursor;const cards=[];do{const page=searchTools({query:'',limit:50,...(cursor?{cursor}:{})});cards.push(...page.items);cursor=page.nextCursor;}while(cursor);return cards;}
test('the entire live catalog has explicit selection criteria and valid comparison targets',()=>{
  const cards=catalog(),ids=new Set(cards.map(c=>c.id));
  const declared=TOOL_SELECTION_GROUPS.flatMap(g=>Object.keys(g.choices));
  assert.equal(new Set(declared).size,declared.length);
  assert.deepEqual(new Set(declared),ids,'new tools must be classified rather than silently receiving a generic fallback');
  for(const row of cards){
    const guide=getTool({id:row.id}).selectionGuide;
    assert.deepEqual(row.selectionGuide,guide,'search and full card have the same distinctions');
    assert(guide.chooseWhen.length>10,row.id);assert(guide.alternatives.length>0,row.id);
    for(const candidate of guide.alternatives){assert(ids.has(candidate.id),candidate.id);assert.notEqual(candidate.id,row.id);assert.equal(candidate.chooseWhen,getTool({id:candidate.id}).selectionGuide.chooseWhen);}
  }
});
test('near names compare input, shape, output and stage instead of copying one product rule',()=>{
  const pairs=[['torus','template.ring'],['template.rectBuckle','template.flatFrame'],['template.dBuckle','template.dFlatFrame'],['template.sliderBuckle','template.twinWindowPlate'],['template.archedTwinWindowPlate','template.bowedTwinWindowPlate'],['template.twoPieceEyelet','template.alloyEyelet'],['template.twistedChain','template.groundChain'],['helix','coil'],['shell','thickenFace'],['extrude','referenceExtrude'],['loft','guidedLoft'],['holeWizard','template.counterboreTool'],['profileConstraints','inspectConstraints'],['transform','setView'],['group','union'],['fillet','roundEnd'],['logo','relief'],['meshReliefEdit','reliefSculpt'],['files.open','files.import'],['files.save','files.export'],['getJob','getServicesJob'],['history.restore','history.undo']];
  for(const [a,b] of pairs){const guide=getTool({id:a}).selectionGuide;assert(guide.alternatives.some(c=>c.id===b),`${a} vs ${b}`);assert.notEqual(guide.chooseWhen,getTool({id:b}).selectionGuide.chooseWhen);}
  assert.match(TOOL_SELECTION_GUIDANCE,/不新增执行限制/);
  assert(!KNOWLEDGE_GUIDANCE.includes('template.keyRing'),'bootstrap stays product-neutral');
  const page=readDocs({docId:'api.tool-selection',limitChars:1000});assert.match(page.text,/工具选择/);
});
