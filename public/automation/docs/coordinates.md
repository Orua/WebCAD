# coordinates

Lengths are millimetres; angles degrees; volume mm^3; scale dimensionless. Coordinates are right-handed world XYZ unless the individual tool states otherwise.
box width/depth/height means positive X/Y/Z extent from [0,0,0]. It does not center at the origin.
hole and multiHole use radius, never diameter. multiHole.points are 1..100 world [x,y,z] cutter START points, not local XY. Depth is positive; direction is 1 or -1 along axis X/Y/Z, default Z/+1. These tools do not accept through.
faceHole.point is world XYZ on a planar face. through=true computes sufficient depth from the body bounds; otherwise positive depth is required. Face direction comes from exact topology.
Face and edge indices are zero-based within one body at one snapshot. No index is a stable semantic name. Prefer query selectionToken for feature.add. Current-model tokens cannot retarget a historical feature.edit.
transform rotates/scales about world origin, applies rotations X/Y/Z, then translates; absolute positioning sets final bounding-box center. Its legacy contract is unchanged.
slot.angle is degrees, independent of the sign of cut direction.
