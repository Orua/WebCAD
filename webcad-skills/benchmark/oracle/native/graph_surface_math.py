"""Original S07/S08 graph equations and bounded observation sample locations."""
import math

OFF_GRID = ((.113, .219), (.337, .581), (.719, .873), (.887, .443))


def target(case_id, u, v):
    if case_id == 'S07':
        x, y = 20*u-10, 20*v-10
        return None if x*x+y*y < 9-1e-9 else [x, y, (x*x-y*y)/100]
    if case_id == 'S08':
        return [20*u, 20*v, 3*v*math.sin(math.pi*u)+2*math.sin(math.pi*v)]
    raise ValueError('GRAPH_CASE_UNSUPPORTED')


def samples(case_id):
    result = [target(case_id, i/8, j/8) for i in range(9) for j in range(9)]
    result.extend(target(case_id, u, v) for u, v in OFF_GRID)
    return [point for point in result if point is not None]


def boundary_samples(case_id):
    points = []
    for i in range(17):
        t = i/16
        for u, v in ((0, t), (1, t), (t, 0), (t, 1)):
            points.append(target(case_id, u, v))
    if case_id == 'S07':
        for i in range(48):
            angle = 2*math.pi*i/48;x, y = 3*math.cos(angle), 3*math.sin(angle)
            points.append([x, y, (x*x-y*y)/100])
    return points
