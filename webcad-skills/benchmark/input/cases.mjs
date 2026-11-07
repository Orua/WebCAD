// Synthetic public specifications. No construction recipes or expected measurements.
const specs = [
 ['B01','solid','Plate X40 Y30 Z4; centered on X/Y, bottom z=0. Two Z through holes diameter 4 at (-12,0) and (12,0).'],
 ['B02','solid','Coaxial sleeve on Z: outside diameter 12, inside diameter 8, height 20, bottom z=0; open through bore.'],
 ['B03','solid','Plate 30 by 20 by 5, centered X/Y, bottom z=0. R1 only on all four vertical edges. Keep top and bottom perimeter sharp. Verify undo.'],
 ['M01','solid','Coaxial Z part: outside radius 8 for z=0..4 and radius 5 for z=4..20; through bore radius 3. Planar shoulders.'],
 ['M02','solid','Closed circular wire radius 2 swept around XY rounded-rectangle centerline. Centerline envelope 40 by 24, corner radius 6, z=0.'],
 ['M03','solid','90 degree hollow bend: XY centerline radius 20, angle 0..90 degrees. Tube outside radius 3, inside radius 2. Ends normal to tangent.'],
 ['M04','solid','Centered 40 by 30 by 10 plate, bottom z=0. Center Z through bore diameter 4 and top flat counterbore diameter 10, depth 3.'],
 ['M05','solid','Z sleeve outside radius 12, inside radius 10, height 20 from z=0. Six radial holes diameter 2 at z=10 every 60 degrees. Each cut only spans radial distance 9..13 on its own side.'],
 ['S01','solid','For z=0..40, every XY section is a centered 20 by 12 rectangle rotated by 60*z/40 degrees. Continuous smooth sides, no stacked boxes.'],
 ['S02','solid','For t=z/40 in [0,1], centered horizontal ellipses have semiaxes a=10-4*t and b=4+2*t. No twist. End is circle radius 6.'],
 ['S03','solid','For z=0..40, horizontal circular sections have center (6*sin(pi*z/40),0,z), radius 5-2*z/40. Sections remain parallel to XY.'],
 ['S04','solid','Cubic Bezier path controls (0,0,0),(15,0,10),(-10,10,25),(5,0,40). Sweep radius 2 circles normal to local tangent; close both ends.'],
 ['S05','solid','XY arc centerline radius 20, angle 0..90 degrees. At t=angle/90 radial width is 4+2*t and Z height 3+t; centered sections with no extra twist.'],
 ['S06','surface','Open surface for u,t in [0,1]: x=(2*u-1)*(10+2*sin(pi*t)), y=40*t, z=5*sin(pi*t)+2*(2*u-1)^2. Retain all boundaries.'],
 ['S07','surface','Open saddle x,y in [-10,10], z=(x*x-y*y)/100. Remove projected disk x*x+y*y<9 to form a hole.'],
 ['S08','surface','Open patch for u,v in [0,1]: x=20*u, y=20*v, z=3*v*sin(pi*u)+2*sin(pi*v). Match all boundaries and interior.'],
 ['S09','surface','For y in [-6,6]: left support x=-10..0,z=0; right support x=10..20,z=8. Bridge x=10*t,z=8*(3*t*t-2*t*t*t) for t in [0,1]. G1 at both seams.'],
 ['S10','solid','Closed body x=-10..10,y=-8..8. Bottom z=0; top z=5+(x*x+y*y)/200, four vertical boundary sides.'],
 ['S11','solid','Cylinder surface radius 20, angle -60..60 degrees, z=0..15. Thicken radially outward by 1 and close all boundary edges.'],
 ['S12','solid','Sphere radius 20 centered at origin, keep z>=10. Drill Z through hole diameter 4 at x=5,y=0. Apply R0.5 only to spherical-side hole rim; leave bottom hole rim sharp.'],
];
export const cases = Object.freeze(specs.map(([caseId,targetType,specification])=>Object.freeze({
 caseId,caseVersion:'1.0.0',units:'mm',coordinateFrame:'world-right-handed',targetType,specification,
 delivery:'Save final project; export actual STEP bytes, reimport into a separate document and check geometry again.',
})));
