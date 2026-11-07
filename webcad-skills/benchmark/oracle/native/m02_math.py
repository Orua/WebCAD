"""M02 exact path frames and scalar measurement reduction. No CAD imports."""
import math
LENGTH_TOLERANCE = .01


def frames():
    result = []
    # Straight sections include the centerline's actual extrema, not tube bounds.
    for side, start, end, tangent in [
        (0, [-14, -12, 0], [14, -12, 0], [1, 0, 0]),
        (1, [20, -6, 0], [20, 6, 0], [0, 1, 0]),
        (2, [14, 12, 0], [-14, 12, 0], [-1, 0, 0]),
        (3, [-20, 6, 0], [-20, -6, 0], [0, -1, 0])]:
        for t in [.25, .5, .75]:
            result.append(dict(kind='straight', side=side, t=t, center=[a+(b-a)*t for a, b in zip(start, end)], tangent=tangent))
    for corner, center, first in [(0, [14, -6], -math.pi/2), (1, [14, 6], 0), (2, [-14, 6], math.pi/2), (3, [-14, -6], math.pi)]:
        for t in [.125, .375, .625, .875]:
            angle = first+t*math.pi/2
            result.append(dict(kind='corner', corner=corner, t=t, center=[center[0]+6*math.cos(angle), center[1]+6*math.sin(angle), 0], tangent=[-math.sin(angle), math.cos(angle), 0]))
    return result


def project(point, frame):
    c, t = frame['center'], frame['tangent']
    delta = [p-v for p, v in zip(point, c)]
    return [-t[1]*delta[0]+t[0]*delta[1], delta[2], t[0]*delta[0]+t[1]*delta[1]]


def measured_center(fitted, frame):
    c, t = frame['center'], frame['tangent']
    return [c[0]-t[1]*fitted['x'], c[1]+t[0]*fitted['x'], c[2]+fitted['y']]


def fit_circle(points):
    if len(points) < 3 or any(not math.isfinite(v) for p in points for v in p):
        return None
    mx, my = [sum(p[i] for p in points)/len(points) for i in [0, 1]]
    xx = xy = yy = bx = by = 0
    for x, y, _ in points:
        dx, dy = x-mx, y-my
        squared = dx*dx+dy*dy
        xx += dx*dx;xy += dx*dy;yy += dy*dy
        bx += dx*squared/2;by += dy*squared/2
    determinant = xx*yy-xy*xy
    if abs(determinant) < 1e-12:
        return None
    x, y = mx+(yy*bx-xy*by)/determinant, my+(xx*by-xy*bx)/determinant
    radius = math.sqrt(sum((p[0]-x)**2+(p[1]-y)**2 for p in points)/len(points))
    return dict(x=x, y=y, radius=radius, maxCircleResidualMm=max(abs(math.hypot(p[0]-x, p[1]-y)-radius) for p in points),
                maxPlaneResidualMm=max(abs(p[2]) for p in points))


def centerline_measurements(observations):
    centers = [item['measuredCenter'] for item in observations if item.get('measuredCenter') is not None]
    if len(centers) != len(frames()):
        return dict(available=False)
    limits = {name+axis: (min if name == 'min' else max)(point[i] for point in centers)
              for i, axis in enumerate('XYZ') for name in ['min', 'max']}
    corners = []
    for index, target in enumerate([[14, -6], [14, 6], [-14, 6], [-14, -6]]):
        points = [item['measuredCenter'] for item in observations if item.get('kind') == 'corner' and item.get('corner') == index]
        fitted = fit_circle(points)
        corners.append(dict(corner=index, fitted=fitted, targetCenter=target))
    envelope = all(abs(limits[key]-value) <= LENGTH_TOLERANCE for key, value in dict(minX=-20, maxX=20, minY=-12, maxY=12, minZ=0, maxZ=0).items())
    corner_match = all(item['fitted'] is not None and abs(item['fitted']['radius']-6) <= LENGTH_TOLERANCE
                       and math.dist([item['fitted']['x'], item['fitted']['y']], item['targetCenter']) <= LENGTH_TOLERANCE
                       and item['fitted']['maxCircleResidualMm'] <= LENGTH_TOLERANCE for item in corners)
    return dict(available=True, bounds=limits, corners=corners, matches=envelope and corner_match)
