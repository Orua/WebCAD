"""Frozen cubic Bezier specification and independent numerical measurements."""
import math

CONTROLS = ((0, 0, 0), (15, 0, 10), (-10, 10, 25), (5, 0, 40))


def center(t, controls=CONTROLS):
    s = 1-t
    return [s**3*controls[0][i]+3*s*s*t*controls[1][i]+3*s*t*t*controls[2][i]+t**3*controls[3][i] for i in range(3)]


def derivative(t, controls=CONTROLS):
    return [3*((1-t)**2*(controls[1][i]-controls[0][i])+2*(1-t)*t*(controls[2][i]-controls[1][i])+t*t*(controls[3][i]-controls[2][i])) for i in range(3)]


def second(t):
    return [-240+480*t, 60-180*t, 30-30*t]


def unit(v):
    length = math.sqrt(sum(x*x for x in v))
    if length < 1e-12:
        raise ValueError('DEGENERATE_PATH_FRAME')
    return [x/length for x in v]


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def frame(t):
    n = unit(derivative(t));u = unit(cross((0, 0, 1) if abs(n[2]) < .9 else (1, 0, 0), n))
    return dict(t=t, center=center(t), normal=n, u=u, v=cross(n, u))


def arc_length(intervals=4096):
    if intervals < 2 or intervals % 2:
        raise ValueError('EVEN_INTEGRATION_INTERVAL_COUNT_REQUIRED')
    speed = lambda t: math.sqrt(sum(x*x for x in derivative(t)))
    return (speed(0)+speed(1)+sum((4 if i % 2 else 2)*speed(i/intervals) for i in range(1, intervals)))/(3*intervals)


def curvature_radius(t):
    d = derivative(t);numerator = math.sqrt(sum(x*x for x in cross(d, second(t))))
    return math.sqrt(sum(x*x for x in d))**3/numerator if numerator > 1e-12 else math.inf


def surface(t, angle):
    f = frame(t)
    return [f['center'][i]+2*(math.cos(angle)*f['u'][i]+math.sin(angle)*f['v'][i]) for i in range(3)]
