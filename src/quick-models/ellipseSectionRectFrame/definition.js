// Editable catalog metadata for ellipseSectionRectFrame.
export default Object.freeze({
  "label": "椭圆截面圆角方框",
  "labelEn": "Rounded rectangle with elliptical section",
  "description": "以独立正面料宽和侧面深度构造椭圆截面，沿圆角矩形中心线扫掠；内 R 为平面内孔圆角，不自动等于侧面 R。",
  "descriptionEn": "Sweep an elliptical cross-section around a rounded rectangular centerline. Front band width and side depth are independent; the inner planar radius is separate from section shape.",
  "defaults": {
    "innerWidth": 25,
    "innerHeight": 19,
    "innerRadius": 2.5,
    "sectionWidth": 5.5,
    "sectionDepth": 6
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
      "key": "innerRadius",
      "label": "平面内 R",
      "labelEn": "Inner planar radius",
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
      "label": "侧面深度",
      "labelEn": "Side depth",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
