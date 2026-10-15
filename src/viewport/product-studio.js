// Keep this portable lighting source identical in CadViewer and WebCAD.
// Camera-space product lighting: side softbox, opposite rim, overhead strip,
// dark lower flag and a studio sweep with a dark horizon band.
// v2 (2026-10-15): soft-edged diffusers with a brighter core (no flat clipped
// cards, no stair-stepped highlight edges on tessellated bends), lower key peak,
// overhead strip, sweep/horizon room gradient, optional screen-space anisotropy.
export const PRODUCT_STUDIO = Object.freeze({azimuth:-65,elevation:25,key:1.3,fill:0.45,ambient:0.4,version:2,minBlur:0.18,keyPeak:2.7,topPeak:1.25});
export const PRODUCT_STUDIO_SHADER = /* glsl */`
float productSoftbox(vec3 ray,vec3 center,vec2 size,vec2 blur){
  center=normalize(center);
  vec3 reference=abs(center.y)>0.98?vec3(1.0,0.0,0.0):vec3(0.0,1.0,0.0);
  vec3 across=normalize(cross(reference,center));
  vec3 up=cross(center,across);
  float facing=dot(ray,center);
  vec2 p=vec2(dot(ray,across),dot(ray,up))/max(facing,0.01);
  vec2 edge=1.0-smoothstep(size,size+blur,abs(p));
  // Real diffusers are brighter in the middle; metals then show a gradient
  // instead of a flat white card.
  vec2 q=abs(p)/(size+blur);
  float core=1.0-0.5*clamp(dot(q,q)*0.5,0.0,1.0);
  return edge.x*edge.y*core*smoothstep(0.05,0.2,facing);
}
vec3 productStudioRadiance(vec3 ray,float roughness,float anisotropy,vec3 keyDirection,vec3 levels){
  float blur=0.18+roughness*roughness*1.8;
  // Brushed finishes stretch reflections across the brushing direction.
  vec2 blur2=vec2(blur*(1.0+anisotropy*2.2),blur*(1.0-anisotropy*0.35));
  float key=productSoftbox(ray,keyDirection,vec2(0.55,0.80),blur2);
  float rim=productSoftbox(ray,vec3(0.88,0.14,-0.30),vec2(0.10,0.95),blur2);
  float top=productSoftbox(ray,vec3(0.0,0.97,0.24),vec2(0.85,0.20),blur2);
  float flag=productSoftbox(ray,vec3(0.15,-0.62,0.77),vec2(0.38,0.20),blur2+0.12);
  // Studio sweep: floor bounce below, soft ceiling above, darker horizon band.
  float floorBounce=mix(0.30,0.17,smoothstep(-0.9,-0.05,ray.y));
  float ceiling=mix(0.15,0.27,smoothstep(0.05,0.9,ray.y));
  float room=mix(floorBounce,ceiling,smoothstep(-0.06,0.06,ray.y));
  float horizonWidth=0.10+blur*0.6;
  room*=1.0-0.55*exp(-(ray.y*ray.y)/(horizonWidth*horizonWidth));
  vec3 light=vec3(room)*levels.z*(1.0-0.72*flag);
  // Broader rough reflections carry the same finite source energy.
  float spread=1.0/(1.0+blur*2.0);
  light+=vec3(1.0,0.98,0.94)*key*2.7*levels.x*spread;
  light+=vec3(0.92,0.96,1.0)*rim*2.4*levels.y*spread;
  light+=vec3(0.97,0.98,1.0)*top*1.25*levels.y*spread;
  return light;
}
vec3 productStudioSpecular(vec3 normal,vec3 viewDirection,vec3 f0,float roughness,float anisotropy,vec3 keyDirection,vec3 levels,vec3 surfacePoint){
  float nv=max(dot(normal,viewDirection),0.001);
  vec3 ray=reflect(-viewDirection,normal);
  // A finite studio, rather than an infinitely distant sky: reflection cards
  // move across a flat face as its position or the view changes.
  float projected=dot(surfacePoint,ray);
  float distanceToRoom=-projected+sqrt(max(projected*projected+2.25-dot(surfacePoint,surfacePoint),0.01));
  ray=normalize(surfacePoint+ray*distanceToRoom);
  // Split-sum environment BRDF fit used by the common metallic-roughness model.
  vec4 r=roughness*vec4(-1.0,-0.0275,-0.572,0.022)+vec4(1.0,0.0425,1.04,-0.04);
  float a004=min(r.x*r.x,exp2(-9.28*nv))*r.x+r.y;
  vec2 fab=vec2(-1.04,1.04)*a004+r.zw;
  return productStudioRadiance(ray,roughness,anisotropy,keyDirection,levels)*(f0*fab.x+fab.y);
}
// Thin dielectric lacquer over plating (F0 0.04, near-mirror), Schlick-weighted.
vec3 productStudioCoat(vec3 normal,vec3 viewDirection,vec3 keyDirection,vec3 levels,vec3 surfacePoint,out float fresnel){
  float nv=max(dot(normal,viewDirection),0.001);
  fresnel=0.04+0.96*pow(1.0-nv,5.0);
  return productStudioSpecular(normal,viewDirection,vec3(1.0),0.05,0.0,keyDirection,levels,surfacePoint)*fresnel;
}
`;
