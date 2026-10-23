import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessagePresenter} from '../src/message-dialog.js';
import {humanError,errorRecovery} from '../src/error-recovery.js';

class Node {
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.events={};this.attrs={};}
 setAttribute(k,v){this.attrs[k]=v;}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 addEventListener(name,fn){this.events[name]=fn;}
 querySelector(){return this.tool||null;}
 remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
 focus(){throw Error('A notice must not steal focus');}
 showModal(){throw Error('An error is not a blocking decision');}
}
test('errors are nonmodal, latest-only and remain inside an existing tool dialog',()=>{
 const old=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};
 try{
  const root=new Node('main'),tool=new Node('dialog');root.tool=tool;
  const ui=createMessagePresenter(root);ui.error('请输入有效角度');
  assert.equal(tool.children.length,1);assert.equal(tool.children[0].tagName,'section');assert.equal(tool.children[0].attrs.role,'alert');
  ui.error('请输入有效角度');assert.equal(tool.children.length,1);
  ui.warning('设置尚未保存');assert.equal(tool.children.length,1);assert.equal(tool.children[0].attrs.role,'status');
  tool.children[0].children[0].events.click();assert.equal(tool.children.length,0);ui.destroy();
 }finally{globalThis.document=old;}
});
test('ordinary UI corrections omit unrelated commit warnings; API keeps receipt scope',()=>{
 assert.equal(humanError('请输入有效角度'),'请输入有效角度');
 const receipt=errorRecovery({code:'JOB_TIMEOUT'},{status:'unknown',commitState:'unknown'});
 assert.equal(receipt.stop,true);assert.equal(receipt.scope,'failed-operation');assert.equal(receipt.agentMayContinue,true);
});
