# Quick start / 从空白页到交付

Use a blank project in a trusted deployment. For source builds see [BUILD.md](BUILD.md); the anonymous public deployment has a separate [acceptance checklist](PUBLIC-DEPLOYMENT.md).

1. Open the basic-solid creation tool and create a box, for example 20 × 10 × 5 mm. Keep the default placement unless you need a specific reference anchor.
2. Select the box, open its available dimensions/properties and change one dimension in the current session. Apply the change; inspect the displayed shape and use measurement tools to confirm the dimensions.
3. Try undo and redo in this session. A rendered image alone does not confirm an exact solid; check the operation result and geometry information too.
4. Save the project as `.webcad`. Reopen the saved file in a separate blank project and confirm the final shape and object state.
5. Select the exact solid and export STEP. Confirm the export produced nonempty STEP data and import it in a blank project or independent CAD application. STL exports triangles and does not substitute for this precise-geometry check.

The default saved project preserves final BRep/complete meshes, identity, appearance, visibility, material and valid anchors. Session parameter editing and undo are distinct from permanent feature-tree history; the default file does not save the complete modeling recipe or undo timeline.

This is a reproducible acceptance procedure, not a claim that the current build or a particular public deployment has executed it. See [VALIDATION.md](VALIDATION.md) for the evidence required to record a pass. Detailed menu and selection behavior is documented in the [Chinese user guide](USER-GUIDE.zh-CN.md).
