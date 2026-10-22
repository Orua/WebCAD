import test from 'node:test';
import assert from 'node:assert/strict';
import {fitMaskedReliefBSpline,sampleMaskedReliefBSpline} from '../src/relief-design-core/masked-bspline-fit.mjs';
import {cubicBasis} from '../src/relief-sculpt-surface.js';
import {buildDesignProblem} from '../src/relief-design-core/domain.mjs';

// Independent production display basis; explicitly invert its physical XY.
function reference(poles,n,x,y,span=20){
 const invert=x=>{let lo=0,hi=1;for(let k=0;k<56;k++){const m=(lo+hi)/2,p=cubicBasis(n,m).reduce((s,b)=>s+b.weight*(b.index/(n-1)-.5)*span,0);if(p<x)lo=m;else hi=m;}return (lo+hi)/2;};
 const bx=cubicBasis(n,invert(x)),by=cubicBasis(n,invert(y));let z=0;
 for(const a of bx)for(const b of by)z+=poles[b.index*n+a.index]*a.weight*b.weight;
 return z;
}
function fixture({circle=false,baseline=.35,mode='emboss',poles=9}={}){
 const sign=mode==='engrave'?-1:1,columns=33,rows=33,widthMm=20,heightMm=20;
 const domain={support:circle?{kind:'circle',centerMm:[0,0],radiusMm:10}:{kind:'rect',centerMm:[0,0],widthMm,heightMm},throughHoles:circle?[{kind:'circle',centerMm:[5,0],radiusMm:.7}]:[],protectedZones:circle?[{kind:'circle',centerMm:[1,0],radiusMm:.4}]:[]};
 const design=buildDesignProblem({grid:{columns,rows,widthMm,heightMm},...domain,initialMm:new Float64Array(columns*rows).fill(baseline),lowerMm:baseline-2,upperMm:baseline+2});
 const controls=new Float64Array(poles*poles);controls[Math.floor(poles/2)*poles+(circle?4:Math.floor(poles/2))]=.6;
 const heightsMm=Float64Array.from({length:columns*rows},(_,k)=>baseline+sign*reference(controls,poles,(k%columns/(columns-1)-.5)*20,(Math.floor(k/columns)/(rows-1)-.5)*20));
 for(let k=0;k<heightsMm.length;k++)if(design.fixedMask[k]||!design.active[k])heightsMm[k]=baseline;
 return {field:{columns,rows,widthMm,heightMm,heightsMm,active:design.active,fixedMask:design.fixedMask},domain,baselineMm:baseline,mode,controlColumns:poles,controlRows:poles,maxControlPoints:poles*poles,controlMaxMm:.6,acceptanceToleranceMm:.025};
}

test('rectangular fixed rim fits real control poles with an offset baseline and both operation directions',()=>{
 for(const mode of ['emboss','engrave']){
  const options=fixture({mode}),before=structuredClone(options),fit=fitMaskedReliefBSpline(options),sign=mode==='emboss'?1:-1;
  assert.deepEqual(options,before,'authored field and masks stay unchanged');
  assert.ok(sign*(sampleMaskedReliefBSpline(fit,.173,-.291)-options.baselineMm)>.1);
  for(const t of [-9.73,-3.619,.317,8.419]){
   assert.ok(Math.abs(sampleMaskedReliefBSpline(fit,t,-10)-.35)<1e-12);
   assert.ok(Math.abs(sampleMaskedReliefBSpline(fit,10,t)-.35)<1e-12);
  }
  assert.ok(fit.report.metrics.independent.count>1000);
  assert.equal(fit.report.deviationKind,'sampled-not-global');assert.equal(fit.report.brepComputed,false);
  for(let k=0;k<fit.lockedControlMask.length;k++)if(fit.lockedControlMask[k]){assert.equal(fit.controlHeightsMm[k],.35);assert.equal(Math.abs(fit.controlDeltasMm[k]),0);}
 }
});

test('circular support, hole and protected interior keep their continuous baseline at independent physical samples',()=>{
 const options=fixture({circle:true,poles:17,baseline:-.4,mode:'engrave'}),fit=fitMaskedReliefBSpline(options);
 assert.deepEqual(fit.domain,options.domain);assert.deepEqual(fit.sourceMasks.active,options.field.active);assert.deepEqual(fit.sourceMasks.fixedMask,options.field.fixedMask);
 for(const [cx,cy,r] of [[0,0,10],[5,0,.7]])for(let k=0;k<113;k++){
  const a=(k+.1237)*Math.PI*2/113;assert.ok(Math.abs(sampleMaskedReliefBSpline(fit,cx+r*Math.cos(a),cy+r*Math.sin(a))+.4)<1e-11);
 }
 for(let k=0;k<73;k++){const a=(k+.413)*Math.PI*2/73,r=.4*Math.sqrt((k+.137)/73);assert.ok(Math.abs(sampleMaskedReliefBSpline(fit,1+r*Math.cos(a),r*Math.sin(a))+.4)<1e-11);}
 assert.ok(sampleMaskedReliefBSpline(fit,-5.37,.137)<-.41,'unprotected interior is not erased to pass protection');
 assert.ok(fit.report.metrics.protection.count>150);assert.ok(fit.report.protectionCertificate.fixedCellCount>0);
});

test('fully fixed authored cells retain baseline continuously even without a named analytic zone',()=>{
 const options=fixture({poles:17}),f=options.field;
 for(let j=13;j<=16;j++)for(let i=25;i<=28;i++){const k=j*f.columns+i;f.fixedMask[k]=1;f.heightsMm[k]=options.baselineMm;}
 const fit=fitMaskedReliefBSpline(options);
 for(const x of [5.719,6.137,7.113])for(const y of [-1.713,-.871,-.219])assert.ok(Math.abs(sampleMaskedReliefBSpline(fit,x,y)-.35)<1e-11);
 assert.ok(fit.report.protectionCertificate.fixedCellCount>=9);
});

test('a declared rectangular protection zone retains baseline between nodes and conflicting authored content is refused',()=>{
 const options=fixture({poles:17});options.domain.protectedZones=[{kind:'rect',centerMm:[6,0],widthMm:1,heightMm:1.5}];
 const fit=fitMaskedReliefBSpline(options);
 for(const x of [5.617,6.113,6.419])for(const y of [-.613,.173,.719])assert.ok(Math.abs(sampleMaskedReliefBSpline(fit,x,y)-.35)<1e-11);
 const conflict=fixture({poles:17});conflict.domain.protectedZones=[{kind:'rect',centerMm:[0,0],widthMm:1,heightMm:1}];
 assert.throws(()=>fitMaskedReliefBSpline(conflict),{code:'FIT_CONSTRAINT_CONFLICT'});
});

test('no freedom, mode disagreement, nonbaseline protection and domain contradictions refuse explicitly',()=>{
 const coarse=fixture({poles:4});assert.throws(()=>fitMaskedReliefBSpline(coarse),{code:'FIT_NO_FREEDOM'});
 const direction=fixture();direction.mode='engrave';assert.throws(()=>fitMaskedReliefBSpline(direction),{code:'FIT_DIRECTION_CONFLICT'});
 const fixed=fixture();fixed.field.heightsMm[0]+=.01;assert.throws(()=>fitMaskedReliefBSpline(fixed),{code:'FIT_CONSTRAINT_CONFLICT'});
 const hole=fixture({circle:true,poles:17});hole.field.active[16*33+24]=1;assert.throws(()=>fitMaskedReliefBSpline(hole),{code:'FIT_DOMAIN_CONFLICT'});
});

test('independent deviation rejects a fit that cannot preserve the authored between-grid surface',()=>{
 const options=fixture();options.acceptanceToleranceMm=1e-6;
 assert.throws(()=>fitMaskedReliefBSpline(options),error=>error.code==='FIT_DEVIATION'&&error.details.metrics.independent.maxMm>options.acceptanceToleranceMm&&error.details.deviationKind==='sampled-not-global');
});

test('bounded iterations, total work and cancellation never return a partial success',()=>{
 assert.throws(()=>fitMaskedReliefBSpline({...fixture(),maxIterations:1,toleranceMm:1e-14}),{code:'FIT_NOT_CONVERGED'});
 assert.throws(()=>fitMaskedReliefBSpline({...fixture(),maxWork:100}),{code:'FIT_WORK_BUDGET'});
 let checks=0;assert.throws(()=>fitMaskedReliefBSpline({...fixture(),shouldCancel:()=>++checks>10}),{code:'FIT_CANCELLED'});
 const capacity=fixture();capacity.maxControlPoints=16;assert.throws(()=>fitMaskedReliefBSpline(capacity),{code:'FIT_CAPACITY'});
 const allFixed=fixture();allFixed.field.fixedMask.fill(1);allFixed.field.heightsMm.fill(.35);
 const baseline=fitMaskedReliefBSpline(allFixed);assert.ok(Math.abs(sampleMaskedReliefBSpline(baseline,.713,-.37)-.35)<1e-12);
});


test('candidate policy retains over-tolerance and iteration-limited fits with truthful warnings',()=>{
 const o={...fixture(),acceptanceToleranceMm:1e-6,deviationPolicy:'candidate'},fit=fitMaskedReliefBSpline(o);
 assert.equal(fit.report.status,'approximation-candidate');assert.equal(fit.report.withinTolerance,false);assert.ok(fit.report.warnings.includes('FIT_DEVIATION'));
 assert.ok(fit.controlDeltasMm.some(v=>v>0));assert.ok(fit.report.metrics.protection.maxMm<1e-12);
 const limited=fitMaskedReliefBSpline({...o,maxIterations:1,toleranceMm:1e-14});assert.equal(limited.report.converged,false);assert.ok(limited.report.warnings.includes('FIT_NOT_CONVERGED'));
 const invalid={...o,mode:'engrave'};assert.throws(()=>fitMaskedReliefBSpline(invalid),{code:'FIT_DIRECTION_CONFLICT'});
});

test('server control sampling accepts 129 poles without expanding local solving capacity',()=>{
 const fit={kind:'webcad-masked-baseline-bspline-v1',columns:129,rows:129,widthMm:20,heightMm:20,controlHeightsMm:new Float64Array(129*129).fill(.25)};
 assert.ok(Math.abs(sampleMaskedReliefBSpline(fit,0,0)-.25)<1e-12);
});
