/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      borderRadius: {
        // 语义圆角五档（TOKENS_PLAN §4.1），取值与 :root 变量保持一致：
        // xs 微型（圆点/指示条/复选框）/ ctl 控件（按钮/输入/tab/下拉）/
        // card 卡片 / panel 面板（page-card/modal/抽屉）/ hero 英雄容器。
        // 胶囊仍用 Tailwind 内置 rounded-full。
        // ⚠ 命名铁律：禁止占用 Tailwind 内置档位名（sm/md/lg/xl/2xl/3xl）。
        //   theme.extend 是合并语义——一旦定义 xl，内置 rounded-xl 会被
        //   静默覆盖成自定义值，全站现有 rounded-xl 用法（68 处，内置 16px）
        //   集体变形且不报错。新档位一律用无冲突的自造名。
        xs: 'var(--radius-xs)',
        ctl: 'var(--radius-ctl)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        hero: 'var(--radius-xl)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        float: 'var(--shadow-float)',
      },
      colors: {
        /* ── brand：域感知主色阶（TOKENS_PLAN §2.3 方案 A）──
           改这一处，全站 brand-* 引用全部获得域感知能力。
           必须用 rgb(var(..-rgb) / <alpha-value>)：直接写 var(--d-600)
           会让 bg-brand/5 这类不透明度修饰静默失效（§2.2 已实测）。 */
        brand: {
          DEFAULT: 'rgb(var(--d-600-rgb) / <alpha-value>)',
          50:  'rgb(var(--d-50-rgb)  / <alpha-value>)',
          100: 'rgb(var(--d-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--d-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--d-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--d-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--d-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--d-600-rgb) / <alpha-value>)',
          700: 'rgb(var(--d-700-rgb) / <alpha-value>)',
          800: 'rgb(var(--d-800-rgb) / <alpha-value>)',
          900: 'rgb(var(--d-900-rgb) / <alpha-value>)',
        },

        /* ── 中性色阶 n-*：替代 gray/slate 混用，统一冷倾 ── */
        n: {
          0:   'rgb(var(--n-0-rgb)   / <alpha-value>)',
          25:  'rgb(var(--n-25-rgb)  / <alpha-value>)',
          50:  'rgb(var(--n-50-rgb)  / <alpha-value>)',
          100: 'rgb(var(--n-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--n-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--n-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--n-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--n-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--n-600-rgb) / <alpha-value>)',
          700: 'rgb(var(--n-700-rgb) / <alpha-value>)',
          800: 'rgb(var(--n-800-rgb) / <alpha-value>)',
          900: 'rgb(var(--n-900-rgb) / <alpha-value>)',
          950: 'rgb(var(--n-950-rgb) / <alpha-value>)',
        },

        /* ── 语义色：只做状态，禁止做身份色 ── */
        success: {
          300: 'rgb(72 159 118 / <alpha-value>)',
          500: 'rgb(16 151 88 / <alpha-value>)',
          600: 'rgb(0 138 74 / <alpha-value>)',
          700: 'rgb(0 109 58 / <alpha-value>)',
        },
        warning: {
          300: 'rgb(178 154 56 / <alpha-value>)',
          500: 'rgb(170 136 0 / <alpha-value>)',
          600: 'rgb(140 112 0 / <alpha-value>)',
          700: 'rgb(110 88 0 / <alpha-value>)',
        },
        danger: {
          300: 'rgb(255 165 171 / <alpha-value>)',
          500: 'rgb(204 86 94 / <alpha-value>)',
          600: 'rgb(169 45 55 / <alpha-value>)',
          700: 'rgb(143 30 38 / <alpha-value>)',
        },
        info: {
          300: 'rgb(124 203 249 / <alpha-value>)',
          500: 'rgb(24 140 207 / <alpha-value>)',
          600: 'rgb(0 121 191 / <alpha-value>)',
          700: 'rgb(0 96 151 / <alpha-value>)',
        },

        /* ── 图表色板：同图分类序列 ≤6，超出改用分面/表格 ── */
        /* 三档制，数值由 scripts/design-tokens.mjs 生成并校验，勿手改：
           base    = 图形边界（描边 / marker / 面积块），已验 ≥3:1 on 白底；
           ink     = 数据标签 / 图例文字 on 白底，已验 ≥4.5:1（6 个 base 里只有
                     viz-1 / viz-5 达 4.5:1，所以文字一律用 ink，禁用 base 当文字色）；
           onDark  = 暗色模式 on 深色卡片底，已验 ≥4.5:1。
           CSS 侧同名变量 --viz-N / --viz-N-ink / --viz-N-on-dark 见 docs/design/.generated-palette.css */
        viz: {
          1: '#AC402E', 2: '#DE723A', 3: '#69A13F',
          4: '#009CD8', 5: '#6767C2', 6: '#C55898',
        },
        'viz-ink': {
          1: '#902A19', 2: '#973603', 3: '#2E6B01',
          4: '#006389', 5: '#6060BC', 6: '#81235A',
        },
        'viz-on-dark': {
          1: '#FEA89A', 2: '#F9AC85', 3: '#6D9450',
          4: '#6ACAEF', 5: '#B9B9FF', 6: '#F4A8D4',
        },
      },
      keyframes: {
        'page-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'page-in': 'page-in .3s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
}
