import math
import unittest
import s05_math as oracle


class BentRectangleTests(unittest.TestCase):
    def test_actual_world_points_reduce_to_radial_width_and_vertical_height(self):
        for t in oracle.STATIONS:
            points = [oracle.point(t, u, v) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            measured = oracle.measure(points, t)
            self.assertAlmostEqual(measured['width'], 4+2*t)
            self.assertAlmostEqual(measured['height'], 3+t)
            self.assertAlmostEqual(measured['radius'], 20)
            self.assertAlmostEqual(measured['angleDeg'], 90*t)

    def test_equal_area_is_not_a_valid_section_dimensions_check(self):
        t = .5
        wrong = oracle.measure([oracle.point(t, u, v, area_preserving_width=True) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))], t)
        self.assertAlmostEqual(wrong['width']*wrong['height'], (4+2*t)*(3+t))
        self.assertGreater(abs(wrong['width']-(4+2*t)), .05)
        # An independent Simpson integral of A(theta)*R agrees with the closed form.
        samples = 100
        area = lambda t: (4+2*t)*(3+t)
        integral = (area(0)+area(1)+sum((4 if i % 2 else 2)*area(i/samples) for i in range(1, samples)))/(3*samples)*20*math.pi/2
        self.assertAlmostEqual(integral, oracle.volume(), places=10)


if __name__ == '__main__':
    unittest.main()
