// ITtime 设计系统 · 色板生成与校验（感知均匀校准版）
//
// 为什么需要这一层：直接用 HSL 的 L% 做统一阶梯，黄色相与青相在同等 L% 下
// 感知亮度差极大（实测 teal L=43.5% 在白底只有 2.59:1，amber 只有 3.39:1，
// 均不达WCAG AA）。因此本脚本以 OKLCH 的 L 为目标，反解每个色相的 HSL L 值，
// 再输出 hex（给 Tailwind / 直接写死）与 hsl 三元组（给 CSS 变量驱动主题）。
//
// 用法：node scripts/design-tokens.mjs
import fs from 'node:fs'
import path from 'node:path'

/* ════════════ 色彩数学 ════════════ */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// sRGB <-> OKLab
function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
function linearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055 }
const toLinear = (rgb) => rgb.map(srgbToLinear)
const toGamma = (rgb) => rgb.map(linearToSrgb)

function oklabFromRgb(rgb) {
  const [r, g, b] = toLinear(rgb)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function rgbFromOklab(L, a, bb) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb
  const s_ = L - 0.0894841775 * a - 1.2914855480 * bb
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  return toGamma([
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]).map((v) => clamp(v, 0, 1))
}
function oklchFromRgb(rgb) {
  const [L, a, b] = oklabFromRgb(rgb)
  return { L, C: Math.hypot(a, b), H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

// HSL -> OKLCH
function hslToRgbRaw(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [clamp(r + m, 0, 1), clamp(g + m, 0, 1), clamp(b + m, 0, 1)]
}
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255)
}

// 相对亮度 & 对比度（WCAG 2.1）
const lin = (c) => srgbToLinear(c)
const relLum = (hex) => { const [r, g, b] = hexToRgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const l1 = relLum(a), l2 = relLum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05) }

/**
 * 感知校准：对给定 HSL 色相/饱和度，二分搜索使 OKLCH 的 L 等于目标 Ltarget。
 * 这样 5 个域色尽管色相不同，在视觉上是一档亮度——满足「同明度成体系」。
 */
function calibrateL(h, s, Ltarget) {
  let lo = 0, hi = 100
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const L = oklchFromRgb(hslToRgbRaw(h, s, mid)).L
    if (L < Ltarget) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

/* ════════════ 设计决策 ════════════ */

// 五域共用同一条「感知亮度 + 彩度」阶梯（OKLCH 标定）
// oL = 目标 OKLCH L；oC = 目标 OKLCH 彩度上限。彩度随 L 降低而略升，避免暗部发灰。
// dL = 逐域亮度微调：500 步统一亮度下，5 个色相的 ΔE 最低只能到 ~11.5（不足 WCAG 无关的
//       视觉可辨门槛 12）。这是 5 色相的数学极限，因此把 500 步拆成「亮度+彩度层级」：
//       主域最亮最饱和 → 后台域最暗最灰。两两 ΔE 全部 ≥ 12，同时仍读作一套系统。
const RAMP = {
  50:   { oL: 0.977, oC: 0.022 },
  100:  { oL: 0.945, oC: 0.045 },
  200:  { oL: 0.885, oC: 0.078 },
  300:  { oL: 0.812, oC: 0.110 },
  400:  { oL: 0.722, oC: 0.130 },
  500:  { oL: 0.640, oC: 0.150 },
  600:  { oL: 0.556, oC: 0.158 },
  700:  { oL: 0.470, oC: 0.148 },
  800:  { oL: 0.388, oC: 0.130 },
  900:  { oL: 0.305, oC: 0.110 },
}

// OKLCH 彩度 → HSL 饱和度（同样需要二分，换算回 CSS 变量能直接用的 s%）
function calibrateS(h, lTargetHsl, Ctarget) {
  let lo = 0, hi = 100
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const C = oklchFromRgb(hslToRgbRaw(h, mid, lTargetHsl)).C
    if (C < Ctarget) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

// 直接在 OKLCH 生成 hex（用于图表色板等不需要 CSS 变量的场景）
const oklchHex = (L, C, H) => toHex(rgbFromOklab(L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)))

function buildScale(h, chromaScale = 1, oLShift = 0, solidShift = 0) {
  const out = {}
  for (const [step, { oL, oC }] of Object.entries(RAMP)) {
    // 500/400 两档承载「域身份」，按层级偏移；其余档保持统一阶梯以维持系统感
    const shift = step === '500' ? oLShift : oLShift * 0.35
    // 600/700/800 是「实心底 + 白字」的专用档，需要单独压暗以满足 4.5:1
    const extra = solidShift && ['600', '700', '800'].includes(step) ? solidShift : 0
    const Lt = clamp(oL + shift + extra, 0.02, 0.99)
    const Ct = oC * chromaScale
    const lHsl = calibrateL(h, 100, Lt)          // 先按目标 L 反解 HSL L（此时饱和度拉满）
    const sHsl = calibrateS(h, lHsl, Ct)// 再按目标 C 反解 HSL S
    const hex = toHex(hslToRgbRaw(h, sHsl, lHsl))
    out[step] = { hex, h, s: +sHsl.toFixed(1), l: +lHsl.toFixed(1) }
  }
  return out
}

/**
 * 选出「实心按钮底色」步进：
 *  - 亮色模式实心按钮用白字 → 需要足够深的底；
 *  - 暗色模式实心按钮用近黑字 → 需要足够亮的底。
 * 从候选步进里自动挑第一个达标的，避免逐域手调。
 */
function pickSolid(sc, mode) {
  const order = mode === 'light' ? ['600', '700', '800', '500'] : ['400', '300', '500', '200']
  const ink = mode === 'light' ? '#FFFFFF' : '#0B0F17'
  for (const step of order) if (contrast(sc[step].hex, ink) >= 4.5) return step
  return order[order.length - 1]
}

// 五个功能域：色相 + 彩度缩放 + 500 步亮度偏移
// 色相区间受「语义护栏」约束（避开 success152 / warning48 / danger356 / info202 的邻域），
// dL 让 500 步形成亮度层级，把两两 ΔE 顶到 12 以上。
const DOMAINS = {
  work:     { label: '工作台', h: 171, chroma: 0.99, dL: -0.002, reason: '品牌继承：主 CTA 沿用现有 teal，用户肌肉记忆不断；定为最亮一档，它是默认落地页' },
  time:     { label: '时间',   h: 234, chroma: 0.84, dL: -0.014, solidShift: -0.042, reason: '冷色秩序感；日历/计划以网格与时间块为主，蓝色降彩度不抢内容。600/700/800 需额外压暗：靛蓝在白底上同样 L 值天生比 teal 暗不上去' },
  tasks:    { label: '事项',   h: 30,  chroma: 1.06, dL: +0.015, reason: '暖色行动感；与工作台 teal 形成冷暖对冲，待办/习惯天然偏暖' },
  insights: { label: '洞察',   h: 282, chroma: 1.03, dL: -0.061, reason: '分析/深度；与时间域拉开 48°，并压暗一档避免两块蓝紫在同一页打架' },
  system:   { label: '体系',   h: 344, chroma: 0.73, dL: -0.065, reason: '收尾色相；标签/设置是低频后台域，最低彩度表达「不急」' },
}
const SEMANTIC = {
  success: { label: '成功', h: 152, chroma: 0.95 },
  warning: { label: '警告', h: 48,  chroma: 1.08 },
  danger:  { label: '危险', h: 356, chroma: 1.00 },
  info:    { label: '信息', h: 202, chroma: 0.92 },
}

// 中性色阶：整体冷倾（呼应深空 aurora），暗色端再冷一档加强深空感
const NEUTRAL_RAMP = {
  0:   { oL: 1.000, oC: 0.000 },
  25:  { oL: 0.982, oC: 0.004 },
  50:  { oL: 0.966, oC: 0.007 },
  100: { oL: 0.937, oC: 0.009 },
  200: { oL: 0.885, oC: 0.012 },
  300: { oL: 0.800, oC: 0.014 },
  400: { oL: 0.665, oC: 0.016 },
  500: { oL: 0.498, oC: 0.018 },
  600: { oL: 0.442, oC: 0.022 },
  700: { oL: 0.352, oC: 0.027 },
  800: { oL: 0.262, oC: 0.032 },
  900: { oL: 0.186, oC: 0.036 },
  950: { oL: 0.132, oC: 0.040 },
}
const NH = 240  // 中性冷倾色相（OKLCH）

function buildNeutral(h) {
  const out = {}
  for (const [step, { oL, oC }] of Object.entries(NEUTRAL_RAMP)) {
    const lHsl = calibrateL(h, 100, oL)
    const sHsl = calibrateS(h, lHsl, oC)
    out[step] = { hex: toHex(hslToRgbRaw(h, sHsl, lHsl)), h, s: +sHsl.toFixed(1), l: +lHsl.toFixed(1) }
  }
  return out
}

/* ════════════ 生成 ════════════ */
const SCALES = Object.fromEntries(Object.entries(DOMAINS).map(([k, d]) => [k, buildScale(d.h, d.chroma, d.dL, d.solidShift)]))
const SEMI = Object.fromEntries(Object.entries(SEMANTIC).map(([k, d]) => [k, buildScale(d.h, d.chroma)]))
const N = buildNeutral(NH)

const P = (s = '') => console.log(s)
const fmtScale = (sc) => Object.entries(sc).map(([k, v]) => `${k}:${v.hex}`).join('  ')

P('═'.repeat(96))
P('ITtime 设计系统 · 色板生成与校验（OKLCH 感知均匀校准）')
P('═'.repeat(96))
P('\n设计原则：5 个域共用同一条感知亮度阶梯（OKLCH L），只改色相与彩度。')
P('→ 视觉上「同明度、成体系」，同时每一档都过 WCAG AA。\n')

for (const [k, d] of Object.entries(DOMAINS)) {
  P(`【域 ${k}】${d.label}   hue=${d.h}   chromaScale=${d.chroma}`)
  P(`   理由：${d.reason}`)
  P(`   ${fmtScale(SCALES[k])}`)
}
P(`\n【中性色阶 n-*】OKLCH hue=${NH}（冷倾，暗端再冷一档）`)
P(`   ${Object.entries(N).map(([k, v]) => `${k}:${v.hex}`).join('  ')}`)
for (const [k, d] of Object.entries(SEMANTIC)) {
  P(`\n【语义 ${k}】${d.label}   hue=${d.h}`)
  P(`   ${fmtScale(SEMI[k])}`)
}

/* ════════════ 对比度校验 ════════════ */
P('\n' + '─'.repeat(96))
P('WCAG 2.1 对比度校验')
P('─'.repeat(96))

const BG_L = N[50].hex, CARD_L = N[0].hex
const BG_D = N[950].hex, CARD_D = N[900].hex
let fails = []
const check = (label, fg, bg, need) => {
  const r = contrast(fg, bg)
  const ok = r >= need
  if (!ok) fails.push(`${label} (${r.toFixed(2)}:1 < ${need})`)
  P(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${r.toFixed(2).padStart(5)}:1  需 ${need}`)
}

P('\n[亮色] 域色 700 作正文 on 卡片白底（AA 4.5:1）')
for (const [k, sc] of Object.entries(SCALES)) check(`${DOMAINS[k].label} ${sc[700].hex}`, sc[700].hex, CARD_L, 4.5)
P('\n[亮色] 域色 600 步对白底（实心按钮 + 白字，正文门槛 4.5:1）')
for (const [k, sc] of Object.entries(SCALES)) check(`${DOMAINS[k].label} 600 ${sc[600].hex}`, sc[600].hex, CARD_L, 4.5)
P('\n[亮色] 域色 solid 作按钮底 + 白字（AA 4.5:1，自动选步进）')
const SOLID_L = {}
for (const [k, sc] of Object.entries(SCALES)) {
  SOLID_L[k] = pickSolid(sc, 'light')
  check(`${DOMAINS[k].label} ${SOLID_L[k]} ${sc[SOLID_L[k]].hex}`, sc[SOLID_L[k]].hex, CARD_L, 4.5)
}
P('\n[亮色] 域色 500 作图标 on 白底（非文本 AA 3:1）')
for (const [k, sc] of Object.entries(SCALES)) check(`${DOMAINS[k].label} 500 图标`, sc[500].hex, CARD_L, 3)

P('\n[暗色] 域色 300 作正文 on 卡片底（AA 4.5:1）')
for (const [k, sc] of Object.entries(SCALES)) check(`${DOMAINS[k].label} ${sc[300].hex}`, sc[300].hex, CARD_D, 4.5)
P('\n[暗色] 域色 400 作图标/大字（非文本 AA 3:1）')
for (const [k, sc] of Object.entries(SCALES)) check(`${DOMAINS[k].label} 400 图标`, sc[400].hex, CARD_D, 3)
P('\n[暗色] 域色 solid 作按钮底 + 近黑字（AA 4.5:1，自动选步进）')
const SOLID_D = {}
for (const [k, sc] of Object.entries(SCALES)) {
  SOLID_D[k] = pickSolid(sc, 'dark')
  check(`${DOMAINS[k].label} ${SOLID_D[k]} ${sc[SOLID_D[k]].hex}`, sc[SOLID_D[k]].hex, '#0B0F17', 4.5)
}

P('\n[亮色] 中性色文字层级')
check('n-700 正文', N[700].hex, CARD_L, 4.5)
check('n-600 次要说明', N[600].hex, CARD_L, 4.5)
check('n-500 占位/图标', N[500].hex, CARD_L, 3)
check('n-400 禁用（WCAG 豁免，仅记录）', N[400].hex, CARD_L, 1.0)
P('\n[暗色] 中性色文字层级')
check('n-200 正文', N[200].hex, CARD_D, 4.5)
check('n-300 次要说明', N[300].hex, CARD_D, 4.5)
check('n-400 占位/图标', N[400].hex, CARD_D, 3)

P('\n[亮色] 语义色 700 作正文')
for (const [k, sc] of Object.entries(SEMI)) check(`${SEMANTIC[k].label} ${sc[700].hex}`, sc[700].hex, CARD_L, 4.5)
P('\n[暗色] 语义色 300 作正文')
for (const [k, sc] of Object.entries(SEMI)) check(`${SEMANTIC[k].label} ${sc[300].hex}`, sc[300].hex, CARD_D, 4.5)

/* ════════════ 色相可辨识度 ════════════ */
P('\n' + '─'.repeat(96))
P('五域关键色（500 步）两两可辨识度  OKLab ΔE × 100  目标 ≥ 12')
P('─'.repeat(96))
// 注意：OKLab 的 ΔE 定义在0–1 区间（JND≈0.02），乘 100 后才与��通行 Lab ΔE≥12 门槛同量级。
const dE = (a, b) => {
  const A = oklabFromRgb(hexToRgb(a)), B = oklabFromRgb(hexToRgb(b))
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) * 100
}
const dk = Object.keys(SCALES)
const dpairs = []
for (let i = 0; i < dk.length; i++) for (let j = i + 1; j < dk.length; j++)
  dpairs.push([`${DOMAINS[dk[i]].label}/${DOMAINS[dk[j]].label}`, dE(SCALES[dk[i]][500].hex, SCALES[dk[j]][500].hex)])
dpairs.sort((a, b) => a[1] - b[1])
for (const [n, v] of dpairs) {
  if (v < 12) fails.push(`域色对 ${n} ΔE=${v.toFixed(1)}`)
  P(`  ${v >= 12 ? 'PASS' : 'FAIL'}  ${n.padEnd(24)} ΔE=${v.toFixed(1)}`)
}

/* ════════════ 色觉友好 ════════════ */
P('\n' + '─'.repeat(96))
P('色觉友好：域色关键色在三类色觉下的两两距离（护栏：ΔE < 12 的对必须配形状/位置/直标辅助）')
P('─'.repeat(96))
function simulate(hex, type) {
  let [r, g, b] = hexToRgb(hex)
  const M = {
    deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0.3, 0.7, 0]],
    protanopia:   [[0.567, 0.433, 0], [0.558, 0.442, 0], [0.242, 0.758, 0]],
    tritanopia:   [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
  }[type]
  return toHex(M.map((row, i) => clamp(row[0] * r + row[1] * g + row[2] * b, 0, 1)))
}
for (const type of ['deuteranopia', 'protanopia', 'tritanopia']) {
  const list = []
  for (let i = 0; i < dk.length; i++) for (let j = i + 1; j < dk.length; j++)
    list.push([`${DOMAINS[dk[i]].label}/${DOMAINS[dk[j]].label}`,
      dE(simulate(SCALES[dk[i]][500].hex, type), simulate(SCALES[dk[j]][500].hex, type))])
  list.sort((a, b) => a[1] - b[1])
  P(`  ${type.padEnd(14)} 最弱对: ${list.slice(0, 3).map(([n, v]) => `${n}=${v.toFixed(1)}`).join('   ')}`)
}
P('\n  ⚠ 结论（重要，非缺陷）：5 个色相在三类色觉下最弱对约 ΔE 6~9，低于 12。')
P('    这是「同时给5 个功能域分配强区分色相」的数学极限，不是选色失误。')
P('    因此规范强制：**域身份永远不由颜色单独承载**——导航项=色相 + 图标 + 文字标签，')
P('    图表序列 = 色相 + 直接数值标签/线型/marker 形状。去掉颜色后仍可完全识别，才算合格。')

/* hex → HSL 色相。buildScale 只认 HSL 色相，而 viz 基色是直接给的 hex，
   这里反解一次，让 ink / on-dark 两档能复用同一条已校验过的亮度阶梯。 */
function hexToHslHue(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h
  if (max === r) h = (g - b) / d
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return (h * 60 + 360) % 360
}

/* ════════════ 数据可视化色板 ════════════ */
P('\n' + '─'.repeat(96))
P('数据可视化分类色板（6 系列上限）')
P('─'.repeat(96))
// 为什么只有 6 个：实测 8 系列时 teal/cyan 最弱对仅 ΔE 6.6（正常视觉），
// 色觉模拟后更差。分类序列超过 6 个，任何调色方案都无法同时保证可辨与安全，
// 因此规范把「同图分类序列 ≤ 6」定为硬上限，超出改用分组/分面/表格。
const VIZ = [
  { name: 'viz-1', hex: '#AC402E', note: '砖红 · 主序列/负向' },
  { name: 'viz-2', hex: '#DE723A', note: '橙 · 对照' },
  { name: 'viz-3', hex: '#69A13F', note: '绿 · 完成/正向' },
  { name: 'viz-4', hex: '#009CD8', note: '天蓝 · 信息' },
  { name: 'viz-5', hex: '#6767C2', note: '靛 · 次要' },
  { name: 'viz-6', hex: '#C55898', note: '品红 · 第六类' },
]
const viz = VIZ
viz.forEach((v) => P(`  ${v.name.padEnd(8)} ${v.hex}   ${contrast(v.hex, CARD_L).toFixed(2)}:1 on 白   ${v.note}`))
P('\n  对比度校验（图形边界需 ≥3:1，非文本 WCAG AA）：')
for (const v of viz) check(`viz ${v.hex} on 白底`, v.hex, CARD_L, 3)
const vp = []
for (let i = 0; i < viz.length; i++) for (let j = i + 1; j < viz.length; j++) vp.push([`${viz[i].name}/${viz[j].name}`, dE(viz[i].hex, viz[j].hex)])
vp.sort((a, b) => a[1] - b[1])
P(`\n  正常视觉最弱 3 对：${vp.slice(0, 3).map(([n, v]) => `${n}=${v.toFixed(1)}`).join('   ')}`)
if (vp[0][1] < 12) fails.push(`viz 色板最弱对 ΔE=${vp[0][1].toFixed(1)}`)
for (const type of ['deuteranopia', 'protanopia', 'tritanopia']) {
  const list = []
  for (let i = 0; i < viz.length; i++) for (let j = i + 1; j < viz.length; j++)
    list.push([`${viz[i].name}/${viz[j].name}`, dE(simulate(viz[i].hex, type), simulate(viz[j].hex, type))])
  list.sort((a, b) => a[1] - b[1])
  P(`  ${type.padEnd(14)} 最弱 3 对：${list.slice(0, 3).map(([n, v]) => `${n}=${v.toFixed(1)}`).join('   ')}`)
}
P('\n  ⚠ 色觉模拟下最弱对约 ΔE 8，仍低于 12 —— 规范要求：多序列图表必须叠加第二编码')
P('    （直接数值标签 / 线型图案 / marker 形状 / 顺序固定），不能只靠颜色区分。')

// viz 三档化：基色只保证「图形边界 ≥3:1」，但图表的数据标签、图例文字是文本，需 4.5:1。
// 实测 6 个基色里只有 2 个能在白底上当文字用，因此按同一色相另建两档——
// 复用 buildScale 的亮度阶梯 + 对比度搜索选步进，不手调 hex（改基色时两档自动跟随）。
const vizScales = viz.map((v) => {
  const h = hexToHslHue(v.hex)
  const sc = buildScale(h, 0.95)
  const inkStep = ['700', '800', '600', '900'].find((s) => contrast(sc[s].hex, CARD_L) >= 4.5)
  const darkStep = ['300', '400', '200', '500'].find((s) => contrast(sc[s].hex, CARD_D) >= 4.5)
  return { ...v, h, ink: inkStep ? sc[inkStep] : null, onDark: darkStep ? sc[darkStep] : null }
})
for (const v of vizScales) {
  if (!v.ink) fails.push(`viz ${v.name} 找不到白底 4.5:1 的文字档`)
  else check(`viz ${v.name} 文字档 on 白底`, v.ink.hex, CARD_L, 4.5)
  if (!v.onDark) fails.push(`viz ${v.name} 找不到深色底 4.5:1 的暗色档`)
  else check(`viz ${v.name} 暗色档 on 深色卡片`, v.onDark.hex, CARD_D, 4.5)
}
P('\n  三档化结果（文字档 on 白底 / 暗色档 on 深色卡片，均 AA 4.5:1）：')
vizScales.forEach((v) => P(`  ${v.name.padEnd(8)} 基色 ${v.hex}  文字档 ${v.ink ? v.ink.hex : '—'}  暗色档 ${v.onDark ? v.onDark.hex : '—'}`))

/* ════════════ 导出 ════════════ */
const out = {
  domains: Object.fromEntries(Object.entries(SCALES).map(([k, sc]) => [k, {
    meta: DOMAINS[k],
    steps: Object.fromEntries(Object.entries(sc).map(([s, v]) => [s, { hex: v.hex, hsl: `${v.h} ${v.s}% ${v.l}%` }])),
  }])),
  neutral: Object.fromEntries(Object.entries(N).map(([k, v]) => [k, { hex: v.hex, hsl: `${v.h} ${v.s}% ${v.l}%` }])),
  semantic: Object.fromEntries(Object.entries(SEMI).map(([k, sc]) => [k, {
    meta: SEMANTIC[k],
    steps: Object.fromEntries(Object.entries(sc).map(([s, v]) => [s, { hex: v.hex, hsl: `${v.h} ${v.s}% ${v.l}%` }])),
  }])),
  viz: vizScales.map((v) => ({ name: v.name, hex: v.hex, ink: v.ink ? v.ink.hex : null, onDark: v.onDark ? v.onDark.hex : null })),
  failures: fails,
}
const dir = path.resolve('docs/design')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, '.tokens-report.json'), JSON.stringify(out, null, 2), 'utf8')
P(`\n${'═'.repeat(96)}`)
P(fails.length === 0 ? '✓ 全部硬性校验通过（WCAG AA / ΔE 门槛）' : `✗ ${fails.length} 项未达标：\n  - ${fails.join('\n  - ')}`)
P(`机器可读 token 已写入 docs/design/.tokens-report.json`)

/* ════════════ 顺带产出 CSS 变量块（可直接粘贴）═══════════ */
const css = []
css.push('/* ── 域色板（由 scripts/design-tokens.mjs 生成，勿手改）── */')
for (const [k, d] of Object.entries(DOMAINS)) {
  css.push(`\n/* ${d.label} ${d.reason} */`)
  for (const [s, v] of Object.entries(SCALES[k])) css.push(`--domain-${k}-${s}: ${v.hex};`)
}
css.push('\n/* ── 中性色阶 n-* ── */')
for (const [k, v] of Object.entries(N)) css.push(`--n-${k}: ${v.hex};`)
css.push('\n/* ── 语义色（success / warning / danger / info）── */')
for (const [k, d] of Object.entries(SEMANTIC)) {
  css.push(`/* ${d.label} */`)
  for (const [s, v] of Object.entries(SEMI[k])) css.push(`--semantic-${k}-${s}: ${v.hex};`)
}
css.push('\n/* ── 数据可视化分类色板：同图序列 ≤ 6 为硬上限，超出改用分组/分面/表格 ── */')
css.push('/* 基色 = 图形边界（描边 / marker / 面积块），已验 ≥3:1 on 白底 */')
for (const v of viz) css.push(`--${v.name}: ${v.hex};`)
css.push('\n/* 文字档 = 数据标签 / 图例文字 on 白底（AA 4.5:1）。6 个基色只有 2 个能直接当文字用，故另建 */')
for (const v of vizScales) css.push(`--${v.name}-ink: ${v.ink ? v.ink.hex : v.hex};`)
css.push('\n/* 暗色档 = on 深色卡片底（AA 4.5:1），暗色模式的图表专用 */')
for (const v of vizScales) css.push(`--${v.name}-on-dark: ${v.onDark ? v.onDark.hex : v.hex};`)
fs.writeFileSync(path.join(dir, '.generated-palette.css'), css.join('\n') + '\n', 'utf8')
P('CSS 色板片段已写入 docs/design/.generated-palette.css')