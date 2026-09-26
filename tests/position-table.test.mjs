import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePositionRows,generatePositionRows} from '../src/position-table.js';

test('pasted multi-line positions retain explicit row order',()=>{
  assert.deepEqual(parsePositionRows('1,2,3\n4\t5\t6','multiHole'),[{x:1,y:2,z:3},{x:4,y:5,z:6}]);
  assert.throws(()=>parsePositionRows('1,2\n4,5,6','multiHole'),/第 1 行/);
  assert.deepEqual(parsePositionRows('1,2,3,4,5,0.5','multiPocket'),[{x:1,y:2,z:3,width:4,height:5,cornerRadius:0.5}]);
});

test('position generators use deterministic millimetre coordinates',()=>{
  assert.deepEqual(generatePositionRows({pattern:'line',count:3,origin:[1,2,3],step:[10,0,0]}),[[1,2,3],[11,2,3],[21,2,3]]);
  assert.deepEqual(generatePositionRows({pattern:'symmetric',count:2,origin:[10,0,0],step:[6,0,0]}),[[7,0,0],[13,0,0]]);
  const circle=generatePositionRows({pattern:'circle',count:4,origin:[0,0,0],radius:10});
  assert.ok(Math.hypot(circle[1][0],circle[1][1]-10)<1e-9);
});
