# MOTION_SPEC · ITtime 动效分层规范

> 版本：v1.0 · 作者：visual · 状态：已落盘，可直接进入 Phase 3
> 上游输入：`TOKENS_PLAN.md`（§4 时长令牌）、UX 的动效分层提案与两项裁定
> 下游消费：`fe-shell` / `fe-pages` / `INTERACTION_SPEC.md`

---

## 0. 结论速查

### 0.1 五层时长总表

| 层 | 档位名 | 时长 | 缓动（入场） | 位移 / 缩放幅度 | 循环 |
|---|---|---|---|---|---|
| **L0** | 环境层 Ambient | 1200 / 2400 / 26000 / 32000 ms | `cubic-bezier(.4,0,.6,1)` | 极光 ±60px+scale(1.12)；脉冲 scale 1→1.6 | `infinite` |
| **L1** | 微反馈层 Micro | **180 ms**（基准）/ 140 / 90 ms | `cubic-bezier(.2,.8,.2,1)` | 位移 0–4 px；缩放 .98–1 | 单次 |
| **L2** | 组件层 Component | **260 ms**（基准）/ 200 / 250 / 320 ms | `cubic-bezier(.16,1,.3,1)` | 位移 8–14 px；缩放 .96→1 | 单次 |
| **L3** | 页面层 Page | **300 ms**（基准）/ 380 / 480 ms 预留 | `cubic-bezier(.16,1,.3,1)` | 位移 12 px；缩放 .99→1 | 单次 |
| **L4** | 数据层 Data | **700 / 900 / 2400 ms** | `cubic-bezier(.16,1,.3,1)` / 环形用 `cubic-bezier(.2,.8,.2,1)` | 数字滚动 100% 行高；柱 scaleY 0→1；环 dashoffset 1→0 | 单次（pulse 除外） |

出场（exit）一律换 `cubic-bezier(.4,0,1,1)`，时长取同层值的 0.7 倍（向下取整到 10 ms）。

### 0.2 与 UX 提案的关系（三处说明，请 UX 过目）

UX 提案：L1 = .18s、L2 = .2s、L3 = .25s、L4 = .3s，全部锚定现存代码。**结论：采纳为 L1–L3 主锚点，做两处扩展、一处重命名。**

1. **原值保留，零改动。** `.18s`（index.css:151 全局 transition）、`.2s`（index.css:105 `overlay-in`）、`.25s`（index.css:111 `modal-in`）、`.3s`（tailwind.config.js `page-in`）四个值一个不改，全部落入本规范的对应层。
2. **向下扩展**：新增 90 ms（按压）与 140 ms（关键帧类微动画）。理由：`.18s` 对"按下"这种需要感知即时的反馈偏慢，JND 阈值在 150 ms 附近，90–140 ms 才是"手起画面应"的区间。
3. **向上扩展 L4**：`.3s` 装不下数字滚动 / 图表生长 / 环形进度。这类动画的时长下限由**可读性**决定——人眼跟踪一段位移约需 500 ms 以上，700 ms 是能让用户看清"数字从 1234 滚到 5678"过程的下限。L4 因此是全新一层，与现存代码无冲突。
4. **唯一一处重命名：modal-in 归 L2 而非 L3。** UX 把 `.25s` 的 modal 定为 L3。本规范将其归入 L2（组件层），因为 L2 的时长带就是 200–320 ms，`overlay-in`(200) 与 `modal-in`(250) 同带；若 modal 独占 L3，则 L3 变成只有 250/300 两个相差 20% 的值，感知上无法区分，且页面转场将失去独立身份。**`.25s` 的数值完全不变**，变的只是层级归属。
5. **新增 L0 环境层**，用于承接三个现存/即将存在的无限循环动画：`aurora-drift`(26s/32s)、`skeleton-shimmer`、`pulse-live`。它们与 L4 的本质区别是"循环永不结束且不承载信息"，放进 L4 会误导实现者给它们加 `animation-fill-mode` 和终态。**UX 对骨架屏的裁定（循环 1.2s、reduce 下关闭、配 `aria-busy`）原样保留**，仅层级标签从 L1 移到 L0——UX 用 L1 想表达的"骨架屏不承载交互语义、不得抢占注意力"正是 L0 的定义。

### 0.3 三条硬规则

1. **只用 `transform` 和 `opacity` 做动画。** 禁止动画 `width/height/top/left/margin/box-shadow/backdrop-filter`。这一条对 Capacitor Android 是硬约束（详见 §11）。
2. **所有新动画必须加 `motion-safe:` 前缀**（与 `Layout.tsx:42` 现有写法一致），同时依赖 §6 的全局兜底规则。双保险，缺一不可。
3. **`prefers-reduced-motion: reduce` 下，L4 直接显示终值，不做中间态。** 不是"变快"，是"不演"。

---

## 1. 设计原则

### P1 · 时长即优先级
用户操作的反馈必须快过用户的怀疑。180 ms 是"系统响应了"的感知上限；超过 400 ms 的动画只允许出现在用户**没有正在操作**的场合（页面初次进入、数据生长）。L0–L4 的编号就是干扰度排序，编号越小越不许抢注意力。

### P2 · 一层只管一件事
L1 回答"我点的东西有反应吗"，L2 回答"新出现的面板从哪来"，L3 回答"我换页面了吗"，L4 回答"数据变成什么样了"。**禁止用一个动画同时干两件事**——例如不要给 modal 同时做入场位移和内容错峰，那会让 250 ms 内出现两个运动中心，视觉上会"散"。

### P3 · 幅度随层级递增，但永不超过一屏的 5%
L1 位移 4 px（ barely perceptible，只提供"活着"的感觉），L2 8–14 px（说明来源方向），L3 12 px，L4 100% 行高（数字滚动）。任何位移超过视口 5% 的动画都不允许——ITtime 是工具型应用，用户在计时，大位移会打断心流。

### P4 · 循环动画是背景，不是内容
L0 的三个循环动画（极光、骨架微光、实时脉冲）共同遵守：不承载任何信息、不响应指针、reduce 下必须停止、单页面同时存在的循环动画元素不超过 12 个（GPU 合成层预算）。

### P5 · 降级是"跳到终态"，不是"加速"
`prefers-reduced-motion: reduce` 的语义是用户前庭敏感，不是用户性子急。所有动画降级后必须**直接呈现最终视觉状态**：modal 直接可见、列表直接齐出、数字直接是终值、图表直接画完。

---

## 2. 分层定义

### L0 · 环境层 Ambient

| 动画名 | 时长 | 缓动 | 循环 | 用途 |
|---|---|---|---|---|
| `aurora-drift`（现存） | 26000 ms / 32000 ms | `cubic-bezier(.4,0,.6,1)` | `infinite alternate` / `alternate-reverse` | `.app-shell::before/::after` 两团极光 |
| `skeleton-shimmer`（现存） | **1200 ms** | `cubic-bezier(.4,0,.6,1)` | `infinite` | 骨架屏微光 |
| `pulse-live`（新增） | 2400 ms | `cubic-bezier(.4,0,.6,1)` | `infinite` | "正在计时"呼吸圆点 |

**规则**
- 现存 `skeleton-shimmer` 是 `1.5s`，UX 裁定 1.2 s。建议改为 1200 ms（改 1 处，见 §9），不改也不违反本规范。
- 三者都是 `infinite`，因此**绝不能加 `animation-fill-mode: both`**——那会让 reduce 降级时元素停在 0% 关键帧（见 §6 洞 1 的镜像问题）。
- 循环动画所在元素必须 `pointer-events: none`（极光已是，骨架屏天然是）。
- 骨架屏微光同时最多 12 个元素；超出就退化为静态灰块。

### L1 · 微反馈层 Micro

**基准 180 ms** —— 直接继承 `index.css:151–153` 的全局 transition，**零改动**。

```css
button, a, input, textarea, select {
  transition: color .18s var(--ease-micro), background-color .18s var(--ease-micro),
    border-color .18s var(--ease-micro), box-shadow .18s var(--ease-micro),
    opacity .18s var(--ease-micro), transform .18s var(--ease-micro);
}
```

| 变体 | 时长 | 用途 |
|---|---|---|
| 180 ms | 全局属性过渡（hover / focus / 选中 / 禁用 / 颜色） | 现存 |
| 140 ms | 关键帧类微动画：`tip-in`、`pop-in`、`press-tap` | 新增 |
| 90 ms | JS 触发的按压反馈（非 `:active`，如长按计时按钮） | 新增 |

**幅度**：位移 0–4 px；缩放 `.98→1`；透明度 `0→1`。
**缓动**：`cubic-bezier(.2,.8,.2,1)`（即现存 `--ui-ease`）。
**场景**：hover、focus-visible、`scale(.98)` 按压、开关切换、tooltip、颜色/边框/阴影变化、行内图标状态翻转。
**不适用**：任何超过 4 px 的位移、任何循环动画（循环归 L0）、任何承载信息的变化（归 L4）。

### L2 · 组件层 Component

**基准 260 ms**，时长带 **200–320 ms**。

| 取值 | 用途 | 来源 |
|---|---|---|
| 200 ms | 遮罩淡入 `overlay-in` | 现存 index.css:105 |
| 250 ms | 弹窗 `modal-in` | 现存 index.css:111 |
| **260 ms** | 新组件基准：Popover、Select、Toast、下拉菜单、列表项 | 新增 |
| 320 ms | 含布局变化的展开（高度/网格重排） | 新增，按需 |

**缓动**：入场 `cubic-bezier(.16,1,.3,1)`；出场 `cubic-bezier(.4,0,1,1)`。
**幅度**：位移 8–14 px；缩放 `.96→1`；遮罩透明度 `0→1`。
**错峰（stagger）**：列表项 40 ms/项，**最多错 6 项**，第 7 项起齐出。总时长 = `260 + 5×40 = 460 ms` 封顶。

> 为什么错峰要封顶：7 项以上的列表（Todo、标签、日历条目）很常见。不封顶的话第 20 项要等 800 ms 才出现，用户会以为页面卡了。封顶后长列表的观感是"前几项陆续到，其余一起到"，符合格式塔的连续性原则。

**场景**：下拉菜单、Popover、Toast、Select、Accordion、卡片展开、列表错峰进场、底部抽屉（`sheet-in`）、⌘K 命令面板（见 §5）。

### L3 · 页面层 Page

**300 ms** —— 继承 `tailwind.config.js` 现存 `page-in` 时长，**零改动**。

**缓动**：入场 `cubic-bezier(.16,1,.3,1)`。
**幅度**：位移 12 px；缩放 `.99→1`；透明度 `0→1`。
**触发**：路由切换。`Layout.tsx:42` 已用 `key={location.pathname}` 实现重挂载，无需改。
**预留 380 / 480 ms**：仅用于未来的共享元素转场（如点击日历某天 → 日视图卡片放大成全页）。当前代码库不使用，写了防止后来者乱造值。

**本规范对现存动画的唯一视觉性改动**：`page-in` 从纯 opacity 升级为 `opacity + translateY(12px) + scale(.99)`。时长仍 300 ms，缓动从 `cubic-bezier(.2,.8,.2,1)` 换成 `cubic-bezier(.16,1,.3,1)`。理由：纯淡入的页面转场在玻璃拟态背景上几乎不可感知（背景本身有极光在动，淡入会"融进背景"），加 12 px 位移后转场才有明确的"内容换过了"信号。这是低风险改动，若不接受可回退到纯 opacity，其余规范不受影响。

### L4 · 数据层 Data

| 动画 | 时长 | 缓动 | 幅度 | 挂载页面 |
|---|---|---|---|---|
| `number-roll` 数字滚动 | 700 ms | `cubic-bezier(.16,1,.3,1)` | 每位数字列位移 100% 行高 | Timer、Goals、Insights |
| `bar-grow` 柱状生长 | 700 ms | `cubic-bezier(.16,1,.3,1)` | `scaleY 0→1`，`transform-origin: bottom` | Insights、Goals |
| `ring-draw` 环形进度 | 900 ms | `cubic-bezier(.2,.8,.2,1)` | `stroke-dashoffset 1→0` | Timer、Goals |
| `pulse-live` 实时脉冲 | 2400 ms | `cubic-bezier(.4,0,.6,1)` | `scale 1→1.6` + `opacity .5→0` | Timer |

**规则**
- 只在"活"页面跑：Timer、Insights、Calendar、Goals。静态页（Settings、Tags、Vault）不挂任何 L4。
- **只跑一次**：组件挂载时触发，数据更新（如计时器每秒跳数）**不重跑**生长动画，只更新数值。重跑会让图表每秒抖一次。
- 数字滚动必须配 `font-variant-numeric: tabular-nums`（`TOKENS_PLAN.md` §4），否则滚动过程中宽度会变，导致布局抖动。
- reduce 下降级：`number-roll` 直接渲染终值字符串；`bar-grow`/`ring-draw` 直接是终态；`pulse-live` 不渲染脉冲元素（只留静态圆点）。

---

## 3. 缓动曲线令牌

四个曲线，全部写进 `index.css` 的 `:root`。**不写 `ease` / `ease-in-out` / `linear`** —— 这三个是浏览器默认值，写出来等于没指定，且 `ease-in-out` 的中段过弯，在 200–300 ms 的短动画里会显"肉"。

```css
:root {
  /* L1 · 前载减速：起手快、尾段长，用于状态反馈（= 现存 --ui-ease 原值） */
  --ease-micro: cubic-bezier(.2, .8, .2, 1);

  /* L2 / L3 / L4 入场与生长：expo-out，前 30% 时间走完 70% 位移，后 70% 时间沉降 */
  --ease-enter: cubic-bezier(.16, 1, .3, 1);

  /* 出场：ease-in，起手缓、离场快，让元素"被收走"而不是"自己飘走" */
  --ease-exit:  cubic-bezier(.4, 0, 1, 1);

  /* L0 无限循环：无方向性，首尾对称，避免循环接缝处的速度跳变 */
  --ease-loop:  cubic-bezier(.4, 0, .6, 1);
}
```

**曲线选型依据**

- `cubic-bezier(.2,.8,.2,1)` 的两个控制点 x 都是 .2，意味着动画在时间轴前 20% 就完成了大部分位移——这正是微反馈需要的"手起画面应"。
- `cubic-bezier(.16,1,.3,1)`（expo-out）第二控制点 y=1，位移在 30% 时间处已基本到位，剩余 70% 时间做 6–14 px 的微沉降。短动画（200–320 ms）用它不会显得"没完"。
- `cubic-bezier(.4,0,1,1)` 起手速度为 0，元素缓慢起动后加速离场。用于出场时，用户视线已经不在它上面，不需要柔和收尾。
- `cubic-bezier(.4,0,.6,1)` 是标准 ease-in-out 的等价参数化形式，首尾速度为 0，循环接缝无速度跳变。

**可选覆盖**：若 `ring-draw` 的 900 ms 环在低端机上"看不清过程"，把缓动换成近线性 `cubic-bezier(.25,.46,.45,.94)`（ease-out-quad），过程更匀。仅此一处允许覆盖，其余不许自造。

---

## 4. 幅度参考表

| 层 | 位移 | 缩放 | 透明度 | 说明 |
|---|---|---|---|---|
| L0 | 极光 ±60 px + scale(1.12)；脉冲 scale(1→1.6) | — | 脉冲 .5→0 | 大幅但极慢（26 s），不干扰 |
| L1 | 0–4 px | .98→1 | 0→1 或 1→0 | 4 px 是" barely perceptible" |
| L2 | 8–14 px | .96→1 | 0→1 | 14 px 是 modal 现值，不要超过 |
| L3 | 12 px | .99→1 | 0→1 | 与 L2 上限齐平，靠缩放差异区分 |
| L4 | 100% 行高（数字）/ 0→100%（柱、环） | — | 脉冲专用 | 大幅但只跑一次 |

**硬上限**：任何单次位移不得超过视口短边的 5%（手机上约 40 px）。超出会打断心流。

---

## 5. 逐场景映射表

| 场景 | 层 | 时长 | 缓动 | 幅度 | 实现要点 |
|---|---|---|---|---|---|
| 按钮 / 链接 / 输入框 hover、focus | L1 | 180 ms | `--ease-micro` | 无位移 | 现存全局 transition，**不要**再叠 `transition-all duration-200` |
| 按钮按下 `:active` | L1 | 180 ms（继承） | `--ease-micro` | `scale(.98)` | 现存 index.css:156–159 |
| 长按计时按钮（JS 触发） | L1 | 90 ms | `--ease-micro` | `scale(.96)→1` | `press-tap` |
| Tooltip | L1 | 140 ms | `--ease-micro` | `translateY(4px)` | `tip-in`，需 `motion-safe:` |
| 小徽标 / 角标出现 | L1 | 140 ms | `--ease-micro` | `translateY(4px) scale(.98)` | `pop-in` |
| 遮罩层 | L2 | 200 ms | `--ease-micro` | 无 | 现存 `overlay-in` |
| Modal | L2 | 250 ms | `--ease-micro`（现存） | `translateY(14px) scale(.985)` | 现存 `modal-in` |
| Popover / Select / 下拉 | L2 | 260 ms | `--ease-enter` | `translateY(8px) scale(.96)` | `pop-in` |
| Toast | L2 | 260 ms 入 / 180 ms 出 | `--ease-enter` / `--ease-exit` | `translateY(12px)` | 出入用不同 easing |
| 列表项错峰进场 | L2 | 260 ms + 40 ms/项（≤6 项） | `--ease-enter` | `translateY(10px)` | `list-in`，`animation-delay` 内联 |
| 卡片展开（高度变化） | L2 | 320 ms | `--ease-enter` | 高度 0→auto | 用 `grid-template-rows: 0fr→1fr` 技巧，勿动画 `height` |
| 底部抽屉（移动端） | L2 | 260 ms 入 / 180 ms 出 | `--ease-enter` / `--ease-exit` | `translateY(100%)→0` | `sheet-in`，须避让 `env(safe-area-inset-bottom)` |
| **⌘K 命令面板** | **L3 语义 / L2 时长** | **200 ms** | `--ease-enter` | **`translateY(-8px)→0`** | UX 裁定，见下 |
| 路由切换 | L3 | 300 ms | `--ease-enter` | `translateY(12px) scale(.99)` | 现存 `page-in`（升级版，见 §2 L3） |
| 骨架屏微光 | L0 | 1200 ms | `--ease-loop` | `background-position` 位移 | UX 裁定，见下 |
| 数字滚动 | L4 | 700 ms | `--ease-enter` | 100% 行高 | JS 驱动，须 `tabular-nums` |
| 柱状图生长 | L4 | 700 ms | `--ease-enter` | `scaleY 0→1` | `bar-grow`，`transform-origin: bottom` |
| 环形进度绘制 | L4 | 900 ms | `--ease-micro` | `dashoffset 1→0` | `ring-draw`，SVG 用 `pathLength="1"` |
| 实时脉冲圆点 | L0 | 2400 ms | `--ease-loop` | `scale 1→1.6` + `opacity .5→0` | `pulse-live`，伪元素实现 |
| 极光背景漂移 | L0 | 26000 / 32000 ms | `--ease-loop` | ±60 px + scale(1.12) | 现存，勿改 |
| 加载旋转 `spinner` | L1 | Tailwind 默认 1 s | `linear` | 360° 旋转 | 现存 `animate-spin`，**唯一允许 `linear` 的场合** |

### 5.1 UX 裁定一：⌘K 命令面板

> UX 原裁定："L3 语义层但取 L2 时长（.2s）、位移 translateY(-8px)"

**采纳，原值写入上表。** 补充实现理由：命令面板由键盘触发（⌘K / Ctrl+K），用户手指已在键盘上、注意力在屏幕顶部，200 ms 是"感知即时"的上限；同时它是全屏接管层，语义上确实是 L3（场景切换级）。`translateY(-8px)` 用负位移而非正位移，是因为面板从视口顶部下方进入，负位移才符合来源方向。

```tsx
<div
  role="dialog"
  aria-modal="true"
  className={clsx(
    'fixed inset-x-0 top-[12vh] z-50 mx-auto w-full max-w-xl',
    'motion-safe:animate-cmdk-in'   // 200ms / translateY(-8px) / --ease-enter
  )}
>
```
配套 `@keyframes`：
```css
@keyframes cmdk-in {
  from { opacity: 0; transform: translateY(-8px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```
（缩放 `.98` 是为与 `pop-in` 的 `.96` 区分：面板比 popover 大，缩放过大会显"晃"。）

### 5.2 UX 裁定二：骨架屏

> UX 原裁定："归 L1、循环 1.2s、reduce 下必须关闭且配 aria-busy"

**时长与 aria-busy 原样采纳；层级标签移到 L0。**

- 1200 ms 循环：采纳，写入 §2 L0 表。现存 CSS 是 `1.5s`，建议改 1200 ms（§9 有现成片段）。
- reduce 下关闭：由 §6 的全局规则保证（`animation-duration: .01ms` + `animation-iteration-count: 1`）。骨架屏因此会退化为**静态灰块**，这是正确的——微光不承载信息。
- `aria-busy="true"`：必须由组件自己加，CSS 管不到。规范片段：

```tsx
// 骨架屏容器：role=status + aria-busy + aria-label，三者缺一不可
<div role="status" aria-busy="true" aria-label="正在加载">
  {[0, 1, 2, 3].map(i => (
    <div key={i} className="skeleton h-4 rounded-ctl" style={{ width: `${90 - i * 12}%` }} />
  ))}
</div>
```

> `role="status"` 已隐含 `aria-live="polite"`，屏幕阅读器会在加载完成后播报；`aria-busy` 让 AT 知道这块区域内容未定，不要在中间态朗读。

---

## 6. prefers-reduced-motion 处置

### 6.1 现状与冲突分析

`index.css` 现有**两段** reduce 规则：

```css
/* 块 A · index.css:135-140 */
@media (prefers-reduced-motion: reduce) {
  .modal-panel,
  [class*='animate-'] {
    animation: none !important;
  }
}

/* 块 B · index.css:259-266 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

**新动画会被正确覆盖，不打架。** 块 B 的 `*, *::before, *::after` 是通配选择器，本规范新增的任何 `@keyframes` / `animate-*` 都会被压到 `.01ms` + 1 次迭代。块 A 与块 B 在 `.modal-panel` 上同时生效时终态一致（`animation-name: none` 来自块 A，`animation-duration: .01ms` 来自块 B，两者不冲突）。

**但有三个洞，必须补。**

#### 洞 1 · `animation-delay` 未重置 → 错峰列表会逐项延迟闪现

L2 列表错峰用 `animation-delay: 40/80/120ms` + `animation-fill-mode: both`。块 B 只压 `animation-duration`，不压 `animation-delay`：

- `animation-duration: .01ms` 让动画瞬间结束 ✓
- 但 `animation-delay: 80ms` 仍然有效，而 `fill-mode: both` 让元素在 delay 期间**保持 0% 关键帧**（`opacity: 0`）
- 结果：reduce 用户看到列表**一项一项延迟出现**，恰好是最容易触发前庭不适的那种动效

**这是本规范与现存规则之间的真实冲突点，必须补 `animation-delay: 0ms !important`。**

#### 洞 2 · `transition-delay` 未重置

同理，任何 `delay-*` 工具类配 `transition-*` 的组合在 reduce 下会延迟生效。当前代码库没有 `delay-*` 用量，但 Phase 3 之后会有（错峰、Toast 自动消失）。**预防性补 `transition-delay: 0ms !important`。**

#### 洞 3 · Recharts 是 JS 动画，CSS 够不到

`<Area animationDuration={700}>` 这类 props 由 Recharts 内部的 `requestAnimationFrame` 驱动，`@media (prefers-reduced-motion)` 对它**完全无效**。

已 grep 确认：当前代码库中 `isAnimationActive` / `animationDuration` / `animationBegin` **零命中**。也就是说 Recharts 现在全默认开启动画，且 reduce 下不降级——这是现存缺口，不是本规范引入的。修法见 §6.4。

### 6.2 合并后的完整规则（替换块 A 与块 B）

```css
/* ── 动效降级：全局唯一入口 ── */
/* 覆盖 CSS 动画 / 过渡 / 滚动；JS 驱动的动画（Recharts）见 §6.4，须另行处理 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    transition-delay: 0ms !important;
  }

  /* spinner 例外：上面的 * 通配符带 !important，特异性 (0,0,0) 但凭 important
     胜过 .animate-spin 的普通声明 (0,1,0)——会把 spinner 的 iteration-count 压成 1，
     转一圈就停， loading 指示器直接消失。这里用 (0,1,0) + !important 反压回来
     （同为 !important 时比特异性，通配符 0 段最低）。
     两个属性都必须显式恢复：只恢复 duration 会让它变成每秒无数圈的模糊；
     只恢复 iteration-count 会让单圈耗时 .01ms 同样糊成一团。
     duration 取 1s = Tailwind animate-spin 原生值，reduce 与非 reduce 下观感一致，
     不做额外降速——360° 匀速旋转不触发前庭不适（见 §6.3 例外说明）。 */
  .animate-spin {
    animation-duration: 1s !important;
    animation-iteration-count: infinite !important;
  }
}
```

**改动清单**：
1. 删除块 A（index.css:135–140）—— 它是块 B 的严格子集，保留无害但属冗余。**可选，不影响正确性。**
2. 块 B 增加两行：`animation-delay: 0ms !important;` 和 `transition-delay: 0ms !important;`。**必改。**
3. 新增 `.animate-spin` 例外段。**必改**，否则规则 2 的 `animation-iteration-count: 1` 会连带冻死所有加载指示器（存量 3 处 `animate-spin` + Phase 3-C 会新增的图表/骨架屏）。

**为什么不写成 `animation: none !important`**：那样会把 `animation-fill-mode: both` 的元素直接跳到 100% 关键帧，对入场动画是想要的终态，但对 `aurora-drift` 这类无 fill-mode 的循环动画也没问题——然而一旦将来有人给循环动画加了 `forwards`，`animation: none` 会让元素停在初始态。`.01ms` + `iteration-count: 1` 的写法更保守：它让动画"瞬间播完一次"，终态由 fill-mode 自然决定。

### 6.3 新动画的写法约定

每个新动画**同时**满足两条，缺一不可：

```tsx
// 约定 1：Tailwind 工具类加 motion-safe: 前缀（与 Layout.tsx:42 一致）
<div className="motion-safe:animate-list-in" style={{ animationDelay: `${i * 40}ms` }} />

// 约定 2：@keyframes 本身不写 fill-mode 之外的降级逻辑（交给 §6.2 兜底）
```

`motion-safe:` 生成 `@media (prefers-reduced-motion: no-preference) { ... }`，reduce 下整个类不生成，`animation-delay` 内联样式也随之无效（因为选择器不匹配）——这是洞 1 的**第一道防线**。§6.2 的 `animation-delay: 0ms` 是**第二道防线**，防的是有人忘了加前缀。

> 唯一例外：`animate-spin`（加载指示器）**不加** `motion-safe:`。spinner 是"系统在工作"的唯一信号，reduce 用户也需要它，且 360° 匀速旋转不触发前庭不适。
>
> ⚠ 这个例外**只在类名层面成立**。§6.2 的 `*` + `!important` 会凭 important 胜过 `.animate-spin` 的普通声明，把 `animation-iteration-count` 压成 1——所以 CSS 侧必须同时在 §6.2 里写 `.animate-spin { animation-duration: 1s !important; animation-iteration-count: infinite !important; }` 把两个属性显式恢复。**只在前端不加 `motion-safe:` 而不补 §6.2 的例外段，spinner 在 reduce 下转一圈就停。**

### 6.4 JS 侧：useReducedMotion + Recharts

```ts
// apps/web/src/hooks/useReducedMotion.ts
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** 读取并订阅 prefers-reduced-motion。SSR / 首帧安全：初始值取当前匹配状态。 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    // 订阅前同步一次，覆盖「hook 挂载时系统设置已变更」的情况
    setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
```

```tsx
// apps/web/src/components/charts/useChartMotion.ts
import { useReducedMotion } from '../../hooks/useReducedMotion'

/**
 * Recharts 动画参数。
 * 注意：Recharts 的 animationEasing 只接受
 * 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'，
 * **不接受 cubic-bezier 字符串**。这是 Recharts 的类型限制，不是疏漏。
 * 因此图表动画的缓动固定用 'ease-out'，与 --ease-enter 观感接近但不等价。
 */
export function useChartMotion(seriesIndex = 0) {
  const reduced = useReducedMotion()
  return {
    isAnimationActive: !reduced,
    animationDuration: 700,
    animationEasing: 'ease-out' as const,
    // 多序列错峰 60ms/条，最多 6 条（与 L2 错峰上限对齐）
    animationBegin: Math.min(seriesIndex, 5) * 60,
  }
}
```

用法（所有图表统一）：

```tsx
const motion = useChartMotion(index)

<Area
  key={dataKey}
  type="monotone"
  dataKey={dataKey}
  stroke={color}
  fill={color}
  fillOpacity={0.15}
  {...motion}          // isAnimationActive / animationDuration / animationEasing / animationBegin
/>
```

**数字滚动的 reduce 降级**（JS 驱动，同样够不到 CSS）：

```tsx
function RollingNumber({ value }: { value: number }) {
  const reduced = useReducedMotion()
  const display = useSpring(value, { duration: 700 })

  // reduce：直接用终值，不起 spring
  if (reduced) return <span className="tabular-nums">{value.toLocaleString('zh-CN')}</span>

  return <span className="tabular-nums">{Math.round(display).toLocaleString('zh-CN')}</span>
}
```

---

## 7. 完整 @keyframes

以下片段可直接追加到 `index.css`（放在 `@keyframes skeleton-shimmer` 附近，即第 256–257 行区域）。**带「现存」标注的不要重复定义。**

```css
/* ═══════════ L0 · 环境层 ═══════════ */

/* aurora-drift —— 现存（index.css:617），勿重复定义 */
/* @keyframes aurora-drift { from { transform: translate(0,0) scale(1) } to { transform: translate(-60px,50px) scale(1.12) } } */

/* skeleton-shimmer —— 现存（index.css:256），勿重复定义；仅建议把 .skeleton 的 1.5s 改 1.2s */

@keyframes pulse-live {
  0%   { transform: scale(1);   opacity: .5; }
  70%  { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* ═══════════ L1 · 微反馈层 ═══════════ */

/* fade-in —— 现存（index.css:257），勿重复定义 */

@keyframes tip-in {
  from { opacity: 0; transform: translateY(4px) scale(.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}

@keyframes pop-in {
  from { opacity: 0; transform: translateY(8px) scale(.96); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}

@keyframes press-tap {
  0%   { transform: scale(1); }
  40%  { transform: scale(.96); }
  100% { transform: scale(1); }
}

/* ═══════════ L2 · 组件层 ═══════════ */

/* overlay-in / modal-in —— 现存（index.css:108 / 126），勿重复定义 */

@keyframes list-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes sheet-in {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

@keyframes cmdk-in {
  from { opacity: 0; transform: translateY(-8px) scale(.98); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}

/* ═══════════ L3 · 页面层 ═══════════ */

/* page-in 升级版：替代 tailwind.config.js 里的纯 opacity 版本。
   若不接受这次升级，把下面整段删掉，保留 config 里的原版即可，其余规范不受影响。 */
@keyframes page-in {
  from { opacity: 0; transform: translateY(12px) scale(.99); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}

/* ═══════════ L4 · 数据层 ═══════════ */

@keyframes bar-grow {
  from { transform: scaleY(0); }
  to   { transform: scaleY(1); }
}

/* ring-draw 依赖 SVG 的 pathLength="1"：把路径长度归一化为 1，
   于是 stroke-dasharray: 1 / stroke-dashoffset: 1→0 即「从零画到满」。
   适用于手写 SVG（如 TimerPage 的环形计时器）；Recharts 图表请用 §6.4 的 JS props。 */
@keyframes ring-draw {
  from { stroke-dashoffset: 1; }
  to   { stroke-dashoffset: 0; }
}
```

`pulse-live` 的推荐用法（伪元素，不占布局、不影响内容点击）：

```css
.live-dot {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--success-500);
}
.live-dot::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: inherit;
  animation: pulse-live 2400ms var(--ease-loop) infinite;
}
```

---

## 8. tailwind.config.js animation 配置

**完整 `animation` / `keyframes` / 新增 `transitionTimingFunction` 片段**，直接替换现有 `keyframes` + `animation` 两块（第 31–39 行）。

```js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // 缓动令牌：与 index.css 的 --ease-* 一一对应，供 duration-*/ease-* 工具类使用
      transitionTimingFunction: {
        micro: 'cubic-bezier(.2,.8,.2,1)',      // = --ease-micro
        enter: 'cubic-bezier(.16,1,.3,1)',      // = --ease-enter
        exit:  'cubic-bezier(.4,0,1,1)',        // = --ease-exit
        loop:  'cubic-bezier(.4,0,.6,1)',       // = --ease-loop
      },

      keyframes: {
        /* ── L0 环境层 ── */
        'pulse-live': {
          '0%':   { transform: 'scale(1)',   opacity: '.5' },
          '70%':  { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        /* ── L1 微反馈层 ── */
        'tip-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(.98)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(.96)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'press-tap': {
          '0%':   { transform: 'scale(1)' },
          '40%':  { transform: 'scale(.96)' },
          '100%': { transform: 'scale(1)' },
        },
        /* ── L2 组件层 ── */
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
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        /* ── L3 页面层 ── */
        'page-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(.99)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        /* ── L4 数据层 ── */
        'bar-grow': {
          from: { transform: 'scaleY(0)' },
          to:   { transform: 'scaleY(1)' },
        },
        'ring-draw': {
          from: { strokeDashoffset: '1' },
          to:   { strokeDashoffset: '0' },
        },
      },

      animation: {
        /* L0 */
        'pulse-live': 'pulse-live 2400ms cubic-bezier(.4,0,.6,1) infinite',
        /* L1 */
        'tip-in':    'tip-in 140ms cubic-bezier(.2,.8,.2,1) both',
        'pop-in':    'pop-in 140ms cubic-bezier(.2,.8,.2,1) both',
        'press-tap': 'press-tap 90ms cubic-bezier(.2,.8,.2,1) both',
        /* L2 */
        'list-in':   'list-in 260ms cubic-bezier(.16,1,.3,1) both',
        'sheet-in':  'sheet-in 260ms cubic-bezier(.16,1,.3,1) both',
        'cmdk-in':   'cmdk-in 200ms cubic-bezier(.16,1,.3,1) both',
        /* L3 */
        'page-in':   'page-in 300ms cubic-bezier(.16,1,.3,1) both',
        /* L4 */
        'bar-grow':  'bar-grow 700ms cubic-bezier(.16,1,.3,1) both',
        'ring-draw': 'ring-draw 900ms cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
}
```

> **注意**：`page-in` 的时长从现存的 `.3s` 保持 300 ms 不变，但 `@keyframes` 内容和缓动换了。若选择不升级 `page-in`，把 config 里的 `'page-in'` keyframes 删掉、animation 行改回 `'page-in .3s cubic-bezier(.2,.8,.2,1) both'` 即可。
>
> `transitionTimingFunction` 的四个令牌是**新增**的，不影响现存任何 `transition-*` 类（它们继续用 Tailwind 默认的 `cubic-bezier(.4,0,.2,1)`，由 index.css:151 的全局规则覆盖为 `.18s var(--ui-ease)`）。加它们是为了让 `duration-[260ms] ease-enter` 这类组合在未来可写。

---

## 9. index.css 增量片段

### 9.1 缓动令牌（追加到 `:root`，第 18 行 `--ui-ease` 旁边）

```css
:root {
  --ui-ease: cubic-bezier(.2,.8,.2,1);   /* 现存，保留 —— 即 --ease-micro 的原名 */

  /* 动效缓动令牌（MOTION_SPEC §3） */
  --ease-micro: cubic-bezier(.2,.8,.2,1);
  --ease-enter: cubic-bezier(.16,1,.3,1);
  --ease-exit:  cubic-bezier(.4,0,1,1);
  --ease-loop:  cubic-bezier(.4,0,.6,1);
}
```

`--ui-ease` 与 `--ease-micro` 同值并存是有意的：前者已被 151–153、237、105、111 等 6 处引用，改名会牵连存量；后者是新代码的统一入口。**两变量必须同值**，若将来要调 L1 曲线，两处一起改。

### 9.2 动效降级规则（替换 index.css:259–266）

```css
/* ── 动效降级：全局唯一入口 ── */
/* 覆盖 CSS 动画 / 过渡 / 滚动；JS 驱动的动画（Recharts）见 MOTION_SPEC §6.4 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    transition-delay: 0ms !important;
  }

  /* spinner 例外：* 通配符带 !important 会凭 important 胜过 .animate-spin 的普通声明，
     把 iteration-count 压成 1，转一圈就停。这里用 (0,1,0) + !important 反压回来。
     duration 与 iteration-count 都必须显式恢复，理由见 §6.2。 */
  .animate-spin {
    animation-duration: 1s !important;
    animation-iteration-count: infinite !important;
  }
}
```

并**删除** index.css:135–140 的旧块（冗余，删不改行为）：

```css
/* 删除这段：
@media (prefers-reduced-motion: reduce) {
  .modal-panel,
  [class*='animate-'] {
    animation: none !important;
  }
}
*/
```

### 9.3 骨架屏时长对齐（可选，1 处）

```css
.skeleton {
  background: linear-gradient(100deg, rgb(226 232 240 / .7) 30%, rgb(241 245 249) 50%, rgb(226 232 240 / .7) 70%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1200ms var(--ease-loop) infinite;   /* 1.5s → 1.2s */
}
```

### 9.4 卡片展开的高度动画工具类（L2 · 320 ms）

用 `grid-template-rows: 0fr → 1fr` 技巧，**不要动画 `height: auto`**（不可插值）也**不要动画 `max-height`**（会导致 timing 失真、内容在动画中段被裁剪）。

```css
.collapsible {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 320ms var(--ease-enter);
}
.collapsible[data-open="true"] {
  grid-template-rows: 1fr;
}
.collapsible > * {
  overflow: hidden;
  min-height: 0;
}
```

> `grid-template-rows` 的 `fr` 值在现代浏览器（Chrome 107+ / Safari 16+ / Firefox 66+ 对 grid 的支持更早）可插值。Capacitor Android 的 WebView 版本需 ≥ Chrome 107，若目标设备更低，退化为 `display: none` 切换（无动画），不要退化成 `max-height`。

### 9.5 按压阴影的合成层优化（可选，针对低端 Android）

现存 `.btn-primary:hover` 同时动画 `box-shadow` 和 `transform`。`box-shadow` 的过渡会触发重绘（paint），在低端 Android 上与 `transform` 混用会掉帧。优化手法：把阴影搬到伪元素，只动画伪元素的 `opacity`。

```css
.btn-primary {
  position: relative;
  isolation: isolate;
}
.btn-primary::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  box-shadow: 0 5px 14px rgb(var(--d-500-rgb) / .18);
  opacity: 0;
  transition: opacity .2s var(--ease-micro);
}
.btn-primary:not(:disabled):hover::before { opacity: 1; }
.btn-primary:not(:disabled):hover { transform: translateY(-1px); }
```

并把 index.css:227 的 `box-shadow: 0 5px 14px rgb(15 118 110 / .18);` 从 `.btn-primary:hover` 规则里删掉。

---

## 10. 存量时长归类与迁移

Phase 3 之前代码库里已有一批"野生"时长。逐一定性，避免实现者困惑：

| 位置 | 现写法 | 归类 | 处置 |
|---|---|---|---|
| `index.css:151–153` | `transition: … .18s var(--ui-ease)` | L1 基准 | **保留不动** |
| `index.css:105` | `overlay-in .2s` | L2（带内低端） | **保留不动** |
| `index.css:111` | `modal-in .25s` | L2（带内高端） | **保留不动** |
| `index.css:237` | `transition: box-shadow .2s, border-color .2s` | L1/L2 边界 | **保留不动**；若采纳 §9.5 优化，改为 `opacity .2s` |
| `index.css:248` | `skeleton-shimmer 1.5s ease-in-out infinite` | L0 | 建议改 1200 ms + `var(--ease-loop)`（§9.3） |
| `index.css:636/642` | `aurora-drift 26s/32s ease-in-out infinite` | L0 | **保留不动**（`ease-in-out` 与 `--ease-loop` 等价，无必要改） |
| `tailwind.config.js:38` | `page-in .3s cubic-bezier(.2,.8,.2,1)` | L3 | 升级为 §8 版本（位移 + `--ease-enter`），或原样保留 |
| `CalendarPage.tsx:609` | `transition-all duration-200` | L2 | 建议改 `duration-200 ease-enter`；`transition-all` 建议收敛到具体属性 |
| `CalendarPage.tsx:944/1174/1556` | `transition-all duration-150` | L1/L2 边界 | 建议改 `duration-150`；`transition-all` 同上 |
| `App.tsx` / `AuthGate.tsx` | `animate-spin` | L1 | **保留不动，不加 `motion-safe:`**（见 §6.3 例外） |
| `CalendarPage.tsx:1414` / `TimerPage.tsx:1079/1320` | `animate-pulse` | L0/L1 混用 | 建议统一换成 `live-dot` + `pulse-live`（§7），语义更明确 |
| `Layout.tsx:42` | `motion-safe:animate-page-in` | L3 | 已正确，作为全项目的写法范本 |

**`transition-all` 收敛建议**（不强制，但强烈推荐）：`transition-all` 会让 `width/height/padding` 等属性也参与过渡，是掉帧主因。Phase 3 改造时顺手改成具体属性，例如：

```diff
- className="transition-all duration-200"
+ className="transition-[background-color,border-color,box-shadow,transform] duration-200 ease-enter"
```

---

## 11. 性能与 Capacitor 注意事项

### 11.1 合成层预算

- 只动画 `transform` 和 `opacity`，这两个属性可以在合成层完成，不触发 layout / paint。
- 动画元素**不要**滥用 `will-change`。只在 L0/L4 的长动画元素上加，且动画结束后移除（或用 `animationend` 清理）。全局 `* { will-change: transform }` 会让每个元素都开合成层，显存直接爆。
- 单页面循环动画元素 ≤ 12 个（§2 L0 规则）。骨架屏一次渲染 4–8 个 `skeleton` 是安全上限。

### 11.2 Capacitor Android 专项

- **禁用会触发重绘的动画属性**：`box-shadow`、`backdrop-filter`、`filter`、`border-radius`（部分旧 WebView 不支持圆角动画）。`.app-shell` 已有 `backdrop-filter`，但它不是动画属性，静态使用没问题。
- **底部导航（`.mobile-nav`）不做页面转场**。它是常驻容器，路由切换只换 `<main>` 内容。给底导航加转场会让每次切换都有两个运动中心，违反 §1 P2。
- **底部抽屉必须避让安全区**：
  ```css
  .sheet-in {
    padding-bottom: calc(1rem + env(safe-area-inset-bottom));
  }
  ```
- **触屏无 hover**：所有 `:hover` 样式在 Capacitor 上可能"粘住"（触摸后高亮不消失）。动效上无解，但**不要**给 `:hover` 加超过 L1 幅度的位移——`translateY(-1px)` 在触屏上粘住时只是轻微错位，`translateY(-8px)` 粘住会很奇怪。现存 `.btn-primary:hover` 的 `-1px` 是安全的。

### 11.3 数字滚动的布局稳定

```css
.tabular-nums { font-variant-numeric: tabular-nums; }
```
所有会跳动的数字（计时器、统计值、进度百分比）必须加。不加的话，数字从 `9` 滚到 `0` 时宽度变化会推挤相邻元素——在 TimerPage 这种每秒更新一次的页面上，每秒抖一次比没有动画更糟。

---

## 12. 禁止事项

1. **禁止写 `ease` / `ease-in-out` / `linear`**（`animate-spin` 除外）。这三个值写出来等于没指定曲线。
2. **禁止动画 `width` / `height` / `top` / `left` / `margin` / `padding`**。用 `transform` 代替；高度展开用 §9.4 的 `grid-template-rows` 技巧。
3. **禁止给循环动画加 `animation-fill-mode`**。会让 reduce 降级时停在错误的帧。
4. **禁止同一元素同时挂两个不同层的动画**。例如 modal 上又叠 `list-in`——违反 §1 P2，且两个 `animation-delay` 会互相覆盖（CSS 同名属性后者胜）。
5. **禁止超过 460 ms 的错峰总时长**（260 + 5×40）。
6. **禁止在 L4 数据动画上监听数据更新重新触发**。只跑一次，见 §2 L4。
7. **禁止 `transition-all`**（迁移项，见 §10）。
8. **禁止自造第五个缓动曲线**。四个 `--ease-*` 覆盖全部场景；例外只有 §3 末尾的 `ring-draw` 近线性覆盖。
9. **禁止用 `animation-delay` 实现"延迟加载"**。延迟加载用 `setTimeout` / `requestIdleCallback`，动效延迟只用于错峰。
10. **禁止忘记 `motion-safe:` 前缀**（`animate-spin` 除外）。这是 reduce 第一道防线。

---

## 附：与 TOKENS_PLAN.md 的一致性修正

`TOKENS_PLAN.md` §2.1 的 `animation` 配置块中，以下值需按本规范对齐（前端落地时以本文件为准）：

| TOKENS_PLAN 原值 | 本规范值 | 原因 |
|---|---|---|
| `'page-in': 'page-in 380ms cubic-bezier(0,.18,.24,1) both'` | `'page-in 300ms cubic-bezier(.16,1,.3,1) both'` | 300 ms 是现存值，零改动；缓动统一到 `--ease-enter` |
| `'pop-in': 'pop-in 260ms …'` | `'pop-in 140ms …'` | pop-in 是 L1 微反馈（徽标/角标），不是 L2 组件 |
| `'tip-in': 'tip-in 200ms …'` | `'tip-in 140ms …'` | 同上，归 L1 |
| `'list-in': 'list-in 260ms …'` | 不变 | L2 基准 |
| `'shimmer': 'shimmer 1200ms …'` | 沿用现存 `.skeleton` 类，不新增工具类 | 骨架屏用语义类，不用 `animate-*` |
| `'press-tap': 'press-tap 140ms …'` | `'press-tap 90ms …'` | 按压归 L1 的 90 ms 变体 |

其余（`bar-grow` 700 ms、`ring-draw` 900 ms、`pulse-live` 2400 ms）两份文档一致，无需改。
