"""Scalar and AST-only tests; no OCP import or geometry execution."""
import ast
import math
import unittest
from pathlib import Path
import m02_math as oracle


def observations():
    result = []
    for frame in oracle.frames():
        c, t = frame['center'], frame['tangent']
        points = [[c[0]-2*t[1]*math.cos(a), c[1]+2*t[0]*math.cos(a), 2*math.sin(a)] for a in [i*math.pi/24 for i in range(48)]]
        fitted = oracle.fit_circle([oracle.project(p, frame) for p in points])
        result.append(dict(**frame, fitted=fitted, measuredCenter=oracle.measured_center(fitted, frame)))
    return result


class ClosedWireMathTest(unittest.TestCase):
    def test_native_reader_ast_only(self):
        ast.parse(Path(__file__).with_name('ocp_m02_reader.py').read_text(encoding='utf-8'))

    def test_all_actual_circle_sections_and_measured_path(self):
        actual = observations()
        self.assertEqual(len(actual), 28)
        for frame in actual:
            self.assertAlmostEqual(frame['fitted']['radius'], 2)
            self.assertLess(math.dist(frame['measuredCenter'], frame['center']), 1e-10)
        measured = oracle.centerline_measurements(actual)
        self.assertTrue(measured['matches'])
        for corner in measured['corners']:
            self.assertAlmostEqual(corner['fitted']['radius'], 6)

    def test_path_envelope_is_not_tube_envelope(self):
        measured = oracle.centerline_measurements(observations())
        self.assertAlmostEqual(measured['bounds']['maxX']-measured['bounds']['minX'], 40)
        self.assertAlmostEqual(measured['bounds']['maxY']-measured['bounds']['minY'], 24)
        self.assertNotEqual(measured['bounds']['maxX'], 22)

    def test_shifted_actual_path_and_wrong_corner_fail(self):
        actual = observations()
        for item in actual:
            item['measuredCenter'][0] += 1
        self.assertFalse(oracle.centerline_measurements(actual)['matches'])
        actual = observations()
        for item in actual:
            if item['kind'] == 'corner':
                target = [[14, -6], [14, 6], [-14, 6], [-14, -6]][item['corner']]
                item['measuredCenter'][:2] = [v+(p-v)*5/6 for p, v in zip(item['measuredCenter'], target)]
        self.assertFalse(oracle.centerline_measurements(actual)['matches'])

    def test_missing_measurements_stay_unavailable(self):
        self.assertFalse(oracle.centerline_measurements(observations()[:-1])['available'])

    def test_fit_uses_actual_size_and_offset(self):
        points = [[.7+2.3*math.cos(a), -.2+2.3*math.sin(a), 0] for a in [i*math.pi/24 for i in range(48)]]
        fit = oracle.fit_circle(points)
        self.assertAlmostEqual(fit['radius'], 2.3);self.assertAlmostEqual(fit['x'], .7);self.assertAlmostEqual(fit['y'], -.2)
        self.assertIsNone(oracle.fit_circle([[1, 0, 0]]*48))


if __name__ == '__main__':
    unittest.main()
