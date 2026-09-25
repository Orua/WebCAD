// Editable catalog metadata for gableOpenFrame.
export default Object.freeze({
  "label": "斜肩开口框",
  "labelEn": "Open gable frame",
  "description": "两只直腿与屋顶形斜肩组成开口框，端部按指定 R 做两段圆角与短平底。内外宽、内外肩高、内外峰高、板厚分别输入。",
  "descriptionEn": "Open gable frame with straight legs, sloped shoulders and rounded open ends. Independent inner/outer widths, shoulder and peak heights, depth and end radius.",
  "defaults": {
    "outerWidth": 25,
    "innerWidth": 20,
    "outerPeakHeight": 16,
    "outerShoulderHeight": 12.4,
    "innerPeakHeight": 13.5,
    "innerShoulderHeight": 10.5,
    "thickness": 4,
    "endRadius": 1
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
      "key": "outerPeakHeight",
      "label": "外峰高",
      "labelEn": "Outer peak height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "outerShoulderHeight",
      "label": "外肩高",
      "labelEn": "Outer shoulder height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerPeakHeight",
      "label": "内峰高",
      "labelEn": "Inner peak height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerShoulderHeight",
      "label": "内肩高",
      "labelEn": "Inner shoulder height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "板厚",
      "labelEn": "Plate depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "endRadius",
      "label": "脚端 R",
      "labelEn": "Leg end radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ]
});
