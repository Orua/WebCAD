# api.round-preflight

inspectRound({context,bodyId,params:{edgeIds:[当前边号],mode:"edge",radiusMm:0.3}}) 复用 round 内部规划，只读独立 BRep 副本。params 按 getTool({id:"round"}) 完整契约；恰选 edgeIds 或 faceIds，faceIds 仅解析平面边界。返回实际 resolved/scope、targetCount、targets[].supportSurfaceTypes、constructionCategories、限制和 attemptCount:0。自动端头模式会测量一个真实截面；没有构造圆角、没有多半径扫描，不保证 R 或推荐深度可行。来源与历史不改。失败报告 stage=planning，不误报成半径失败。加工后须新 context 与 queryGeometry 重新选边；旧预检不跨 revision 生效。
