// Editable catalog metadata for roundedFlatFrame.
export default Object.freeze({
  "label": "圆边独立 R 平面框",
  "labelEn": "Rounded frame with independent radii",
  "description": "独立内外圆角的闭合平面框，再以指定 R 一次倒圆所有尖边。圆边 R 必须显式给出；若内核无法完成则整步失败，不自动缩小。R 接近半厚可作外观候选，不保证精确半圆截面。",
  "descriptionEn": "A flat frame with independent inner and outer corner radii, then one exact fillet of every sharp edge. The specified edge radius fails atomically if unsolvable. Near half-thickness can approximate a round section but is not certified as a semicircle.",
  "defaults": {
    "outerWidth": 40,
    "outerHeight": 28,
    "innerWidth": 30,
    "innerHeight": 18,
    "outerRadius": 5,
    "innerRadius": 2,
    "thickness": 4,
    "edgeRadius": 1.5
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
    },
    {
      "key": "edgeRadius",
      "label": "整件圆边 R",
      "labelEn": "All-edge fillet radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
