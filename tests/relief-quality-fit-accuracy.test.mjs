// Photo/luminance quality fit accuracy: band-limit + auto edge-fade keep independent max error usable.
// Synthetic cliff-at-rim height field previously produced ~2 mm residuals (Codex photo-relief report);
// after buildTarget band-limit (~0.85×control spacing) and auto fade when keep+fade=0, expect ≪ 0.5 mm.
import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeHeightGrid} from '../src/relief-source/convert.js';
import {decodeQualitySource,buildQualityTarget,finestControlSpacing} from '../src/relief-design-core/quality-target.mjs';

function makeCliffField({columns=129,rows=129,rimHeight=1,innerHeight=0.3,edgePx=2}={}){
  const values=new Float32Array(columns*rows);
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
    const onRim=i<edgePx||j<edgePx||i>=columns-edgePx||j>=rows-edgePx;
    const hf=((i^j)&1)?0.15:0;
    values[j*columns+i]=onRim?rimHeight:innerHeight+hf;
  }
  return encodeHeightGrid({columns,rows,values});
}

test('buildQualityTarget auto-fades rim when keepout+fade are 0',()=>{
  const q={source:makeCliffField(),depthMm:2,edgeKeepoutMm:0,edgeFadeMm:0};
  const source=decodeQualitySource(q);
  const domain={support:{kind:'rect',centerMm:[0,0],widthMm:20,heightMm:20},throughHoles:[],protectedZones:[]};
  const t=buildQualityTarget({source,domain,widthMm:20,heightMm:20,baselineMm:0,upperMm:2,precisionMm:0.05,controlSpacingMm:0.5});
  const at=(x,y)=>{const i=Math.round((x+10)/t.pitchX),j=Math.round((y+10)/t.pitchY);return t.h[j*t.C+i];};
  const centre=at(0,0),near=at(9.5,0),corner=at(9.9,9.9);
  assert.ok(centre>0.4,'centre keeps volume: '+centre);
  assert.ok(near<centre*0.4,'near-rim faded below 40% of centre: '+near+' vs '+centre);
  assert.ok(corner<0.02,'corner near baseline: '+corner);
});

test('band-limit removes sub-control-spacing checker that a cubic net cannot fit',()=>{
  // Uniform interior checker (no rim cliff); keep/fade explicit so auto-fade does not dominate jumps.
  const q={source:makeCliffField({rimHeight:0.4,innerHeight:0.4,edgePx:0}),depthMm:1,edgeKeepoutMm:0.5,edgeFadeMm:1};
  const source=decodeQualitySource(q);
  const domain={support:{kind:'rect',centerMm:[0,0],widthMm:20,heightMm:20},throughHoles:[],protectedZones:[]};
  const t=buildQualityTarget({source,domain,widthMm:20,heightMm:20,baselineMm:0,upperMm:1,precisionMm:0.05,controlSpacingMm:0.5});
  // Interior only (exclude fade band ~1.5 mm from edge).
  let jump=0,samples=0;
  for(let j=1;j<t.R-1;j++)for(let i=1;i<t.C-1;i++){
    const x=i*t.pitchX-10,y=j*t.pitchY-10;
    if(Math.abs(x)>7||Math.abs(y)>7)continue;
    const k=j*t.C+i;if(!t.active[k]||!t.active[k-1])continue;
    jump=Math.max(jump,Math.abs(t.h[k]-t.h[k-1]));samples++;
  }
  assert.ok(samples>100,'interior samples '+samples);
  assert.ok(jump<0.05,'interior band-limited neighbour jump '+jump);
});

test('finestControlSpacing still derives from capacity/source/precision (unchanged contract)',()=>{
  assert.equal(finestControlSpacing({widthMm:60,heightMm:60,source:{columns:1025,rows:1025},precisionMm:0.05,maxControlSide:513}),60/(513-3));
});
