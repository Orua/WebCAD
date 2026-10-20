import { buildLegacyQuickModel } from '../legacy-geometry.js';
import {buildProfileJunction} from './junction.js';
import {buildSourceFreeJunction,buildSourceFixedJunction,buildRollingJunction} from './source-free.js';

// Replace this implementation to give sliderBuckle independent geometry.
export function build(params, cad, options, context) {
  if(params.jointStyle==='sourceFree')return buildSourceFreeJunction(params,cad);
  if(params.jointStyle==='sourceFixedR')return buildSourceFixedJunction(params,cad);
  if(params.jointStyle==='rollingBall')return buildRollingJunction(params,cad);
  const base=buildLegacyQuickModel({ ...params, kind: 'sliderBuckle' }, cad, options, context.definitions, context.buildNested);
  if(params.jointStyle===undefined||params.jointStyle==='intersection')return base;
  try{
    if(params.jointStyle!=='profileRound')throw new Error('未知日字扣接头方式');
    return buildProfileJunction(base,params,cad);
  }finally{base.delete();}
}
