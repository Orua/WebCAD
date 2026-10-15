import * as THREE from 'three';

// Shared with CadViewer: a short, bounded screen-space cavity shading pass.
export const METAL_OCCLUSION = Object.freeze({directions:8,samples:16,radiusScale:0.035,angleBias:0.06,strength:1.5,minLight:0.42});

export function createMetalOcclusionUniforms(){
  return {webcadOcclusionDepth:{value:null},webcadOcclusionEnabled:{value:0},webcadOcclusionResolution:{value:new THREE.Vector2(1,1)},webcadOcclusionProjection:{value:new THREE.Matrix4()},webcadOcclusionInverseProjection:{value:new THREE.Matrix4()}};
}

export const metalOcclusionShader=/* glsl */`
uniform sampler2D webcadOcclusionDepth;
uniform float webcadOcclusionEnabled;
uniform vec2 webcadOcclusionResolution;
uniform mat4 webcadOcclusionProjection;
uniform mat4 webcadOcclusionInverseProjection;
vec3 webcadOcclusionPosition(vec2 uv,float depth){
  vec4 p=webcadOcclusionInverseProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
  return p.xyz/p.w;
}
float webcadCavityLight(vec3 position,vec3 surfaceNormal){
  if(webcadOcclusionEnabled<0.5)return 1.0;
  float radius=max(webcadRadius*0.035,0.000035);
  vec2 uv=gl_FragCoord.xy/webcadOcclusionResolution;
  float projectionW=max(abs((webcadOcclusionProjection*vec4(position,1.0)).w),0.00001);
  vec2 uvRadius=vec2(webcadOcclusionProjection[0][0],webcadOcclusionProjection[1][1])*radius/(2.0*projectionW);
  float total=0.0;
  for(int direction=0;direction<8;direction++){
    float angle=float(direction)*0.78539816339;
    vec2 axis=vec2(cos(angle),sin(angle));
    float horizon=0.0;
    for(int ring=0;ring<2;ring++){
      vec2 sampleUv=uv+axis*uvRadius*(ring==0?0.3:0.9);
      if(sampleUv.x<=0.0||sampleUv.x>=1.0||sampleUv.y<=0.0||sampleUv.y>=1.0)continue;
      float depth=texture2D(webcadOcclusionDepth,sampleUv).r;
      if(depth>=0.999999)continue;
      vec3 delta=webcadOcclusionPosition(sampleUv,depth)-position;
      float distanceToSample=length(delta);
      if(distanceToSample<radius*0.001||distanceToSample>radius)continue;
      float elevation=max(dot(surfaceNormal,delta/distanceToSample)-0.06,0.0);
      float falloff=1.0-smoothstep(radius*0.1,radius,distanceToSample);
      horizon=max(horizon,elevation*falloff);
    }
    total+=horizon;
  }
  return clamp(1.0-total*(1.5/8.0),0.42,1.0);
}
`;

export function isOcclusionSurface(object){
  const material=object.material;
  return !!(object.isMesh&&['body','display-only'].includes(object.userData?.type)&&material&&!Array.isArray(material)&&material.visible!==false&&!material.wireframe&&!material.transparent&&material.opacity>=0.999);
}

export function metalEdgeOpacity({selected=false,selectedEdge=false,translucent=false,mode='edges',finish='design'}={}){
  if(selectedEdge)return 1;
  if(translucent)return 0.25;
  return selected||mode==='wire'||mode==='transparentEdges'||finish==='design'?0.72:0.18;
}

export function fitOcclusionCamera(camera,surfaces){
  const depthCamera=camera.clone();let nearest=Infinity,farthest=0;
  for(const object of surfaces){
    if(!object.geometry.boundingSphere)object.geometry.computeBoundingSphere();
    const sphere=object.geometry.boundingSphere?.clone().applyMatrix4(object.matrixWorld);
    if(!sphere)continue;
    const depth=-sphere.center.applyMatrix4(camera.matrixWorldInverse).z;
    nearest=Math.min(nearest,depth-sphere.radius);farthest=Math.max(farthest,depth+sphere.radius);
  }
  // The editing camera intentionally has a huge range. A tight depth-only
  // projection keeps sub-millimetre engraving visible without changing its view.
  if(Number.isFinite(nearest)&&farthest>camera.near){
    depthCamera.near=Math.max(camera.near,nearest*0.8);
    depthCamera.far=Math.min(camera.far,Math.max(depthCamera.near+0.001,farthest*1.05));
    depthCamera.updateProjectionMatrix();
  }
  return depthCamera;
}

/** Renders only visible, opaque CAD surfaces into depth. No geometry is copied. */
export class MetalOcclusionPass {
  constructor(renderer,uniforms){
    this.renderer=renderer;this.uniforms=uniforms;this.size=new THREE.Vector2();
    const depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    depthTexture.format=THREE.DepthFormat;
    this.target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthTexture,stencilBuffer:false});
    this.material=new THREE.MeshDepthMaterial({side:THREE.DoubleSide,blending:THREE.NoBlending});
    this.uniforms.webcadOcclusionDepth.value=depthTexture;
    this.state={enabled:false,method:'screen-space-cavity',samples:16,radiusScale:0.035,sourceChanged:false};
  }
  render(scene,camera,{enabled=true,clippingPlanes=[]}={}){
    const surfaces=new Set();
    scene.traverseVisible(object=>{if(isOcclusionSurface(object))surfaces.add(object);});
    enabled=enabled&&[...surfaces].some(object=>object.material.userData.metalFinish&&object.material.userData.metalFinish!=='design');
    this.uniforms.webcadOcclusionEnabled.value=0;
    this.state={...this.state,enabled:!!enabled,surfaceCount:enabled?surfaces.size:0,projection:camera.isOrthographicCamera?'orthographic':'perspective'};
    if(!enabled)return;
    const depthCamera=fitOcclusionCamera(camera,surfaces);
    this.renderer.getDrawingBufferSize(this.size);
    const width=Math.max(1,this.size.x),height=Math.max(1,this.size.y);
    if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
    this.uniforms.webcadOcclusionResolution.value.set(width,height);
    this.uniforms.webcadOcclusionProjection.value.copy(depthCamera.projectionMatrix);
    this.uniforms.webcadOcclusionInverseProjection.value.copy(depthCamera.projectionMatrixInverse);
    this.material.clippingPlanes=clippingPlanes;
    const hidden=[],previousTarget=this.renderer.getRenderTarget(),previousOverride=scene.overrideMaterial,previousBackground=scene.background,previousAutoClear=this.renderer.autoClear;
    try{
      scene.traverse(object=>{if(object.visible&&(object.isMesh||object.isLine||object.isPoints||object.isSprite)&&!surfaces.has(object)){hidden.push(object);object.visible=false;}});
      scene.overrideMaterial=this.material;scene.background=null;this.renderer.autoClear=true;
      this.renderer.setRenderTarget(this.target);this.renderer.render(scene,depthCamera);
      this.uniforms.webcadOcclusionEnabled.value=1;
    }finally{
      for(const object of hidden)object.visible=true;
      scene.overrideMaterial=previousOverride;scene.background=previousBackground;
      this.renderer.autoClear=previousAutoClear;this.renderer.setRenderTarget(previousTarget);
    }
  }
  dispose(){this.uniforms.webcadOcclusionEnabled.value=0;this.uniforms.webcadOcclusionDepth.value=null;this.target.dispose();this.material.dispose();}
}
