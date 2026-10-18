const fs = require('fs')
const path = require('path')

// 动效防回归校验（对应 commit 7c46939 的 page-in fill-mode 回归）：
// 1. .animate-page-in 的 animation 声明不得含 fill-mode both/forwards——
//    transform 残留会使 <main> 成为 fixed 包含块，全站弹窗遮罩错位；
// 2. 弹窗退场 keyframes（modal-out / overlay-out）必须在场。
// 参照 scripts/verify-domains.cjs 的构建产物定位写法。

const assetsDir = path.join(__dirname, '..', 'apps', 'web', 'dist', 'assets')
if (!fs.existsSync(assetsDir)) {
  console.error('✗ 找不到构建产物目录 apps/web/dist/assets。先跑：cd apps/web && npm run build')
  process.exit(1)
}
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

let pass = true

// ── 1. animate-page-in 不得带 fill-mode both/forwards ──
// 产物形如 .motion-safe\:animate-page-in{animation:page-in .3s cubic-bezier(.16,1,.3,1)}
// （类名可能带 motion-safe: 等前缀变体，选择器以 animate-page-in 结尾即命中）
const pageInMatches = [...css.matchAll(/[^{}]*animate-page-in\{([^}]*)\}/g)]
if (pageInMatches.length === 0) {
  console.log('✗ 产物中未找到 .animate-page-in 规则（可能从未 build 或类名被改）')
  pass = false
} else {
  for (const [, decl] of pageInMatches) {
    const shorthand = /animation:([^;}]+)/.exec(decl)
    const fillMode = /animation-fill-mode:([^;}]+)/.exec(decl)
    const shorthandBad = shorthand ? /\b(both|forwards)\b/.test(shorthand[1]) : false
    const fillBad = fillMode ? /\b(both|forwards)\b/.test(fillMode[1]) : false
    if (!shorthand || !shorthand[1].includes('page-in')) {
      console.log('✗ .animate-page-in 内容异常：' + decl)
      pass = false
    } else if (shorthandBad || fillBad) {
      console.log('✗ animate-page-in 带 fill-mode both/forwards（回归！transform 残留会让 main 成为 fixed 包含块）：' + decl)
      pass = false
    } else {
      console.log('✓ animate-page-in 无 fill-mode 残留：' + shorthand[1].trim())
    }
  }
}

// ── 2. 弹窗退场 keyframes 存在 ──
for (const name of ['modal-out', 'overlay-out']) {
  const re = new RegExp('@keyframes\\s+' + name + '\\b')
  if (re.test(css)) {
    console.log('✓ @keyframes ' + name + ' 存在')
  } else {
    console.log('✗ @keyframes ' + name + ' 缺失（弹窗退场动画被移除？）')
    pass = false
  }
}

console.log('\n' + (pass ? '✓ 动效防回归校验通过' : '✗ 存在动效回归，详见上方'))
process.exit(pass ? 0 : 1)
