# api.profile-fitting

fitProfile({context,kind:"circle"|"line",plane?:"XY"|"XZ"|"YZ",points:[[u,v],...],maxResidualMm?}) 基于 3–1000 个按截面坐标给出的有限采样点，只计算圆或直线候选，不生成实体也不修改 revision。circle 返回圆心、半径、按输入顺序展开的角覆盖；line 返回中心点、方向和投影长度；两者都返回最大与 RMS 残差。maxResidualMm 只作用户输入阈值的数值比较，不是默认产品公差。源自 text-to-cad 的截面圆候选算法思想；结果是点样本的近似，不能替代原图尺寸、完整拓扑或内核精确实体。拟合曲面建模另有 fittedSurface 操作，需 3–12×3–12 对应点阵。
