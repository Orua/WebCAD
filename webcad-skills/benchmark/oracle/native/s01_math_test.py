"""Pure measured-section regressions; no CAD runtime or fixture generation."""
import math
import unittest
import s01_math as oracle


def contour(t, shift=0, width=20, height=12, angle_offset=0):
    angle = math.pi*t/3+angle_offset
    c, s = math.cos(angle), math.sin(angle)
    vertices = [[shift+c*x-s*y, s*x+c*y, 40*t] for x, y in
                [(-width/2, -height/2), (width/2, -height/2), (width/2, height/2), (-width/2, height/2)]]
    return vertices, list(zip(vertices, vertices[1:]+vertices[:1]))


class TwistMathTest(unittest.TestCase):
    def test_actual_rotated_rectangle_frame(self):
        for t in oracle.STATIONS:
            points, segments = contour(t)
            measured = oracle.frame_evidence(points, segments, t)
            self.assertTrue(measured['verdict'])
            self.assertAlmostEqual(measured['fitted']['width'], 20)
            self.assertAlmostEqual(measured['fitted']['height'], 12)
            self.assertAlmostEqual(measured['fitted']['angleDeg'], 60*t)
            self.assertFalse(measured['continuousMaximumErrorCertified'])

    def test_wrong_middle_angle_rejected_with_same_area(self):
        points, segments = contour(.5, angle_offset=math.pi/12)
        measured = oracle.frame_evidence(points, segments, .5)
        self.assertAlmostEqual(measured['fitted']['area'], 240)
        self.assertFalse(measured['verdict'])

    def test_displacement_and_area_preserving_distortion_rejected(self):
        for kwargs in [dict(shift=1), dict(width=24, height=10)]:
            points, segments = contour(.5, **kwargs)
            self.assertFalse(oracle.frame_evidence(points, segments, .5)['verdict'])

    def test_missing_contour_is_unknown(self):
        self.assertIsNone(oracle.frame_evidence([], [], .5)['verdict'])
        self.assertIsNone(oracle.fit_rectangle([[i, 0, 0] for i in range(4)]))

    def test_off_grid_sampling_is_retained(self):
        self.assertEqual(len(oracle.STATIONS), 39)
        self.assertTrue(all(t in oracle.STATIONS for t in [0, .25, .5, .75, 1, .311, .537]))


if __name__ == '__main__':
    unittest.main()
