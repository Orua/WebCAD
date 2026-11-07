"""Frozen S05 radial-width/Z-height field, independent of product construction."""
import math

STATIONS = (0, .04, .125, .2, .25, .37, .5, .63, .75, .83, .93, 1)


def frame(t):
    angle = math.pi*t/2
    return dict(t=t, angleDeg=90*t, center=[20*math.cos(angle), 20*math.sin(angle), 0], radial=[math.cos(angle), math.sin(angle), 0], normal=[-math.sin(angle), math.cos(angle), 0], width=4+2*t, height=3+t)


def point(t, u, v, radius=20, area_preserving_width=False, twist=False):
    f = frame(t);width, height = f['width'], f['height']
    if area_preserving_width:
        width *= 1.2;height /= 1.2
    radial, z = u*width/2, v*height/2
    if twist:
        angle = math.pi*math.sin(math.pi*t)/6
        radial, z = radial*math.cos(angle)-z*math.sin(angle), radial*math.sin(angle)+z*math.cos(angle)
    return [(radius+radial)*f['radial'][0], (radius+radial)*f['radial'][1], z]


def measure(points, t):
    if len(points) < 4:
        return dict(available=False)
    f = frame(t)
    projected = [[p[0]*f['radial'][0]+p[1]*f['radial'][1], p[2], p[0]*f['normal'][0]+p[1]*f['normal'][1]] for p in points]
    low = [min(p[i] for p in projected) for i in range(2)];high = [max(p[i] for p in projected) for i in range(2)]
    radius, z = (low[0]+high[0])/2, (low[1]+high[1])/2
    center = [radius*f['radial'][0], radius*f['radial'][1], z]
    rectangle_error = max(min(abs(p[0]-low[0]), abs(p[0]-high[0]), abs(p[1]-low[1]), abs(p[1]-high[1])) for p in projected)
    return dict(available=True, t=t, angleDeg=math.degrees(math.atan2(center[1], center[0])), radius=radius, width=high[0]-low[0], height=high[1]-low[1], centerZ=z,
                planeResidualMm=max(abs(p[2]) for p in projected), rectangleResidualMm=rectangle_error)


def volume():
    return 530*math.pi/3
