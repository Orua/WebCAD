// A bounded topology cleanup, independent of FreeCAD's C++ implementation.
export const refineShapeNotes='清理一个封闭实体上同一平面或曲面的多余分割线。无需参数；固定线性公差 1e-7 mm、角公差 1e-7 rad，不增大公差、不近似重建曲面。最多 400 面、2000 边。检查 BRep、实体数、体积、包围盒及双向材料差；来源隔离复制。没有可清理的边面时返回 NO_CHANGE，不增加历史。替换当前对象，原始上游保留；可预览、撤销。边面编号会改变，后续必须重新 queryGeometry。不是删孔、补洞、去特征或圆角。读取 getState().bodies[].refineReport 的前后面边数与验证结果。';
export const refineShapeOperations={refineShape:{description:'Refine same-domain faces and remove redundant splitter edges',refs:1,paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false},notes:refineShapeNotes}};
export const refineShapeErrors=['NO_CHANGE','REFINE_LIMIT','REFINE_UNSUPPORTED','REFINE_GEOMETRY_CHANGED','REFINE_FAILED'];
