# ITtime 设计 Token 落地清单（Phase 3 直接输入）

> 面向：前端工程师。本文所有代码片段均可直接粘贴，不含伪代码。
> 配套：[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)（设计原理）· [MOTION_SPEC.md](./MOTION_SPEC.md)（动效）
> 生成脚本：`scripts/design-tokens.mjs`（`node scripts/design-tokens.mjs`，产物写入 `docs/design/.generated-palette.css`）

---

## 0. 结论速览（先看这里）

| 项 | 结论 |
|---|---|
| `data-domain` 挂哪 | **`.app-shell` 上**。fixed 侧栏 / fixed 底栏均能继承（详见 §1.3 的验证） |
| `brand` 色怎么办 | **改 tailwind.config.js 一处定义**，131 处 `brand-*` 引用全部自动跟随域切换。**必须用 `rgb(var(..-rgb) / <alpha-value>)` 写法**，否则 11 处 `bg-brand/5` 类直接失效（已实测，见 §2.2） |
| Aurora Glass 怎么办 | **不删，改为派生**：把 `--aurora-teal` 等重定义为 `var(--d-400)`。`.btn-primary` 等 4 处消费者零改动即获得域感知能力 |
| 现有 `--radius-card/ctl` | 保留原值不变，只在其上**新增**层级，零视觉回归 |
| 本次色板校验状态 | `node scripts/design-tokens.mjs` → **✓ 全部硬性校验通过**（WCAG AA + ΔE） |

---

## 1. 域主题切换机制

### 1.1 核心思路：不要写 50 个变量

反模式（不要这么写）——5 域 × 10 档 = 50 个变量，再由 `[data-domain]` 逐个大挪：

```css
/* ❌ 反模式：50 行赋值，加一个域要改 10 处 */
:root[data-domain="time"] { --d-50: #F4F5FF; --d-100: #E7E9FF; /* …×10 */ }
```

正模式：**只有一组"活动域"变量 `--d-50 … --d-900`**，`[data-domain]` 只负责把它指向哪套色板。Tailwind 永远引用 `var(--d-600)`，于是同一份配置在所有域自动生效。

```css
/* :root 定义 5 套原始色板（只写死，不切换） */
/* [data-domain] 只做指针（每个域 10 行，加新域只加 10 行） */
/* Tailwind 只认 --d-* */
```

### 1.2 三层变量架构

三层各司其职，**互不覆盖**——这是不出 bug 的关键：

| 层 | 选择器 | 内容 | 随主题变？ |
|---|---|---|---|
| **L1 原始色板** | `:root` | `--d-work-50 … --d-system-900`、`--n-*`、`--sem-*`、`--d-*-rgb` 三元组 | 否 |
| **L2 域指针** | `:root[data-domain="…"]` | `--d-50 … --d-900` → 指向 L1 中某套 | 否 |
| **L3 角色与主题** | `html.dark` | `--d` / `--d-fg` / `--d-solid` / `--d-bg` / `--d-bd` / `--d-ring` + 玻璃与中性反转 | **是** |

> L2 与 L3 操作的是**不同的变量名**（`--d-600` vs `--d-solid`），所以永远不会互相打架。

### 1.3 `data-domain` 挂在 `.app-shell` —— 继承性验证

**结论：可以挂，fixed 子元素能继承。**

CSS 自定义属性的继承走 **DOM 树**，与 `position` 无关。`position: fixed` 改变的只是包含块和绘制层，不影响继承链。验证 Layout.tsx 实际结构：

```
div.app-shell[data-domain="time"]        ← 变量定义处
├── aside.desktop-sidebar.fixed          ← DOM 子节点，继承 ✓
│   └── nav > NavLink × 5
└── div.min-h-screen
    ├── main.app-main
    └── nav.mobile-nav.fixed             ← DOM 子节点，继承 ✓
```

两个 fixed 元素都在 `.app-shell` 的 DOM 子树内，因此都能拿到 `--d-*`。

**三个需要注意的边界：**

1. **`backdrop-filter` 不切断继承。** `.desktop-sidebar` 和 `.mobile-nav` 都有 `backdrop-filter`，它只创建包含块/层叠上下文，自定义属性照常继承。已确认无需额外处理。
2. **Portal 会切断。** 若将来把 Modal / Command Palette 用 `createPortal` 挂到 `document.body`，它就脱离了 `.app-shell`，`--d-*` 会回落到 `:root` 默认值（work 域）。**规避办法：把 `data-domain` 同时镜像到 `<html>`**，见 §1.5。
3. **ErrorBoundary 在 `.app-shell` 之外。** App.tsx 里 `ErrorBoundary` 包着 `AuthGate`，登录页/错误页拿不到域色，会显示 `:root` 默认（work 青）。这是**期望行为**——品牌入口页保持固定的品牌青，不随域跳。

### 1.4 完整 CSS（可直接粘贴）

```css
/* ══════════════════════════════════════════════════════════════
   ITtime 域色系统 —— L1 原始色板（由 scripts/design-tokens.mjs 生成，勿手改）
   ══════════════════════════════════════════════════════════════ */
:root {
  /* ── 工作台：品牌继承，主 CTA 沿用 teal；最亮一档，默认落地页 ── */
  --d-work-50: #E5FAF7;  --d-work-100: #C1EBE5; --d-work-200: #58A398;
  --d-work-300: #33AD9B; --d-work-400: #08B89E; --d-work-500: #00A28A;
  --d-work-600: #008672; --d-work-700: #006A5A; --d-work-800: #005044;
  --d-work-900: #00382F;

  /* ── 时间：冷色秩序感；600/700/800 额外压暗以保证白底 4.5:1 ── */
  --d-time-50: #F4F5FF;  --d-time-100: #E7E9FF; --d-time-200: #CFD4FF;
  --d-time-300: #B4BBFD; --d-time-400: #9CA5F0; --d-time-500: #848DE2;
  --d-time-600: #656EC5; --d-time-700: #464F9C; --d-time-800: #303778;
  --d-time-900: #292E63;

  /* ── 事项：暖色行动感，与 teal 形成冷暖对冲 ── */
  --d-tasks-50: #FFF8F1;  --d-tasks-100: #FFEBD7; --d-tasks-200: #FFD1A4;
  --d-tasks-300: #F4B06B; --d-tasks-400: #D17F2C; --d-tasks-500: #D56E07;
  --d-tasks-600: #B25900; --d-tasks-700: #8D4600; --d-tasks-800: #6B3600;
  --d-tasks-900: #4B2500;

  /* ── 洞察：分析/深度；与时间域拉开 48°，并压暗一档 ── */
  --d-insights-50: #F8EDFC;  --d-insights-100: #F3DEFC; --d-insights-200: #E9C5F9;
  --d-insights-300: #DBA8F1; --d-insights-400: #C489DD; --d-insights-500: #8E4DAB;
  --d-insights-600: #833EA1; --d-insights-700: #6A2A85; --d-insights-800: #521B69;
  --d-insights-900: #3A0E4D;

  /* ── 体系：收尾色相；最低彩度表达「不急」 ── */
  --d-system-50: #FBEDF1;  --d-system-100: #FBDEE6; --d-system-200: #F6C6D2;
  --d-system-300: #EBA9BB; --d-system-400: #D3889C; --d-system-500: #98485E;
  --d-system-600: #8F3C52; --d-system-700: #762A3E; --d-system-800: #5D1C2D;
  --d-system-900: #44101E;

  /* ── 中性色阶 n-*：OKLCH hue 240 冷倾，暗端再冷一档 ── */
  --n-0: #FFFFFF;  --n-25: #FAFAFD; --n-50: #F6F6FB; --n-100: #F0F0F7;
  --n-200: #E5E5EE; --n-300: #D5D5DF; --n-400: #BBBBC6; --n-500: #93939F;
  --n-600: #757583; --n-700: #535364; --n-800: #343446; --n-900: #1C1C2F;
  --n-950: #0C0C20;

  /* ── 语义色（仅用于状态，禁止做大面积身份色）── */
  --sem-success-500: #109758; --sem-success-600: #008A4A; --sem-success-700: #006D3A;
  --sem-success-300: #489F76;
  --sem-warning-500: #AA8800; --sem-warning-600: #8C7000; --sem-warning-700: #6E5800;
  --sem-warning-300: #B29A38;
  --sem-danger-500: #CC565E;  --sem-danger-600: #A92F37;  --sem-danger-700: #8F1E26;
  --sem-danger-300: #FFA5AB;
  --sem-info-500: #188CCF;    --sem-info-600: #0079BF;    --sem-info-700: #006097;
  --sem-info-300: #7CCBF9;
}

/* ══════════════════════════════════════════════════════════════
   L1b 域色 RGB 三元组 —— 供 Tailwind <alpha-value> 使用
   没有这一段，bg-brand/5 这类不透明度修饰会失效（已实测）
   ══════════════════════════════════════════════════════════════ */
:root {
  --d-work-50-rgb: 229 250 247;  --d-work-100-rgb: 193 235 229;
  --d-work-200-rgb: 88 163 152;  --d-work-300-rgb: 51 173 155;
  --d-work-400-rgb: 8 184 158;   --d-work-500-rgb: 0 162 138;
  --d-work-600-rgb: 0 134 114;   --d-work-700-rgb: 0 106 90;
  --d-work-800-rgb: 0 80 68;     --d-work-900-rgb: 0 56 47;

  --d-time-50-rgb: 244 245 255;  --d-time-100-rgb: 231 233 255;
  --d-time-200-rgb: 207 212 255; --d-time-300-rgb: 180 187 253;
  --d-time-400-rgb: 156 165 240; --d-time-500-rgb: 132 141 226;
  --d-time-600-rgb: 101 110 197; --d-time-700-rgb: 70 79 156;
  --d-time-800-rgb: 48 55 120;   --d-time-900-rgb: 41 46 99;

  --d-tasks-50-rgb: 255 248 241;  --d-tasks-100-rgb: 255 235 215;
  --d-tasks-200-rgb: 255 209 164; --d-tasks-300-rgb: 244 176 107;
  --d-tasks-400-rgb: 209 127 44;  --d-tasks-500-rgb: 213 110 7;
  --d-tasks-600-rgb: 178 89 0;    --d-tasks-700-rgb: 141 70 0;
  --d-tasks-800-rgb: 107 54 0;    --d-tasks-900-rgb: 75 37 0;

  --d-insights-50-rgb: 248 237 252;  --d-insights-100-rgb: 243 222 252;
  --d-insights-200-rgb: 233 197 249; --d-insights-300-rgb: 219 168 241;
  --d-insights-400-rgb: 196 137 221; --d-insights-500-rgb: 142 77 171;
  --d-insights-600-rgb: 131 62 161;  --d-insights-700-rgb: 106 42 133;
  --d-insights-800-rgb: 82 27 105;   --d-insights-900-rgb: 58 14 77;

  --d-system-50-rgb: 251 237 241;  --d-system-100-rgb: 251 222 230;
  --d-system-200-rgb: 246 198 210; --d-system-300-rgb: 235 169 187;
  --d-system-400-rgb: 211 136 156; --d-system-500-rgb: 152 72 94;
  --d-system-600-rgb: 143 60 82;   --d-system-700-rgb: 118 42 62;
  --d-system-800-rgb: 93 28 45;    --d-system-900-rgb: 68 16 30;

  --n-0-rgb: 255 255 255;   --n-25-rgb: 250 250 253;  --n-50-rgb: 246 246 251;
  --n-100-rgb: 240 240 247; --n-200-rgb: 229 229 238; --n-300-rgb: 213 213 223;
  --n-400-rgb: 187 187 198; --n-500-rgb: 147 147 159; --n-600-rgb: 117 117 131;
  --n-700-rgb: 83 83 100;   --n-800-rgb: 52 52 70;    --n-900-rgb: 28 28 47;
  --n-950-rgb: 12 12 32;
}

/* ══════════════════════════════════════════════════════════════
   L2 域指针 —— 活动域变量 + L3 角色默认值（亮色）
   注意：默认值就是 work 域，所以 .app-shell 之外的区域也有合理回落
   ══════════════════════════════════════════════════════════════ */
:root,
:root[data-domain="work"] {
  --d-50: var(--d-work-50);   --d-100: var(--d-work-100);
  --d-200: var(--d-work-200); --d-300: var(--d-work-300);
  --d-400: var(--d-work-400); --d-500: var(--d-work-500);
  --d-600: var(--d-work-600); --d-700: var(--d-work-700);
  --d-800: var(--d-work-800); --d-900: var(--d-work-900);
}
:root[data-domain="time"] {
  --d-50: var(--d-time-50);   --d-100: var(--d-time-100);
  --d-200: var(--d-time-200); --d-300: var(--d-time-300);
  --d-400: var(--d-time-400); --d-500: var(--d-time-500);
  --d-600: var(--d-time-600); --d-700: var(--d-time-700);
  --d-800: var(--d-time-800); --d-900: var(--d-time-900);
}
:root[data-domain="tasks"] {
  --d-50: var(--d-tasks-50);   --d-100: var(--d-tasks-100);
  --d-200: var(--d-tasks-200); --d-300: var(--d-tasks-300);
  --d-400: var(--d-tasks-400); --d-500: var(--d-tasks-500);
  --d-600: var(--d-tasks-600); --d-700: var(--d-tasks-700);
  --d-800: var(--d-tasks-800); --d-900: var(--d-tasks-900);
}
:root[data-domain="insights"] {
  --d-50: var(--d-insights-50);   --d-100: var(--d-insights-100);
  --d-200: var(--d-insights-200); --d-300: var(--d-insights-300);
  --d-400: var(--d-insights-400); --d-500: var(--d-insights-500);
  --d-600: var(--d-insights-600); --d-700: var(--d-insights-700);
  --d-800: var(--d-insights-800); --d-900: var(--d-insights-900);
}
:root[data-domain="system"] {
  --d-50: var(--d-system-50);   --d-100: var(--d-system-100);
  --d-200: var(--d-system-200); --d-300: var(--d-system-300);
  --d-400: var(--d-system-400); --d-500: var(--d-system-500);
  --d-600: var(--d-system-600); --d-700: var(--d-system-700);
  --d-800: var(--d-system-800); --d-900: var(--d-system-900);
}

/* ══════════════════════════════════════════════════════════════
   L3 角色变量（亮色）—— 每一步的用途都经过 WCAG 校验
   ══════════════════════════════════════════════════════════════ */
:root {
  --d: var(--d-500);                    /* 域身份色：图标/图形，白底 ≥3:1 */
  --d-fg: var(--d-700);                 /* 域色正文：白底 ≥4.5:1 */
  --d-solid: var(--d-600);              /* 实心底：配白字 ≥4.5:1 */
  --d-on-solid: #FFFFFF;
  --d-ring: var(--d-600);               /* focus ring：≥4.5:1，见 §4.4 */
  --d-bg: var(--d-50);                  /* 域色淡底 */
  --d-bd: var(--d-200);                 /* 域色边框 */
  --d-glow: rgb(var(--d-500-rgb) / .28);
}
/* ══════════════════════════════════════════════════════════════
   L3 角色变量（暗色）—— 深空玻璃
   关键差异：暗色下「实心底」改用 400 档配近黑字（亮底深字），
   而不是沿用 600 档配白字——否则按钮在暗底上会糊成一团。
   ══════════════════════════════════════════════════════════════ */
html.dark {
  --d: var(--d-400);
  --d-fg: var(--d-300);
  --d-solid: var(--d-400);
  --d-on-solid: #0B0F17;
  --d-ring: var(--d-400);
  --d-bg: rgb(var(--d-900-rgb) / .45);
  --d-bd: rgb(var(--d-700-rgb) / .55);
  --d-glow: rgb(var(--d-400-rgb) / .22);
}

/* ══════════════════════════════════════════════════════════════
   兼容旧代码：把 Aurora 令牌改为「派生」，消费者零改动
   —— 详见 §4
   ══════════════════════════════════════════════════════════════ */
:root {
  --aurora-teal: var(--d-400);
  --aurora-cyan: var(--d-300);
  --aurora-violet: #8B5CF6;              /* 极光第二团固定紫，不与域争 */
  --aurora-grad: linear-gradient(135deg, var(--d-400) 0%, var(--d-300) 100%);
}

### 1.5 React 侧接线（Layout.tsx）

```tsx
// apps/web/src/components/Layout.tsx
import { NavLink, useLocation } from 'react-router-dom'
import { Timer, ListTodo, ChartColumn, Settings, CalendarDays, LogOut, Wifi, Tags } from 'lucide-react'

const navItems = [
  { to: '/',        label: '工作台', icon: Timer,        domain: 'work' },
  { to: '/time',    label: '时间',   icon: CalendarDays, domain: 'time' },
  { to: '/tasks',   label: '事项',   icon: ListTodo,     domain: 'tasks' },
  { to: '/insights',label: '洞察',   icon: ChartColumn,  domain: 'insights' },
  { to: '/system',  label: '体系',   icon: Tags,         domain: 'system' },
] as const

/** 路径 → 域。注意 /settings 已重定向到 /system?tab=settings，因此归 system。 */
const domainOf = (pathname: string): DomainKey =>
  navItems.find((n) => n.to !== '/' && pathname.startsWith(n.to))?.domain
  ?? (pathname === '/' ? 'work' : 'work')

export default function Layout({ children, username, onLogout }: LayoutProps) {
  const location = useLocation()
  const domain = domainOf(location.pathname)

  useEffect(() => {
    // 镜像到 <html>：Portal 挂到 body 的浮层也能拿到域色
    document.documentElement.dataset.domain = domain
  }, [domain])

  return (
    <div
      className="app-shell min-h-screen pb-24 lg:pl-64 lg:pb-0"
      data-domain={domain}
    >
      {/* …侧边栏 / main / 底栏保持不变… */}
    </div>
  )
}
```

配套的类型定义（新建 `apps/web/src/domainTheme.ts`）：

```ts
export type DomainKey = 'work' | 'time' | 'tasks' | 'insights' | 'system'

export const DOMAIN_LABEL: Record<DomainKey, string> = {
  work: '工作台', time: '时间', tasks: '事项', insights: '洞察', system: '体系',
}
```

> **为什么两个地方都设**：`.app-shell` 上的 `data-domain` 服务于常规子树；`<html>` 上的镜像服务于将来任何 Portal 到 `body` 的浮层（Modal、⌘K 命令面板）。二者值永远相同，不冲突。

---

## 2. tailwind.config.js 扩展

### 2.1 完整可粘贴配置

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── brand：改这一处，131 处 brand-* 引用全部获得域感知能力 ──
           必须用 rgb(var(..-rgb) / <alpha-value>)：
           直接写 var(--d-600) 会让 bg-brand/5 这类不透明度修饰失效（已实测）。 */
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

        /* ── 中性色阶：替代 gray/slate，冷倾 ── */
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
           CSS 侧同名变量 --viz-N / --viz-N-ink / --viz-N-on-dark 见 .generated-palette.css */
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

      borderRadius: {
        // 原有两档保留原值，零视觉回归
        card: 'var(--radius-card)',   // 12px
        ctl:  'var(--radius-ctl)',    // 8px
        // 新增三级
        xs:   'var(--radius-xs)',     // 4px  微型：圆点/指示条/复选框
        panel:'var(--radius-panel)',  // 18px 面板：page-card / modal（对齐现有玻璃覆盖值）
        xl:   'var(--radius-xl)',     // 24px 英雄容器：计时盘外框
      },

      boxShadow: {
        card:  'var(--shadow-card)',
        float: 'var(--shadow-float)',
        panel: 'var(--shadow-panel)',
        modal: 'var(--shadow-modal)',
        glow:  'var(--shadow-glow)',
      },

      /* 缓动令牌：与 index.css 的 --ease-* 一一对应（MOTION_SPEC §3）*/
      transitionTimingFunction: {
        micro: 'cubic-bezier(.2,.8,.2,1)',      // = --ease-micro
        enter: 'cubic-bezier(.16,1,.3,1)',      // = --ease-enter
        exit:  'cubic-bezier(.4,0,1,1)',        // = --ease-exit
        loop:  'cubic-bezier(.4,0,.6,1)',       // = --ease-loop
      },

      keyframes: {
        /* ── L0 环境层：无限循环，禁止加 fill-mode ── */
        'pulse-live': {
          '0%':   { transform: 'scale(1)',   opacity: '.5' },
          '70%':  { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        /* ── L1 微反馈层（140ms / 90ms）── */
        'tip-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(.98)' },
          to:   { opacity: '1', transform: 'translateY(0)   scale(1)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(.96)' },
          to:   { opacity: '1', transform: 'translateY(0)   scale(1)' },
        },
        'press-tap': {
          '0%':   { transform: 'scale(1)' },
          '40%':  { transform: 'scale(.96)' },
          '100%': { transform: 'scale(1)' },
        },
        /* ── L2 组件层（260ms 基准 / 200ms cmdk）── */
        'list-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-in': {
          from: { transform: 'translateY(100%)' },
          to:   { transform: 'translateY(0)' },
        },
        'cmdk-in': {
          from: { opacity: '0', transform: 'translateY(-8px) scale(.98)' },
          to:   { opacity: '1', transform: 'translateY(0)    scale(1)' },
        },
        /* ── L3 页面层（300ms，替代现有 page-in 的纯淡入）── */
        'page-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(.99)' },
          to:   { opacity: '1', transform: 'translateY(0)    scale(1)' },
        },
        /* ── L4 数据层 ── */
        'bar-grow': {
          from: { transform: 'scaleY(0)' },
          to:   { transform: 'scaleY(1)' },
        },
        /* ring-draw 依赖 SVG pathLength="1"；Recharts 图表请改用 JS props（MOTION_SPEC §6.4）*/
        'ring-draw': {
          from: { strokeDashoffset: '1' },
          to:   { strokeDashoffset: '0' },
        },
      },

      animation: {
        /* L0 · 环境层 */
        'pulse-live': 'pulse-live 2400ms cubic-bezier(.4,0,.6,1) infinite',
        /* L1 · 微反馈层 */
        'tip-in':    'tip-in 140ms cubic-bezier(.2,.8,.2,1) both',
        'pop-in':    'pop-in 140ms cubic-bezier(.2,.8,.2,1) both',
        'press-tap': 'press-tap 90ms cubic-bezier(.2,.8,.2,1) both',
        /* L2 · 组件层 */
        'list-in':   'list-in 260ms cubic-bezier(.16,1,.3,1) both',
        'sheet-in':  'sheet-in 260ms cubic-bezier(.16,1,.3,1) both',
        'cmdk-in':   'cmdk-in 200ms cubic-bezier(.16,1,.3,1) both',
        /* L3 · 页面层 */
        'page-in':   'page-in 300ms cubic-bezier(.16,1,.3,1) both',
        /* L4 · 数据层 */
        'bar-grow':  'bar-grow 700ms cubic-bezier(.16,1,.3,1) both',
        'ring-draw': 'ring-draw 900ms cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
}
```

对应的 CSS 变量（放进 `index.css` 的 `:root`）：

```css
:root {
  /* ── 圆角三级 + 微型 + 胶囊 ── */
  --radius-xs: 4px;
  --radius-ctl: 8px;
  --radius-card: 12px;
  --radius-panel: 18px;
  --radius-xl: 24px;

  /* ── 阴影三级 + 语义发光 ── */
  --shadow-card: 0 1px 2px rgb(15 23 42 / .05), 0 1px 3px rgb(15 23 42 / .04);
  --shadow-panel: 0 2px 6px rgb(15 23 42 / .06), 0 10px 28px -12px rgb(15 23 42 / .12);
  --shadow-float: 0 12px 34px rgb(15 23 42 / .08);
  --shadow-modal: 0 24px 64px rgb(15 23 42 / .18);
  --shadow-glow: 0 0 22px var(--d-glow);
}
html.dark {
  --shadow-card: 0 1px 2px rgb(0 0 0 / .30);
  --shadow-panel: 0 2px 8px rgb(0 0 0 / .34), 0 12px 32px -14px rgb(0 0 0 / .50);
  --shadow-float: 0 12px 34px rgb(0 0 0 / .44);
  --shadow-modal: 0 24px 64px rgb(0 0 0 / .58);
  --shadow-glow: 0 0 26px var(--d-glow);
}
```

### 2.2 为什么必须写 `rgb(var(..-rgb) / <alpha-value>)`

**这是本次实测出来的坑，不是理论担忧。**

代码里存在 11 处带不透明度修饰的 `brand` 用法：

```
bg-brand/5 · bg-brand/10 · bg-brand/20 · border-brand/20 · hover:bg-brand/20
涉及：CalendarPage.tsx:869 · NoteEditorPage.tsx:557-560 · NotesPage.tsx:362
      TimerPage.tsx:423,918,2198 · VaultPage.tsx:535,674
```

若把 `brand` 定义成普通 `var(--d-600)`，Tailwind 3 无法从中解析出通道值，`/5` 修饰会被**静默丢弃**——不会报错，只会让这些淡底全部变成 100% 不透明，视觉上突然出现 5 个生硬的实色块。

用 `<alpha-value>` 占位符则完全正常。已用项目自带的 `tailwindcss@3.4.16` 实测编译，输出：

```css
.bg-brand\/10  { background-color: rgb(var(--d-600-rgb) / 0.1); }
.border-brand\/20 { border-color: rgb(var(--d-600-rgb) / 0.2); }
.from-brand-500 { --tw-gradient-from: rgb(var(--d-500-rgb) / 1) var(--tw-gradient-from-position); /* … */ }
.ring-brand-400\/30 { --tw-ring-color: rgb(var(--d-400-rgb) / 0.3); }
```

普通用法、不透明度、渐变、ring 四类全部生成合法 CSS。

### 2.3 brand 迁移策略：改一处，不改 131 处

**策略：保留 `brand-*` 类名不动，只把它的定义指向活动域。**

| 方案 | 评价 |
|---|---|
| A. 保留 `brand` 指向域色（**采纳**） | 131 处零改动即全部域感知。`text-brand-700` 自动变成当前域的 700 档 |
| B. 新增 `domain-*` 并存，逐步替换 | 需要改 131 处，且期间两套色并存易混 |
| C. 直接把 `brand` 删掉 | 会一次性炸掉全站主按钮、链接、选中态 |

采纳 A 的**语义代价**：`brand-600` 从此不再等于"品牌青"，而等于"当前域的主色"。这与"功能域分色"的产品决策一致，但需要在团队内明确，避免有人以为 `brand-600` 是固定品牌色。

**例外清单——这些应保持固定的品牌青，不要跟着域跳：**

| 位置 | 现状 | 处置 |
|---|---|---|
| `Layout.tsx:19` 侧栏 "IT" logo | `from-teal-500 to-sky-400`（Tailwind 内置 teal，非 brand） | 已天然固定，**不要改** |
| `App.tsx:49` ErrorBoundary 刷新按钮 | `bg-brand` | 在 `.app-shell` 外，天然回落到 work 青，**符合期望** |
| 登录页 `AuthGate` | — | 同样在 `.app-shell` 外，保持品牌青 |

即：**不需要为品牌固定色做任何特殊处理**，只要 `data-domain` 只挂在 `.app-shell` 上，壳外区域自动保持 work 青。

---

## 3. Aurora Glass 与新系统的共存策略

### 3.1 核心策略：把 Aurora 令牌从「写死」改为「派生」

`index.css` 591–758 行的 Aurora 段**不需要重写**。只需把 4 个令牌的定义从字面量改为指向活动域：

```diff
 :root {
-  --aurora-teal: #14b8a6;
-  --aurora-cyan: #38bdf8;
-  --aurora-violet: #8b5cf6;
-  --aurora-grad: linear-gradient(135deg, #14b8a6 0%, #38bdf8 100%);
+  /* 派生：跟随 data-domain 自动切换 */
+  --aurora-teal: var(--d-400);
+  --aurora-cyan: var(--d-300);
+  --aurora-violet: #8B5CF6;   /* 极光第二团固定紫，刻意不与域色相争 */
+  --aurora-grad: linear-gradient(135deg, var(--d-400) 0%, var(--d-300) 100%);
 }
```

改完这 4 行，下面 4 个消费者**零改动**即获得域感知能力：

| 消费者 | 位置 | 用的令牌 |
|---|---|---|
| `.btn-primary` 背景 | index.css:683 | `var(--aurora-grad)` |
| `.clock-hero` 渐变文字 | index.css:708 | `var(--aurora-grad)` |
| `.stats-overview strong` 渐变数字 | index.css:732 | `var(--aurora-grad)` |
| `.page-header-icon` 背景 | index.css:702 | `var(--aurora-grad)` |
| `.app-shell::before` 极光团 | index.css:634 | `var(--aurora-teal)` |
| `.app-shell::after` 极光团 | index.css:640 | `var(--aurora-violet)` |

**对比度已验证**：渐变端点（`--d-400` → `--d-300`）配按钮文字 `#04121a`，五个域最低 6.13:1，全部超过 AA 4.5:1。

### 3.2 必须一起改的：硬编码 teal 光晕

以下位置写死了 `rgba(20, 184, 166, …)`（旧 teal），**不会**跟随域切换，需要手工替换：

| 位置 | 现状 | 改为 |
|---|---|---|
| index.css:686 | `.btn-primary { box-shadow: 0 6px 22px rgba(20,184,166,.3) }` | `box-shadow: 0 6px 22px var(--d-glow)` |
| index.css:688 | `.btn-primary:hover { box-shadow: 0 8px 30px rgba(20,184,166,.48) }` | `box-shadow: 0 8px 30px rgb(var(--d-400-rgb) / .48)` |
| index.css:703 | `.page-header-icon { box-shadow: 0 0 18px rgba(20,184,166,.3) }` | `box-shadow: 0 0 18px var(--d-glow)` |
| index.css:719 | `.dark .timer-tag[aria-pressed] { border-color: rgba(20,184,166,.55); box-shadow: 0 0 18px rgba(20,184,166,.25) }` | `border-color: rgb(var(--d-400-rgb) / .55); box-shadow: 0 0 18px rgb(var(--d-400-rgb) / .25)` |
| index.css:724 | `.stats-overview { background: linear-gradient(150deg, rgba(20,184,166,.12), rgba(56,189,248,.05) 55%, var(--glass-bg)) }` | `background: linear-gradient(150deg, rgb(var(--d-500-rgb) / .12), rgb(var(--d-400-rgb) / .05) 55%, var(--glass-bg))` |
| index.css:725 | `.stats-overview { border-color: rgba(20,184,166,.28) }` | `border-color: rgb(var(--d-500-rgb) / .28)` |
| index.css:726 | `.stats-overview { border-left: 3px solid var(--aurora-teal) }` | 已用变量，**保持不变** |
| index.css:740 | `.dark .nav-item-glow { box-shadow: inset 0 0 18px rgba(20,184,166,.08) }` | `box-shadow: inset 0 0 18px rgb(var(--d-400-rgb) / .08)` |

### 3.3 玻璃令牌如何扩展以支持多域色

现有 `--glass-*` 是**域无关**的（只分亮/暗），这是正确的——玻璃是材质，不应该跟着域变色。需要扩展的只是让玻璃**能透出域色**：

```css
:root {
  /* 材质（域无关，保持不变）*/
  --glass-bg: rgba(255, 255, 255, .68);
  --glass-bg-2: rgba(255, 255, 255, .82);
  --glass-line: rgba(15, 23, 42, .08);
  --glass-line-strong: rgba(15, 23, 42, .16);
  --glass-blur: blur(20px);

  /* 新增：域色玻璃变体（供选中态/域强调卡片使用）*/
  --glass-domain: rgb(var(--d-500-rgb) / .06);      /* 淡域色玻璃底 */
  --glass-domain-line: rgb(var(--d-500-rgb) / .22); /* 淡域色描边 */
}
html.dark {
  --glass-bg: rgba(255, 255, 255, .045);
  --glass-bg-2: rgba(255, 255, 255, .07);
  --glass-line: rgba(255, 255, 255, .09);
  --glass-line-strong: rgba(255, 255, 255, .16);
  --glass-domain: rgb(var(--d-500-rgb) / .10);
  --glass-domain-line: rgb(var(--d-400-rgb) / .30);
}
```

用法示例——域强调卡片：

```html
<div class="rounded-panel border border-[color:var(--glass-domain-line)]
            bg-[color:var(--glass-domain)] backdrop-blur-[20px] p-4">
  <!-- 内容 -->
</div>
```

---

## 4. 圆角 / 阴影 / 间距 三级体系

### 4.1 圆角

| Token | 值 | 用途 | 现状对照 |
|---|---|---|---|
| `--radius-xs` | 4px | 微型：状态圆点、指示条、复选框、内嵌 tag | 新增 |
| `--radius-ctl` | 8px | 控件：按钮、输入框、tab、tooltip、下拉 | **原有值不变** |
| `--radius-card` | 12px | 卡片：metric-card、列表项、设置分组 | **原有值不变** |
| `--radius-panel` | 18px | 面板：page-card、modal、抽屉 | 新增，**对齐现有 `.page-card` 玻璃覆盖的 18px** |
| `--radius-xl` | 24px | 英雄容器：计时盘外框、空状态插图底 | 新增 |
| `rounded-full` | 999px | 胶囊：chip、徽章、开关 | Tailwind 内置 |

> **为什么保留 18px 单独一档**：`index.css:658` 现有 `.page-card, .surface-card { border-radius: 18px }`，而 `--radius-card` 是 12px。二者不一致是历史遗留。新增 `--radius-panel: 18px` 让这层覆盖有名字可引，后续替换 `rounded-card` → `rounded-panel` 即可收敛，**本次不改动，零视觉回归**。

### 4.2 阴影

| Token | 亮色 | 暗色 | 用途 |
|---|---|---|---|
| `--shadow-card` | `0 1px 2px rgb(15 23 42/.05), 0 1px 3px rgb(15 23 42/.04)` | `0 1px 2px rgb(0 0 0/.30)` | 静态卡片 |
| `--shadow-panel` | `0 2px 6px rgb(15 23 42/.06), 0 10px 28px -12px rgb(15 23 42/.12)` | `0 2px 8px rgb(0 0 0/.34), 0 12px 32px -14px rgb(0 0 0/.50)` | 抬起一层：吸顶工具条、下拉 |
| `--shadow-float` | `0 12px 34px rgb(15 23 42/.08)` | `0 12px 34px rgb(0 0 0/.44)` | 浮层：popover、日期选择器 |
| `--shadow-modal` | `0 24px 64px rgb(15 23 42/.18)` | `0 24px 64px rgb(0 0 0/.58)` | 模态（**对齐 index.css:112 现有硬编码值**） |
| `--shadow-glow` | `0 0 22px var(--d-glow)` | `0 0 26px var(--d-glow)` | 语义发光：进行中/选中 |

> **玻璃表面用 `--shadow-card` 而非 `--shadow-float`**：玻璃已有 `backdrop-filter` 提供层次，叠加重阴影会显脏。`index.css:240` 现有 `.surface-card:hover { box-shadow: var(--shadow-float) }` 建议改为 `--shadow-panel`。

### 4.3 间距

**不要重映射 Tailwind 的 spacing 比例尺。** 项目 `html` 字号由 `fontSettings.ts` 设为 15/15/16px，而 Tailwind 间距本身是 rem 基准，所以**现有 `p-4` / `gap-3` 已经会随用户字号偏好缩放**——这正是想要的行为。改动比例尺会一次性破坏全部布局。

新增的是**语义间距 token**，只给新布局代码用：

```css
:root {
  --space-gutter: 1rem;      /* 页面左右安全边距（移动端）*/
  --space-section: 1.5rem;   /* 区块之间的纵向距离 */
  --space-card: 1rem;        /* 卡片内边距 */
  --space-stack: .5rem;      /* 列表项之间的间距 */
  --space-inline: .5rem;     /* 行内元素间距 */
}
@media (min-width: 640px)  { :root { --space-gutter: 1.5rem; } }
@media (min-width: 1024px) { :root { --space-gutter: 2rem; } }
```

对应 Tailwind 工具类（按需，不必全上）：

```js
spacing: {
  gutter: 'var(--space-gutter)',
  section: 'var(--space-section)',
  card: 'var(--space-card)',
  stack: 'var(--space-stack)',
},
```

### 4.4 Focus ring：现有实现对比度不足（建议一并修）

现状 `index.css:165-168`：

```css
:focus-visible {
  outline: 3px solid rgb(45 212 191 / .45);   /* 旧 teal，45% 不透明度 */
  outline-offset: 2px;
}
```

实测：45% alpha 的域色叠在白底上只有 **1.5–2.0:1**，远低于非文本元素 3:1 的门槛；且写死了 teal，不跟随域。

```css
/* 替换为：全不透明度 + 域感知 + 柔和光环 */
:focus-visible {
  outline: 2px solid var(--d-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgb(var(--d-500-rgb) / .18);
}
```

实测新值：亮色 `--d-ring` = `--d-600`，五域 4.51–8.84:1；暗色 `--d-ring` = `--d-400`，五域 3.14–6.33:1。全部达标。

### 4.5 字体排版 token（与 fontSettings.ts 协同）

`fontSettings.ts` 把 `html` 字号设为 15/15/16px。因此**所有字号 token 必须用 rem**，才能让用户的字号偏好真正生效——现有代码里散落的 `text-[11px]` / `text-[10px]` 是硬编码，建议后续替换为下表 token。

```css
:root {
  /* 字号阶梯（rem，随 html 字号缩放）*/
  --fs-2xs: .6875rem;   /* 11px@16 · kicker / 角标 */
  --fs-xs:  .75rem;     /* 12px@16 · 辅助说明 */
  --fs-sm:  .8125rem;   /* 13px@16 · 次要正文 / 表格 */
  --fs-base: .875rem;   /* 14px@16 · UI 默认正文 */
  --fs-md:  1rem;       /* 16px@16 · 强调正文 */
  --fs-lg:  1.125rem;   /* 18px@16 · 卡片标题 */
  --fs-xl:  1.25rem;    /* 20px@16 · 页面标题 */
  --fs-2xl: 1.5rem;     /* 24px@16 · 区块标题 */
  --fs-3xl: 2rem;       /* 32px@16 · 计时数字 */
  --fs-4xl: 3rem;       /* 48px@16 · 全屏时钟 */

  /* 行高：CJK 需要比拉丁文更松 */
  --lh-tight: 1.25;     /* 数字 / 标题 */
  --lh-snug: 1.4;       /* UI 列表 */
  --lh-normal: 1.6;     /* 中英混排正文 */
  --lh-relaxed: 1.75;   /* 长文阅读（日记）*/

  /* 字重：CJK 在 700 以上易糊，正文最高用到 600 */
  --fw-normal: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;       /* 仅用于数字与拉丁文标题 */
}
```

> **中英混排注意**：`font-variant-numeric: tabular-nums` 必须给所有会跳动的数字（计时器、统计数字、日历日期），否则位数变化时文字会左右抖。现有 `.stats-overview strong` 已有此设置，新组件需要跟进。

---

## 5. 实施顺序与回归检查

### 5.1 建议顺序（每步可独立验证）

| 步骤 | 改动 | 风险 |
|---|---|---|
| 1 | `index.css` 加入 §1.4 全部变量块（L1/L1b/L2/L3） | 无。纯新增，不与现有规则冲突 |
| 2 | `index.css` 的 Aurora 4 行改为派生（§3.1） | 低。改完主按钮/渐变数字立即域感知 |
| 3 | `tailwind.config.js` 按 §2.1 替换 `theme.extend` | 中。**必须先确认 §2.2 的 rgb 三元组已就位** |
| 4 | `index.css` 替换 8 处硬编码 teal 光晕（§3.2） | 低 |
| 5 | `Layout.tsx` 加 `data-domain`（§1.5） | 中。需验证 fixed 侧栏/底栏确实变色 |
| 6 | 圆角/阴影 token 落地 + `rounded-card`→`rounded-panel` 替换 | 中。建议逐页替换并截图比对 |
| 7 | focus ring 修复（§4.4） | 低 |
| 8 | 字号/行高 token 替换硬编码 `text-[11px]` | 低但量大，可延后 |

### 5.2 回归检查清单

- [ ] `node scripts/design-tokens.mjs` 输出 `✓ 全部硬性校验通过`
- [ ] `npm run build -w apps/web` 通过（确认 Tailwind 配置无语法错误）
- [ ] 五个一级入口逐一访问，侧栏活动项、页头图标、主按钮颜色各自不同且属于对应域
- [ ] fixed 侧栏与移动端底栏的活动色**跟随域变化**（验证 DOM 继承假设成立）
- [ ] `TimerPage` / `TodosPage` / `TagsPage` 里的 `bg-brand/5`、`bg-brand/10` 淡底**仍然是淡底**，没有变成实色（验证 `<alpha-value>` 生效）
- [ ] 暗色模式下五个域的实心按钮文字仍可读（应为近黑字 on 亮色底）
- [ ] 缩小窗口到 375px，底栏 5 个 tab 的域色仍正确
- [ ] 登录页与 ErrorBoundary 仍为品牌青（未受域切换影响）

### 5.3 已知取舍

1. **`brand-*` 语义变更**：`brand-600` 不再是固定品牌青，而是"当前域主色"。这是功能域分色决策的必然结果，需在团队内对齐。
2. **暗色实心按钮是"亮底深字"**：与亮色的"深底白字"相反。这是暗色下保证 4.5:1 的唯一途径，视觉上也是主流暗色主题（GitHub / Linear）的做法。
3. **5 个域色无法同时满足色觉障碍下的完全可分**（最弱对 ΔE≈6–9）。这是数学极限。缓解措施是**域身份永不只靠颜色承载**：导航项 = 色相 + 图标 + 文字标签。详见 DESIGN_SYSTEM.md §3.4。
