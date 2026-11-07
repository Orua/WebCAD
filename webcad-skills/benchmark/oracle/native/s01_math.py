"""Measured oriented rectangles and target-curve distances; no CAD imports."""
import math
STATIONS = sorted(set([i/32 for i in range(33)]+[.017, .139, .311, .537, .773, .967]))
CURVE_TOLERANCE_MM = .05
PLANE_TOLERANCE_MM = .01


def hull(points):
    xy = sorted(set((p[0], p[1]) for p in points))
    if len(xy) < 3:
        return []
    def cross(a, b, c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower, upper = [], []
    for p in xy:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 1e-12:
            lower.pop()
        lower.append(p)
    for p in reversed(xy):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 1e-12:
            upper.pop()
        upper.append(p)
    return lower[:-1]+upper[:-1]


def fit_rectangle(points):
    if len(points) < 4 or any(not math.isfinite(v) for p in points for v in p):
        return None
    polygon = hull(points)
    best = None
    for i, a in enumerate(polygon):
        b = polygon[(i+1) % len(polygon)]
        angle = math.atan2(b[1]-a[1], b[0]-a[0])
        c, s = math.cos(angle), math.sin(angle)
        xs, ys = zip(*[(c*p[0]+s*p[1], -s*p[0]+c*p[1]) for p in polygon])
        lo_x, hi_x, lo_y, hi_y = min(xs), max(xs), min(ys), max(ys)
        width, height = hi_x-lo_x, hi_y-lo_y
        area = width*height
        if width <= 1e-10 or height <= 1e-10 or best is not None and area >= best['area']-1e-10:
            continue
        cx, cy = (lo_x+hi_x)/2, (lo_y+hi_y)/2
        if width < height:
            width, height, angle = height, width, angle+math.pi/2
        angle_deg = math.degrees(angle) % 180
        if angle_deg > 90:
            angle_deg -= 180
        if abs(angle_deg) < 1e-10:
            angle_deg = 0
        mean_z = sum(p[2] for p in points)/len(points)
        best = dict(x=c*cx-s*cy, y=s*cx+c*cy, z=mean_z, width=width, height=height, angleDeg=angle_deg, area=area,
                    maxPlaneResidualMm=max(abs(p[2]-mean_z) for p in points))
    return best


def target_boundary(t, samples_per_side=16):
    angle = math.pi*t/3
    c, s = math.cos(angle), math.sin(angle)
    vertices = [(-10, -6), (10, -6), (10, 6), (-10, 6)]
    points = []
    for i, a in enumerate(vertices):
        b = vertices[(i+1) % 4]
        for j in range(samples_per_side):
            u = j/samples_per_side
            x, y = a[0]+u*(b[0]-a[0]), a[1]+u*(b[1]-a[1])
            points.append([c*x-s*y, s*x+c*y, 40*t])
    return points


def target_distance(point, t):
    angle = math.pi*t/3
    c, s = math.cos(angle), math.sin(angle)
    x, y = abs(c*point[0]+s*point[1]), abs(-s*point[0]+c*point[1])
    outside = math.hypot(max(x-10, 0), max(y-6, 0))
    xy = outside if outside > 0 else min(10-x, 6-y)
    return math.hypot(xy, point[2]-40*t)


def segment_distance(point, start, end):
    delta = [b-a for a, b in zip(start, end)]
    length = sum(v*v for v in delta)
    t = max(0, min(1, sum((p-a)*v for p, a, v in zip(point, start, delta))/length)) if length else 0
    return math.dist(point, [a+t*v for a, v in zip(start, delta)])


def frame_evidence(points, segments, t):
    fitted = fit_rectangle(points)
    if fitted is None or not segments:
        return dict(available=False, verdict=None)
    forward = max(target_distance(point, t) for point in points)
    reverse = max(min(segment_distance(point, a, b) for a, b in segments) for point in target_boundary(t))
    centered = math.hypot(fitted['x'], fitted['y']) <= PLANE_TOLERANCE_MM
    plane = abs(fitted['z']-40*t) <= PLANE_TOLERANCE_MM and fitted['maxPlaneResidualMm'] <= PLANE_TOLERANCE_MM
    return dict(available=True, fitted=fitted, actualSampleToTargetMaxMm=forward, targetSampleToActualPolylineMaxMm=reverse,
                verdict=centered and plane and forward <= CURVE_TOLERANCE_MM and reverse <= CURVE_TOLERANCE_MM,
                continuousMaximumErrorCertified=False, polylineDistanceIsSampleApproximation=True)
