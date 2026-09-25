# recipes.mounting-plate

四孔板示例，尺寸单位 mm。先调用 info()/getState() 取得当前完整上下文，再用 getTool({id:"box"}) 与 getTool({id:"multiHole"}) 读取实际版本、schemaHash 与示例。新增 box：{width:50,depth:30,height:3}、refs:[]。取得实际板件 bodyId 与新 revision 后新增 multiHole：{radius:2,depth:5,axis:"Z",direction:-1,points:[[5,5,4],[45,5,4],[5,25,4],[45,25,4]]}、refs:[实际 bodyId]。刀具从全局 Z=4 向下切至 Z=-1。体积期望值是 4500-48π mm³；须以当前精确 B-Rep 测量和导出回读验证。
命名参数已通过 execute action document.parameters 接出；可绑定板长和右孔 X 到 length 与 length-edgeMargin，再只改 length。具体示例见 docs/examples/page-api-plate.js。
