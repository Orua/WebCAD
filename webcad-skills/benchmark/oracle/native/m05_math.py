"""M05 scalar axis classification; no CAD imports."""
import math
LENGTH_TOLERANCE = .01


def direction(index):
    angle = index*math.pi/3
    return [math.cos(angle), math.sin(angle), 0]


def classify_hole(cylinder):
    axis = cylinder['axis']
    length = math.sqrt(sum(v*v for v in axis))
    if length <= 0 or not math.isfinite(length):
        return None
    axis = [v/length for v in axis]
    b = cylinder['bounds']
    middle = [(b['min'+a]+b['max'+a])/2 for a in ['X', 'Y', 'Z']]
    if sum(m*a for m, a in zip(middle[:2], axis[:2])) < 0:
        axis = [-v for v in axis]
    angle = math.atan2(axis[1], axis[0]) % (2*math.pi)
    index = int(math.floor(angle/(math.pi/3)+.5)) % 6
    target = direction(index)
    normal_error = 24*math.sqrt(sum((a-t)**2 for a, t in zip(axis, target)))
    origin = [cylinder['x'], cylinder['y'], cylinder['z']-10]
    projection = sum(a*b for a, b in zip(origin, axis))
    closest = [p-projection*a for p, a in zip(origin, axis)]
    offset = math.sqrt(sum(v*v for v in closest))
    return dict(index=index, measuredAxis=axis, axisDeviationAcrossDiameterMm=normal_error, axisOffsetMm=offset,
                radiusMm=cylinder['radius'], radiusErrorMm=abs(cylinder['radius']-1), closestAxisOffsetMm=closest,
                matches=normal_error <= LENGTH_TOLERANCE and offset <= LENGTH_TOLERANCE and abs(cylinder['radius']-1) <= LENGTH_TOLERANCE)


def distinct_holes(classified):
    groups = []
    for item in classified:
        if item is None:
            continue
        if not any(24*math.dist(item['measuredAxis'], other['measuredAxis']) <= LENGTH_TOLERANCE
                   and math.dist(item['closestAxisOffsetMm'], other['closestAxisOffsetMm']) <= LENGTH_TOLERANCE
                   and abs(item['radiusMm']-other['radiusMm']) <= LENGTH_TOLERANCE for other in groups):
            groups.append(item)
    return groups
