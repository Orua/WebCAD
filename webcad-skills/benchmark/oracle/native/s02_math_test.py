"""Scalar ellipse tests only. Never imports OCP or writes reference geometry."""
import math
import unittest
import ast
from pathlib import Path
import s02_math as oracle

# Load only pure verdict functions, never import the OCP reader or execute geometry.
_tree = ast.parse(Path(__file__).with_name("ocp_s02_reader.py").read_text(encoding="utf-8"))
_functions = [node for node in _tree.body if isinstance(node, ast.FunctionDef) and node.name in {"measured_point_verdict", "combine_point_verdicts"}]
_namespace = {"math": math, "oracle": oracle}
exec(compile(ast.Module(body=_functions, type_ignores=[]), "s02-point-verdict-only", "exec"), _namespace)
point_verdict = _namespace["measured_point_verdict"]
combine_verdicts = _namespace["combine_point_verdicts"]


def points(a, b, angle=0, cx=0, cy=0):
    return [[cx+a*math.cos(t)*math.cos(angle)-b*math.sin(t)*math.sin(angle),
             cy+a*math.cos(t)*math.sin(angle)+b*math.sin(t)*math.cos(angle), 20]
            for t in [2*math.pi*i/64 for i in range(64)]]


class S02MathTest(unittest.TestCase):
    def test_fit_actual_axes_and_center(self):
        measured = oracle.fit_ellipse(points(8, 5, cx=2, cy=-1))
        self.assertAlmostEqual(measured["a"], 8, places=8)
        self.assertAlmostEqual(measured["b"], 5, places=8)
        self.assertAlmostEqual(measured["x"], 2, places=8)
        self.assertAlmostEqual(measured["y"], -1, places=8)

    def test_twisted_ellipse_is_not_untwisted_even_with_same_area(self):
        actual = points(8, 5, angle=math.pi/6)
        measured = oracle.fit_ellipse(actual)
        self.assertAlmostEqual(measured["major"]*measured["minor"], 40, places=7)
        self.assertGreater(max(oracle.ellipse_distance(p, 8, 5)["distanceMm"] for p in actual), .05)

    def test_circle_has_no_meaningful_major_axis_angle(self):
        measured = oracle.fit_ellipse(points(6, 6, angle=.7))
        self.assertFalse(measured["axisDefined"])
        self.assertAlmostEqual(measured["a"], 6, places=7)
        self.assertAlmostEqual(measured["b"], 6, places=7)

    def test_area_preserving_middle_distortion_requires_dimension_checks(self):
        a, b = oracle.target_axes(.5)
        wrong_a, wrong_b = a+1.5, a*b/(a+1.5)
        measured = oracle.fit_ellipse(points(wrong_a, wrong_b))
        self.assertAlmostEqual(measured["major"]*measured["minor"], a*b, places=7)
        self.assertGreater(abs(measured["a"]-a), .05)

    def test_degenerate_points_do_not_create_an_ellipse(self):
        self.assertIsNone(oracle.fit_ellipse([[i, 0, 20] for i in range(16)]))

    def test_samples_include_mandatory_and_off_grid_middle_stations(self):
        self.assertEqual(len(oracle.STATIONS), 23)
        self.assertTrue(all(t in oracle.STATIONS for t in [0, .25, .5, .75, 1]))
        self.assertIn(.311, oracle.STATIONS)

    def test_normal_distance_does_not_use_a_stricter_radial_proxy(self):
        a, b, theta = 8, 5, math.pi/4
        p = [a*math.cos(theta), b*math.sin(theta), 20]
        normal = [math.cos(theta)/a, math.sin(theta)/b]
        length = math.hypot(*normal)
        actual = [p[0]+.049*normal[0]/length, p[1]+.049*normal[1]/length, 20]
        self.assertLess(oracle.ellipse_distance(actual, a, b)["distanceMm"], .05)
        rho = math.sqrt((actual[0]/a)**2+(actual[1]/b)**2)
        self.assertGreater(math.hypot(actual[0], actual[1])*abs(1-1/rho), .05)

    def test_shifted_center_is_rejected_despite_unconverged_numerical_points(self):
        checks = [point_verdict(point, 8, 5, dict(distanceMm=1, converged=False)) for point in points(8, 5, cx=1)]
        self.assertFalse(combine_verdicts(checks))
        self.assertGreater(checks[0]["lowerBoundMm"], .99)
        self.assertEqual(checks[0]["reason"], "certified-target-ellipse-distance-lower-bound")

    def test_unknown_points_never_override_a_certified_failure(self):
        unknown = point_verdict([8, 0, 20], 8, 5, dict(distanceMm=.2, converged=False))
        failed = point_verdict([9, 0, 20], 8, 5, dict(distanceMm=1, converged=False))
        self.assertIsNone(unknown["verdict"])
        self.assertFalse(combine_verdicts([unknown, failed, unknown]))
        self.assertIsNone(combine_verdicts([unknown]))

    def test_inside_circle_violation_has_a_valid_lower_bound(self):
        result = point_verdict([0, 5.5, 40], 6, 6, dict(distanceMm=.5, converged=False))
        self.assertFalse(result["verdict"])
        self.assertAlmostEqual(result["lowerBoundMm"], .5)

    def test_true_within_tolerance_sample_is_not_rejected_by_the_lower_bounds(self):
        a, b, theta = 8, 5, math.pi/4
        normal = [math.cos(theta)/a, math.sin(theta)/b]
        length = math.hypot(*normal)
        actual = [a*math.cos(theta)+.049*normal[0]/length, b*math.sin(theta)+.049*normal[1]/length, 20]
        numerical = oracle.ellipse_distance(actual, a, b)
        result = point_verdict(actual, a, b, {**numerical, "converged": False})
        self.assertTrue(result["verdict"])
        self.assertLessEqual(result["lowerBoundMm"], numerical["distanceMm"]+1e-9)


if __name__ == "__main__":
    unittest.main()
