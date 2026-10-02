const number=(description,limits={})=>({type:'number',description,...limits});
const length=description=>number(description,{exclusiveMinimum:0,maximum:1000});
export const reliefNotes='在一个有效封闭实体的当前平面上生成有高低层次的连续曲面浮雕。values 是按图像从下至上、每行从左至右排列的 4–65 行/列矩形高度控制网格，值域 0–1；三次夹持 B 样条平滑近似，通常不穿过每一个样点。depthMm 是控制高度上限，不保证实际峰值达到它。widthMm/heightMm 为完整矩形尺寸；必须全部位于所选有限面内且避开孔，不自动裁剪。图案中心为该面面积质心加 offsetX/offsetY；局部 X 是投影世界 X（近共线时用世界 Y），局部 Y=外法向叉乘 X；angleDeg 绕外法向旋转。mode=emboss 加料，engrave 减料，保留一个有效实体；来源隔离复制，失败不提交。只支持平面，不支持曲面包裹。灰度/颜色不等于真实照片深度。readRelief 在浏览器本地从 JPG/PNG/SVG 生成 values；工程保存该网格和来源哈希，无外部文件依赖。预览、历史改参、撤销共用同一操作；getState().bodies[].reliefReport 读实际增减体积、网格和尺寸。';
export const reliefOperations={relief:{description:'浮雕：从图片高度场生成有层次的平滑 B 样条曲面 / Surface relief',refs:1,paramsSchema:{type:'object',additionalProperties:false,required:['faceId','widthMm','heightMm','depthMm','values'],properties:{
 faceId:{type:'integer',minimum:0,description:'Current selected planar face index on refs[0]'},
 widthMm:length('Full image rectangle width in local face X (mm)'),heightMm:length('Full image rectangle height in local face Y (mm)'),depthMm:number('Maximum control height or depth (mm)',{minimum:.01,maximum:20}),
 mode:{type:'string',enum:['emboss','engrave'],default:'emboss'},offsetX:number('Offset from face centroid in local X (mm)'),offsetY:number('Offset from face centroid in local Y (mm)'),angleDeg:number('Rotation around outward face normal (degrees)'),
 values:{type:'array',minItems:4,maxItems:65,items:{type:'array',minItems:4,maxItems:65,items:number('Normalized height control value',{minimum:0,maximum:1})}},
 source:{type:'object',additionalProperties:false,properties:{name:{type:'string',maxLength:255},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},format:{type:'string',enum:['jpg','png','svg','grid']},style:{type:'string',enum:['grayscale','rounded']},whiteHigh:{type:'boolean'},threshold:number('Rounded silhouette threshold',{minimum:0,maximum:1}),originalWidth:{type:'integer',minimum:1},originalHeight:{type:'integer',minimum:1}}}
}},notes:reliefNotes}};
export const reliefExample={faceId:0,widthMm:10,heightMm:10,depthMm:.8,values:[[0,0,0,0,0],[0,.3,.6,.3,0],[0,.6,1,.6,0],[0,.3,.6,.3,0],[0,0,0,0,0]]};
export const reliefErrors=['RELIEF_UNSUPPORTED','RELIEF_LIMIT','RELIEF_OUTSIDE_FACE','RELIEF_NO_CHANGE','RELIEF_INVALID'];
export const reliefFields=[['widthMm','图案宽 mm',20,'positive'],['heightMm','图案高 mm',20,'positive'],['depthMm','起伏高度 mm',1,'positive'],['mode','方式','emboss',['emboss','engrave']],['offsetX','水平偏移 mm',0],['offsetY','垂直偏移 mm',0],['angleDeg','旋转 °',0]];
