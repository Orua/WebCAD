import {reliefPlateExample} from './mesh/relief-plate.js';
import {heightfieldReliefExample} from './mesh/heightfield-relief.js';
import {meshBooleanExample} from './mesh/mesh-boolean.js';
import {reliefEditExample} from './mesh/relief-edit-contract.js';
import {SUBD_EXAMPLE} from './subd-contract.js';
import {mechanicalDefaults,mechanicalExamples} from './mechanical-tool-contracts.js';
export const operationDefaults = {badge:{side:'single',direction:1,radiusMm:0},reliefShoulder:{}, meshReliefEdit:{},meshReliefPlate:{}, cylinder:{},sphere:{},cone:{radius1:10,radius2:0},torus:{},round:{mode:'auto',strength:.5}, roundEnd:{axis:'Y',direction:1,profileAxis:'Z'}, rounding:{strength:1}, autoRound:{}, smoothTransition: {}, box: {}, hole: { x: 0, y: 0, z: 0, axis: 'Z', direction: 1 },holeWizard:{kind:'plain',axis:'Z',direction:1,through:false},
  mirror:{plane:'XY',offsetMm:0,keepOriginal:false},linearPattern:{count:3,dx:0,dy:0,dz:0,outputMode:'compound'},circularPattern:{count:3,angle:360,axis:'Z',cx:0,cy:0,cz:0,outputMode:'compound'},
  multiHole: { axis: 'Z', direction: 1 }, multiPocket:{axis:'Z',direction:-1}, multiBoss:{axis:'Z',direction:1}, faceHole: { through: false }, fillet: {}, chamfer: {}, shell: {}, draftFaces:{}, extractFaces:{}, extractShell:{}, sketchProfile:{}, profileOffset:{}, profileRepair:{}, profileExtrude:{},...mechanicalDefaults };
const triangle = [[-1, -1], [1, -1], [0, 1]];
const regions = [{ outer: triangle }];
export const operationExamples = {badge:{faceId:0,thicknessMm:2,side:'double',direction:1,radiusMm:0}, reliefShoulder:{faceId:0,point:[0,50.25,7],widthMm:.3,endProtectionMm:.3,endPolicy:'retained-step-with-planar-caps'}, meshReliefEdit:reliefEditExample,meshReliefPlate:reliefPlateExample,meshHeightfieldRelief:heightfieldReliefExample,meshBoolean:meshBooleanExample, round:{edgeIds:[0]}, roundEnd:{axis:'Y',direction:1,profileAxis:'Z',depthMm:2,edgeIds:[0]}, rounding:{specVersion:3,scope:{kind:'edges',edgeIds:[0]}}, autoRound:{radius:0.1}, smoothTransition:{radius:0.1,faceIds:[0,1]},
  box: { width: 50, depth: 30, height: 3 }, cylinder: { radius: 10, height: 20 }, sphere: { radius: 10 },
  cone: { radius1: 10, radius2: 0, height: 20 }, torus: { majorRadius: 10, minorRadius: 2 },
  extrude: { profile: 'rectangle', width: 20, depth: 10, height: 5 },
  revolve: { profile: 'rectangle', width: 2, depth: 3, offset: 10, angle: 360 },
  sweep: { profile: 'circle', radius: 1, points: [[0, 0, 0], [0, 0, 10]] },
  loft: { profile: 'circle', radius: 5, endRadius: 3, height: 10 },
  transform: { x: 10 }, copy: { x: 10 }, mirror: { plane: 'YZ' },
  hole: { radius: 2, depth: 5, x: 5, y: 5, z: 4, axis: 'Z', direction: -1 },
  multiHole: { radius: 2, depth: 5, axis: 'Z', direction: -1, points: [[5, 5, 4], [45, 5, 4], [5, 25, 4], [45, 25, 4]] },
  multiPocket:{depth:0.5,axis:'Z',direction:-1,pockets:[{x:10,y:10,z:3,width:6,height:4},{x:25,y:10,z:3,width:6,height:4,cornerRadius:0.5}]},
  multiBoss:{radius:2,height:3,axis:'Z',direction:1,points:[[10,10,3],[30,10,3]]},
  tap: { faceId:0,point:[5,5,10],threadSize:'M3',depthMm:4 },
  faceHole: { faceId: 0, point: [5, 5, 3], radius: 2, through: true },
  faceExtrude: { faceId: 0, height: 2 }, fillet: { radius: 0.5, edgeIds: [0] },
  chamfer: { distance: 0.5, edgeIds: [0] }, shell: { thickness: 1, faceIds: [0] },
  slot: { length: 10, width: 3, depth: 5, x: 20, y: 15, z: 4, direction: -1 },
  linearPattern: { count: 3, dx: 20 }, circularPattern: { count: 3, angle: 360, axis: 'Z' },
  split: { plane: 'XY', offset: 1 }, extractSolid: { solidIndex: 0 }, group: {}, union: {}, cut: {}, intersect: {},
  quickModel: { kind: 'tube' }, remove: {}, import: {},
  logo: { placementVersion:2, faceId: 0, point:[5,5,3], mode: 'engrave', depth: 0.2, draftAngle:0, regions, source:{kind:'reviewed-contours',reviewed:true} },
  vectorProfile: { regions, output: 'solid', height: 2 },
  arcProfile: { outer:[{type:'line',points:[[0,0],[10,0]]},{type:'line',points:[[10,0],[10,5]]},{type:'line',points:[[10,5],[0,5]]},{type:'line',points:[[0,5],[0,0]]}],height:2 },
  curveSweep: { pathType: 'arc', points: [[10, 0, 0], [7.071, 7.071, 0], [0, 10, 0]], radius: 1 },
  advancedLoft: { sections: [{ z: 0, points: triangle }, { z: 10, points: triangle }] },
  fittedSurface: { points: [0, 5, 10].map(y => [0, 5, 10].map(x => [x, y, 0])) },
  thickenFace: { faceId: 0, thickness: 1 }, curvedLogo: { faceId: 0, point: [10, 0, 5], depth: 0.2, regions },
  planeSection: { plane: 'XY', offset: 1 }, faceBoundary: { faceId: 0 }, extractFaces:{faceIds:[0]}, extractShell:{shellIndex:0},
  sewFaces: { tolerance: 0.01, makeSolid: false }, surfaceTrim: { faceId: 0, mode: 'intersect' },
  referenceExtrude: { direction: [0,0,1], distance: 3 }, referenceLoft: { ruled: false },
  sketchProfile:{profileVersion:1,entities:[{id:'circle-1',type:'circle',centerMm:[0,0],diameterMm:20}],loops:[{id:'outer',edges:[{entityId:'circle-1',reversed:false}]}],regions:[{id:'region-1',outerLoopId:'outer',holeLoopIds:[]}],output:'face'},
  profileOffset:{distanceMm:2,side:'inside',join:'intersection',output:'band'},
  profileRepair:{issueId:'closure:outline',maxEndpointMoveMm:0.03},
  profileExtrude:{operation:'newBody',extent:'distance',distanceMm:3,direction:1},
  holeWizard:{kind:'counterbore',diameterMm:4,depthMm:6,through:false,recessDiameterMm:7,recessDepthMm:2,x:10,y:10,z:10,axis:'Z',direction:-1},
  draftFaces:{faceIds:[0,1,2,3],neutralFaceId:4,pullDirection:[0,0,1],angleDeg:2},
  ...mechanicalExamples,
  bumpSet:{bumps:[{centerMm:[0,0,4],radiusMm:1}],blendRadiusMm:.1},
  subdBody:SUBD_EXAMPLE,
};

