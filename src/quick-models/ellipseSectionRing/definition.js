// Editable catalog metadata for ellipseSectionRing.
export default Object.freeze({
  "label": "椭圆截面圆环",
  "labelEn": "Circular ring with elliptical section",
  "description": "正面环带宽和侧面深度独立输入，沿圆形中心线扫掠椭圆截面；截面形状是可编辑候选，须按源图验证。",
  "descriptionEn": "Circular ring swept from an elliptical section with independent front band width and side depth. Section shape is an editable candidate to verify against the source.",
  "defaults": {
    "innerDiameter": 37.4,
    "sectionWidth": 4.1,
    "sectionDepth": 5
  },
  "fields": [
    {
      "key": "innerDiameter",
      "label": "正面内径",
      "labelEn": "Inner front diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionWidth",
      "label": "正面料宽",
      "labelEn": "Front band width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sectionDepth",
      "label": "侧面总深度",
      "labelEn": "Side depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
