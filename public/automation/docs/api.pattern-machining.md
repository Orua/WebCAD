# api.pattern-machining

图案加工分流 v1
先解释用户要的几何，再发现工具。恒深文字/凹线条（如 stripes.png 凹下0.4mm）→ LOGO；离散层高→分层relief；连续耳、眼、鼻口体块→连续雕刻；连续主体加恒深文字→分开的组合步骤。颜色、格式、题材、深度大小和关键词搜索都不能单独决定路线。沿用已确认上下文；明确请求不重复问工具，含糊的“做上去”只问缺失的几何意义。
planPatternMachining({context,intent})只读规划。intent.version=1；requestedGeometry=constantDepthContours|layeredRelief|continuousRelief|mixed|unspecified；sourceInterpretation=reviewedVectors|rasterArtwork|authoredHeightMap|shadedReference|sculptMesh；userIntentEvidence保留用户原请求/已确认上下文。提供原始sourceHash、dimensionsMm:{width,height}、direction、specifiedDepthsMm或targetPeakMm、preserve、supportBinding:{bodyId,geometryFingerprint}、placementSnapshot:{origin,quaternion}。看route/missingInputs/capabilityBlockers/canExecute，不把关键词命中视为执行许可。规划不证明来源/支撑绑定；执行仍读当前面与几何、完整工具卡。
新LOGO/relief创建和预览params必须携带machiningIntent；Worker执行端再次核对声明，UI明确修改已声明的深度/方向时同步数值声明；旧文件重建、编辑、撤销保留旧版本，无字段不自动升级。新LOGO需reviewedVectors及原孔/空白；照片浮雕标shadedReference，当前语义雕刻未启用，不得把亮度映射后报成品。readRelief显式提供sourceInterpretation；灰度只能用于authoredHeightMap。旧depthMm是控制点比例，不是实际峰值；targetPeakMm不走旧算法。自然圆滑不等于固定R。
转换失败、超时或不支持保持原目标和原工程；不互换LOGO/浮雕，不去耳朵/封孔/改深度或盲目重提任务。任务completed、几何提交、生成文件、落盘、离线重开及造型验收分别报告；取消先读已提交revision和原commandId。
