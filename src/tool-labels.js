// One source for UI labels and AI discovery. Additional labels come from the
// existing feature modules; adding a tool to the UI also makes its name searchable.
import { advancedNames } from './advanced-tool-fields.js';
import { referenceNames } from './reference-tool-fields.js';
import { referenceProfileNames } from './reference-profile-tools.js';
import { mechanicalNames } from './mechanical-tool-contracts.js';

export const TOOL_LABELS = Object.freeze({
  quickModelFavorites:'常用模型',
  box:'长方体',cylinder:'圆柱',sphere:'球体',cone:'圆锥',torus:'圆环',extrude:'拉伸',revolve:'旋转成型',
  transform:'移动 / 旋转',copy:'复制',mirror:'镜像',union:'合并',cut:'相减',intersect:'相交',
  fillet:'圆角',chamfer:'倒角',shell:'抽壳',hole:'打孔',holeWizard:'孔向导',draftFaces:'受限拔模',linearPattern:'直线阵列',circularPattern:'环形阵列',remove:'删除',import:'导入',
  ...advancedNames,...referenceNames,...referenceProfileNames,...mechanicalNames,
  vectorProfile:'导入路径',arcProfile:'解析线弧轮廓',sketchProfile:'绘制轮廓',profileOffset:'等距偏移 / 边框',profileRepair:'修复轮廓',profileExtrude:'轮廓拉伸 / 加工',quickModel:'快捷模型',multiHole:'多位置打孔',
  multiPocket:'批量矩形凹槽',multiBoss:'批量圆柱凸台',slot:'长圆槽',logo:'LOGO',faceHole:'面上打孔',
  faceExtrude:'面上拉伸',sweep:'扫掠',loft:'放样',split:'分割',extractSolid:'提取实体',section:'剖切',
  selectTool:'选择',group:'组合',explode:'拆散',gizmoTranslate:'移动手柄',gizmoRotate:'旋转手柄',gizmoOff:'关闭手柄',
  new:'新建工程',open:'打开工程',save:'保存工程',export:'导出文件',download:'下载文件',write:'写入文件',
  read:'读取文件字节',register:'登记文件资源',release:'释放文件资源',capabilities:'文件能力',
});
