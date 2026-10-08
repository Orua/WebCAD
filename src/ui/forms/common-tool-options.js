const show=(form,key,visible)=>{const input=form.elements.namedItem(key);if(input){input.disabled=!visible;input.closest('[data-field]').hidden=!visible;}};

export function configureChamferOptions(form){
  const mode=form.elements.namedItem('mode');
  const refresh=()=>{show(form,'distance2',mode.value==='twoDistances');show(form,'angleDeg',mode.value==='distanceAngle');show(form,'flipDirection',mode.value!=='equalDistance');};
  mode.addEventListener('change',refresh);refresh();
}

export function configureDrillPointOptions(form){
  const tip=form.elements.namedItem('drillPoint'),through=form.elements.namedItem('through');
  const refresh=()=>{show(form,'drillPoint',!through.checked);const angled=!through.checked&&tip.value==='angled';show(form,'drillPointAngleDeg',angled);show(form,'depthReference',angled);};
  form.addEventListener('change',refresh);refresh();
}

// History editing starts from saved parameters, so hiding fields must also
// remove prior values when changing mode. New task forms use the same packing.
export function packCommonToolOptions(op,params){
  if(op==='chamfer'){
    const mode=params.mode||'equalDistance';
    if(mode!=='twoDistances')delete params.distance2;
    if(mode!=='distanceAngle')delete params.angleDeg;
    if(mode==='equalDistance'){delete params.flipDirection;delete params.referenceFaceId;}
  }
  if(op==='holeWizard'){
    if(params.through){params.drillPoint='flat';delete params.depthMm;}
    if(params.drillPoint!=='angled'){delete params.drillPointAngleDeg;delete params.depthReference;}
    if(params.kind==='plain'){delete params.recessDiameterMm;delete params.recessDepthMm;delete params.includedAngleDeg;}
    else if(params.kind==='counterbore')delete params.includedAngleDeg;
    else if(params.kind==='countersink')delete params.recessDepthMm;
  }
  return params;
}
