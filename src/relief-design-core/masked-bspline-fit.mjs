/**
 * Numerical only. Derived from the user-supplied Astra/Pro relief handoff's
 * bspline-fit.mjs (physical XY inversion / open-uniform basis / bounded fit).
 * The handoff README permits use as algorithm reference and regression baseline.
 * Original attribution is retained; masked fitting and support locks are new.
 * No CAD, route authorization, geometry commit, or general surface-freeze claim.
 */
// The product Worker owns elapsed-time cancellation. A caller may still supply
// an explicit work budget; an arbitrary global operation count must not reject
// otherwise supported adaptive fields before their time budget is used.
const LIMIT={side:129,samples:16641,poles:4225,controlSide:65,iterations:50000,work:Number.MAX_SAFE_INTEGER,regions:64};
const fail=(code,message,details={})=>{throw Object.assign(new Error(message),{code,details});};
const finite=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v))fail('FIT_INPUT_INVALID',label+' must be finite');return v;};
const integer=(v,label,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)fail('FIT_INPUT_INVALID',label+' is outside its integer capacity');return v;};
const array=v=>Array.isArray(v)||ArrayBuffer.isView(v)&&!(v instanceof DataView);
function keys(value,allowed,label){if(!value||typeof value!=='object'||Array.isArray(value))fail('FIT_INPUT_INVALID',label+' must be an object');for(const k of Object.keys(value))if(!allowed.includes(k))fail('FIT_INPUT_INVALID',label+'.'+k+' is unsupported');}
function positive(v,label,max){finite(v,label);if(v<=0||v>max)fail('FIT_INPUT_INVALID',label+' is outside its positive capacity');return v;}
function budget(options){let work=0;const max=integer(options.maxWork??LIMIT.work,'maxWork',1,LIMIT.work);return {charge(n){if(options.shouldCancel?.())fail('FIT_CANCELLED','Numerical fit cancelled');if(work+n>max)fail('FIT_WORK_BUDGET','Numerical total work budget reached',{work,nextWork:n,maxWork:max,retry:'none'});work+=n;},get work(){return work;},max};}

// Same degree, knot vector and linearly spaced XY poles as relief.js.
function maskedSplineBasis(count,t){
 const degree=Math.min(3,count-1),end=count-degree,u=t*end,span=u>=end?count-1:Math.floor(u)+degree;
 const knots=[...Array(degree+1).fill(0),...Array.from({length:end-1},(_,i)=>i+1),...Array(degree+1).fill(end)];
 const basis=[1],left=[],right=[];
 for(let j=1;j<=degree;j++){left[j]=u-knots[span+1-j];right[j]=knots[span+j]-u;let saved=0;for(let r=0;r<j;r++){const term=basis[r]/(right[r+1]+left[j-r]);basis[r]=saved+right[r+1]*term;saved=left[j-r]*term;}basis[j]=saved;}
 return basis.map((weight,k)=>({index:span-degree+k,weight}));
}
function axisCoordinate(n,t,span){return maskedSplineBasis(n,t).reduce((s,b)=>s+b.weight*(b.index/(n-1)-.5)*span,0);}
function atPhysical(n,x,span,work){
 if(x< -span/2||x>span/2)fail('FIT_PARAMETER_OUTSIDE','Physical position is outside the design field');
 work?.charge(54*(n+64));
 if(x===-span/2)return maskedSplineBasis(n,0);if(x===span/2)return maskedSplineBasis(n,1);
 let lo=0,hi=1;for(let i=0;i<54;i++){const mid=(lo+hi)/2;if(axisCoordinate(n,mid,span)<x)lo=mid;else hi=mid;}
 return maskedSplineBasis(n,(lo+hi)/2);
}
function axisSupports(n,span,work){
 const end=n-3,knots=[0,0,0,0,...Array.from({length:end-1},(_,i)=>i+1),end,end,end,end];
 work.charge(n*64);
 return Array.from({length:n},(_,i)=>[axisCoordinate(n,knots[i]/end,span),axisCoordinate(n,knots[i+4]/end,span)]);
}
function shape(s,label){
 keys(s,s?.kind==='circle'?['kind','centerMm','radiusMm']:['kind','centerMm','widthMm','heightMm'],label);
 if(!array(s.centerMm)||s.centerMm.length!==2)fail('FIT_INPUT_INVALID',label+' needs centerMm');
 const centerMm=Array.from(s.centerMm,v=>finite(v,label+'.centerMm'));
 if(centerMm.some(v=>Math.abs(v)>1000))fail('FIT_INPUT_INVALID','Region center exceeds numerical capacity');
 if(s.kind==='circle')return {kind:'circle',centerMm,radiusMm:positive(s.radiusMm,label+'.radiusMm',1000)};
 if(s.kind==='rect')return {kind:'rect',centerMm,widthMm:positive(s.widthMm,label+'.widthMm',1000),heightMm:positive(s.heightMm,label+'.heightMm',1000)};
 fail('FIT_DOMAIN_UNSUPPORTED','Only explicit circle/rect domains are supported');
}
function contains(s,x,y){const dx=Math.abs(x-s.centerMm[0]),dy=Math.abs(y-s.centerMm[1]);return s.kind==='circle'?Math.hypot(dx,dy)<=s.radiusMm:dx<=s.widthMm/2&&dy<=s.heightMm/2;}
// Conservative interval intersection. The roundoff pad expands locks only;
// it never shrinks declared protection or changes the authored domain.
function intersects(s,box,boundary){
 const [a,b,c,d]=box,[x,y]=s.centerMm,e=1e-10*Math.max(1,Math.abs(a),Math.abs(b),Math.abs(c),Math.abs(d),Math.abs(x),Math.abs(y));
 if(s.kind==='circle'){
  const near=Math.hypot(Math.max(a-x,0,x-c),Math.max(b-y,0,y-d));
  const far=Math.hypot(Math.max(Math.abs(a-x),Math.abs(c-x)),Math.max(Math.abs(b-y),Math.abs(d-y)));
  return near<=s.radiusMm+e&&(!boundary||far+e>=s.radiusMm);
 }
 const l=x-s.widthMm/2,r=x+s.widthMm/2,lo=y-s.heightMm/2,hi=y+s.heightMm/2;
 if(a>r+e||c<l-e||b>hi+e||d<lo-e)return false;
 return !boundary||a<=l+e||c>=r-e||b<=lo+e||d>=hi-e;
}
function valueAt(poles,nx,bx,by){let z=0;for(const y of by)for(const x of bx)z+=poles[y.index*nx+x.index]*x.weight*y.weight;return z;}
function metric(){return {count:0,maxMm:0,sumSquaredMm:0,worst:null};}
function add(m,actual,expected,xMm,yMm){const e=Math.abs(actual-expected);m.count++;m.sumSquaredMm+=e*e;if(e>m.maxMm){m.maxMm=e;m.worst={xMm,yMm,actualMm:actual,expectedMm:expected};}}
function finish(m){return {count:m.count,maxMm:m.maxMm,rmsMm:m.count?Math.sqrt(m.sumSquaredMm/m.count):0,worst:m.worst};}

/**
 * field: current authored mm field + unchanged active/fixedMask, row zero -Y.
 * domain: support, throughHoles, protectedZones (same local XY as field).
 * baselineMm: explicit constant authored baseline; mode applies to h-baseline.
 * The result retains absolute controls and signed deltas separately. It is NOT
 * an executable relief params fragment: baseline/support binding is still needed.
 */
export function fitMaskedReliefBSpline(options){
 keys(options,['field','domain','baselineMm','controlColumns','controlRows','mode','maxControlPoints','controlMaxMm','maxIterations','maxWork','toleranceMm','acceptanceToleranceMm','deviationPolicy','shouldCancel'],'options');
 if(options.shouldCancel!==undefined&&typeof options.shouldCancel!=='function')fail('FIT_INPUT_INVALID','shouldCancel must be a function');
 const deviationPolicy=options.deviationPolicy??'strict';if(!['strict','candidate'].includes(deviationPolicy))fail('FIT_INPUT_INVALID','Unknown deviationPolicy');
 const candidate=deviationPolicy==='candidate';
 const work=budget(options);work.charge(1);
 const f=options.field;keys(f,['columns','rows','widthMm','heightMm','heightsMm','active','fixedMask'],'field');
 const columns=integer(f.columns,'field.columns',2,LIMIT.side),rows=integer(f.rows,'field.rows',2,LIMIT.side),count=columns*rows;
 if(count>LIMIT.samples)fail('FIT_CAPACITY','Too many authored samples');
 const widthMm=positive(f.widthMm,'widthMm',1000),heightMm=positive(f.heightMm,'heightMm',1000),baselineMm=finite(options.baselineMm,'baselineMm');
 if(Math.abs(baselineMm)>100)fail('FIT_INPUT_INVALID','baselineMm exceeds authored height capacity');
 const nx=integer(options.controlColumns,'controlColumns',4,LIMIT.controlSide),ny=integer(options.controlRows,'controlRows',4,LIMIT.controlSide),n=nx*ny;
 if(n>integer(options.maxControlPoints,'maxControlPoints',16,LIMIT.poles))fail('FIT_CAPACITY','Explicit pole capacity exceeded',{automaticResize:false});
 if(nx>columns||ny>rows)fail('FIT_UNDERSAMPLED','Authored grid must not be smaller than the control net');
 if(!['emboss','engrave'].includes(options.mode))fail('FIT_INPUT_INVALID','Explicit emboss/engrave mode is required');
 const sign=options.mode==='emboss'?1:-1,heights=new Float64Array(count),active=new Uint8Array(count),fixed=new Uint8Array(count);
 for(const key of ['heightsMm','active','fixedMask'])if(!array(f[key])||f[key].length!==count)fail('FIT_INPUT_INVALID','field.'+key+' has the wrong length');
 let maximum=0,activeCount=0;
 work.charge(count*8);
 for(let k=0;k<count;k++){
  heights[k]=finite(f.heightsMm[k],'authored height');
  for(const key of ['active','fixedMask'])if(f[key][k]!==0&&f[key][k]!==1)fail('FIT_INPUT_INVALID','Masks must contain 0/1');
  active[k]=f.active[k];fixed[k]=f.fixedMask[k];
  if(fixed[k]&&heights[k]!==baselineMm)fail('FIT_CONSTRAINT_CONFLICT','Only the declared constant baseline can be protected',{index:k});
  if(!active[k])continue;
  activeCount++;const delta=(heights[k]-baselineMm)*sign;
  if(delta<0)fail('FIT_DIRECTION_CONFLICT','Authored height relative to baseline conflicts with mode',{index:k});
  maximum=Math.max(maximum,delta);
 }
 if(!activeCount)fail('FIT_DOMAIN_EMPTY','No active authored samples');
 const envelope=options.controlMaxMm??maximum;
 finite(envelope,'controlMaxMm');if(envelope<maximum||envelope<0||envelope>20)fail('FIT_INPUT_INVALID','Control envelope must cover signed delta magnitudes and remain <=20 mm');
 const maxIterations=integer(options.maxIterations??12000,'maxIterations',1,LIMIT.iterations),tolerance=positive(options.toleranceMm??1e-9,'toleranceMm',1),acceptance=positive(options.acceptanceToleranceMm,'acceptanceToleranceMm',20);
 keys(options.domain,['support','throughHoles','protectedZones'],'domain');
 const support=shape(options.domain.support,'support');
 const regions=key=>{const a=options.domain[key]??[];if(!Array.isArray(a)||a.length>LIMIT.regions)fail('FIT_INPUT_INVALID','Too many '+key);return a.map((s,i)=>shape(s,key+'['+i+']'));};
 const throughHoles=regions('throughHoles'),protectedZones=regions('protectedZones');
 if(throughHoles.length+protectedZones.length>LIMIT.regions)fail('FIT_CAPACITY','Too many protection regions');
 const xs=Array.from({length:columns},(_,i)=>(i/(columns-1)-.5)*widthMm),ys=Array.from({length:rows},(_,j)=>(j/(rows-1)-.5)*heightMm);
 const bx=xs.map(x=>atPhysical(nx,x,widthMm,work)),by=ys.map(y=>atPhysical(ny,y,heightMm,work));
 const sx=axisSupports(nx,widthMm,work),sy=axisSupports(ny,heightMm,work),locked=new Uint8Array(n);
 // All support-boundary and hole-boundary influence poles stay at baseline.
 // Every protected-domain influence pole is locked over the full region.
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  work.charge((2+throughHoles.length+protectedZones.length)*16);
  const box=[sx[i][0],sy[j][0],sx[i][1],sy[j][1]];
  if(intersects(support,box,true)||throughHoles.some(s=>intersects(s,box,true))||protectedZones.some(s=>intersects(s,box,false)))locked[j*nx+i]=1;
 }
 const samples=[],columnSum=new Float64Array(n);
 for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
  const k=j*columns+i;if(!active[k])continue;
  work.charge((throughHoles.length+protectedZones.length+1)*8+32);
  if(!contains(support,xs[i],ys[j])||throughHoles.some(s=>contains(s,xs[i],ys[j])))fail('FIT_DOMAIN_CONFLICT','Active sample contradicts declared support/hole',{index:k});
  if(protectedZones.some(s=>contains(s,xs[i],ys[j]))&&heights[k]!==baselineMm)fail('FIT_CONSTRAINT_CONFLICT','Protected domain must retain the authored baseline',{index:k});
  const ids=[],weights=[];
  for(const y of by[j])for(const x of bx[i]){const id=y.index*nx+x.index,w=x.weight*y.weight;ids.push(id);weights.push(w);columnSum[id]+=w;if(fixed[k]&&w>0)locked[id]=1;}
  samples.push({ids,weights,target:(heights[k]-baselineMm)*sign,x:xs[i],y:ys[j]});
 }
 // Retain every whole baseline cell promised by the original fixedMask's
 // bilinear semantics, even when it was not described by an analytic zone.
 let fixedCellCount=0;
 for(let j=0;j<rows-1;j++)for(let i=0;i<columns-1;i++){
  const k=j*columns+i;if(![k,k+1,k+columns,k+columns+1].every(id=>active[id]&&fixed[id]))continue;
  fixedCellCount++;work.charge(nx+ny+n);const guard=1e-10*Math.max(1,widthMm,heightMm);
  for(let y=0;y<ny;y++)if(sy[y][0]<=ys[j+1]+guard&&sy[y][1]>=ys[j]-guard)for(let x=0;x<nx;x++)if(sx[x][0]<=xs[i+1]+guard&&sx[x][1]>=xs[i]-guard)locked[y*nx+x]=1;
 }
 for(let k=0;k<n;k++)if(columnSum[k]===0)locked[k]=1;
 const free=n-locked.reduce((s,v)=>s+v,0);
 if(!free&&maximum>0)fail('FIT_NO_FREEDOM','Protection leaves no free observed control poles',{controlPoints:n,lockedControlPoints:n,retry:'none'});
 for(const s of samples)if(!candidate&&s.target>acceptance&&s.ids.every((k,i)=>locked[k]||s.weights[i]===0)){const spacing=Math.max(widthMm/Math.max(1,nx-3),heightMm/Math.max(1,ny-3));fail('FIT_CONSTRAINT_CONFLICT','Requested relief lies entirely in locked basis support',{xMm:s.x,yMm:s.y,controlSpacingMm:spacing,suggestedMarginMm:2*spacing,retry:'none'});}
 const L=Math.max(1,...columnSum),project=(v,k)=>locked[k]?0:Math.max(0,Math.min(envelope,v));
 const gradient=values=>{
  work.charge(samples.length*32+n);
  const out=new Float64Array(n);
  for(const s of samples){let z=0;for(let t=0;t<s.ids.length;t++)z+=values[s.ids[t]]*s.weights[t];const r=z-s.target;for(let t=0;t<s.ids.length;t++)out[s.ids[t]]+=r*s.weights[t];}
  return out;
 };
 let c=new Float64Array(n),accelerated=c.slice(),momentum=1,residual=Infinity,iterations=0;
 for(;iterations<maxIterations;iterations++){
  const g=gradient(accelerated),next=Float64Array.from(accelerated,(v,k)=>project(v-g[k]/L,k)),check=gradient(next);
  work.charge(n*8);residual=0;for(let k=0;k<n;k++)residual=Math.max(residual,Math.abs(next[k]-project(next[k]-check[k]/L,k)));
  if(residual<=tolerance){c=next;iterations++;break;}
  const m=(1+Math.sqrt(1+4*momentum*momentum))/2;
  accelerated=Float64Array.from(next,(v,k)=>v+(momentum-1)/m*(v-c[k]));c=next;momentum=m;
 }
 if(!candidate&&residual>tolerance)fail('FIT_NOT_CONVERGED','Projected residual did not converge',{iterations,projectedResidualMm:residual,estimatedWork:work.work,retry:'none'});
 const deltas=Float64Array.from(c,v=>v*sign),poles=Float64Array.from(deltas,v=>baselineMm+v),training=metric(),independent=metric(),protection=metric();
 const xCache=new Map(xs.map((x,i)=>[x,bx[i]])),yCache=new Map(ys.map((y,j)=>[y,by[j]]));
 const axis=(cache,n,x,span)=>{if(!cache.has(x))cache.set(x,atPhysical(n,x,span,work));return cache.get(x);};
 const sample=(x,y)=>{work.charge(32);return valueAt(poles,nx,axis(xCache,nx,x,widthMm),axis(yCache,ny,y,heightMm));};
 for(const s of samples)add(training,sample(s.x,s.y),baselineMm+sign*s.target,s.x,s.y);
 // Two off-grid positions per axis in every fully retained authored cell.
 const fractions=[.2113248654051871,.7886751345948129];
 for(let j=0;j<rows-1;j++)for(let i=0;i<columns-1;i++){
  const k=j*columns+i;if(![k,k+1,k+columns,k+columns+1].every(id=>active[id]))continue;
  for(const u of fractions)for(const v of fractions){
   const x=xs[i]+u*(xs[i+1]-xs[i]),y=ys[j]+v*(ys[j+1]-ys[j]);
   const expected=(1-v)*((1-u)*heights[k]+u*heights[k+1])+v*((1-u)*heights[k+columns]+u*heights[k+columns+1]);
   const actual=sample(x,y);add(independent,actual,expected,x,y);
   if([k,k+1,k+columns,k+columns+1].every(id=>fixed[id]))add(protection,actual,baselineMm,x,y);
  }
 }
 // Independent physical boundary and region-interior checks supplement the
 // continuous coefficient-support certificate; they do not replace its proof.
 const inspect=(x,y)=>{if(x>=-widthMm/2&&x<=widthMm/2&&y>=-heightMm/2&&y<=heightMm/2)add(protection,sample(x,y),baselineMm,x,y);};
 for(const s of [support,...throughHoles,...protectedZones]){
  const [x,y]=s.centerMm;
  if(s.kind==='circle')for(let k=0;k<67;k++){const t=2*Math.PI*(k+.371)/67;inspect(x+s.radiusMm*Math.cos(t),y+s.radiusMm*Math.sin(t));}
  else for(let k=0;k<67;k++){const t=(k+.371)/67;inspect(x-s.widthMm/2+t*s.widthMm,y-s.heightMm/2);inspect(x-s.widthMm/2+t*s.widthMm,y+s.heightMm/2);inspect(x-s.widthMm/2,y-s.heightMm/2+t*s.heightMm);inspect(x+s.widthMm/2,y-s.heightMm/2+t*s.heightMm);}
  if(protectedZones.includes(s))for(const u of [.173,.431,.793])for(const v of [.219,.617,.887]){
   const px=x+(u-.5)*(s.kind==='circle'?s.radiusMm*2:s.widthMm),py=y+(v-.5)*(s.kind==='circle'?s.radiusMm*2:s.heightMm);if(contains(s,px,py))inspect(px,py);
  }
 }
 const metrics={training:finish(training),independent:finish(independent),protection:finish(protection)},protectionRoundoffMm=1e-10*Math.max(1,Math.abs(baselineMm));
 if(protection.maxMm>protectionRoundoffMm)fail('FIT_PROTECTION_FAILED','Independent protection samples do not retain baseline',{metrics,retry:'none'});
 const withinTolerance=Math.max(training.maxMm,independent.maxMm)<=acceptance,converged=residual<=tolerance;
 if(!candidate&&!withinTolerance)fail('FIT_DEVIATION','Fit exceeds explicitly accepted sampled deviation',{metrics,acceptanceToleranceMm:acceptance,deviationKind:'sampled-not-global',retry:'none'});
 return {kind:'webcad-masked-baseline-bspline-v1',columns:nx,rows:ny,widthMm,heightMm,baselineMm,mode:options.mode,controlHeightsMm:poles,controlDeltasMm:deltas,
  domain:{support,throughHoles,protectedZones},sourceMasks:{active,fixedMask:fixed},lockedControlMask:locked,
  report:{status:withinTolerance&&converged?'numerically-accepted':'approximation-candidate',deviationPolicy,withinTolerance,converged,warnings:[...(!withinTolerance?['FIT_DEVIATION']:[]),...(!converged?['FIT_NOT_CONVERGED']:[])],method:'masked-bounded-accelerated-projected-gradient',iterations,projectedResidualMm:residual,solverToleranceMm:tolerance,estimatedWork:work.work,maxWork:work.max,
   controlPoints:n,freeControlPoints:free,lockedControlPoints:n-free,controlEnvelopeDeltaMm:options.mode==='emboss'?[0,envelope]:[-envelope,0],acceptanceToleranceMm:acceptance,metrics,
   protectionCertificate:{kind:'all-intersecting-basis-supports-locked-to-constant-baseline',continuousDomains:['declared-support-boundary','declared-hole-boundaries','declared-protected-zones','fully-fixed-authored-cells'],fixedCellCount,fixedNodeGuarantee:'baseline-at-active-fixed-nodes',roundoffCheckMm:protectionRoundoffMm},
   deviationKind:'sampled-not-global',reference:'bilinear-authored-field-on-fully-active-cells',automaticResize:false,brepComputed:false,commitState:'notCommitted',needsGeometryValidation:true,routePreflightRequired:true,
   unsupportedGuarantees:['through-hole-BRep-topology','freeze-arbitrary-existing-surface','global-approximation-error','manufacturability'],baselineSupportBindingRequired:true}};
}

export function sampleMaskedReliefBSpline(fit,xMm,yMm){
 if(fit?.kind!=='webcad-masked-baseline-bspline-v1')fail('FIT_INPUT_INVALID','Expected a masked baseline numerical fit');
 integer(fit.columns,'fit.columns',4,129);integer(fit.rows,'fit.rows',4,129);
 positive(fit.widthMm,'fit.widthMm',1000);positive(fit.heightMm,'fit.heightMm',1000);
 if(!array(fit.controlHeightsMm)||fit.controlHeightsMm.length!==fit.columns*fit.rows)fail('FIT_INPUT_INVALID','Invalid fitted controls');
 for(const value of fit.controlHeightsMm)finite(value,'control height');
 finite(xMm,'xMm');finite(yMm,'yMm');
 return valueAt(fit.controlHeightsMm,fit.columns,atPhysical(fit.columns,xMm,fit.widthMm),atPhysical(fit.rows,yMm,fit.heightMm));
}
