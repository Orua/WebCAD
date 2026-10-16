import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {QUICK_MODELS,QUICK_MODEL_VISIBLE_KINDS} from '../src/quick-models.js';
import {QUICK_MODEL_PREVIEWS} from '../src/quick-models/preview-assets.js';
export async function verifyQuickModelPreviews(directory){
 if(!isDeepStrictEqual(Object.keys(QUICK_MODEL_PREVIEWS).sort(),[...QUICK_MODEL_VISIBLE_KINDS].sort()))throw Error('Quick-model preview coverage differs from the installed catalog');
 for(const kind of QUICK_MODEL_VISIBLE_KINDS){const asset=QUICK_MODEL_PREVIEWS[kind];if(!isDeepStrictEqual(asset.defaultParams,QUICK_MODELS[kind].defaults))throw Error(kind+': previews use stale defaults');for(const [key,hashKey]of [['image','imageSha256'],['guide','guideSha256']]){if(!/^quick-model-previews\/[a-zA-Z0-9-]+\.png$/.test(asset[key]))throw Error(kind+': invalid preview asset path');const bytes=await readFile(resolve(directory,asset[key]));if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||createHash('sha256').update(bytes).digest('hex')!==asset[hashKey])throw Error(kind+': preview image hash/signature mismatch');}if(kind==='threadedSleeve'&&asset.style!=='transparent-edges')throw Error('Threaded sleeve needs a transparent structural preview');}
 return QUICK_MODEL_VISIBLE_KINDS.length;
}
