"""Pure measured-ellipse fitting and curve distance; no OCP or IO imports."""
import math

TOLERANCE_MM = .05
STATIONS = sorted(set([i/16 for i in range(17)] + [.017, .139, .311, .537, .773, .967]))


def fit_ellipse(points):
    if len(points) < 12:
        return None
    mean_x = sum(p[0] for p in points)/len(points)
    mean_y = sum(p[1] for p in points)/len(points)
    matrix = [[0.0]*6 for _ in range(5)]
    for x, y, _ in points:
        x, y = x-mean_x, y-mean_y
        row = [x*x, x*y, y*y, x, y]
        for i in range(5):
            for j in range(5):
                matrix[i][j] += row[i]*row[j]
            matrix[i][5] += row[i]
    for column in range(5):
        pivot = max(range(column, 5), key=lambda row: abs(matrix[row][column]))
        if abs(matrix[pivot][column]) < 1e-12:
            return None
        matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
        divisor = matrix[column][column]
        matrix[column] = [value/divisor for value in matrix[column]]
        for row in range(5):
            if row == column:
                continue
            factor = matrix[row][column]
            matrix[row] = [a-factor*b for a, b in zip(matrix[row], matrix[column])]
    a, b, c, d, e = [matrix[i][5] for i in range(5)]
    determinant = a*c-b*b/4
    if determinant <= 1e-14:
        return None
    cx, cy = -(c*d-b*e/2)/(2*determinant), -(a*e-b*d/2)/(2*determinant)
    scale = 1-(a*cx*cx+b*cx*cy+c*cy*cy+d*cx+e*cy)
    discriminant = math.hypot(a-c, b)
    small, large = (a+c-discriminant)/2, (a+c+discriminant)/2
    if small <= 0 or scale <= 0:
        return None
    major, minor = math.sqrt(scale/small), math.sqrt(scale/large)
    angle = (math.atan2(b, a-c)/2+math.pi/2+math.pi/2) % math.pi-math.pi/2
    mean_z = sum(p[2] for p in points)/len(points)
    return dict(x=mean_x+cx, y=mean_y+cy, z=mean_z,
                major=major, minor=minor, angleRad=angle,
                a=math.sqrt(scale*c/determinant), b=math.sqrt(scale*a/determinant),
                axisDefined=major-minor>1e-7,
                maxPlaneResidualMm=max(abs(p[2]-mean_z) for p in points))


def ellipse_distance(point, a, b, center=(0, 0), angle=0):
    """Numerical Euclidean distance to a planar ellipse, not radial residual."""
    cosine, sine = math.cos(angle), math.sin(angle)
    dx, dy = point[0]-center[0], point[1]-center[1]
    x, y = cosine*dx+sine*dy, -sine*dx+cosine*dy
    seeds = [math.atan2(y/b, x/a), 0, math.pi/2, math.pi, 3*math.pi/2]
    best = None
    for theta in seeds:
        converged = False
        for iteration in range(40):
            ex, ey = a*math.cos(theta), b*math.sin(theta)
            tx, ty = -a*math.sin(theta), b*math.cos(theta)
            distance_squared = (ex-x)**2+(ey-y)**2
            if distance_squared < 1e-20:
                converged = True
                break
            delta = -(tx*(ex-x)+ty*(ey-y))/(tx*tx+ty*ty)
            moved = False
            for exponent in range(16):
                next_theta = theta+delta*.5**exponent
                next_distance = (a*math.cos(next_theta)-x)**2+(b*math.sin(next_theta)-y)**2
                if next_distance <= distance_squared:
                    converged = abs(next_theta-theta)<1e-12 or abs(next_distance-distance_squared)<1e-16
                    theta = next_theta; moved = True; break
            if converged or not moved:
                break
        distance = math.hypot(a*math.cos(theta)-x, b*math.sin(theta)-y)
        result = dict(distanceMm=distance, converged=converged, iterations=iteration+1)
        if best is None or distance < best["distanceMm"]:
            best = result
        if distance < 1e-10:
            break
    return best


def target_axes(t):
    return 10-4*t, 4+2*t
