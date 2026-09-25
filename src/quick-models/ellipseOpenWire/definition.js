// Editable catalog metadata for ellipseOpenWire.
export default Object.freeze({
  "label": "内真椭圆开缝圆线圈",
  "labelEn": "Open round-wire ellipse from inner outline",
  "description": "以内孔真椭圆外偏半线径扫掠圆线；底部正中用平行平面切出真实缝宽。外轮廓真椭圆的图纸不可使用本工具。",
  "descriptionEn": "Sweep round wire along a half-wire outward offset of a true inner ellipse, then cut a bottom-center parallel flat gap. Source drawings with a true outer ellipse need another tool.",
  "defaults": {
    "innerWidth": 15,
    "innerHeight": 20,
    "sectionSize": 3.5,
    "gapWidth": 0.2
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内高",
      "labelEn": "Inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionSize",
      "label": "线径／方线边长",
      "labelEn": "Wire diameter / square size",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "gapWidth",
      "label": "底中实际平切缝宽",
      "labelEn": "Bottom-center parallel gap width",
      "type": "number",
      "min": 0.01,
      "step": 0.1
    }
  ]
});
