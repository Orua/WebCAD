"""Bounded numeric placement planner, shipped by WebCAD and run on the Agent host.
No shell, network, file writes, CAD kernel, guessed source dimensions or model-specific geometry.
"""
import math


def plan(layout):
    allowed = {"kind", "sourceBinding", "majorRadiusMm", "minorRadiusMm", "stoneDiameterMm",
               "clearanceMm", "embedDepthMm", "centerMm", "xAxis", "normal", "rows"}
    if not isinstance(layout, dict) or set(layout) - allowed or layout.get("kind") != "torus-surface":
        raise ValueError("Use documented kind=torus-surface and explicit source dimensions.")
    binding = layout.get("sourceBinding")
    if not isinstance(binding, dict) or set(binding) != {"documentId", "revision", "geometryFingerprint"}:
        raise ValueError("Bind source documentId, revision and geometryFingerprint; recheck before commit.")
    if type(binding["revision"]) is not int or binding["revision"] < 0 or any(not isinstance(binding[k], str) or not binding[k] for k in ("documentId", "geometryFingerprint")):
        raise ValueError("Invalid source binding.")

    def number(value, name, minimum=0, maximum=10000):
        if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError("Invalid finite millimeter/angle field: " + name)
        return float(value)

    def vector(value, name):
        if not isinstance(value, list) or len(value) != 3:
            raise ValueError("Explicit three-component vector required: " + name)
        return [number(v, name, -100000, 100000) for v in value]

    def dot(a, b):
        return sum(x*y for x, y in zip(a, b))

    def cross(a, b):
        return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]

    center = vector(layout["centerMm"], "centerMm")
    x_axis, z_axis = vector(layout["xAxis"], "xAxis"), vector(layout["normal"], "normal")
    if abs(dot(x_axis, x_axis)-1) > 1e-8 or abs(dot(z_axis, z_axis)-1) > 1e-8 or abs(dot(x_axis, z_axis)) > 1e-8:
        raise ValueError("Source xAxis/normal must be orthogonal unit vectors.")
    y_axis = cross(z_axis, x_axis)
    major = number(layout["majorRadiusMm"], "majorRadiusMm", 0.001)
    minor = number(layout["minorRadiusMm"], "minorRadiusMm", 0.001)
    diameter = number(layout["stoneDiameterMm"], "stoneDiameterMm", 0.001)
    gap = number(layout["clearanceMm"], "clearanceMm")
    embed = number(layout["embedDepthMm"], "embedDepthMm", 0, minor)
    if major <= minor:
        raise ValueError("Only an explicitly measured ring torus is supported.")
    rows = layout["rows"]
    if not isinstance(rows, list) or not 1 <= len(rows) <= 64:
        raise ValueError("Provide 1-64 explicit surface rows; the planner does not infer coverage.")
    placements = []
    for row_index, row in enumerate(rows):
        if not isinstance(row, dict) or set(row) - {"angleDeg", "count", "phaseDeg"}:
            raise ValueError("Row requires angleDeg and optional count/phaseDeg.")
        phi = math.radians(number(row["angleDeg"], "angleDeg", -360, 360))
        radius = major+(minor-embed)*math.cos(phi)
        ratio = (diameter+gap)/(2*radius)
        if ratio >= 1:
            raise ValueError("The requested stone does not fit this source row.")
        capacity = int(math.floor(math.pi/math.asin(ratio)))
        count = row.get("count", capacity)
        if type(count) is not int or not 1 <= count <= min(capacity, 1000) or len(placements)+count > 2000:
            raise ValueError("Row count exceeds chord-spacing capacity or 2000-placement budget.")
        phase = math.radians(number(row.get("phaseDeg", 0), "phaseDeg", -360, 360))
        for index in range(count):
            theta = phase+2*math.pi*index/count
            local = [radius*math.cos(theta), radius*math.sin(theta), (minor-embed)*math.sin(phi)]
            n_local = [math.cos(phi)*math.cos(theta), math.cos(phi)*math.sin(theta), math.sin(phi)]
            world = lambda v: [sum(v[j]*[x_axis,y_axis,z_axis][j][i] for j in range(3)) for i in range(3)]
            position = [a+b for a,b in zip(center,world(local))]
            normal = world(n_local)
            # Minimal rotation from the stone's local +Z to the measured outward normal.
            quaternion = [-normal[1],normal[0],0,1+normal[2]]
            length = math.sqrt(sum(v*v for v in quaternion))
            quaternion = [1,0,0,0] if length < 1e-12 else [v/length for v in quaternion]
            placements.append({"row":row_index,"index":index,"positionMm":position,"normal":normal,"quaternion":quaternion})
    minimum = None
    for i, a in enumerate(placements):
        for b in placements[i+1:]:
            distance = math.dist(a["positionMm"],b["positionMm"])
            minimum = distance if minimum is None else min(minimum,distance)
    return {"status":"planned","kind":"torus-surface","units":"mm","sourceBinding":dict(binding),
            "count":len(placements),"placements":placements,"minCenterDistanceMm":minimum,
            "minimumRequiredMm":diameter+gap,"spacingPass":minimum is None or minimum+1e-8 >= diameter+gap,
            "geometryCommitted":False,"limitations":["Explicit analytic torus only; no source inference.",
              "Center-spacing check is conservative; inspect stone bodies and seats after placement.",
              "Quaternion aligns local +Z; use the complete current placement/copy card to bind source anchors."]}
