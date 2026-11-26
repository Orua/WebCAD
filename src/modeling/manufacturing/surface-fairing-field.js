const MAX_FIELD_NODES = 900000;
const fail = message => { throw Object.assign(new Error(message), {code:'FAIRING_FIELD_INVALID'}); };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smooth = x => { const t=clamp(x,0,1);return t*t*t*(10+t*(-15+6*t)); };

function readField(field) {
  const size=[field.columns,field.rows,field.layers], count=size.reduce((a,n)=>a*n,1);
  if(size.some(n=>!Number.isInteger(n)||n<5)||count>MAX_FIELD_NODES)fail('高度位移场的网格尺寸超出容量');
  const step=size.map((n,i)=>(field.maxMm[i]-field.minMm[i])/(n-1));
  if(step.some(d=>!(d>0)))fail('高度位移场的范围必须递增');
  const binary=atob(field.offsetsI16le);
  if(binary.length!==count*2)fail('高度位移场的字节数与网格尺寸不一致');
  const raw=new Float64Array(count), layer=size[0]*size[1];
  let minSlope=Infinity;
  for(let i=0;i<count;i++){
    const u=binary.charCodeAt(2*i)|binary.charCodeAt(2*i+1)<<8;
    raw[i]=((u<<16)>>16)*field.mmPerCount;
    if((i<layer||i>=count-layer)&&raw[i]!==0)fail('高度位移场两端必须是零位移');
    if(i>=layer)minSlope=Math.min(minSlope,1+(raw[i]-raw[i-layer])/step[2]);
  }
  if(minSlope<=0.04)fail('高度位移场的 Z 次序发生交错');
  return {raw,size,step,minSlope};
}

const mirror = (i,n) => { const m=(i%(2*n-2)+2*n-2)%(2*n-2);return m<n?m:2*n-2-m; };

function lines(size,axis,visit) {
  const [nx,ny,nz]=size, n=size[axis];
  if(axis===0){ for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)visit((z*ny+y)*nx,1,n); }
  if(axis===1){ for(let z=0;z<nz;z++)for(let x=0;x<nx;x++)visit(z*ny*nx+x,nx,n); }
  if(axis===2){ for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)visit(y*nx+x,nx*ny,n); }
}

function gaussianXY(raw,size,step,smoothingMm) {
  return [0,1].reduce((values,axis)=>{
    const sigma=smoothingMm/step[axis], radius=Math.ceil(4*sigma);
    if(radius>128)fail('修顺半径相对于采样网格过大');
    const weights=Array.from({length:2*radius+1},(_,i)=>Math.exp(-0.5*((i-radius)/sigma)**2));
    const sum=weights.reduce((a,b)=>a+b,0), result=new Float64Array(raw.length);
    lines(size,axis,(base,stride,n)=>{
      for(let i=0;i<n;i++){
        let value=0;
        for(let j=-radius;j<=radius;j++)value+=weights[j+radius]*values[base+mirror(i+j,n)*stride];
        result[base+i*stride]=value/sum;
      }
    });
    return result;
  },raw);
}

// Cardinal cubic interpolation, with reflected end conditions on each axis.
function splineCoefficients(values,size) {
  const result=values.slice();
  for(let axis=0;axis<3;axis++){
    const scratch=new Float64Array(size[axis]), upper=new Float64Array(size[axis]), denom=new Float64Array(size[axis]);
    const n=size[axis];denom[0]=4;upper[0]=0.5;
    for(let i=1;i<n;i++){
      denom[i]=4-(i===n-1?2:1)*upper[i-1];upper[i]=1/denom[i];
    }
    lines(size,axis,(base,stride)=>{
      scratch[0]=6*result[base]/denom[0];
      for(let i=1;i<n;i++)scratch[i]=(6*result[base+i*stride]-(i===n-1?2:1)*scratch[i-1])/denom[i];
      result[base+(n-1)*stride]=scratch[n-1];
      for(let i=n-2;i>=0;i--){scratch[i]-=upper[i]*scratch[i+1];result[base+i*stride]=scratch[i];}
    });
  }
  return result;
}

function cubic(t) {
  const q=1-t, b=t*t, c=b*t;
  return [q*q*q/6,(4-6*b+3*c)/6,(1+3*t+3*b-3*c)/6,c/6];
}

function sampler(values,size,min,step) {
  const [nx,ny,nz]=size;
  return (x,y)=>{
    const u=(x-min[0])/step[0], v=(y-min[1])/step[1], iu=Math.floor(u), iv=Math.floor(v);
    const wu=cubic(u-iu), wv=cubic(v-iv), indices=[], weights=[];
    for(let j=0;j<4;j++)for(let i=0;i<4;i++){
      indices.push(mirror(iv+j-1,ny)*nx+mirror(iu+i-1,nx));weights.push(wv[j]*wu[i]);
    }
    return z=>{
      const w=(z-min[2])/step[2], iw=Math.floor(w), wz=cubic(w-iw);
      let out=0;
      for(let k=0;k<4;k++){
        const index=mirror(iw+k-1,nz)*nx*ny;
        let slab=0;
        for(let q=0;q<16;q++)slab+=values[index+indices[q]]*weights[q];
        out+=slab*wz[k];
      }
      return out;
    };
  };
}

export function makeSurfaceFairingField(params) {
  const {field,smoothingMm,maxAdjustmentMm,protectedRadiusMm,protectedCenter}=params;
  const {raw,size,step,minSlope}=readField(field), min=field.minMm,max=field.maxMm;
  const filtered=gaussianXY(raw,size,step,smoothingMm);
  const original=sampler(splineCoefficients(raw,size),size,min,step);
  const fair=sampler(splineCoefficients(filtered,size),size,min,step);
  const stats={minSampledVerticalScale:minSlope,maxAdjustmentMm:0};
  const shift=(x,y,z)=>{
    if(x<=min[0]||x>=max[0]||y<=min[1]||y>=max[1]||z<=min[2]||z>=max[2])return 0;
    const r=Math.hypot(x-protectedCenter[0],y-protectedCenter[1]);
    const guard=smooth((r-protectedRadiusMm)/1)*smooth(Math.min(x-min[0],max[0]-x,y-min[1],max[1]-y)/smoothingMm);
    if(guard===0)return 0;
    const sample=original(x,y);
    let lo=min[2],hi=max[2],base=z,residual=Infinity;
    for(let i=0;i<23;i++){
      residual=base+sample(base)-z;
      if(Math.abs(residual)<2e-8)break;
      if(residual>0)hi=base;else lo=base;
      const dz=0.002, a=Math.max(min[2],base-dz), b=Math.min(max[2],base+dz);
      const slope=1+(sample(b)-sample(a))/(b-a), next=base-residual/slope;
      base=slope>0.03&&next>lo&&next<hi?next:(lo+hi)/2;
    }
    if(Math.abs(residual)>3e-6)fail('不能反解源件当前高度');
    const correction=(fair(x,y)(base)-sample(base))*guard*smooth((base-min[2])/0.45)*smooth((max[2]-base)/0.45);
    if(Math.abs(correction)>maxAdjustmentMm)fail('修顺超过允许的最大高度改变量');
    stats.maxAdjustmentMm=Math.max(stats.maxAdjustmentMm,Math.abs(correction));
    return correction;
  };
  return {shift,stats};
}
