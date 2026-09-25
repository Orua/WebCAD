# api.display-preferences

全局设置在顶部全局设置按钮。setDisplayPreferences({context,values})：defaultColor/background 为 #RRGGBB，defaultFinish 为材质键；environmentMode 为 studio（均匀工作室，默认）或 hdr（原 HDR）。exposure 0.1–3；environmentIntensity 0–3；environmentRotation/lightAzimuth -180–180 度（绕世界Z）；lightElevation -89–89 度；roughnessOffset 0–0.6（只影响金属）；keyIntensity/fillIntensity/ambientIntensity 0–6。字段均可部分更新。getState().displayPreferences 读当前值。cookie 保存一年，同源浏览器自动读取，persisted=false 表示未持久化。全局设置不属于工程撤销历史；单体显式颜色和材质优先，工程 document.appearance finish:null 跟随全局，否则保持工程覆盖。UI 可选标准、柔和、明暗对比预设或恢复默认。环境反射方向与直接光源方向是不同设置；金属凹凸不等于实体几何缺陷。
