import math
import unittest
import s04_math as oracle


class BezierSpecificationTests(unittest.TestCase):
    def test_endpoints_derivatives_and_control_semantics(self):
        self.assertEqual(oracle.center(0), [0, 0, 0])
        self.assertEqual(oracle.center(1), [5, 0, 40])
        self.assertEqual(oracle.derivative(0), [45, 0, 30])
        self.assertEqual(oracle.derivative(1), [45, -30, 45])
        self.assertAlmostEqual(oracle.center(.75)[0], 0)
        self.assertNotEqual(oracle.center(2/3), list(oracle.CONTROLS[2]))

    def test_arc_length_convergence_and_reference_reach_margin(self):
        length = oracle.arc_length(4096)
        self.assertGreater(length, math.dist(oracle.CONTROLS[0], oracle.CONTROLS[-1]))
        self.assertAlmostEqual(length, oracle.arc_length(1024), places=8)
        self.assertGreater(min(oracle.curvature_radius(i/4096) for i in range(4097)), 2)
        for t in (0, .125, .5, .875, 1):
            self.assertGreater(oracle.derivative(t)[2], 0)
            self.assertAlmostEqual(math.dist(oracle.surface(t, .37), oracle.center(t)), 2)


if __name__ == '__main__':
    unittest.main()
