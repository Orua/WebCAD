// Editable catalog metadata for twinWindowPlate.
export default Object.freeze({
  "label": "平板双窗扣",
  "labelEn": "Flat twin-window buckle",
  "description": "独立外 R 和孔 R 的平板双窗，中间是板体一部分；整件前后尖边按指定 R 倒圆。两个孔等宽等高且上下对称，不含圆杆、偏置孔或侧向拱弯。",
  "descriptionEn": "A flat plate with two equal symmetric rounded windows and an integral center bridge. Independent outline, window and front/back edge radii. No round bar, offset windows or side arch.",
  "defaults": {
    "outerWidth": 44.8,
    "outerHeight": 26.6,
    "outerRadius": 3.5,
    "windowWidth": 37.8,
    "totalInnerHeight": 19.6,
    "windowRadius": 2,
    "barWidth": 3.5,
    "thickness": 3.5,
    "edgeRadius": 0.5
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
      "key": "outerRadius",
      "label": "外平面 R",
      "labelEn": "Outer planar radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "windowWidth",
      "label": "每孔净宽",
      "labelEn": "Window clear width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "totalInnerHeight",
      "label": "双孔与横条总内高",
      "labelEn": "Total inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowRadius",
      "label": "孔内平面 R",
      "labelEn": "Window planar radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "barWidth",
      "label": "中横条正面宽",
      "labelEn": "Center bridge width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "整板厚度",
      "labelEn": "Plate thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "edgeRadius",
      "label": "前后边缘截面 R",
      "labelEn": "Front/back edge radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ]
});
