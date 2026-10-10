# Format matrix (2026-09-23)

| Input | Current capability | Important limits |
| --- | --- | --- |
| `.logo.json` | Prototype conversion | `webcad-logo v1`, mm, polygon regions; measured size must match `sizeMm` |
| `.svg` | Prototype conversion | mm root size; matching viewBox; direct path M/L/H/V/Z or rect; evenodd compound holes/islands; no group, transform, curves, CSS, text, stroke, opacity, clip, mask or external resources |
| `.png` | Prototype raster tracing | Static, signature checked, threshold and transparent pixels; no EXIF, crop or advanced background selection |
| `.jpg` / `.jpeg` | Prototype raster tracing | Static, signature checked; no EXIF orientation or crop |
| `.bmp` | Prototype raster tracing | Decoder-supported variants only; signature checked |
| `.dxf` | Prototype conversion | 2D ASCII `AC1015`, `AC1018`, `AC1021`, `AC1024`, `AC1027`, `AC1032` (R2000/R2004/R2007/R2010/R2013/R2018); closed LWPOLYLINE without bulge and joined LINE chains; rejects open, branched, 3D or other entities. `$INSUNITS` 1/4/5/6 converts inches/mm/cm/m; unknown units require an explicit size mode. |
| `.pdf` / PDF-compatible `.ai` | Prototype vector conversion | PDF signature and PdfPig parse; one selected page, filled paths, evenodd compound holes, cubic curves flattened to requested tolerance. Stroke-only state operators such as `J` may occur on fill-only paths; actual painted strokes remain rejected. Rejects text, images, strokes, clipping, transparency/graphics effects, multiple colors, rotated pages and unhandled operators; nonzero winding with multiple subpaths is rejected. |
| `.dwg`, CDR, EPS, other AI | Disabled | No licensed provider |

Pure stroked PDF linework is accepted as a separate reconstruction case: straight segments are joined into closed boundaries. By default, the join tolerance is 0.25% of the complete logo width, so it scales with the artwork; `PdfJoinToleranceMm` set to a positive value explicitly overrides this in final millimetres (up to 0.1 mm). Unique endpoint matching, short spur removal and short collinear backtrack removal remain required. It returns `needsReview`; this interprets stroke centerlines as boundaries and does not expand stroke width. Mixed fill/stroke content and dashed/curved linework remain unsupported. Both the original FURLA LOGO.pdf and the scaled FURLA extracted from the ten-logo sheet were verified with 5 regions and closed paths. MARC_JACOBS_INFO was verified after removing source backtracks.

The word *prototype* means limited local acceptance; it does not mean the full source-format subset or production isolation from the requirements document has passed. PDF and DXF source content is never silently rasterized.
