import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleCoordinates} from './host-math.mjs';
test('bounded arithmetic computes curve/grid inputs without geometry or hidden oracle data',()=>{
 const curve=sampleCoordinates({coordinates:['2*t','sin(pi*t)','t^2'],axes:[{name:'t',min:0,max:1,count:3}]});
 assert.deepEqual(curve.points[1],[1,1,.25]);assert.equal(curve.geometryChanged,false);
 const grid=sampleCoordinates({coordinates:['u','v','u+v'],axes:[{name:'u',min:0,max:1,count:2},{name:'v',min:0,max:2,count:3}]});
 assert.deepEqual(grid.points[1][2],[1,2,3]);assert.equal(grid.pointCount,6);
});
test('host arithmetic rejects code, unknown variables, nonfinite results and unbounded grids',()=>{
 const request={coordinates:['t','t','t'],axes:[{name:'t',min:0,max:1,count:3}]};
 for(const expression of ['process.exit()','fetch(1)','unknown','1/0'])assert.throws(()=>sampleCoordinates({...request,coordinates:[expression,'0','0']}));
 assert.throws(()=>sampleCoordinates({...request,axes:[{name:'t',min:0,max:1,count:100000}]}));
});
