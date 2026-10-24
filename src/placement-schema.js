// Shared by runtime validation, operation cards and the published Agent contract.
export const vectorSchema={type:'array',minItems:3,maxItems:3,items:{type:'number'}};
export const quaternionSchema={type:'array',minItems:4,maxItems:4,items:{type:'number'},description:'Normalized quaternion [x,y,z,w]; runtime verifies unit length.'};
const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
export const FRAME_SCHEMA={oneOf:[
 object({kind:{const:'world'}}),
 object({kind:{const:'snapshot'},origin:vectorSchema,quaternion:quaternionSchema}),
 object({kind:{const:'work'},expectedFrameVersion:{type:'integer',minimum:1}}),
 object({kind:{const:'saved'},frameId:{type:'string',minLength:1},expectedFrameVersion:{type:'integer',minimum:1}})
]};
export const SOURCE_ANCHOR_SCHEMA={oneOf:[
 object({kind:{enum:['model-origin','bottom-center','bounds-center']}}),
 object({kind:{const:'point'},point:vectorSchema}),
 object({kind:{const:'named'},anchorId:{type:'string',minLength:1}})
]};
export const PLACEMENT_SCHEMA=object({version:{const:1},frame:FRAME_SCHEMA,sourceAnchor:SOURCE_ANCHOR_SCHEMA},['version','frame']);
export const PLACEMENT_GUIDE=`# 显式定位与默认摆放

placement:{version:1,frame,sourceAnchor} 是 add 的同级字段，不放在 params 内。
frame 有且只有以下四种形状：
- 世界坐标原点：{kind:'world'}，不能带 origin、quaternion 或 coordinates。
- 明确位置和姿态：{kind:'snapshot',origin:[x,y,z],quaternion:[qx,qy,qz,qw]}。
- 当前工作基准：{kind:'work',expectedFrameVersion:当前版本}。
- 已保存基准：{kind:'saved',frameId:实际ID,expectedFrameVersion:当前版本}。

任意世界位置/方向使用 snapshot。origin 是毫米世界坐标；quaternion 是单位四元数 [x,y,z,w]。sourceAnchor 可为 model-origin、bottom-center、bounds-center、point（另带 point）或 named（另带 anchorId）；优先按当前实体卡指定的插入锚点。不得发明 frame.coordinates 或把 origin 塞进 world。

显式 placement 固定位置，禁止默认自动摆放。省略 placement 会冻结当前工作基准，并可能收到 AUTO_PLACED；设置工作基准后省略 placement 仍不等于精确放置。收到 AUTO_PLACED 必须以最终 bounds/量测为准。

只读预检为 Page api.resolvePlacement({context,op,params,refs:[],placement})；MCP 为 webcad_read(method:'resolvePlacement',args:同一对象)。返回不计算几何，成功不等于实体已创建。

通用例：将一个半径 r、高 h 的圆柱底面中心置于世界点 p，沿 Z 轴：placement:{version:1,frame:{kind:'snapshot',origin:p,quaternion:[0,0,0,1]},sourceAnchor:{kind:'bottom-center'}}。姿态由用户要求计算，不能从示例借尺寸。沿 X 轴可用绕世界 Y 旋转90度的单位四元数 [0,Math.SQRT1_2,0,Math.SQRT1_2]。

变换有两条独立契约：省略 placement 的普通世界变换用 params:{x,y,z,rx,ry,rz,scale}；显式 placement 则使用 mode:'translate' 配 delta、mode:'rotate' 配 pivot/axisVector/angleDeg，或当前 transform 卡的其他 mode，不能混用旧 x/y/z 和 mode。变换后引用 createdBodyIds/replacements 中的新 ID；run 后续步骤用 $ref。
`;
