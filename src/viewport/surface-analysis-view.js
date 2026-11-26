import * as THREE from 'three';

function zebra(entry,report,clipPlanes) {
  const material = new THREE.ShaderMaterial({
    uniforms:{frequency:{value:report.density},horizontal:{value:report.direction==='horizontal'?1:0}},
    side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    clipping:true,clippingPlanes:clipPlanes,
    vertexShader:`
      varying vec3 surfaceNormal;
      varying vec3 eyeRay;
      #include <clipping_planes_pars_vertex>
      void main(){
        vec4 mvPosition = modelViewMatrix * vec4(position,1.);
        surfaceNormal = normalize(normalMatrix * normal);
        eyeRay = isOrthographic ? vec3(0.,0.,-1.) : normalize(mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader:`
      uniform float frequency;
      uniform float horizontal;
      varying vec3 surfaceNormal;
      varying vec3 eyeRay;
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        vec3 reflection = reflect(normalize(eyeRay),normalize(surfaceNormal));
        float wave = sin(mix(reflection.x,reflection.y,horizontal) * frequency * 3.14159265);
        float smoothing = max(fwidth(wave),.03);
        gl_FragColor = vec4(mix(vec3(.035,.045,.057),vec3(.90,.94,.98),smoothstep(-smoothing,smoothing,wave)),1.);
        #include <colorspace_fragment>
      }`,
  });
  const geometry=entry.mesh.geometry;
  const mesh=new THREE.Mesh(geometry,material);
  mesh.renderOrder=3;
  entry.root.add(mesh);
  return ()=>{entry.root.remove(mesh);material.dispose();};
}

function buildComb(report,span,clip) {
  const length = span*.12/Math.max(report.maxCurvaturePerMm,1e-9), positions=[];
  for (const sample of report.samples) {
    const p=sample.pointMm;
    positions.push(...p,...p.map((x,i)=>x+sample.curvatureVector[i]*length));
  }
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material=new THREE.LineBasicMaterial({color:0x037b96,depthTest:false,clippingPlanes:clip});
  const lines=new THREE.LineSegments(geometry,material);
  lines.renderOrder=10;
  return lines;
}

function buildThickness(report,span,clip) {
  const low=report.thinnest.thicknessMm, high=report.maxThicknessMm, positions=[], colors=[];
  const cool=new THREE.Color(0x0e78ac), warm=new THREE.Color(0xd5361e), pointColor=new THREE.Color();
  for (const sample of report.samples) {
    positions.push(...sample.pointMm.map((value,i)=>value+(sample.outwardNormal?.[i]??0)*span*.0006));
    const fraction=report.thresholdMm==null?
      high-low<1e-6?.5:1-(sample.thicknessMm-low)/(high-low):
      sample.thicknessMm<report.thresholdMm?1:0;
    pointColor.copy(cool).lerp(warm,fraction);
    colors.push(pointColor.r,pointColor.g,pointColor.b);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const material=new THREE.PointsMaterial({size:8,sizeAttenuation:false,vertexColors:true,depthWrite:false,
    depthFunc:THREE.LessEqualDepth,clippingPlanes:clip});
  const heat = new THREE.Points(geometry,material);
  heat.renderOrder=9;
  return heat;
}

export function installSurfaceAnalysis(viewport,report) {
  if (!report) return null;
  const entry=[...viewport.drawEntries()].find(item=>item.body.id===report.bodyId);
  if (!entry?.root.visible) return null;
  const state={bodyId:report.bodyId,mode:report.mode,sampleCount:report.samples?.length??0};
  if (report.mode==='zebra'&&entry.mesh.geometry.index?.count) {
    return {state,dispose:zebra(entry,report,viewport.clipPlanes)};
  }
  const model=report.mode==='comb'?buildComb(report,viewport.span||1,viewport.clipPlanes):
    report.mode==='thickness'?buildThickness(report,viewport.span||1,viewport.clipPlanes):null;
  if (!model) return null;
  viewport.modelRoot.add(model);
  return {state,dispose(){viewport.modelRoot.remove(model);model.geometry.dispose();model.material.dispose();}};
}
