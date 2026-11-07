"""Scalar and AST-only M03 tests; no native geometry execution/import."""
import ast
import math
import unittest
from pathlib import Path
import m03_math as oracle


def circle(radius, cx=0, cy=0, plane=0):
    return [[cx+radius*math.cos(i*math.pi/32), cy+radius*math.sin(i*math.pi/32), plane] for i in range(64)]


class BendMathTest(unittest.TestCase):
    def test_native_source_parses_without_import(self):
        ast.parse(Path(__file__).with_name('ocp_m03_reader.py').read_text(encoding='utf-8'))

    def test_real_points_in_each_prescribed_frame(self):
        for t in [0, 1]+oracle.STATIONS:
            center, radial, tangent = oracle.frame(t)
            self.assertAlmostEqual(math.hypot(*center[:2]), 20)
            self.assertAlmostEqual(sum(a*b for a, b in zip(radial, tangent)), 0)
            for radius in [2, 3]:
                world = [[center[i]+radius*math.cos(j*math.pi/32)*radial[i]+(radius*math.sin(j*math.pi/32) if i == 2 else 0)
                          for i in range(3)] for j in range(64)]
                self.assertTrue(oracle.ring_matches(oracle.fit_circle([oracle.project(p, t) for p in world]), radius))

    def test_wrong_wall_center_and_plane_rejected(self):
        for radius, x, y, plane in [(1.5, 0, 0, 0), (2, 2, 0, 0), (2, 0, 0, .02)]:
            self.assertFalse(oracle.ring_matches(oracle.fit_circle(circle(radius, x, y, plane)), 2))

    def test_fitted_radius_comes_from_actual_points(self):
        fit = oracle.fit_circle(circle(2.6, .3, -.2))
        self.assertAlmostEqual(fit['radius'], 2.6);self.assertAlmostEqual(fit['x'], .3);self.assertAlmostEqual(fit['y'], -.2)
        self.assertIsNone(oracle.fit_circle([[1, 0, 0]]*64))

    def test_tangent_normals_allow_reversal_but_reject_rotation(self):
        self.assertEqual(oracle.normal_error_mm([0, -1, 0], [0, 1, 0]), 0)
        self.assertGreater(oracle.normal_error_mm([math.sin(math.pi/18), math.cos(math.pi/18), 0], [0, 1, 0]), .01)

    def test_available_closed_pair_is_required_by_native_verdict(self):
        tree = ast.parse(Path(__file__).with_name('ocp_m03_reader.py').read_text(encoding='utf-8'))
        namespace = {'oracle': oracle}
        functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in {'ring_verdict', 'combined'}]
        exec(compile(ast.Module(body=functions, type_ignores=[]), 'm03-pure-verdicts', 'exec'), namespace)
        rings = [{'closed': True, 'fitted': oracle.fit_circle(circle(r))} for r in [2, 3]]
        self.assertTrue(namespace['ring_verdict']({'available': True, 'rings': rings}))
        rings[0]['closed'] = False
        self.assertFalse(namespace['ring_verdict']({'available': True, 'rings': rings}))
        self.assertIsNone(namespace['ring_verdict']({'available': False}))
        self.assertFalse(namespace['combined']([None, False]))


if __name__ == '__main__':
    unittest.main()
