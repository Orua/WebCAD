# 拉心扣活动芯

独立的常规双开放卷眼活动芯，通过快速模型目录与 `quickModel` API 使用。

- `eyePitchMm`：两端卷眼轴心距，沿 X。
- `eyeInnerDiameterMm`、`eyeWallMm`：卷眼内径及材料壁厚。
- `widthMm`：前后横芯宽，沿 Y；两端卷眼轴线沿 Y。
- `barThicknessMm`、`barCenterHeightMm`：中央扁带厚度及其相对卷眼轴心的 Z 高度。
- `outerTransitionRadiusMm`、`innerTransitionRadiusMm`：中央扁带接入卷眼的独立外/内相切圆弧。
- `tailLengthMm`、`tailAngleDeg`：开放卷眼末端向中央延伸的尾舌长度与上扬角。

模型原点位于两卷眼轴心中点，活动芯保持为独立实体。模板构造解析 LINE/ARC 侧形并沿 Y 挤出；不复刻各货号正视端帽、冲压翘曲、边缘修饰、LOGO或装配运动。

默认参数来自 PG11552 的常规芯：眼距 45.5、内径 5.5、宽 3.2、卷眼壁 1.7、中央厚 1.5、中心高 2、外/内过渡 R28.3/R30、尾舌长 5、角度 0°。PG14487 可改为眼距 43.2、内径 5.2、宽 4、卷眼壁与中央厚 1.6、中心高 0.2、外/内过渡 R14/R15.6、尾舌长 4.62、角度 27.5°；该对称模板不复刻其原图左右偏心。
