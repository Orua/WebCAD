// Editable catalog metadata for ellipseBar.
export default Object.freeze({
  "label": "椭圆圈固定横杆",
  "labelEn": "Elliptical ring with fixed bar",
  "description": "从内真椭圆外偏线扫掠圆线，再融合居中固定圆杆。圆线外包围须精确回读；接头过渡与源样条仍须对照。",
  "descriptionEn": "Offset a true inner ellipse for a round-wire sweep and fuse one centered fixed round bar. Read back exact bounds; source spline and joint continuity still require comparison.",
  "defaults": {
    "innerWidth": 35,
    "innerHeight": 25,
    "sectionSize": 5,
    "barDiameter": 5,
    "barDepthOffset": 0
  },
  "fields": [
    {
      "key": "innerWidth",
      "label": "内椭圆长径",
      "labelEn": "Inner ellipse major diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "innerHeight",
      "label": "内椭圆短径",
      "labelEn": "Inner ellipse minor diameter",
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
    },
    {
      "key": "barDiameter",
      "label": "横杆直径",
      "labelEn": "Bar diameter",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "barDepthOffset",
      "label": "横杆 Z 错层",
      "labelEn": "Bar Z depth offset",
      "type": "number",
      "min": -100,
      "step": 0.1
    }
  ]
});
