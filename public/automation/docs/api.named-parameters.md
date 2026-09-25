# api.named-parameters

读取 getState().parameters 和 parameterValues。execute({context,idempotencyKey,action:"document.parameters",args:{parameters:{length:{value:50,unit:"mm"},edgeMargin:{value:5,unit:"mm"}},bindings:{"<实际板特征ID>":{"width":"length"},"<实际孔特征ID>":{"points.1.0":"length-edgeMargin","points.3.0":"length-edgeMargin"}}}}) 在一个撤销步骤内计算受影响特征并重建。后续只传 parameters:{length:{value:63,unit:"mm"}} 更新数值，原绑定保持。
参数定义按名称合并；绑定按特征 ID 和数值路径合并。单位仅 mm/scalar，表达式支持有界四则运算和已注册函数，不执行 JS。未定义参数、循环、单位不符、越界或不安全的后续拓扑索引会拒绝并保留原模型。已绑定字段的直接数值编辑返回 PARAMETER_BOUND；请通过参数表或 document.parameters 修改。
