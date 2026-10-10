# Known limitations

- M0 prototype only. Worker currently inherits the launching process identity and is killed on timeout/cancel; Windows Job Object, low-privilege token, system-wide concurrency and crash cleanup are not implemented. Do not expose it as a public upload API.
- PDF/AI and DXF are limited to the subsets in `FORMAT_MATRIX.md`; text, images, clipping, transparency, stroke expansion, DXF curves/INSERT and many other source features are rejected explicitly. DWG is disabled. SVG curves, transforms, nested groups, styling and strokes are rejected explicitly.
- Raster tracing follows thresholded pixel edges without smoothing. Its geometry is valid only for the thresholded mask, and source reconstruction error is unknown. Crop, orientation, advanced background handling, denoise and preview are not yet implemented.
- `InspectAsync` returns PDF page count and selected page but no preview, object, layer or selection bounds. The current prototype does not implement selection or multi-color foreground choice.
- The local WebForms page is a direct conversion test. It has no authenticated source/result IDs, retention policy, CSRF handling or WebCAD frontend integration.
- No clean IIS machine, real customer files, browser CAD application, STEP output, concurrent load or adversarial parser campaign has been accepted.
