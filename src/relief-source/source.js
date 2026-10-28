// Relief height source record: original image identity + conversion settings + (for photos) the
// user's explicit confirmation that the converted result is their own authored height map.
import {normalizeConvertSettings,decodeHeightGrid,RELIEF_CONVERT_LIMITS,PHOTO_RELIEF_VERSION} from './convert.js';
import {contractHash} from '../contracts/operation-schema.js';
import {assertReliefHeightSourceIntent,PHOTO_HEIGHTMAP_CONFIRMATION} from '../machining-intent.js';
export {PHOTO_HEIGHTMAP_CONFIRMATION};
const fail=(code,message,path)=>{throw Object.assign(new Error(message),{code,...(path?{path}:{})});};
const HEX=/^[a-f0-9]{64}$/;
/** interpretation: 'authoredHeightMap' | 'shadedReference' (photo).
 *  shadedReference + settings.mode=photoRelief → derivedFrom.kind photoRelief (no checkbox).
 *  shadedReference + luminance → still needs confirmation {text,confirmedAt}. */
export function createReliefHeightSource({original,interpretation,settings,grid,confirmation}={}){
 if(!original||!HEX.test(original.sha256??'')||typeof original.name!=='string'||!original.name||original.name.length>255)fail('PARAM_SCHEMA_INVALID','需要原图 {sha256,name}','original');
 const s=normalizeConvertSettings(settings),settingsHash=contractHash(s);
 if(!grid||grid.columns!==s.columns||grid.rows!==s.rows)fail('PARAM_SCHEMA_INVALID','高度网格尺寸与转换设置不符','grid');
 decodeHeightGrid(grid);
 let derivedFrom;
 if(interpretation==='shadedReference'){
  if(s.mode==='photoRelief'){
   if(confirmation!==undefined)fail('PARAM_SCHEMA_INVALID','照片浮雕转换不需要旧确认勾选','confirmation');
   derivedFrom={kind:'photoRelief',sourceSha256:original.sha256,settingsHash,photoReliefVersion:PHOTO_RELIEF_VERSION};
  }else{
   if(!confirmation||confirmation.text!==PHOTO_HEIGHTMAP_CONFIRMATION)fail('MACHINING_SOURCE_CONFLICT',`照片（光影参考）只有在用户勾选“${PHOTO_HEIGHTMAP_CONFIRMATION}”后才能作为高度图使用，或改用照片浮雕模式`,'confirmation');
   const at=confirmation.confirmedAt;if(typeof at!=='string'||Number.isNaN(Date.parse(at)))fail('PARAM_SCHEMA_INVALID','确认需要 ISO 时间 confirmedAt','confirmation.confirmedAt');
   derivedFrom={kind:'shadedReference',sourceSha256:original.sha256,settingsHash,confirmation:{text:PHOTO_HEIGHTMAP_CONFIRMATION,confirmedAt:at}};
  }
 }else if(interpretation!=='authoredHeightMap')fail('MACHINING_SOURCE_CONFLICT','浮雕高度来源只接受作者高度图、照片浮雕转换，或经用户确认的光影参考','interpretation');
 else if(confirmation!==undefined)fail('PARAM_SCHEMA_INVALID','作者高度图不需要照片确认','confirmation');
 return validateReliefHeightSource({version:1,interpretation:'authoredHeightMap',original:{sha256:original.sha256,name:original.name},settings:s,settingsHash,grid:{columns:grid.columns,rows:grid.rows,encoding:grid.encoding,data:grid.data,sha256:grid.sha256},...(derivedFrom?{derivedFrom}:{})});
}
export function validateReliefHeightSource(r,path='heightSource.source'){
 const keys=['version','interpretation','original','settings','settingsHash','grid','derivedFrom'];
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!keys.includes(k)))fail('PARAM_SCHEMA_INVALID','高度来源记录字段无效',path);
 if(r.version!==1)fail('PARAM_SCHEMA_INVALID','高度来源记录需要 version:1',path+'.version');
 if(!r.original||!HEX.test(r.original.sha256??'')||typeof r.original.name!=='string'||Object.keys(r.original).some(k=>!['sha256','name'].includes(k)))fail('PARAM_SCHEMA_INVALID','原图身份无效',path+'.original');
 const s=normalizeConvertSettings(r.settings);
 if(contractHash(s)!==r.settingsHash||JSON.stringify(s)!==JSON.stringify(r.settings))fail('MACHINING_SOURCE_CONFLICT','转换设置与其哈希不符',path+'.settingsHash');
 if(!r.grid||r.grid.columns!==s.columns||r.grid.rows!==s.rows||Object.keys(r.grid).some(k=>!['columns','rows','encoding','data','sha256'].includes(k))||!HEX.test(r.grid.sha256??''))fail('PARAM_SCHEMA_INVALID','高度网格记录无效',path+'.grid');
 if(r.grid.columns>RELIEF_CONVERT_LIMITS.maxSide||r.grid.rows>RELIEF_CONVERT_LIMITS.maxSide)fail('RELIEF_LIMIT','高度网格超过 2049',path+'.grid');
 assertReliefHeightSourceIntent(r);
 return r;
}
