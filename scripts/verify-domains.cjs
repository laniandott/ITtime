const fs = require('fs')
const path = require('path')

// 自动定位最新的构建 CSS（文件名带 hash，每次构建都变，不能写死）
const assetsDir = path.join(__dirname, '..', 'apps', 'web', 'dist', 'assets')
const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css'))
if (cssFiles.length === 0) {
  console.error('✗ 找不到构建 CSS。先跑：cd apps/web && npm run build')
  process.exit(1)
}
const cssFile = cssFiles.sort((a, b) =>
  fs.statSync(path.join(assetsDir, b)).mtimeMs - fs.statSync(path.join(assetsDir, a)).mtimeMs
)[0]
const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8')
console.log('校验目标：apps/web/dist/assets/' + cssFile + '\n')

// 1. --d-*-500-rgb 三元组存在性（focus-visible 的 box-shadow 依赖它）
const rgbRe = /--d-(work|time|tasks|insights|system)-500-rgb:\s*([^;]+);/g
const rgb = {}
let m
while ((m = rgbRe.exec(css))) rgb[m[1]] = m[2].trim()
console.log('=== --d-*-500-rgb 三元组 ===')
for (const [k, v] of Object.entries(rgb)) console.log(k.padEnd(9), v)
console.log('条数：' + Object.keys(rgb).length + '/5 ' + (Object.keys(rgb).length === 5 ? '✓' : '✗'))

// 2. focus ring 对比度（图形元素门槛 3:1）
const lum = (h) => {
  const c = parseInt(h.slice(1), 16)
  const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255]
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const cr = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

console.log('\n=== focus ring 对比度（亮色 600 on 白 / 暗色 400 on 深卡片 #1C1C2F）===')
const p600 = { work: '#008672', time: '#656EC5', tasks: '#B25900', insights: '#833EA1', system: '#8F3C52' }
const p400 = { work: '#08B89E', time: '#9CA5F0', tasks: '#D17F2C', insights: '#C489DD', system: '#D3889C' }
let allPass = true
for (const k of Object.keys(p600)) {
  const l = cr(p600[k], '#FFFFFF'), d = cr(p400[k], '#1C1C2F')
  const ok = l >= 3 && d >= 3
  if (!ok) allPass = false
  console.log(k.padEnd(9), '亮=' + l.toFixed(2) + ':1', '暗=' + d.toFixed(2) + ':1', ok ? '✓' : '✗ (图形需 3:1)')
}
console.log('\n' + (allPass ? '✓ 五域 focus ring 全部达标' : '✗ 有域不达标'))

// 3. 实心按钮：白字 on 600（亮）/ 近黑字 on 400（暗），文字门槛 4.5:1
console.log('\n=== 实心按钮文字对比度（亮：白字 on 600 / 暗：#0B0F17 on 400）===')
let btnPass = true
for (const k of Object.keys(p600)) {
  const l = cr('#FFFFFF', p600[k]), d = cr('#0B0F17', p400[k])
  const ok = l >= 4.5 && d >= 4.5
  if (!ok) btnPass = false
  console.log(k.padEnd(9), '亮=' + l.toFixed(2) + ':1', '暗=' + d.toFixed(2) + ':1', ok ? '✓' : '✗ (文字需 4.5:1)')
}
console.log('\n' + (btnPass ? '✓ 五域实心按钮文字全部达标' : '✗ 有域不达标'))

// 4. alpha-value 机制：bg-brand/N 必须解析成 rgb(var(--d-*-rgb) / N)
//    这是 Tailwind 3 最容易静默失效的地方——写成 var(--d-600) 的话
//    bg-brand/5 会直接不生效，且不报错。
console.log('\n=== alpha-value 机制（bg-brand/5 等透明度修饰）===')
const alphaChecks = [
  [/\.bg-brand\\?\/5\{([^}]*)\}/, 'bg-brand/5'],
  [/\.bg-brand\\?\/10\{([^}]*)\}/, 'bg-brand/10'],
  [/\.text-brand\\?\/10\{([^}]*)\}/, 'text-brand/10'],
]
let alphaPass = true
for (const [re, label] of alphaChecks) {
  const r = re.exec(css)
  if (!r) { console.log(label.padEnd(14), '未在产物中找到（可能无此用法，跳过）'); continue }
  const body = r[1]
  const ok = /rgb\(var\(--d-\d+-rgb\)\s*\/\s*\.?\d+\)/.test(body)
  if (!ok) alphaPass = false
  console.log(label.padEnd(14), ok ? '✓ ' + body.trim() : '✗ ' + body.trim())
}
console.log('\n' + (alphaPass ? '✓ alpha-value 链路正确' : '✗ alpha-value 失效，检查 tailwind.config.js'))

// 5. 圆角档位防覆盖（TOKENS_PLAN §4.1）
// 背景：theme.extend 是合并语义而非替换。一旦在 extend.borderRadius 里
// 定义 xl，Tailwind 内置 rounded-xl（0.75rem）会被静默覆盖成自定义值，
// 且方向变体 rounded-t-xl / rounded-b-xl 一并派生污染——不报错，
// 纯视觉回归（曾实际发生：68 处 rounded-xl 从 12px 变 24px）。
// 本段双保险：
//   源头——配置文件 extend.borderRadius 键名 ∩ Tailwind 3 内置档位名必须为空；
//   产物——内置档位类（含方向变体）若出现，值必须等于原生值；
//          自建档位类若出现，值必须指向 --radius-* 变量。
console.log('\n=== 圆角档位防覆盖 ===')
const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'tailwind.config.js'), 'utf8')
const brBlock = /borderRadius:\s*\{([\s\S]*?)\n {6}\}/.exec(cfgSrc)
const customRadiusKeys = new Set()
if (brBlock) {
  for (const km of brBlock[1].matchAll(/^\s*'?([A-Za-z0-9-]+)'?\s*:/gm)) customRadiusKeys.add(km[1])
}
// Tailwind 3.4 内置 borderRadius 键名与原生值（rem）
const BUILTIN_RADIUS = ['none', 'sm', 'DEFAULT', 'md', 'lg', 'xl', '2xl', '3xl', 'full']
const NATIVE = { sm: '0.125rem', md: '0.375rem', lg: '0.5rem', xl: '0.75rem', '2xl': '1rem', '3xl': '1.5rem' }
// 数值化比较：cssnano 会压掉前导零（0.75rem → .75rem），字符串比对会误报
const toRem = (v) => {
  const m = /^\.?(\d+(?:\.\d+)?)rem$/.exec(v)
  return m ? parseFloat(v) : null
}
const clashes = BUILTIN_RADIUS.filter((k) => customRadiusKeys.has(k))
let radiusPass = !!brBlock
if (!brBlock) {
  console.log('✗ 无法从 tailwind.config.js 解析 borderRadius 块')
} else if (clashes.length > 0) {
  radiusPass = false
  console.log('✗ 撞名：' + clashes.join(', ') + ' —— extend 会静默覆盖内置档位，改个不冲突的名字')
} else {
  console.log('✓ 配置键名与内置档位无交集（自建：' + [...customRadiusKeys].sort().join(', ') + '）')
}
// 源头校验：每个自建键的值必须指向 --radius-* 变量（产物无引用时 JIT 不生成，靠这里兜底）
if (brBlock) {
  for (const km of brBlock[1].matchAll(/^\s*'?([A-Za-z0-9-]+)'?\s*:\s*'([^']+)'/gm)) {
    const ok = /^var\(--radius-[a-z]+\)$/.test(km[2])
    if (!ok) radiusPass = false
    console.log(('  ' + km[1]).padEnd(18), ok ? '✓ ' + km[2] : '✗ ' + km[2] + '（应形如 var(--radius-*)）')
  }
}
// 产物校验：内置档位（含方向变体 t-/r-/b-/l-）不得出现 var(--radius-*)
const radiusDirs = ['', 't-', 'r-', 'b-', 'l-']
for (const k of Object.keys(NATIVE)) {
  for (const d of radiusDirs) {
    const cls = 'rounded-' + (d ? d + k : k)
    const r = new RegExp('\\.' + cls + '\\{([^}]*)\\}').exec(css)
    if (!r) continue // JIT：无引用不生成，跳过
    const values = [...r[1].matchAll(/radius:([a-z0-9.]+)/g)].map((x) => x[1])
    const ok = values.length > 0 && values.every((v) => toRem(v) === toRem(NATIVE[k]))
    if (!ok) radiusPass = false
    console.log(cls.padEnd(18), ok ? '✓ ' + r[1].trim() : '✗ ' + r[1].trim() + '（应为 ' + NATIVE[k] + '）')
  }
}
// 产物校验：自建档位若出现，必须指向 --radius-* 变量
const SEMANTIC = { xs: '--radius-xs', ctl: '--radius-ctl', card: '--radius-card', panel: '--radius-panel', hero: '--radius-xl' }
for (const [k, v] of Object.entries(SEMANTIC)) {
  const cls = 'rounded-' + k
  const r = new RegExp('\\.' + cls + '\\{([^}]*)\\}').exec(css)
  if (!r) { console.log(cls.padEnd(18), '产物中未出现（无引用，跳过）'); continue }
  const ok = r[1].includes('var(' + v + ')')
  if (!ok) radiusPass = false
  console.log(cls.padEnd(18), ok ? '✓ ' + r[1].trim() : '✗ ' + r[1].trim() + '（应含 var(' + v + ')）')
}
console.log('\n' + (radiusPass ? '✓ 圆角档位无覆盖' : '✗ 圆角档位存在覆盖/断链'))

// 汇总
const allOk = Object.keys(rgb).length === 5 && allPass && btnPass && alphaPass && radiusPass
console.log('\n' + '═'.repeat(60))
console.log(allOk ? '✓ 全部通过' : '✗ 存在未达标项，详见上方')
process.exit(allOk ? 0 : 1)
