# A07 persisted-topology diagnostic (OCCT 7.8.1)

This isolated console program reads the existing synthetic A07 `baseline.brep`,
`cutter.brep`, `invalid-result.brep` and `invalid-face.brep`. It does not create a
baseline, run Boolean operations, heal, sew, deploy, or enable shoulder capability.
There is no public Services operation or runtime dependency on this directory.

Build with the fixed Windows OCCT **7.8.1 EXACT** SDK, pinned nlohmann headers and
llvm-mingw toolchain. Keep binaries/build dependencies under
`F:/WebCADServices-local/tests/r1-shoulder`; reports and exploratory sources remain
under `G:/CAD-Workspace/WebCAD/{temp,reports}/20261010-R1-next/n3`.

```powershell
# After configuring this directory with the fixed SDK/toolchain:
& 'F:/WebCADServices-local/tests/r1-shoulder/build/ShoulderDiagnostic.exe' `
  'G:/CAD-Workspace/WebCAD/services/a07-shoulder-diagnostic' `
  'G:/CAD-Workspace/WebCAD/temp/20261010-R1-next/n3/topology-diagnostic.json'
```

The JSON records ordered coedges, 3D/PCurve ranges, orientation, vertices, endpoint
agreement, BRepCheck_Wire's failure pair, ShapeAnalysis_Wire checks and complete
pairwise trimmed-PCurve intersections/overlaps at the original 1e-7 precision.
Face indices are zero-based and edge/vertex IDs are one-based, scoped to one loaded
file. They are evidence IDs, never persistent product selections. If ordered and
raw coedge counts differ, an ordered traversal is incomplete; inspect raw wire
occurrences rather than guessing the missing edge. ShapeAnalysis's FAIL status
alone does not replace BRepCheck validity.

The N3 one-off shared-topology candidate and raw-occurrence inspector are research
sources on G:, not product code. The single authorized candidate was rejected:
12 faces/one solid, invalid reconstructed host/protected-strip wires and wrong
material results. See `N3.md`, `budget-ledger.json`, `candidate-result.json` and
`candidate-raw-coedges.json` in the above evidence directories. Do not rerun or
repair/retry the candidate under this exhausted budget.

Signed, face-oriented adaptive seam normals and G0 samples are finite evidence,
not strict whole-curve guarantees. Low G1 covers only U=[1/3,2/3], and protected ends
carry no whole-edge G1 claim. No real product, horse, eleven-layer extension, R
substitution, or release acceptance follows from these diagnostic programs.
