const place={version:1,frame:{kind:'world'},sourceAnchor:{kind:'model-origin'}};
const add=(id,op,params,refs=[])=>({id,method:'add',args:{op,params,refs,...(refs.length?{}:{placement:place})}});
const measure=id=>({id:'measure',method:'measure',args:{bodyId:{$ref:id+'.createdBodyIds.0'}}});
export function recipe(id,b={}){
 if(id==='plate-two-holes')return [add('plate','box',{width:40,depth:20,height:3}),add('holes','multiHole',{radius:2,depth:3,axis:'Z',direction:-1,points:[[10,10,3],[30,10,3]]},[{$ref:'plate.createdBodyIds.0'}]),measure('holes')];
 if(id==='blind-hole')return [add('plate','box',{width:30,depth:20,height:3}),add('hole','hole',{radius:2,depth:1,x:15,y:10,z:3,axis:'Z',direction:-1},[{$ref:'plate.createdBodyIds.0'}]),measure('hole')];
 if(id==='tube')return [add('tube','quickModel',{kind:'tube',outerDiameter:12,innerDiameter:8,height:3}),measure('tube')];
 if(id==='finish'){
  if(!b.bodyId||!Array.isArray(b.edgeIds)||!b.edgeIds.length)throw Error('Fresh body and selected edges required');
  if(b.kind==='chamfer'&&b.distanceMm>0)return [add('finish','chamfer',{distance:b.distanceMm,edgeIds:b.edgeIds},[b.bodyId]),measure('finish')];
  if(b.kind==='fillet'&&b.radiusMm>0)return [add('finish','fillet',{radius:b.radiusMm,edgeIds:b.edgeIds},[b.bodyId]),measure('finish')];
  throw Error('Explicit chamfer distance or fillet radius required');
 }
 if(id==='edit-box'){
  if(!b.featureId||!b.opVersion||!b.schemaHash||!(b.heightMm>0))throw Error('Real editable feature, its operation contract and requested height required');
  return [{id:'edit',method:'execute',args:{action:'feature.edit',args:{featureId:b.featureId,opVersion:b.opVersion,schemaHash:b.schemaHash,params:{height:b.heightMm}}}}];
 }
 if(id==='export'){
  if(!b.bodyId||!['step','stl'].includes(b.format))throw Error('Explicit body and step/stl format required');
  return [{id:'export',method:'files.export',args:{format:b.format,ids:[b.bodyId],name:'method-test.'+b.format}}];
 }
 throw Error('Unknown recipe '+id);
}
export const expectedGeometry={
 'plate-two-holes':{bounds:[40,20,3],volume:2400-24*Math.PI,solidCount:1,holeCenters:[[10,10],[30,10]],radius:2,expectedCircularEdges:4},
 'blind-hole':{bounds:[30,20,3],volume:1800-4*Math.PI,solidCount:1,holeCenters:[[15,10]],radius:2,bottomZ:2},
 tube:{bounds:[12,12,3],volume:60*Math.PI,solidCount:1,innerRadius:4}
};
