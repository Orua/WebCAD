// Editable catalog metadata for capsuleWire.
export default Object.freeze({
  "label": "圆线直段长圈",
  "labelEn": "Round-wire capsule loop",
  "description": "闭合圆线长圈：两端精确半圆、上下直段，内宽高与圆线直径独立输入。未标缝宽时不猜接缝。",
  "descriptionEn": "Closed round-wire capsule loop with exact semicircular ends and straight runs. Set inner width, inner height and wire diameter; an unmarked seam is not guessed.",
  "defaults": {
    "innerWidth": 34.9,
    "innerHeight": 13.9,
    "sectionSize": 6.1
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
    }
  ]
});
