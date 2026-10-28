// 261024: Services phase timeouts, restore key without doc revision, margin 25%, mill fillet fallback helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {servicesRequestTimeoutMs} from '../src/services/client.js';
import {effectiveEdgeMargins,RELIEF_EDGE_MARGIN_MAX_FRACTION} from '../src/relief-design-field.js';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');

test('Services timeouts: upload/result ≥120s, large submit follows serverWaitMs',()=>{
 assert.ok(servicesRequestTimeoutMs('upload',{bytes:0})>=120000);
 assert.ok(servicesRequestTimeoutMs('upload',{bytes:5*1024*1024})>=120000);
 assert.ok(servicesRequestTimeoutMs('result',{bytes:2*1024*1024})>=120000);
 assert.ok(servicesRequestTimeoutMs('artifact',{bytes:1024})>=120000);
 assert.equal(servicesRequestTimeoutMs('poll'),60000);
 assert.equal(servicesRequestTimeoutMs('submit',{bytes:1024}),60000);
 assert.ok(servicesRequestTimeoutMs('submit',{bytes:3057103,serverWaitMs:180000})>=180000);
 assert.equal(servicesRequestTimeoutMs('cancel'),60000);
});

test('restore key omits whole-document revision',()=>{
 const src=readFileSync(join(root,'src/relief-design-runtime.js'),'utf8');
 const m=src.match(/const key=\(context,entry\)=>[^;]+;/);
 assert.ok(m,'key() present');
 assert.ok(!/context\.revision/.test(m[0])&&!/expectedRevision/.test(m[0]),'key must not bind whole-doc revision: '+m[0]);
 assert.match(m[0],/documentId/);
 assert.match(m[0],/documentInstanceId/);
 assert.match(m[0],/entry\.id/);
 assert.match(m[0],/entry\.revision|entry\.draft/);
});

test('edge margin fraction is 25% of min half-size',()=>{
 assert.equal(RELIEF_EDGE_MARGIN_MAX_FRACTION,.25);
 const draft=(w,h,keep,fade)=>({support:{kind:'rectangle',centerMm:[0,0],widthMm:w,heightMm:h},heightSource:{source:{grid:{columns:9,rows:9}},edgeKeepoutMm:keep,edgeFadeMm:fade}});
 // 60→18: keep+fade 4 must scale (half=9, limit=2.25)
 const s=effectiveEdgeMargins(draft(18,18,2,2));
 assert.equal(s.scaled,true);
 assert.ok(Math.abs(s.keepMm+s.fadeMm-2.25)<1e-9);
});

test('mill complementary-R fallback module exports edge and multi-edge APIs',async()=>{
 const mod=await import('../src/modeling/rounding/mill-fillet-fallback.js');
 assert.equal(typeof mod.millComplementaryFilletEdge,'function');
 assert.equal(typeof mod.millComplementaryFillet,'function');
});

test('edge-blend and analytic-round wire mill fallback',()=>{
 const blend=readFileSync(join(root,'src/edge-blend.js'),'utf8');
 assert.match(blend,/millComplementaryFillet/);
 assert.match(blend,/mill-complementary-r-fallback/);
 const analytic=readFileSync(join(root,'src/modeling/rounding/analytic-round.js'),'utf8');
 assert.match(analytic,/millComplementaryFillet/);
});

test('height panel fallback copy and draft preview helpers exist',()=>{
 const h=readFileSync(join(root,'src/ui/forms/relief-design-height-panel.js'),'utf8');
 assert.match(h,/已改用浏览器转换/);
 assert.match(h,/showFromDraft/);
 assert.match(h,/fileBytes/);
});

test('convertSourceOnServices prefers compressed upload when provided',()=>{
 const p=readFileSync(join(root,'src/services/relief-pipeline.js'),'utf8');
 assert.match(p,/compressed/);
 assert.match(p,/fileBytes/);
 assert.match(p,/MaterializeRgba|JPEG|jpeg|png/i);
});

test('60→18 margin scale keeps free half ≥75% so center detail budget remains',()=>{
 const draft=(w,h,keep,fade)=>({support:{kind:'rectangle',centerMm:[0,0],widthMm:w,heightMm:h},heightSource:{source:{grid:{columns:9,rows:9}},edgeKeepoutMm:keep,edgeFadeMm:fade}});
 // support kind in effectiveEdgeMargins uses rect|circle from draft.support — field.js reads kind for half size only via width/height
 const d=(w,keep,fade)=>({support:{kind:'rect',centerMm:[0,0],widthMm:w,heightMm:w},heightSource:{edgeKeepoutMm:keep,edgeFadeMm:fade}});
 const s60=effectiveEdgeMargins(d(60,2,2));
 const s18=effectiveEdgeMargins(d(18,2,2));
 assert.equal(s60.scaled,false);
 assert.equal(s18.scaled,true);
 assert.ok(Math.abs(s18.keepMm+s18.fadeMm-2.25)<1e-9);
 // After scale, free half ≥ 75% of half-size
 const half18=9,free=half18-(s18.keepMm+s18.fadeMm);
 assert.ok(free/half18>=0.75-1e-12);
});


// ---- 261024-v2 hard criteria (contracts; no OCCT wasm) ----
import {adaptiveBrowserControlNet} from '../src/relief-design-field.js';
import {normalizeReliefDesignFitOptions} from '../src/relief-design-fit.js';
import {reliefRetainedHint} from '../src/relief-design-runtime.js';
import {brepExecutionSummary} from '../src/ui/forms/relief-design-brep-panel.js';

test('v2 browser fit: maxWork 800e6 and 129-field control net preserves 65 poles per side',()=>{
 const options={mode:'emboss',controlColumns:17,controlRows:17,acceptanceToleranceMm:.05};
 assert.equal(normalizeReliefDesignFitOptions(options).maxWork,800000000);
 assert.deepEqual(adaptiveBrowserControlNet(129,129),{columns:65,rows:65});
 assert.deepEqual(adaptiveBrowserControlNet(129,65),{columns:65,rows:33});
 assert.deepEqual(adaptiveBrowserControlNet(65,65),{columns:65,rows:65});
});

test('quality candidate output: target=p, explicit strict still available, capacity ladder retained',()=>{
 const src=readFileSync(join(root,'src/services/relief-pipeline.js'),'utf8');
 assert.match(src,/acceptanceToleranceMm:quality\.machiningPrecisionMm/);
 assert.match(src,/deviationPolicy:'candidate'/);
 assert.match(src,/qualityStatus:maxMm>p/);
 assert.match(src,/allowedTo=new Set\(\[257,513,641,769\]\)/);
 const q=readFileSync(join(root,'services/WebCADServices/native/occt-worker/relief_quality.hxx'),'utf8');
 assert.match(q,/default acceptance = machining precision p/);
 assert.match(q,/deviationPolicy",std::string\("strict"\)/);
 const w=readFileSync(join(root,'services/WebCADServices/native/occt-worker/worker.cpp'),'utf8');
 assert.match(w,/for\(int next:\{769,641,513,257\}\)/);
 const d=readFileSync(join(root,'services/WebCADServices/native/occt-worker/relief_design.hxx'),'utf8');
 assert.match(d,/meshVolume/);
 assert.match(d,/BRepCheck_Analyzer/);
});

test('BRep panel allows applying a measured quality candidate',()=>{
 const src=readFileSync(join(root,'src/ui/forms/relief-design-brep-panel.js'),'utf8');
 assert.equal(src.includes('拟合超差不会拒绝'),false);
 assert.match(src,/可以应用并保存/);
 const done=brepExecutionSummary({lastDecision:{executor:'remote'},lastReliefDesign:{controlNet:[257,257],maxErrorMm:.082,rmsErrorMm:.02,machiningPrecisionMm:.05}},{elapsedMs:1000,done:true});
 assert.match(done,/0\.0820/);
 assert.match(done,/超过目标精度/);
});

test('v2 retained hint persists across same draft revision via sessionStorage',()=>{
 const store=new Map();
 globalThis.sessionStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const context={documentId:'doc-1'},entry={id:'design-1',revision:3,draft:{heightSource:{depthMm:1}}};
 const key=`webcad.relief.retained.v1:${context.documentId}:${entry.id}:${entry.revision}`;
 sessionStorage.setItem(key,JSON.stringify({kind:'fit',documentId:'doc-1',designId:'design-1',draftRevision:3,hasHeightSource:true,savedAt:Date.now()}));
 const hint=reliefRetainedHint(context,entry);
 assert.equal(hint.kind,'fit');assert.equal(hint.hasHeightSource,true);
 assert.equal(reliefRetainedHint(context,{...entry,revision:4}),null);
});

test('v2 main.js restores IndexedDB recovery on same-tab refresh; runtime retries FIT_WORK_BUDGET',()=>{
 const main=readFileSync(join(root,'src/main.js'),'utf8');
 assert.match(main,/loadLatestRecovery/);
 assert.match(main,/recovery:latest/);
 assert.match(main,/webcad\.recovery\.latest/);
 assert.match(main,/已从本机恢复刷新前的工程/);
 const rt=readFileSync(join(root,'src/relief-design-runtime.js'),'utf8');
 assert.match(rt,/writeRetainedHint/);
 assert.match(rt,/FIT_WORK_BUDGET/);
 assert.match(rt,/control-net reductions/);
 const dlg=readFileSync(join(root,'src/ui/forms/relief-design-dialog.js'),'utf8');
 assert.match(dlg,/reliefRetainedHint/);
 assert.match(dlg,/检测到本页曾保留的求解\/拟合记录/);
});

test('v2 mill-first on kinked / FaultyContours fallthrough',()=>{
 const blend=readFileSync(join(root,'src/edge-blend.js'),'utf8');
 assert.match(blend,/mostlyKinked/);
 assert.match(blend,/prefer-mill-on-kinked-chain/);
 assert.match(blend,/NbFaultyContours/);
 assert.match(blend,/内核报告 .* 条失败过渡轮廓|faulty>0/);
});
