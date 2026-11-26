const coordinate={type:'number',minimum:-10000,maximum:10000};
const vec=n=>({type:'array',items:coordinate,minItems:n,maxItems:n});
const samples={type:'integer',minimum:5,maximum:256};

export const surfaceFairingOperation={
  description:'曲面保形修顺 / Fair a source-bound Z displacement field and refit STEP faces and seams',refs:1,
  paramsSchema:{type:'object',additionalProperties:false,required:['smoothingMm','maxAdjustmentMm','protectedCenter','protectedRadiusMm','field'],properties:{
    smoothingMm:{type:'number',minimum:0.05,maximum:3,description:'XY Gaussian standard deviation in mm'},
    maxAdjustmentMm:{type:'number',minimum:0.005,maximum:2,description:'Upper limit on a sampled Z correction in mm'},
    protectedCenter:vec(2),protectedRadiusMm:{type:'number',minimum:0,maximum:1000},
    field:{type:'object',additionalProperties:false,required:['columns','rows','layers','minMm','maxMm','mmPerCount','offsetsI16le','sourceSha256'],properties:{
      columns:samples,rows:samples,layers:samples,minMm:vec(3),maxMm:vec(3),
      mmPerCount:{type:'number',minimum:0.000001,maximum:0.01},
      offsetsI16le:{type:'string',minLength:336,maxLength:2400000,pattern:'^[A-Za-z0-9+/]+={0,2}$',description:'Base64 of XYZ-major signed little-endian int16 Z offsets; X is contiguous'},
      sourceSha256:{type:'string',pattern:'^[a-f0-9]{64}$',description:'SHA-256 of the exact STEP input file'}
    }}
  }},
  notes:'选一个按原坐标直接导入的毫米制闭合 STEP 实体，提供与该文件字节绑定的原始 Z 高度位移场。先在 XY 平滑原位移，再反解源件高度并把差量拟合回原曲面、共边和顶点。保持 X/Y，首尾高度层、圆柱保护区及其边带逐渐过渡。支持范围内的非有理多项式样条，未拟合的机械圆柱必须通过几何核对。网格最多 900000 采样，拒绝位置交错、拟合失败和无效闭合。可预览、应用、撤销并从结果导出 STEP。'
};

const values=new Uint8Array(250);
values[2*(2*25+2*5+2)]=50;
export const surfaceFairingExample={smoothingMm:0.75,maxAdjustmentMm:0.75,protectedCenter:[0,0],protectedRadiusMm:0,
  field:{columns:5,rows:5,layers:5,minMm:[-2,-2,0],maxMm:[2,2,4],mmPerCount:0.001,
    offsetsI16le:btoa(String.fromCharCode(...values)),sourceSha256:'0'.repeat(64)}};
export const surfaceFairingErrors=['FAIRING_SOURCE_UNSUPPORTED','FAIRING_FIELD_INVALID','FAIRING_SOURCE_MISMATCH','FAIRING_FIT_FAILED','FAIRING_INVALID_SOLID','NO_CHANGE'];
