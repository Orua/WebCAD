import test from 'node:test';
import assert from 'node:assert/strict';
import {solveReliefDesign} from '../src/relief-design-field.js';
import {fitReliefDesignField} from '../src/relief-design-fit.js';
import {prepareReliefDesignRelief} from '../src/relief-design-brep.js';
import {regionsFromActiveMask,verifyReliefDesignBinding} from '../src/modeling/manufacturing/relief-design-binding.js';
import {validateSchema} from '../src/contracts/operation-schema.js';
import {reliefOperations} from '../src/modeling/manufacturing/relief-contracts.js';

const draft=(extra={})=>({schemaVersion:1,name:'拟合转BRep',support:{kind:'rect',centerMm:[0,0],widthMm:16,heightMm:16},throughHoles:[],protectedZones:[],heightRangeMm:[.35,.65],points:[],fieldSettings:{columns:33,rows:33,toleranceMm:.0001,edits:[{mode:'raise',centerMm:[1,1],radiusMm:4,amountMm:.12,strength:1}]},...extra});
const opts={mode:'emboss',controlColumns:13,controlRows:13,acceptanceToleranceMm:.04,controlMaxMm:.3};
const intent={version:1,requestedGeometry:'continuousRelief',sourceInterpretation:'authoredHeightMap',userIntentEvidence:'测试'};
const support={bodyId:'base',faceId:4,planar:true,solidCount:1,faceCount:6,centerMm:[0,0,4],normal:[0,0,1],sourceSha256:'a'.repeat(64)};
function make(d=draft(),o=opts){const solved=solveReliefDesign(d),r=fitReliefDesignField(d,solved,o);return {fit:{status:'fitted',designId:'design',draftRevision:1,...r,sourceBinding:{draftRevision:1,...r.source}},solved:{status:'solved',...solved},entry:{id:'design',revision:1,draft:d}};}
const base=make();
const request=(over={})=>({...base,expectedDraftRevision:1,support,target:{bodyId:'base',faceId:4,expectedSourceSha256:support.sourceSha256},placement:{originMm:[1,2,4],xDirection:[1,0,0]},datum:{kind:'authoredBaselineOnSelectedFace',baselineMm:.35},machiningIntent:intent,...over});
const codes=r=>r.blockers.map(b=>b.code);

test('prepared plan is a strict relief feature with a complete physical binding and no automatic geometry',()=>{
 const r=prepareReliefDesignRelief(request());
 assert.equal(r.status,'prepared');assert.equal(r.brepComputed,false);assert.equal(r.commitState,'notCommitted');
 const p=r.previewArgs.params;validateSchema(reliefOperations.relief.paramsSchema,p);
 assert.deepEqual([p.offsetX,p.offsetY,p.angleDeg],[1,2,0]);assert.equal(p.maskStrategy,'faceWithHolesExtrude');assert.equal(p.curveToleranceMm,0);
 assert.equal(p.values.length,13);assert.ok(Math.max(...p.values.flat())===1);assert.ok(p.values.flat().every(v=>v>=0&&v<=1));
 assert.equal(p.designBinding.datum.baselineMm,.35);assert.equal(p.machiningIntent.requestedGeometry,'continuousRelief');
 assert.deepEqual(r.previewArgs.refs,['base']);
 // Verification with the same trusted facts succeeds; schema forbids extra binding fields.
 assert.equal(verifyReliefDesignBinding(p,{sourceSha256:support.sourceSha256,support}).kind,'relief-design-binding-verified');
 assert.throws(()=>validateSchema(reliefOperations.relief.paramsSchema,{...p,designBinding:{...p.designBinding,extra:1}}));
});

test('missing or inconsistent user inputs block with Chinese reasons instead of guessing',()=>{
 const cases=[
  [{target:undefined},'RELIEF_DESIGN_TARGET_REQUIRED'],
  [{target:{bodyId:'base',faceId:5}},'RELIEF_DESIGN_SUPPORT_MISMATCH'],
  [{target:{bodyId:'base',faceId:4,expectedSourceSha256:'b'.repeat(64)}},'RELIEF_DESIGN_SOURCE_CHANGED'],
  [{support:{...support,planar:false}},'RELIEF_DESIGN_SUPPORT_INVALID'],
  [{placement:undefined},'RELIEF_DESIGN_PLACEMENT_REQUIRED'],
  [{placement:{originMm:[1,2,4.1],xDirection:[1,0,0]}},'RELIEF_DESIGN_PLACEMENT_INVALID'],
  [{placement:{originMm:[1,2,4],xDirection:[1,0,.1]}},'RELIEF_DESIGN_PLACEMENT_INVALID'],
  [{datum:undefined},'RELIEF_DESIGN_DATUM_REQUIRED'],
  [{datum:{kind:'authoredBaselineOnSelectedFace',baselineMm:.65}},'RELIEF_DESIGN_DATUM_REQUIRED'],
  [{machiningIntent:undefined},'RELIEF_DESIGN_INTENT_REQUIRED'],
  [{machiningIntent:{...intent,targetPeakMm:.3}},'RELIEF_DESIGN_INTENT_REQUIRED'],
  [{machiningIntent:{...intent,requestedGeometry:'layeredRelief'}},'RELIEF_DESIGN_INTENT_REQUIRED'],
  [{fit:{status:'empty'}},'RELIEF_DESIGN_UNFITTED'],
 ];
 for(const [over,code] of cases){const r=prepareReliefDesignRelief(request(over));assert.equal(r.status,'blocked',code);assert.ok(codes(r).includes(code),code+' '+codes(r));assert.ok(r.blockers.every(b=>/[\u4e00-\u9fff]/.test(b.message)));assert.equal(r.previewArgs,undefined);}
});

test('a draft change, revision bump or changed solved field rejects the retained fit as stale',()=>{
 const changed=draft();changed.fieldSettings.edits[0].amountMm=.1;
 assert.throws(()=>prepareReliefDesignRelief(request({entry:{...base.entry,draft:changed}})),{code:'RELIEF_DESIGN_STALE'});
 assert.throws(()=>prepareReliefDesignRelief(request({entry:{...base.entry,revision:2},expectedDraftRevision:2})),{code:'RELIEF_DESIGN_STALE'});
 assert.throws(()=>prepareReliefDesignRelief(request({expectedDraftRevision:2})),{code:'RELIEF_DESIGN_STALE'});
 const solved=structuredClone(base.solved);solved.field.heightsMm[500]+=.001;
 assert.throws(()=>prepareReliefDesignRelief(request({solved})),{code:'RELIEF_DESIGN_STALE'});
 assert.throws(()=>prepareReliefDesignRelief(request({entry:{...base.entry,id:'other'}})),{code:'RELIEF_DESIGN_STALE'});
});

test('flat field is no-change and dense valid candidates proceed to executor routing',()=>{
 const flat=make(draft({fieldSettings:{columns:33,rows:33,toleranceMm:.0001}}));
 assert.ok(codes(prepareReliefDesignRelief(request({...flat}))).includes('RELIEF_DESIGN_NO_CHANGE'));
 const dense=make(draft(),{...opts,controlColumns:33,controlRows:33});
 const r=prepareReliefDesignRelief(request({...dense}));assert.equal(r.status,'prepared');assert.deepEqual(r.blockers,[]);assert.ok(r.previewArgs);
});

test('retained-domain mask keeps through holes as region holes with row-order flip and exact collinear removal only',()=>{
 const columns=9,rows=9,active=new Uint8Array(81).fill(1);
 for(const [i,j] of [[5,5],[6,5],[5,6],[6,6]])active[j*columns+i]=0; // row0=-Y; hole sits in +X/+Y
 const r=regionsFromActiveMask({columns,rows,widthMm:8,heightMm:8},active);
 assert.equal(r.regions.length,1);assert.equal(r.holeCount,1);assert.deepEqual(r.regions[0].outer.length,4);
 const hole=r.regions[0].holes[0];assert.equal(hole.length,4);assert.ok(hole.every(([x,y])=>x>=0&&y>=0),'hole stays in +Y after the row flip');
 const split=new Uint8Array(81).fill(1);for(let j=0;j<rows;j++)split[j*columns+4]=0;
 assert.throws(()=>regionsFromActiveMask({columns,rows,widthMm:8,heightMm:8},split),{code:'RELIEF_DESIGN_MASK_BLOCKED'});
});
