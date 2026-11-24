const roles = ['maleFoot', 'stud', 'socket', 'femaleFoot'];
const sizes = ['8', '10', '12.5', '15'];

function scaledPart(build, cad, role, variant, scale) {
  const shape = build(cad, variant);
  const fixedCutFoot = variant === 'cut' && (role === 'maleFoot' || role === 'femaleFoot');
  if (scale === 1 || fixedCutFoot) return shape;
  try {
    return shape.scale(scale);
  } finally {
    shape.delete();
  }
}

function select(key, label, values, labels) {
  return { key, label, type: 'select', options: values.map((value, i) => ({ value, label: labels[i] })) };
}

export function buttonTool(kind, label, parts, heights) {
  const snap = kind === 'snapButton';
  const definition = {
    label, labelEn: snap ? 'Snap button' : 'Sew-on button',
    description: '以 15 mm 为参考规格。弧面由相切曲线回转生成。整套分解排列，单件底面中心为插入点。切脚保留 Ø6 mm 铆装脚。',
    defaultInsertionAnchor: 'bottom-center',
    defaults: { variant: 'domed', part: 'all', size: '15', diameter: 15 },
    fields: [
      select('variant', '款式', ['domed', 'flat', 'cut'], ['明面（弧形外包面）', '暗面（平脚）', '切脚（Ø6 铆装脚）']),
      select('part', '生成配件', ['all', ...roles],
        ['整套', '公脚', snap ? '公件（钮珠）' : '公件', snap ? '母件（弹弓件）' : '母件', '母脚']),
      select('size', '产品外径', [...sizes, 'custom'], [...sizes.map(s => s + ' mm'), '自定义']),
      { key: 'diameter', label: '自定义外径', type: 'number', unit: 'mm', min: 0.01, step: 0.1 },
    ],
  };
  function build(params, cad) {
    const { variant, part, size, diameter } = { ...definition.defaults, ...params };
    if (!Object.hasOwn(heights, variant) || (part !== 'all' && !roles.includes(part))) throw Error('未知钮扣款式或配件');
    if (size !== 'custom' && !sizes.includes(String(size))) throw Error('未知钮扣规格');
    const scale = (size === 'custom' ? diameter : Number(size)) / 15;
    if (!Number.isFinite(scale) || scale <= 0) throw Error('钮扣外径必须为正数');
    if (part !== 'all') return scaledPart(parts[part], cad, part, variant, scale);
    const levels = heights[variant];
    const pieces = [];
    try {
      for (const [i, role] of roles.entries()) {
        const shape = scaledPart(parts[role], cad, role, variant, scale);
        try {
          pieces.push(shape.translate([0, 0, (levels[i] - levels[3]) * scale]));
        } finally {
          shape.delete();
        }
      }
      return cad.makeCompound(pieces);
    } finally {
      pieces.forEach(shape => shape.delete());
    }
  }
  return { kind, definition, build, iconUrl: new URL('./button.svg', import.meta.url).href };
}
