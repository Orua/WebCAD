// Existing editable examples, shipped with the static page (no sample service).
export const TRIAL_SAMPLES = Object.freeze([
  { id: 'plate', label: '联动四孔板', hint: '50 × 30 × 3 · 孔 R2；参数表只改 length 为 57，再保存重开改 61。' },
  { id: 'frame', label: '扣框', hint: '扁平扣框；参数表修改 innerWidth（内宽）。' },
  { id: 'nameplate', label: '凸轮廓铭牌', hint: '现有闭合轮廓浮雕；参数表修改 thickness（底板厚度）。' },
  { id: 'bushing', label: '轴套', hint: '带法兰轴套；参数表修改 bodyDiameter（轴套外径）。' },
  { id: 'tray', label: '双柱直壁薄壳', hint: '现有直壁托盘；参数表修改 outerWidth（外宽）。' },
].map(Object.freeze));
