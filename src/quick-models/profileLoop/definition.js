// Editable catalog metadata for profileLoop.
export default Object.freeze({
  "label": "圆角扁方截面直段长圈",
  "labelEn": "Capsule loop with rounded rectangular section",
  "description": "两端半圆、上下直段的闭合长圈；正面料宽、侧面厚度和截面 R 独立。R 可等于截面短边一半，形成两圆端加直段的截面。",
  "descriptionEn": "Closed capsule loop with semicircular ends and straight runs. Front width, side depth and section radius are independent; a half-short-side radius forms an exact stadium section.",
  "defaults": {
    "innerWidth": 35.2,
    "innerHeight": 14.6,
    "sectionWidth": 5.5,
    "sectionDepth": 6,
    "sectionRadius": 2.5
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
      "key": "sectionWidth",
      "label": "正面料宽",
      "labelEn": "Front section width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionDepth",
      "label": "侧面厚度",
      "labelEn": "Side section depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionRadius",
      "label": "方线截面 R（圆线忽略）",
      "labelEn": "Square section corner R",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ]
});
