// Editable catalog metadata for flatFrame.
export default Object.freeze({
  "label": "独立内外圆角平面框",
  "labelEn": "Flat frame with independent corner radii",
  "description": "内外轮廓分别定义，框宽与厚度独立；圆角可等于短边一半形成跑道环。参数模板，不是原 IGS 完整复刻。",
  "descriptionEn": "Independent inner/outer outlines and thickness. Half-short-side radii allow capsule frames. A parametric tool, not a complete reconstruction of an IGS part.",
  "defaults": {
    "outerWidth": 40,
    "outerHeight": 28,
    "innerWidth": 28,
    "innerHeight": 16,
    "outerRadius": 5,
    "innerRadius": 3,
    "thickness": 3
  },
  "fields": [
    {
      "key": "outerWidth",
      "label": "外宽",
      "labelEn": "Outer width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerHeight",
      "label": "外高",
      "labelEn": "Outer height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
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
      "key": "outerRadius",
      "label": "外轮廓 R",
      "labelEn": "Outer corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "innerRadius",
      "label": "内轮廓 R",
      "labelEn": "Inner corner radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "厚度",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
