// Editable catalog metadata for dFlatFrame.
export default Object.freeze({
  "label": "独立底角 R 平板 D 框",
  "labelEn": "Flat D frame with independent bottom radii",
  "description": "半圆冠、直腿与独立内外底角 R 的平板 D 框；可按实际宽度切开底部中央。厚度为平板厚度，不代替圆线截面。",
  "descriptionEn": "Flat D frame with semicircular crown, straight legs, independent inner/outer bottom radii and optional measured bottom gap. Thickness is a flat plate depth, not a round-wire section.",
  "defaults": {
    "outerWidth": 28,
    "outerHeight": 25,
    "innerWidth": 20,
    "innerHeight": 17,
    "outerBottomRadius": 3.5,
    "innerBottomRadius": 2,
    "thickness": 4,
    "gapWidth": 0
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
      "key": "outerBottomRadius",
      "label": "底外 R",
      "labelEn": "Outer bottom radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "innerBottomRadius",
      "label": "底内 R",
      "labelEn": "Inner bottom radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "平板厚度",
      "labelEn": "Flat plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "gapWidth",
      "label": "底部实际缝宽（0 闭合）",
      "labelEn": "Bottom gap (0 = closed)",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ]
});
