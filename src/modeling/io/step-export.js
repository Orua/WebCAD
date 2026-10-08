import * as cad from 'replicad';

// CSS colors are sRGB. OCCT stores linear RGB and STEPConstruct_Styles writes sRGB.
// Replicad's hex assembly colors enter OCCT as linear bytes, so assign precise
// linear floats before writing instead of quantizing a second hex color.
const linear = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

export function exportColoredSTEP(configs, oc) {
  const owned = [], hold = value => { owned.push(value); return value; };
  const filename = '/webcad-export.step';
  try {
    const assembly = hold(cad.createAssembly(configs));
    const main = hold(assembly.wrapped.Main());
    const shapes = hold(oc.XCAFDoc_DocumentTool.ShapeTool(main));
    const colors = hold(oc.XCAFDoc_DocumentTool.ColorTool(main));
    for (const {shape, color} of configs) {
      const label = hold(shapes.FindShape(shape.wrapped, false));
      const rgb = [1,3,5].map(index => linear(parseInt(color.slice(index, index + 2), 16) / 255));
      const rgba = hold(new oc.Quantity_ColorRGBA(...rgb, 1));
      colors.SetColor(label, rgba, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
    }
    hold(new oc.STEPCAFControl_Writer());
    oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM');
    oc.Interface_Static.SetCVal('write.step.unit', 'MM');
    const session = hold(new oc.XSControl_WorkSession());
    const writer = hold(new oc.STEPCAFControl_Writer(session, false));
    writer.SetColorMode(true); writer.SetNameMode(true); writer.SetLayerMode(true);
    oc.Interface_Static.SetIVal('write.surfacecurve.mode', 1);
    oc.Interface_Static.SetIVal('write.precision.mode', 0);
    oc.Interface_Static.SetIVal('write.step.assembly', 2);
    oc.Interface_Static.SetIVal('write.step.schema', 5);
    if (!writer.Perform(assembly.wrapped, filename, hold(new oc.Message_ProgressRange()))) throw new Error('STEP 导出失败');
    return new Uint8Array(oc.FS.readFile(filename));
  } finally {
    try { oc.FS.unlink(filename); } catch { /* A failed writer may not create a file. */ }
    owned.reverse().forEach(value => { try { value.delete(); } catch { /* Release the remaining owned handles. */ } });
  }
}
