import {validateRegions} from './logo-model.js';

// Export the accepted contour coordinates directly. No fitting, scaling or kernel work.
export function logoDXF(logo){
  const regions=validateRegions(logo),pairs=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,
    999,'WebCAD LOGO contours; units=mm; reviewRequired='+String(logo.source?.reviewed!==true),0,'ENDSEC',0,'SECTION',2,'ENTITIES'];
  let handle=32;
  const ring=(points,layer)=>{
    pairs.push(0,'LWPOLYLINE',5,(handle++).toString(16).toUpperCase(),100,'AcDbEntity',8,layer,100,'AcDbPolyline',90,points.length,70,1);
    for(const [x,y] of points)pairs.push(10,x,20,y);
  };
  for(const region of regions){ring(region.outer,'LOGO_OUTER');for(const hole of region.holes)ring(hole,'LOGO_HOLE');}
  pairs.push(0,'ENDSEC',0,'EOF');return pairs.join('\r\n')+'\r\n';
}
