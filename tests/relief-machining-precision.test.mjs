import test from 'node:test';
import assert from 'node:assert/strict';
import {solveReliefDesign,applyMachiningPrecision,softKnee,MACHINING_PRECISION_DEFAULT_MM} from '../src/relief-design-field.js';
import {fitReliefDesignField,prepareReliefDesignFit} from '../src/relief-design-fit.js';
import {validateReliefDesign} from '../src/relief-design-drafts.js';

const P=MACHINING_PRECISION_DEFAULT_MM;
const grid=(n,fn)=>{const h=new Float64Array(n*n),a=new Uint8Array(n*n),fx=new Uint8Array(n*n);for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=j*n+i,edge=!i||!j||i===n-1||j===n-1;a[k]=1;fx[k]=edge?1:0;h[k]=edge?0:fn(i/(n-1)-.5,j/(n-1)-.5,k);}return {heightsMm:h,active:a,fixedMask:fx};};
let seed=7;const rnd=()=>((seed=(seed*1103515245+12345)%2147483648)/2147483648)*2-1;

test('default precision is 0.05 mm and the soft knee is continuous (no new step)',()=>{
 assert.equal(P,.05);
 for(let d=-.3;d<=.3;d+=.0005){const a=softKnee(d,P),b=softKnee(d+.0005,P);assert.ok(Math.abs(b-a)<=.0005*1.8,'C0/Lipschitz at '+d);}
 assert.equal(softKnee(.2,P),.2);assert.ok(Math.abs(softKnee(.01,P))<.01*.2);
});

test('sub-0.05 mm noise is removed while a 1 mm feature is kept',()=>{
 const n=65,bump=(x,y)=>Math.exp(-((x*x+y*y)/.02)),noise=new Float64Array(n*n).map(()=>.02*rnd());
 const clean=grid(n,(x,y)=>1*bump(x,y)),f=grid(n,(x,y,k)=>1*bump(x,y)+noise[k]+.02);
 const r=applyMachiningPrecision(f,{columns:n,rows:n,lowerMm:0,upperMm:2,precisionMm:P});
 assert.equal(r.machiningPrecisionMm,.05);assert.ok(r.changedNodeCount>0);
 // High-frequency content: difference to the 5-point average.
 const hf=h=>{let m=0;for(let j=2;j<n-2;j++)for(let i=2;i<n-2;i++){const k=j*n+i;m=Math.max(m,Math.abs(h[k]-(h[k]+h[k-1]+h[k+1]+h[k-n]+h[k+n])/5));}return m;};
 const before=grid(n,(x,y,k)=>1*bump(x,y)+noise[k]+.02).heightsMm;
 assert.ok(hf(f.heightsMm)<P/2&&hf(f.heightsMm)<.6*hf(before),`ripple ${hf(f.heightsMm)} vs ${hf(before)}`);
 // Far from the feature: flat within precision noise floor → baseline (no sub-0.05 residue).
 let flat=0;for(let j=1;j<8;j++)for(let i=1;i<8;i++)flat=Math.max(flat,f.heightsMm[j*n+i]);assert.ok(flat<.01,'flat area noise floor '+flat);
 const c=(n*n-1)/2;assert.ok(Math.abs(f.heightsMm[c]-clean.heightsMm[c])<.05,'peak kept within precision');
});

test('round support: no stair-step at the retained-domain edge; precision recorded in draft fingerprint and fit report',()=>{
 const d=p=>validateReliefDesign({schemaVersion:1,name:'圆',support:{kind:'circle',centerMm:[0,0],radiusMm:10},throughHoles:[{kind:'circle',centerMm:[3,0],radiusMm:1.2}],protectedZones:[],heightRangeMm:[0,1],points:[],
  fieldSettings:{columns:33,rows:33,toleranceMm:.0001,...(p?{machiningPrecisionMm:p}:{}),edits:[{mode:'raise',centerMm:[-4,0],radiusMm:3,amountMm:.8,strength:1}]}});
 const s=solveReliefDesign(d(.05)),f=s.field,n=f.columns;
 assert.equal(s.report.precision.machiningPrecisionMm,.05);
 // Every active node touching the non-retained area (rim, hole) is within precision of the baseline → flush, no step.
 let edge=0;for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){const k=j*n+i;if(!f.active[k])continue;if([k-1,k+1,k-n,k+n].some(q=>!f.active[q]))edge=Math.max(edge,Math.abs(f.heightsMm[k]));}
 assert.ok(edge<P,'edge step '+edge);
 // Default applies even when not authored.
 assert.equal(solveReliefDesign(d()).report.precision.machiningPrecisionMm,.05);
 const opts={mode:'emboss',controlColumns:17,controlRows:17,controlMaxMm:1,acceptanceToleranceMm:.1};
 const a=prepareReliefDesignFit(d(.05),s,opts).source.draftFingerprint,b=prepareReliefDesignFit(d(.1),solveReliefDesign(d(.1)),opts).source.draftFingerprint;
 assert.notEqual(a,b,'precision is part of the recipe fingerprint');
 const fit=fitReliefDesignField(d(.05),s,opts).fit;
 assert.equal(fit.precision.machiningPrecisionMm,.05);assert.equal(typeof fit.precision.withinPrecision,'boolean');assert.ok(Number.isFinite(fit.precision.independentMaxMm));
 assert.throws(()=>d(.005));assert.throws(()=>d(.6));
 const s2=solveReliefDesign(d(.2));assert.equal(s2.report.precision.machiningPrecisionMm,.2);assert.equal(fitReliefDesignField(d(.2),s2,opts).fit.precision.machiningPrecisionMm,.2);
});

test('precision is adjustable: the same 0.07 mm ripple is kept at 0.05 mm and removed at 0.2 mm',()=>{
 const n=33,mk=()=>grid(n,(x,y)=>.5+.07*Math.cos(40*x)*Math.cos(40*y));
 const hf=h=>{let m=0;for(let j=3;j<n-3;j++)for(let i=3;i<n-3;i++){const k=j*n+i;m=Math.max(m,Math.abs(h[k]-(h[k-1]+h[k+1]+h[k-n]+h[k+n])/4));}return m;};
 const a=mk(),b=mk(),ref=hf(mk().heightsMm);
 applyMachiningPrecision(a,{columns:n,rows:n,lowerMm:0,upperMm:2,precisionMm:.05});applyMachiningPrecision(b,{columns:n,rows:n,lowerMm:0,upperMm:2,precisionMm:.2});
 assert.ok(hf(a.heightsMm)>.5*ref,'0.05 keeps supra-precision ripple '+hf(a.heightsMm)/ref);
 assert.ok(hf(b.heightsMm)<.4*ref&&hf(b.heightsMm)<.5*hf(a.heightsMm),'0.2 strongly reduces it '+hf(b.heightsMm)/ref);
});
