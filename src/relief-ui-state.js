// One live editor per page. This is UI draft state, never a second CAD document.
let active=null,sequence=0;
export function bindReliefEditor(controller){controller.editorId=++sequence;active=controller;return()=>{if(active===controller)active=null;};}
export function reliefEditorState(){return active?{...active.get(),editorId:active.editorId}:{active:false};}
export async function actReliefEditor(input){
 if(!active)throw Object.assign(new Error('请先打开浮雕工具并导入图案。'),{code:'CAPABILITY_UNAVAILABLE'});
 return active.act(input);
}
