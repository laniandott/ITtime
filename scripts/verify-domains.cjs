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

// 汇总
const allOk = Object.keys(rgb).length === 5 && allPass && btnPass && alphaPass
console.log('\n' + '═'.repeat(60))
console.log(allOk ? '✓ 全部通过' : '✗ 存在未达标项，详见上方')
process.exit(allOk ? 0 : 1)
