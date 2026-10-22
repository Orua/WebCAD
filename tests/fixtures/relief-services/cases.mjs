// Shared golden cases: the authored draft is solved by the browser modules, then the SAME numeric
// input goes to the native worker (relief.design-fit-brep-1) and to the browser fit.
import {solveReliefDesign} from '../../../src/relief-design-field.js';
import {validateReliefDesign} from '../../../src/relief-design-drafts.js';
import {designFitWorkerParams} from '../../../src/services/relief-pipeline.js';
const SHAPES={box:{support:{kind:'rect',centerMm:[0,0],widthMm:30,heightMm:30},holes:[],source:'box.brep',top:20,point:[0,0,20]},
 disc:{support:{kind:'circle',centerMm:[0,0],radiusMm:15},holes:[{kind:'circle',centerMm:[8,0],radiusMm:3}],source:'disc.brep',top:10,point:[-5,0,10]},
 boxc:{support:{kind:'circle',centerMm:[0,0],radiusMm:12},holes:[],source:'box.brep',top:20,point:[0,0,20]}};
export function designCase(name,{n=33,controls=33,precision=.05}={}){
 const S=SHAPES[name];
 const draft=validateReliefDesign({schemaVersion:1,name:'golden-'+name,support:S.support,throughHoles:S.holes,protectedZones:[],heightRangeMm:[0,1.5],points:[],fieldSettings:{columns:n,rows:n,toleranceMm:.0001,machiningPrecisionMm:precision,edits:[{mode:'raise',centerMm:[-4,2],radiusMm:5,amountMm:1.2,strength:1},{mode:'raise',centerMm:[3,-6],radiusMm:2.5,amountMm:.6,strength:1}]}});
 const solved=solveReliefDesign(draft),fitOptions={mode:'emboss',controlColumns:controls,controlRows:controls,controlMaxMm:1.5,acceptanceToleranceMm:.1,maxIterations:50000};
 const {params}=designFitWorkerParams({draft,solved,fitOptions,placement:{originMm:[0,0,S.top],xDirection:[1,0,0]},faceIntent:{kind:'planar-face-geometric-intent',point:S.point,normal:[0,0,1]}});
 return {draft,solved,fitOptions,params,source:S.source,shape:S};
}
