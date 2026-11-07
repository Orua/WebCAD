"""M03 scalar geometry only. No CAD imports or expected values as observations."""
import math

STATIONS = sorted(set([i/16 for i in range(1, 16)] + [.017, .173, .431, .719, .983]))
LENGTH_TOLERANCE = .01


def frame(t):
    angle = math.pi*t/2
    c, s = math.cos(angle), math.sin(angle)
    return [20*c, 20*s, 0], [c, s, 0], [-s, c, 0]


def project(point, t):
    center, radial, tangent = frame(t)
    delta = [p-c for p, c in zip(point, center)]
    return [sum(a*b for a, b in zip(delta, radial)), delta[2], sum(a*b for a, b in zip(delta, tangent))]


def fit_circle(points):
    if len(points) < 6 or any(not math.isfinite(v) for p in points for v in p):
        return None
    means = [sum(p[i] for p in points)/len(points) for i in range(3)]
    matrix = [[0.0]*4 for _ in range(3)]
    for x, y, _ in points:
        dx, dy = x-means[0], y-means[1]
        row, value = [dx, dy, 1.0], -(dx*dx+dy*dy)
        for i in range(3):
            for j in range(3):
                matrix[i][j] += row[i]*row[j]
            matrix[i][3] += row[i]*value
    for column in range(3):
        pivot = max(range(column, 3), key=lambda row: abs(matrix[row][column]))
        if abs(matrix[pivot][column]) < 1e-12:
            return None
        matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
        divisor = matrix[column][column]
        matrix[column] = [v/divisor for v in matrix[column]]
        for row in range(3):
            if row != column:
                factor = matrix[row][column]
                matrix[row] = [a-factor*b for a, b in zip(matrix[row], matrix[column])]
    a, b, c = (matrix[i][3] for i in range(3))
    squared = (a*a+b*b)/4-c
    if squared <= 0:
        return None
    x, y, radius = means[0]-a/2, means[1]-b/2, math.sqrt(squared)
    return dict(x=x, y=y, radius=radius, maxCircleResidualMm=max(abs(math.hypot(p[0]-x, p[1]-y)-radius) for p in points),
                maxPlaneResidualMm=max(abs(p[2]) for p in points), pointCount=len(points))


def ring_matches(fitted, radius):
    return bool(fitted and math.hypot(fitted['x'], fitted['y']) <= LENGTH_TOLERANCE
                and abs(fitted['radius']-radius) <= LENGTH_TOLERANCE
                and fitted['maxCircleResidualMm'] <= LENGTH_TOLERANCE
                and fitted['maxPlaneResidualMm'] <= LENGTH_TOLERANCE)


def normal_error_mm(normal, tangent, diameter=6):
    # Orientation of the surface parameterization may reverse on STEP import.
    norm = math.sqrt(sum(v*v for v in normal))
    if norm == 0:
        return math.inf
    cosine = min(1, abs(sum(a*b for a, b in zip(normal, tangent)))/norm)
    return diameter*math.sqrt(max(0, 1-cosine*cosine))
