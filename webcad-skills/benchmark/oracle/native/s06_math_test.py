"""Scalar oracle selftests only. Never imports OCP or generates geometry/files."""
import math
import unittest
import s06_math as oracle


class S06MathTest(unittest.TestCase):
    def test_target_points_have_zero_distance_without_uv_assumptions(self):
        for u, t in [(0, 0), (1, 1), (.113, .219), (.719, .873), (.5, .5)]:
            result = oracle.closest_target(oracle.target(u, t))
            self.assertLess(result["distanceMm"], 1e-9)
            self.assertTrue(oracle.sample_verdict(result))

    def test_normal_distance_is_not_vertical_graph_residual(self):
        u, t = .2, .2
        p = oracle.target(u, t)
        a, b = oracle.derivatives(u, t)
        n = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
        size = math.sqrt(sum(x*x for x in n))
        point = [x+.049*y/size for x, y in zip(p, n)]
        result = oracle.closest_target(point)
        self.assertLess(result["distanceMm"], .05)
        projected_t = point[1]/40
        projected_u = (point[0]/(10+2*math.sin(math.pi*projected_t))+1)/2
        self.assertGreater(abs(point[2]-oracle.target(projected_u, projected_t)[2]), .05)

    def test_boundary_distance_distinguishes_interior_points(self):
        point = oracle.target(.5, .5)
        self.assertLess(oracle.closest_target(point)["distanceMm"], 1e-9)
        self.assertGreater(oracle.closest_boundary(point)["distanceMm"], .05)
        for boundary in [(0, .37), (1, .61), (.22, 0), (.84, 1)]:
            self.assertLess(oracle.closest_boundary(oracle.target(*boundary))["distanceMm"], 1e-8)

    def test_extra_patch_has_a_proven_outside_domain_lower_bound(self):
        result = oracle.closest_target([25, 2, 0])
        self.assertGreaterEqual(result["aabbLowerBoundMm"], 13)
        self.assertFalse(oracle.sample_verdict(result))

    def test_unknown_numerical_failure_is_not_geometry_fail(self):
        self.assertIsNone(oracle.sample_verdict(dict(distanceMm=1, converged=False, aabbLowerBoundMm=0)))

    def test_reparameterized_native_uv_is_not_used_as_target_uv(self):
        native_u, native_v = .5, .2
        actual = oracle.target(native_u**2, math.sqrt(native_v))
        closest = oracle.closest_target(actual)
        self.assertLess(closest["distanceMm"], 1e-8)
        self.assertAlmostEqual(closest["u"], .25, places=7)
        self.assertAlmostEqual(closest["t"], math.sqrt(.2), places=7)

    def test_wrong_interior_can_match_all_four_boundaries(self):
        def displaced(u, t):
            point = oracle.target(u, t)
            point[2] += 1.5*(1-(2*u-1)**2)*math.sin(math.pi*t)
            return point
        for u, t in [(0, .3), (1, .7), (.2, 0), (.8, 1)]:
            self.assertLess(oracle.closest_boundary(displaced(u, t))["distanceMm"], 1e-8)
        self.assertFalse(oracle.sample_verdict(oracle.closest_target(displaced(.5, .5))))


if __name__ == "__main__":
    unittest.main()
