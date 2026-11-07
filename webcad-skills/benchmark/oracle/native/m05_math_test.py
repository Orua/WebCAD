"""Scalar/AST-only M05 tests; never imports OCP."""
import ast
import math
import unittest
from pathlib import Path
import m05_math as oracle


def cylinder(index, radius=1, reverse=False, shift=0):
    direction = oracle.direction(index)
    center = [11*direction[0], 11*direction[1], 10]
    return dict(axis=[-v for v in direction] if reverse else direction,
                x=9*direction[0]-shift*direction[1], y=9*direction[1]+shift*direction[0], z=10,
                radius=radius, bounds={**{'min'+axis: value-.5 for axis, value in zip('XYZ', center)},
                                       **{'max'+axis: value+.5 for axis, value in zip('XYZ', center)}})


class RadialHoleMathTest(unittest.TestCase):
    def test_native_source_parses_without_import(self):
        ast.parse(Path(__file__).with_name('ocp_m05_reader.py').read_text(encoding='utf-8'))

    def test_six_actual_radial_axes_and_reversal(self):
        for reverse in [False, True]:
            observations = [oracle.classify_hole(cylinder(i, reverse=reverse)) for i in range(6)]
            self.assertEqual([o['index'] for o in observations], list(range(6)))
            self.assertTrue(all(o['matches'] for o in observations))
            self.assertEqual(len(oracle.distinct_holes(observations+observations)), 6)

    def test_wrong_axis_size_and_seventh_hole(self):
        self.assertFalse(oracle.classify_hole(cylinder(0, shift=1.5))['matches'])
        self.assertFalse(oracle.classify_hole(cylinder(0, radius=1.2))['matches'])
        seventh = oracle.classify_hole(cylinder(.5))
        self.assertFalse(seventh['matches'])
        self.assertEqual(len(oracle.distinct_holes([oracle.classify_hole(cylinder(i)) for i in range(6)]+[seventh])), 7)

    def test_height_error_and_degenerate_direction(self):
        actual = cylinder(0);actual['z'] = 11
        self.assertFalse(oracle.classify_hole(actual)['matches'])
        actual['axis'] = [0, 0, 0]
        self.assertIsNone(oracle.classify_hole(actual))


if __name__ == '__main__':
    unittest.main()
