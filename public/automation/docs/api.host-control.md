# api.host-control

同源宿主通过 window.webcad.hostControl.set({locked?:boolean,connected?:boolean}) 同步设置，get() 读取；返回 {version:1,locked,connected,mouseMode:"view"|"editable",pageApiWritable:true}。不是建模工具，不需要工程context，不增加revision、不存入工程。locked=true 仅允许鼠标在视口旋转、缩放和平移；人工菜单、属性、快捷键、拖入文件、锚点及实体手柄不可用；page API 建模、编辑、文件和查询仍可用。释放 set({locked:false}) 恢复人工编辑并保留查看模式。连接和控制状态显示在已有顶栏右侧；getState().hostControl 同步读取。宿主应在iframe加载后重新设置状态；跨源宿主不授权此直连接口。
