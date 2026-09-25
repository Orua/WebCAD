# recipes.reference-reconstruction

读取 info()/getState() 后，搜索 referenceExtrude/referenceLoft 并读工具卡。已有 planeSection 与 faceBoundary 提供精确参考线框。referenceExtrude 接收一个平面闭合线框或单张带孔平面面，params:{direction:[0,0,1],distance:3}；散边多环不猜孔关系。referenceLoft 按 refs 顺序使用 2–12 个平面单闭环截面，params:{ruled:false}。结果均保留原参考对象；STEP 导出应显式传新实体 ids。可先平移/复制一个参考截面再放样。不自动补缺边，不提高公差来强行闭合。参考驱动的成体不等同从零参数化重建，放样的截面间形状必须对照源件验证。静态版仍无直接 IGES 转换器，离线开发检查的 OCP 不属于产品运行依赖。
