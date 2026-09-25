// Editable catalog metadata for archedTwinWindowPlate.
export default Object.freeze({
  "label": "圆弧拱弯平板双窗扣",
  "labelEn": "Cylindrically arched twin-window plate",
  "description": "圆角双窗平面轮廓沿 Y 方向投影裁切同轴圆筒薄壁，形成侧视圆弧拱弯。适用于薄条一体双窗；径向板厚、外弧半径独立输入。圆线框及独立圆杆须用其它工具。",
  "descriptionEn": "Intersect a rounded twin-window footprint with a coaxial cylindrical wall to create an arched plate. Set outer bend radius and radial thickness independently. Projected strip construction without source-specific edge treatment; round-wire frames need another tool.",
  "defaults": {
    "outerWidth": 32.9,
    "outerHeight": 25.5,
    "outerRadius": 3,
    "windowWidth": 25.4,
    "totalInnerHeight": 18.5,
    "windowRadius": 0.5,
    "barWidth": 3.5,
    "bendRadius": 43.90964782342324,
    "radialThickness": 2.3
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
      "label": "外轮廓平面 R",
      "labelEn": "Outer planar radius",
      "type": "number",
      "min": 0,
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
      "key": "totalInnerHeight",
      "label": "双孔与中条总高",
      "labelEn": "Total inner height",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "windowRadius",
      "label": "孔角平面 R",
      "labelEn": "Window planar radius",
      "type": "number",
      "min": 0,
      "step": 0.1
    },
    {
      "key": "barWidth",
      "label": "中条宽",
      "labelEn": "Center bar width",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "bendRadius",
      "label": "外侧拱弧 R",
      "labelEn": "Outer bend radius",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    },
    {
      "key": "radialThickness",
      "label": "径向板厚",
      "labelEn": "Radial thickness",
      "type": "number",
      "min": 0.1,
      "step": 0.1
    }
  ]
});
