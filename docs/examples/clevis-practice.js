// Self-designed demonstration dimensions (mm), not a customer reconstruction.
// Appends a four-piece clevis assembly. Does not export, save or clear the project.
const ref=id=>({$ref:id+'.createdBodyIds.0'});
const place=(origin,quaternion=[0,0,0,1])=>({version:1,frame:{kind:'snapshot',origin,quaternion},sourceAnchor:{kind:'model-origin'}});
const world={version:1,frame:{kind:'world'}},side=[0,Math.SQRT1_2,0,Math.SQRT1_2];
export const clevisPracticeSteps=[
 {id:'blank',method:'add',args:{op:'box',name:'叉架毛坯',refs:[],placement:place([0,0,0]),params:{width:60,depth:32,height:36}}},
 {id:'cavity',method:'add',args:{op:'box',name:'开口刀具',refs:[],placement:place([10,-2,6]),params:{width:40,depth:36,height:32}}},
 {id:'fork',method:'add',args:{op:'cut',name:'开口叉架',refs:[ref('blank'),ref('cavity')],params:{}}},
 {id:'crossBore',method:'add',args:{op:'holeWizard',name:'跨两耳贯穿轴孔',refs:[ref('fork')],placement:world,params:{kind:'plain',diameterMm:6,through:true,x:0,y:16,z:24,axis:'X',direction:1}}},
 {id:'bracket',method:'add',args:{op:'multiHole',name:'四安装孔叉架',refs:[ref('crossBore')],placement:world,params:{radius:2,depth:8,axis:'Z',direction:-1,points:[[15,6,7],[45,6,7],[15,26,7],[45,26,7]]}}},
 {id:'pin',method:'add',args:{op:'cylinder',name:'带径向间隙的销轴',refs:[],placement:place([-2,16,24],side),params:{radius:2.8,height:64}}},
 {id:'washerBlank',method:'add',args:{op:'cylinder',name:'垫片毛坯',refs:[],placement:place([-2,16,24],side),params:{radius:6,height:1.5}}},
 {id:'washer',method:'add',args:{op:'holeWizard',name:'左垫片',refs:[ref('washerBlank')],placement:world,params:{kind:'plain',diameterMm:6.2,through:true,x:-2,y:16,z:24,axis:'X',direction:1}}},
 {id:'washers',method:'add',args:{op:'linearPattern',name:'两侧垫片',refs:[ref('washer')],placement:world,params:{count:2,dx:62.5,dy:0,dz:0}}},
 {id:'bracketMeasure',method:'measure',args:{bodyId:ref('bracket')}},
 {id:'washerMeasure',method:'measure',args:{bodyId:ref('washers')}},
 {id:'pinFit',method:'inspectFit',args:{bodyAId:ref('bracket'),bodyBId:ref('pin')}},
 {id:'washerGap',method:'measureRelation',args:{mode:'shortest',first:{bodyId:ref('bracket'),kind:'body'},second:{bodyId:ref('washers'),kind:'body'}}},
 {id:'view',method:'setView',args:{direction:'iso',fit:true,display:'edges'}}
];
export async function runClevisPractice(api){
 const connection=api.connect({toolIds:['box','cut','holeWizard','multiHole','cylinder','linearPattern','measure','inspectFit','measureRelation','setView']});
 if(!connection.canExecute)throw new Error('Page blocked: '+connection.blockers.join(', '));
 const receipt=await api.run({context:connection.requestContext,idempotencyKey:crypto.randomUUID(),steps:clevisPracticeSteps});
 if(receipt.status!=='completed')return {status:receipt.status,receipt,saved:false,next:'Read current state and resume only unattempted steps; do not repeat the entire batch.'};
 const read=id=>receipt.results.find(step=>step.id===id).result;
 const bracket=read('bracketMeasure'),washers=read('washerMeasure'),fit=read('pinFit'),gap=read('washerGap');
 const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<1e-5;
 const checks={bracketVolume:near(bracket.volume,30720-276*Math.PI),bracketSize:[60,32,36].every((v,i)=>near(bracket.bounds.max[i]-bracket.bounds.min[i],v)),
  twoWashers:washers.solidCount===2&&near(washers.volume,79.17*Math.PI),pinClearance:fit.classification==='separated'&&near(fit.distanceMm,.2),washerClearance:near(gap.distanceMm,.5)};
 return {status:'completed',receipt,checks,verified:Object.values(checks).every(Boolean),state:api.getState(),saved:false,rendered:receipt.displayMatchesContext===true};
}
