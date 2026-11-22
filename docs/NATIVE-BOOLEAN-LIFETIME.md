# Native Boolean ownership

The matched OCCT build needs `Clear()` before an explicitly owned Boolean builder is deleted. `delete()` alone retained working data in the measured Common calls. This is an observed binding-level lifetime requirement. The underlying C++ destructor or ABI defect has not been isolated.

`releaseNativeBoolean` clears working data and always deletes the wrapper. `ownNativeBoolean` registers that cleanup in an existing resource scope without changing the native object's methods. A returned TopoDS result retains its own topology references. History and provenance must be read before the builder is released.

The rule covers this project's explicit Common, Fuse, Cut and Section builders, including dynamic constructors. It does not replace every Boolean hidden inside Replicad convenience methods. It does not guarantee that arbitrary models fit in a 4 GiB Wasm heap.

## Evidence

The original public feature transaction failed at its 138th material-region call. The full 38-body base occupied a Wasm linear-memory capacity of 1685323776 bytes. The failing Common reached 4294901760 bytes, near the 4 GiB limit. The transaction stayed at revision 58.

Fresh processes each queried the same saved 26-contour BRep and the same empty witness box 12 times. Deletion alone, explicit raw input/result ownership, a single Build, disabled simplification and disabled history each reached a 624230400-byte heap. Explicit Clear followed by delete stayed at 104857600 bytes. Each branch ran once. These are linear-memory capacity observations, not live allocation, RSS or speedup benchmarks.

The fixed public transaction kept all 38 bodies and all 26 contours. It committed feature 59, verified all 78 removal boxes and all 18 material connections, and saved and reopened the native model. Its complete engraving report equals the previously validated isolated segment's report. Observed Wasm capacity was 133431296 bytes after the base and 520159232 after carving, connections and reopening.

## Reproduction

Run the ownership discriminator with a saved carved segment and the existing fixed witness box:

```sh
node scripts/probes/native-region-budget.mjs delete-only 12 /path/repro-1.75.19-segment.webcad
node scripts/probes/native-region-budget.mjs explicit-clear 12 /path/repro-1.75.19-segment.webcad
```

The historical `region-budget-current.log` name denotes the deletion-only 1.75.19 path. It does not describe the 1.75.20 product implementation.

Run the actual public full-scene regression with the preserved base and audit inputs:

```sh
node scripts/probes/dragon-v5-resume-public.mjs /path/output /path/base.webcad /path/base-audit.json
```

A native trap is not zero material. A failed transaction does not prove that its Wasm heap is safe to reuse. Preserve the last committed document, inspect the receipt and use the existing `recoverKernel` path to create a new Worker when needed. This unit did not browser-test forced crash recovery. It did not add an automatic retry or weaker witness checks.
