// Editable catalog metadata for uEndHolePlate.
export default Object.freeze({
  "label": "半圆冠双端孔 U 板",
  "labelEn": "Arched U plate with two end holes",
  "description": "半圆冠与两条等宽直腿连成一块平板，直腿末端各有一个贯穿孔；内外冠同心，孔沿厚度方向贯穿。适合源图确认的单片 U 件，不含另一装配件、螺纹或截面圆杆。",
  "descriptionEn": "One flat U plate with concentric semicircular crowns, equal-width straight legs and one through-hole at each end. No second assembly component, thread or round-wire section.",
  "defaults": {
    "outerWidth": 22,
    "innerWidth": 10,
    "totalHeight": 31.7,
    "thickness": 3,
    "holeDiameter": 3.3,
    "holeInset": 2.7
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
      "key": "innerWidth",
      "label": "内宽",
      "labelEn": "Inner width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "totalHeight",
      "label": "外总高",
      "labelEn": "Total height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "板厚",
      "labelEn": "Plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "holeDiameter",
      "label": "两端通孔直径",
      "labelEn": "End-hole diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "holeInset",
      "label": "孔心距直腿端面",
      "labelEn": "Hole center inset from leg end",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
