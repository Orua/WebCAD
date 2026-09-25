// Editable catalog metadata for bowedTwinWindowPlate.
export default Object.freeze({
  "label": "鼓侧边平板双窗扣",
  "labelEn": "Bowed-side twin-window plate",
  "description": "上下直边、两侧大圆弧鼓边与四角小 R 相切；两个跑道形窗孔及中横条一体成板，可选前后边缘倒圆。左右、上下镜像参数模型，源图有微小非对称时只能近似。",
  "descriptionEn": "A flat plate with straight top/bottom, tangent bowed sides and four small corner arcs, plus two symmetric capsule windows. Optional edge fillet. Symmetric parameter model only.",
  "defaults": {
    "outerHeight": 24.5,
    "topStraightWidth": 30.2527,
    "sideRadius": 35.688467,
    "cornerRadius": 6,
    "windowWidth": 32,
    "windowHeight": 6.55,
    "windowSpacing": 10.35,
    "thickness": 3.7,
    "edgeRadius": 0.8
  },
  "fields": [
    {
      "key": "outerHeight",
      "label": "外高",
      "labelEn": "Outer height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "topStraightWidth",
      "label": "上/下直段长度",
      "labelEn": "Top/bottom straight length",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "sideRadius",
      "label": "侧边鼓弧 R",
      "labelEn": "Bowed side radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "cornerRadius",
      "label": "四角 R",
      "labelEn": "Corner radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowWidth",
      "label": "每孔净宽",
      "labelEn": "Window width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowHeight",
      "label": "每孔净高",
      "labelEn": "Window height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowSpacing",
      "label": "两孔中心距",
      "labelEn": "Window center spacing",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "thickness",
      "label": "板厚",
      "labelEn": "Thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "edgeRadius",
      "label": "前后边缘 R",
      "labelEn": "Front/back edge radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    }
  ]
});
