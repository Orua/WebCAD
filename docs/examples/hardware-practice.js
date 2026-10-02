// Arbitrary demonstration dimensions in mm; no customer reconstruction or exports.
// Run only in an authorized modeling session; appends parts to the current project.
const ref=id=>({$ref:id+'.createdBodyIds.0'});
const place=(origin,quaternion=[0,0,0,1])=>({version:1,frame:{kind:'snapshot',origin,quaternion},sourceAnchor:{kind:'model-origin'}});
const world={version:1,frame:{kind:'world'}};
const poly=points=>({profileVersion:1,entities:points.map((p,i)=>({id:'edge'+i,type:'line',startMm:p,endMm:points[(i+1)%points.length]})),loops:[{id:'outline',edges:points.map((_,i)=>({entityId:'edge'+i,reversed:false}))}],regions:[{id:'region',outerLoopId:'outline',holeLoopIds:[]}],output:'face'});
const section=(w,h)=>({profileVersion:1,entities:[{id:'outline',type:'roundedRectangle',originMm:[-w/2,-h/2],widthMm:w,heightMm:h,cornerRadiusMm:3}],loops:[{id:'loop',edges:[{entityId:'outline',reversed:false}]}],regions:[{id:'region',outerLoopId:'loop',holeLoopIds:[]}],output:'face'});
export const hardwarePracticeBatches=[
 [
  {id:'rollerSection',method:'add',args:{op:'sketchProfile',name:'槽轮母线（保留来源）',refs:[],placement:place([90,0,18]),params:poly([[5,0],[16,0],[16,3],[12,7],[12,11],[16,15],[16,18],[5,18]])}},
  {id:'roller',method:'add',args:{op:'profileRevolve',name:'槽轮旋转体',refs:[ref('rollerSection')],params:{operation:'newBody',axisPoint:[90,0,18],axisDirection:[0,1,0],angleDeg:360}}},
  {id:'rollerHoles',method:'add',args:{op:'multiHole',name:'带四安装孔的槽轮',refs:[ref('roller')],placement:world,params:{radius:1.2,depth:20,axis:'Y',direction:1,points:[[80,-1,18],[100,-1,18],[90,-1,8],[90,-1,28]]}}},
  {id:'hideSection',method:'execute',args:{action:'body.visibility',args:{bodyIds:[ref('rollerSection')],visible:false}}},
  {id:'rollerMeasure',method:'measure',args:{bodyId:ref('rollerHoles')}}
 ],
 [
  ...[[30,18,0,0],[26,16,18,10],[20,14,32,20]].map(([w,h,z,deg],i)=>({id:'knobSection'+i,method:'add',args:{op:'sketchProfile',name:'旋钮截面 '+(i+1),refs:[],placement:place([135,0,z],[0,0,Math.sin(deg*Math.PI/360),Math.cos(deg*Math.PI/360)]),params:section(w,h)}})),
  {id:'knob',method:'add',args:{op:'profileLoft',name:'三截面扭转旋钮',refs:[0,1,2].map(i=>ref('knobSection'+i)),params:{operation:'newBody',ruled:false}}},
  {id:'knobBore',method:'add',args:{op:'hole',name:'带轴孔的扭转旋钮',refs:[ref('knob')],placement:world,params:{radius:3,depth:36,x:135,y:0,z:-2,axis:'Z',direction:1}}},
  {id:'hideKnobSections',method:'execute',args:{action:'body.visibility',args:{bodyIds:[0,1,2].map(i=>ref('knobSection'+i)),visible:false}}},
  {id:'knobMeasure',method:'measure',args:{bodyId:ref('knobBore')}},
  {id:'view',method:'setView',args:{direction:'iso',fit:true,display:'edges'}}
 ]
];

export async function runHardwarePractice(api){
 const c=api.connect({toolIds:['sketchProfile','profileRevolve','profileLoft','multiHole','hole','body.visibility','measure','setView']});
 if(!c.canExecute)throw new Error('Page blocked: '+c.blockers.join(', '));
 const receipts=[];
 for(const steps of hardwarePracticeBatches){
  const fresh=api.connect();if(!fresh.canExecute)throw new Error('Page blocked: '+fresh.blockers.join(', '));
  const r=await api.run({context:fresh.requestContext,idempotencyKey:crypto.randomUUID(),steps});receipts.push(r);
  if(r.status!=='completed')return {status:r.status,receipts,next:'Read current state and retry only unattempted work; do not rerun completed batches.'};
 }
 return {status:'completed',receipts,state:api.getState(),saved:false};
}
