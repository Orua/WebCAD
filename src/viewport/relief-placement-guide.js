import * as THREE from 'three';
import {LogoPlacementGuide} from './logo-placement-guide.js';

// Reuse the same drag, scale, margin and alignment interaction as LOGO. The
// rectangle is the image footprint; holes and the exact face are checked by
// the ordinary relief preview, never inferred from this display mesh.
export class ReliefPlacementGuide {
 constructor(viewport,{bodyId,faceId,face,params,canvas},handlers={}){
  const w=params.widthMm,h=params.heightMm;
  const footprint={sizeMm:[w,h],regions:[{outer:[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]],holes:[]}]};
  let guide;
  const changed=state=>{
   const delta=new THREE.Vector3(...state.point).sub(new THREE.Vector3(...face.origin));
   this.state={bodyId,faceId,widthMm:w*state.scale,heightMm:h*state.scale,depthMm:state.depth,angleDeg:state.angle,
    point:[...state.point],xDirection:[...state.frame.x],offsetX:delta.dot(guide?.x??new THREE.Vector3(...state.frame.x)),offsetY:delta.dot(guide?.y??new THREE.Vector3().crossVectors(new THREE.Vector3(...state.frame.normal),new THREE.Vector3(...state.frame.x))),margins:state.margins,dimensionBasis:state.dimensionBasis};
   if(this.image){this.image.position.fromArray(state.point).addScaledVector(guide.n,.04);this.image.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(guide.x,guide.y,guide.n)));this.image.rotateZ(state.angle*Math.PI/180);this.image.scale.set(state.scale,state.scale,1);}
   handlers.onChange?.({...this.state});
  };
  guide=this.guide=new LogoPlacementGuide(viewport,{bodyId,faceId,face,point:face.origin,logo:footprint,params:{scale:1,angle:params.angleDeg??0,depth:params.depthMm}},
   {onChange:changed,onApply:handlers.onPreview,onCancel:handlers.onCancel,onSelectFace:handlers.onSelectFace});
  guide.dom.dataset.uiAction='relief';
  for(const node of guide.dom.querySelectorAll('[aria-label]')){
   const label=node.getAttribute('aria-label').replaceAll('LOGO','浮雕').replace('雕刻深度','起伏高度').replace('确认雕刻','预览浮雕').replace('取消定位','收起定位');
   node.setAttribute('aria-label',label);node.title=label;
  }
  if(params.layers?.length){guide.depthInput.hidden=true;guide.depthInput.previousElementSibling.hidden=true;}
  if(canvas){
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
   this.image=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.78,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
   this.image.renderOrder=1003;guide.group.add(this.image);this.texture=texture;
  }
  const at=guide.origin.clone().addScaledVector(guide.x,params.offsetX??0).addScaledVector(guide.y,params.offsetY??0);
  guide.update({point:at.toArray()});
 }
 get(){return {...this.state};}
 align(kind){this.guide.align(kind);return this.get();}
 update(patch){
  const p={...patch};
  if(p.offsetX!==undefined||p.offsetY!==undefined){p.point=this.guide.origin.clone().addScaledVector(this.guide.x,p.offsetX??this.state.offsetX).addScaledVector(this.guide.y,p.offsetY??this.state.offsetY).toArray();delete p.offsetX;delete p.offsetY;}
  this.guide.update(p);return this.get();
 }
 render(){this.guide.render();}
 dispose(){this.texture?.dispose();this.guide.dispose();}
}
