# api.ui-coverage

界面动作与 AI 等价接口（手势以坐标和显式参数代替）：
{
  "reference.setWorkFrame": {
    "tools": [
      "reference.setWorkFrame"
    ],
    "method": "execute",
    "usage": "完整 context、idempotencyKey；args 指定 origin 和单位 quaternion。"
  },
  "reference.resetWorkFrame": {
    "tools": [
      "reference.resetWorkFrame"
    ],
    "method": "execute",
    "usage": "args.scope 为 position、orientation 或 all。"
  },
  "reference.setLocked": {
    "tools": [
      "reference.setLocked"
    ],
    "method": "execute",
    "usage": "args.locked 为布尔值。"
  },
  "anchorDrag": {
    "tools": [
      "reference.setWorkFrame"
    ],
    "method": "execute",
    "usage": "UI 中约束拖动参考锚点，松手仅更新任务草稿；用户点击应用后提交一次 reference.setWorkFrame。"
  },
  "anchorVisibility": {
    "tools": [
      "getUILayout",
      "getState"
    ],
    "method": "getUILayout",
    "usage": "参考锚点呼吸球显隐为本地 UI 偏好，不改变工程、固定原始坐标或几何 revision。"
  },
  "commandSearch": {
    "tools": [
      "searchTools"
    ],
    "method": "searchTools",
    "usage": "全局命令搜索使用现有工具名称与 ID；AI 可直接 searchTools，不需打开对话框。"
  },
  "reference.snapNearest": {
    "tools": [
      "queryGeometry",
      "reference.setWorkFrame"
    ],
    "method": "execute",
    "usage": "查询选定 CAD 边的精确端点、弧长中点与解析圆心，明确选中一个候选后提交工作基准。"
  },
  "reference.alignSelectedFace": {
    "tools": [
      "queryGeometry",
      "reference.setWorkFrame"
    ],
    "method": "execute",
    "usage": "选定当前精确平面面片，读取法向；以当前工作 X 作为面内方向，确认后更新工作基准方向。"
  },
  "renderQuality": {
    "tools": [
      "setRenderQuality"
    ],
    "method": "setRenderQuality",
    "usage": "显式 quality=draft/standard/fine/ultra；getState().renderQuality 读公差、三角面数，不修改 BRep。"
  },
  "downloadResource": {
    "tools": [
      "files.download"
    ],
    "method": "files.download",
    "usage": "使用生成回执的 resourceId 重试下载；不重新生成或清除 dirty。"
  },
  "advancedLoft": {
    "tools": [
      "advancedLoft"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "arcProfile": {
    "tools": [
      "arcProfile"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "autoRound": {
    "tools": [
      "autoRound"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "box": {
    "tools": [
      "box"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "chamfer": {
    "tools": [
      "chamfer"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "circularPattern": {
    "tools": [
      "circularPattern"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "cone": {
    "tools": [
      "cone"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "copy": {
    "tools": [
      "copy"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "curveSweep": {
    "tools": [
      "curveSweep"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "curvedLogo": {
    "tools": [
      "curvedLogo"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "cut": {
    "tools": [
      "cut"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "cylinder": {
    "tools": [
      "cylinder"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "extractFaces": {
    "tools": [
      "extractFaces"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "extractShell": {
    "tools": [
      "extractShell"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "extractSolid": {
    "tools": [
      "extractSolid"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "extrude": {
    "tools": [
      "extrude"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "faceBoundary": {
    "tools": [
      "faceBoundary"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "faceExtrude": {
    "tools": [
      "faceExtrude"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "faceHole": {
    "tools": [
      "faceHole"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "fillet": {
    "tools": [
      "fillet"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "fittedSurface": {
    "tools": [
      "fittedSurface"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "group": {
    "tools": [
      "group"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "hole": {
    "tools": [
      "hole"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "import": {
    "tools": [
      "files.import"
    ],
    "method": "files.import",
    "usage": "先 files.register 登记真实字节；不模拟文件选择器。"
  },
  "intersect": {
    "tools": [
      "intersect"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "linearPattern": {
    "tools": [
      "linearPattern"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "loft": {
    "tools": [
      "loft"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "logo": {
    "tools": [
      "logo"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "mirror": {
    "tools": [
      "mirror"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "multiBoss": {
    "tools": [
      "multiBoss"
    ],
    "method": "execute",
    "usage": "getTool({id:\"multiBoss\"}) 读取 strict v2 卡；feature.add 或 run add 传 radius/height/axis/direction/points 与真实 refs；feature.edit 修改历史凸台。"
  },
  "multiHole": {
    "tools": [
      "multiHole"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "multiPocket": {
    "tools": [
      "multiPocket"
    ],
    "method": "execute",
    "usage": "getTool({id:\"multiPocket\"}) 读取 strict v2 卡；feature.add 或 run add 传 depth/axis/direction/pockets、真实 refs；feature.edit 修改历史凹槽列表。"
  },
  "planeSection": {
    "tools": [
      "planeSection"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "quickModel": {
    "tools": [
      "quickModel"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "referenceExtrude": {
    "tools": [
      "referenceExtrude"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "referenceLoft": {
    "tools": [
      "referenceLoft"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "remove": {
    "tools": [
      "feature.remove"
    ],
    "method": "execute",
    "usage": "args:{bodyIds}；删除当前实体。"
  },
  "revolve": {
    "tools": [
      "revolve"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "sewFaces": {
    "tools": [
      "sewFaces"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "shell": {
    "tools": [
      "shell"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "slot": {
    "tools": [
      "slot"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "smoothTransition": {
    "tools": [
      "smoothTransition"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "sphere": {
    "tools": [
      "sphere"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "split": {
    "tools": [
      "split"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "surfaceTrim": {
    "tools": [
      "surfaceTrim"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "sweep": {
    "tools": [
      "sweep"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "thickenFace": {
    "tools": [
      "thickenFace"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "torus": {
    "tools": [
      "torus"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "transform": {
    "tools": [
      "transform"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "union": {
    "tools": [
      "union"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "vectorProfile": {
    "tools": [
      "vectorProfile"
    ],
    "method": "execute",
    "usage": "feature.add；按工具卡传显式 params/refs，或 run 的 add。"
  },
  "displayPreferences": {
    "tools": [
      "setDisplayPreferences",
      "getLogoConverter",
      "setLogoConverter"
    ],
    "method": "setDisplayPreferences",
    "usage": "显示设置用 setDisplayPreferences；LOGO 转换配置用 getLogoConverter/setLogoConverter，URL/Key 保存在当前浏览器。"
  },
  "importAtFrame": {
    "tools": [
      "files.register",
      "files.import"
    ],
    "method": "files.import",
    "usage": "用户选定真实 STEP/BREP 文件后登记字节；显式提交当前工作基准版本、来源包围盒中心和幂等键。"
  },
  "new": {
    "tools": [
      "files.new"
    ],
    "method": "files.new"
  },
  "open": {
    "tools": [
      "files.open",
      "files.import"
    ],
    "method": "files.open"
  },
  "save": {
    "tools": [
      "files.save",
      "files.download",
      "files.write"
    ],
    "method": "files.save"
  },
  "export": {
    "tools": [
      "files.export"
    ],
    "method": "files.export"
  },
  "rename": {
    "tools": [
      "document.rename"
    ],
    "method": "execute"
  },
  "editFeature": {
    "tools": [
      "feature.edit",
      "feature.rename"
    ],
    "method": "execute"
  },
  "visibility": {
    "tools": [
      "body.visibility"
    ],
    "method": "execute"
  },
  "explode": {
    "tools": [
      "body.explode"
    ],
    "method": "execute"
  },
  "perPartMetal": {
    "tools": [
      "body.appearance"
    ],
    "method": "execute"
  },
  "bodyColor": {
    "tools": [
      "body.appearance"
    ],
    "method": "execute"
  },
  "metalFinish": {
    "tools": [
      "document.appearance"
    ],
    "method": "execute"
  },
  "parameters": {
    "tools": [
      "document.parameters"
    ],
    "method": "execute"
  },
  "undo": {
    "tools": [
      "history.undo"
    ],
    "method": "execute"
  },
  "redo": {
    "tools": [
      "history.redo"
    ],
    "method": "execute"
  },
  "preview": {
    "tools": [
      "preview.start",
      "convertLogoPdf"
    ],
    "method": "execute",
    "usage": "PDF 字节可用 convertLogoPdf 取得待复核 regions，再用 preview.start 放置。"
  },
  "commitPreview": {
    "tools": [
      "preview.commit"
    ],
    "method": "execute"
  },
  "cancelPreview": {
    "tools": [
      "preview.cancel"
    ],
    "method": "execute"
  },
  "sketch": {
    "tools": [
      "extrude"
    ],
    "method": "execute",
    "usage": "传 profile/points/plane 等显式轮廓参数；不需要模拟逐点点击。"
  },
  "measure": {
    "tools": [
      "measure",
      "queryGeometry"
    ],
    "method": "measure",
    "usage": "实体/面/边精确测量；两点距离用 points:[XYZ,XYZ]，来源标为输入坐标。"
  },
  "inspectPrintability": {
    "tools": [
      "inspectPrintability"
    ],
    "method": "inspectPrintability",
    "usage": "选定当前 bodyId 与 angleLimitDeg；返回网格悬垂事实和六个摆放方向，不判定工艺合格。"
  },
  "textCommand": {
    "tools": [
      "executeText"
    ],
    "method": "executeText",
    "usage": "仅解析白名单文本命令，编译为当前页面 run 事务；dryRun 可先读回实际步骤。"
  },
  "fitProfile": {
    "tools": [
      "fitProfile"
    ],
    "method": "fitProfile",
    "usage": "输入有序的二维截面点，返回圆或直线的数值拟合参数及残差；不修改工程。"
  },
  "screenshot": {
    "tools": [
      "capture",
      "files.export"
    ],
    "method": "capture"
  },
  "fit": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "view": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "display": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "projection": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "grid": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "snap": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "section": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "selectMode": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "selection": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "selectTool": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "gizmo": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "gizmoTranslate": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "gizmoRotate": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "gizmoOff": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "camera": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "language": {
    "tools": [
      "setView"
    ],
    "method": "setView",
    "usage": "通过相应显式字段控制。手柄建模用 transform；面/边定位用 queryGeometry。selectTool 等价取消预览、gizmo:off、selectionMode:body。"
  },
  "help": {
    "tools": [
      "readDocs"
    ],
    "method": "readDocs"
  },
  "mcp": {
    "tools": [
      "run"
    ],
    "method": "run",
    "usage": "JSON 面板只是同一 api.run 的界面入口。"
  }
}
