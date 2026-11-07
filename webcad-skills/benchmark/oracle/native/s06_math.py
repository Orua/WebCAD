"""Pure numerical S06 oracle mathematics. No OCP, browser or IO imports."""
import math

TOLERANCE_MM = .05
SAMPLE_PARAMETERS = [i/8 for i in range(9)]
OFF_GRID = [(.113, .219), (.337, .581), (.719, .873), (.887, .443)]


def target(u, t):
    w, sine = 2*u-1, math.sin(math.pi*t)
    return [w*(10+2*sine), 40*t, 5*sine+2*w*w]


def derivatives(u, t):
    w, sine, cosine = 2*u-1, math.sin(math.pi*t), math.cos(math.pi*t)
    return [2*(10+2*sine), 0, 8*w], [2*math.pi*w*cosine, 40, 5*math.pi*cosine]


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def clamp(value):
    return min(1.0, max(0.0, value))


def distance_squared(a, b):
    return sum((x-y)**2 for x, y in zip(a, b))


def closest_target(point, boundary=None):
    """Bounded multistart numerical distance to the prescribed analytic graph.

    A returned target point always lies in the declared domain. A small measured
    distance establishes sample membership; this is not a global extrema proof.
    """
    initial_t = clamp(point[1]/40)
    initial_u = clamp((point[0]/(10+2*math.sin(math.pi*initial_t))+1)/2)
    seeds = [(initial_u, initial_t), (.5, .5), (0, 0), (1, 0), (0, 1), (1, 1)]
    if boundary:
        axis, fixed = boundary
        seeds = [(fixed, v) if axis == 0 else (v, fixed) for v in [initial_t if axis == 0 else initial_u, 0, .25, .5, .75, 1]]
    best = None
    for seed in seeds:
        u, t = seed
        converged = False
        for iteration in range(40):
            p = target(u, t)
            residual = [a-b for a, b in zip(p, point)]
            du, dt = derivatives(u, t)
            if boundary:
                tangent = dt if boundary[0] == 0 else du
                step = -dot(tangent, residual)/dot(tangent, tangent)
                delta_u, delta_t = (0, step) if boundary[0] == 0 else (step, 0)
            else:
                a, b, c = dot(du, du), dot(du, dt), dot(dt, dt)
                g0, g1 = dot(du, residual), dot(dt, residual)
                determinant = a*c-b*b
                delta_u, delta_t = (-c*g0+b*g1)/determinant, (b*g0-a*g1)/determinant
            current = distance_squared(p, point)
            moved = False
            for exponent in range(16):
                scale = .5**exponent
                next_u, next_t = clamp(u+scale*delta_u), clamp(t+scale*delta_t)
                if boundary:
                    if boundary[0] == 0:
                        next_u = boundary[1]
                    else:
                        next_t = boundary[1]
                next_distance = distance_squared(target(next_u, next_t), point)
                if next_distance <= current:
                    moved = True
                    converged = abs(next_u-u)+abs(next_t-t) < 1e-12 or abs(current-next_distance) < 1e-16
                    u, t = next_u, next_t
                    break
            if converged or not moved:
                break
        p = target(u, t)
        result = dict(distanceMm=math.sqrt(distance_squared(p, point)), point=p, u=u, t=t,
                      converged=converged, iterations=iteration+1,
                      method="bounded multistart Gauss-Newton on analytic target")
        if best is None or result["distanceMm"] < best["distanceMm"]:
            best = result
    # A simple independent lower bound detects definite outside-domain geometry.
    box = [(-12, 12), (0, 40), (0, 7)]
    best["aabbLowerBoundMm"] = math.sqrt(sum(max(lo-value, 0, value-hi)**2 for value, (lo, hi) in zip(point, box)))
    return best


def closest_boundary(point):
    results = [closest_target(point, boundary) for boundary in [(0, 0), (0, 1), (1, 0), (1, 1)]]
    return min(results, key=lambda result: result["distanceMm"])


def sample_verdict(result):
    if result["distanceMm"] <= TOLERANCE_MM:
        return True
    if result.get("aabbLowerBoundMm", 0) > TOLERANCE_MM or result.get("converged"):
        return False
    return None
