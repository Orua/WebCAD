// Editable catalog metadata for washer.
export default Object.freeze({
  "label": "平垫圈",
  "labelEn": "Flat washer",
  "description": "平面环片，外径 = 内径 + 2 × 径向宽度；无额外倒角。",
  "defaults": {
    "innerDiameter": 10,
    "sectionSize": 3,
    "innerHeight": 1.5
  },
  "fields": [
    {
      "key": "innerDiameter",
      "label": "内径",
      "labelEn": "Inner diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionSize",
      "label": "径向宽度",
      "labelEn": "Radial width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "厚度",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
