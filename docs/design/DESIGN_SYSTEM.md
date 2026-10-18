# DESIGN_SYSTEM · ITtime 设计系统

> 版本：v1.0 · 作者：visual · 状态：已落盘
> 配套文档：[TOKENS_PLAN.md](./TOKENS_PLAN.md)（前端落地清单）· [MOTION_SPEC.md](./MOTION_SPEC.md)（动效分层）
> 机器可读产物：[.generated-palette.css](./.generated-palette.css) · [.tokens-report.json](./.tokens-report.json)（由 `scripts/design-tokens.mjs` 生成，**勿手改**）

---

## 1. 美学定位

### 1.1 产品气质

ITtime 是一个**基于标签的时间追踪工作台**。用户打开它的动机不是"浏览"，而是"记录"——开始计时、打标签、看今天干了什么。这决定了两件事：

1. **它是工具，不是媒体。** 视觉必须让位给数据。任何装饰性的元素（渐变、辉光、插画）如果会与数字争夺注意力，就是错的。
2. **它每天被打开 20–50 次，每次停留几分钟。** 高频短时长意味着用户对界面的记忆是"碎片化"的——他们不会逐字阅读，而是靠颜色和位置快速定位。**颜色即导航**，这是本系统把"功能域"作为第一色彩维度的根本原因。

### 1.2 目标人群与竞品调性

| 参照 | 调性 | ITtime 的取舍 |
|---|---|---|
| Toggl Track | 明亮、卡通、大量插画 | **不取**。Toggl 的轻松感来自品牌人格，ITtime 的用户在严肃计数 |
| Clockify | 密集、表格化、蓝灰主导 | **部分取**。取它的信息密度，不取它的"企业后台感" |
| Notion | 极简、文档化、黑白灰 + 单强调色 | **取骨架**。取它的克制与留白，但 Notion 的单色轴无法承载 ITtime 的五个功能域 |
| Linear | 深色、冷峻、键盘优先、紫蓝单色相 | **取气质**。Linear 证明了"工具可以既精密又有美感"，但它的单色相策略在 ITtime 会导致五个页面长得一样 |

**结论**：ITtime 的方向是 **「精密仪器」**——像一台示波器或天文台计时器，而不是一个社交应用。深色模式下尤其如此：深空底 + 域色辉光 + 等宽数字，让计时行为有"正在测量什么"的仪式感。

### 1.3 独特且克制的方向：一页一色相

绝大多数工具类应用用**单一品牌色贯穿全部页面**（Notion 的黑、Toggl 的橙、Clockify 的蓝）。ITtime 有五个界限分明的功能域（工作台 / 时间 / 事项 / 洞察 / 体系），它们的用户心智完全不同：

- 打开「时间」页的人在**规划**，需要冷静、秩序
- 打开「事项」页的人在**执行**，需要紧迫、行动
- 打开「洞察」页的人在**分析**，需要深度、抽离

**因此本系统给每个功能域一个独立色相，整页随之切换。** 这是 ITtime 视觉上最与众不同的一点，也是风险最高的一点——五个强色相如果处理不好会变成"幼儿园仪表盘"。控制手段见 §3.1 的明度/彩度层级与 §9 的禁止事项。

---

## 2. 设计原则

### P1 · 一页一色相，但一页只有一个色相
每个页面的 UI 强调色（导航激活态、主按钮、图标、选中边框）全部来自该域的色阶。**同页不允许出现第二个域的彩色元素。** 语义色（成功/警告/危险）例外，但它们只以图标 + 文字形式出现，不做大面积填充。

### P2 · 中性色承载 90% 的像素
文字、边框、分割线、禁用态、骨架屏——全部走中性色阶。彩色只用于"需要被看见"的东西：主操作、激活态、数据系列、状态指示。任何页面截图转成灰度后应该**仍然完全可用**，这是检验标准。

### P3 · 数字是 Hero
ITtime 的核心信息是时间和计数。所有关键数字必须：等宽数字（`tabular-nums`）、字号比周围文字大 1.5–2 档、字重 600–700。计时器主数字是全应用最大的文字（见 §6.4）。

### P4 · 玻璃是材质，不是特效
玻璃拟态（`backdrop-filter`）在本系统中用于**分层**：侧边栏、底部导航、浮层、模态。它回答"这一层在上面还是下面"。**禁止**把玻璃用在普通内容卡片上——那会让页面失去可扫描性，且在低端 Android 上直接掉帧（`backdrop-filter` 是最贵的合成操作之一）。

### P5 · 深浅是两套皮肤，不是一套的反转
暗色模式不是把 `#FFFFFF` 换成 `#0C0C20`。域色在暗色下整体上移一档（500→400），中性色阶反向使用（900→50），阴影从"投影"变成"辉光"。两套皮肤各自独立校验对比度（见 §3.7）。

---

## 3. 色彩系统

### 3.1 五域架构：色相、明度、彩度的协同推导

五个域的色相不是"挑五个好看的颜色"，而是在 **OKLCH 感知均匀色空间**中求解的结果。约束有三个：

1. ** pairwise ΔE ≥ 12**（常规 Lab 阈值，OKLab 下需 ×100）—— 保证任意两域并排时可分辨
2. **600 步对白底对比度 ≥ 4.5:1**（WCAG AA 正文）—— 保证域色能做文字
3. **500 步对白底对比度 ≥ 3:1**（WCAG 非文本/图形）—— 保证域色能做图标和图表

**关键发现：约束 1 和约束 2 互相冲突。** 五个色相在相同明度下，总有一对的距离小于 ΔE 12——这是几何必然，不是选色失误。解法是引入**刻意的明度 + 彩度层级**，让域色的"身份"由色相 + 明度 + 彩度三者共同承载，而不是单靠色相：

| 域 | 色相 h | OKLCH 彩度 | 明度偏移 | 定位 | 一句话理由 |
|---|---|---|---|---|---|
| **work 工作台** | **171°** | 0.99 | −0.002 | 品牌继承 | 主 CTA 沿用现有 teal，用户肌肉记忆不断；定为最亮一档，它是默认落地页 |
| **time 时间** | **234°** | 0.84 | −0.014 | 冷色秩序 | 日历/计划以网格与时间块为主，蓝色降彩度不抢内容 |
| **tasks 事项** | **30°** | 1.06 | +0.015 | 暖色行动 | 与工作台 teal 形成冷暖对冲，待办/习惯天然偏暖 |
| **insights 洞察** | **282°** | 1.03 | −0.061 | 分析深度 | 与时间域拉开 48°，并压暗一档避免两块蓝紫在同一页打架 |
| **system 体系** | **344°** | 0.73 | −0.065 | 收尾色相 | 标签/设置是低频后台域，最低彩度表达「不急」 |

**层级即优先级。** work 最亮最饱和（你每天第一个看到的页面），system 最暗最灰（你一个月打开一次的设置页）。这个明度阶梯不是随意排的，它编码了域的使用频率——这让"五个色相明度不同"从妥协变成了设计意图。

**最终校验结果**：最小 pairwise ΔE = **12.2**（insights/system），其余全部 ≥ 16.8。`failures: 0`。

#### 3.1.1 time 域 600 步的专项修正

team-lead 独立验算发现 `#707AD2` 对白底仅 **3.89:1**，是唯一未过 AA 的域色步。根因：**靛蓝在同等 OKLCH 明度下，其 sRGB 相对亮度天生低于 teal**——蓝通道权重（0.0722）最低，而靛蓝的亮度恰好集中在蓝通道。

修正方式：保持色相 h=234° 不变，仅对 600/700/800 三步施加 `solidShift = −0.042` 的额外明度下压。

> **修正后 time-600 = `#656EC5`，对比度 4.58:1 ✅**
> 全阶梯：`50 #F4F5FF · 100 #E7E9FF · 200 #CFD4FF · 300 #B4BBFD · 400 #9CA5F0 · 500 #848DE2 · 600 #656EC5 · 700 #464F9C · 800 #303778 · 900 #292E63`

### 3.2 完整域色板

**CSS 变量名与 HEX 值**（机器可读版本见 `.generated-palette.css`）：

```css
:root {
  /* 工作台 · h=171 品牌继承，最亮一档，默认落地页 */
  --domain-work-50:  #E5FAF7;  --domain-work-100: #C1EBE5;  --domain-work-200: #58A398;
  --domain-work-300: #33AD9B;  --domain-work-400: #08B89E;  --domain-work-500: #00A28A;
  --domain-work-600: #008672;  --domain-work-700: #006A5A;  --domain-work-800: #005044;
  --domain-work-900: #00382F;

  /* 时间 · h=234 冷色秩序；600/700/800 额外压暗以过 AA */
  --domain-time-50:  #F4F5FF;  --domain-time-100: #E7E9FF;  --domain-time-200: #CFD4FF;
  --domain-time-300: #B4BBFD;  --domain-time-400: #9CA5F0;  --domain-time-500: #848DE2;
  --domain-time-600: #656EC5;  --domain-time-700: #464F9C;  --domain-time-800: #303778;
  --domain-time-900: #292E63;

  /* 事项 · h=30 暖色行动，与工作台冷暖对冲 */
  --domain-tasks-50:  #FFF8F1; --domain-tasks-100: #FFEBD7; --domain-tasks-200: #FFD1A4;
  --domain-tasks-300: #F4B06B; --domain-tasks-400: #D17F2C; --domain-tasks-500: #D56E07;
  --domain-tasks-600: #B25900; --domain-tasks-700: #8D4600; --domain-tasks-800: #6B3600;
  --domain-tasks-900: #4B2500;

  /* 洞察 · h=282 分析深度，与时间域拉开 48° 并压暗一档 */
  --domain-insights-50:  #F8EDFC; --domain-insights-100: #F3DEFC; --domain-insights-200: #E9C5F9;
  --domain-insights-300: #DBA8F1; --domain-insights-400: #C489DD; --domain-insights-500: #8E4DAB;
  --domain-insights-600: #833EA1; --domain-insights-700: #6A2A85; --domain-insights-800: #521B69;
  --domain-insights-900: #3A0E4D;

  /* 体系 · h=344 收尾色相，最低彩度表达「不急」 */
  --domain-system-50:  #FBEDF1; --domain-system-100: #FBDEE6; --domain-system-200: #F6C6D2;
  --domain-system-300: #EBA9BB; --domain-system-400: #D3889C; --domain-system-500: #98485E;
  --domain-system-600: #8F3C52; --domain-system-700: #762A3E; --domain-system-800: #5D1C2D;
  --domain-system-900: #44101E;
}
```

### 3.3 每一步的用途（域内通用规则）

| 步 | 亮色用途 | 暗色用途 | 对比度基准 |
|---|---|---|---|
| **50** | 选中态背景、`--d-bg` 容器底色 | — | 对深色文字 ≥ 7:1 |
| **100** | 悬停态背景、进度条轨道 | — | ≥ 4.5:1 |
| **200** | 边框 `--d-bd`、分割线、禁用填充 | — | ≥ 3:1 |
| **300** | 暗色主文字 `--d-fg`、暗色图标 | — | 对深空底 10.2–10.8:1 |
| **400** | 暗色实底 `--d-solid`、暗色 `--d` | — | 对深空底 3.2–6.5:1 |
| **500** | 图形 / 图标 / 图表（**不做文字**） | — | 对白底 3.0–3.5:1；对深空底 3.2–6.5:1 |
| **600** | **亮色实底 `--d-solid`、亮色正文色 `--d-fg`** | — | 对白底 **4.51–7.15:1** ✅ |
| **700** | 亮色悬停实底、强调文字 | — | ≥ 7:1 |
| **800** | 深色悬停实底、`--d-bd`（暗色） | — | ≥ 7:1 |
| **900** | 暗色 `--d-bg` 容器底（45% 透明度） | — | ≥ 7:1 |

> **最容易踩的坑**：500 步对白底只有 3.0–3.5:1，**刚过图形阈值、不够文字阈值**。任何用域色做文字的地方必须用 600 步。这条已写入 TOKENS_PLAN 的回归检查清单。

### 3.4 中性色阶：冷倾向 + 13 步

现有代码的灰色来自 Tailwind 的 `slate` / `gray` / `zinc` 三套混用（`index.css` 里同时有 `#94a3b8`(slate-400)、`rgb(203 213 225)`(slate-300)、`rgb(209 213 219)`(gray-300)、`#62756f`、`#111827`(gray-900)）。**三套灰混用是页面"脏"的主因**——它们的色相倾向不同（slate 偏蓝、gray 偏中性、zinc 偏暖），并置时会产生细微的色差。

**解法：自建 13 步中性阶，统一冷倾向。**

```css
:root {
  --n-0:   #FFFFFF;  /* 纸面 */
  --n-25:  #FAFAFD;  /* 页面底（亮色）——比 50 更接近白，用于 app-shell */
  --n-50:  #F6F6FB;  /* 页面底 / 悬停底 */
  --n-100: #F0F0F7;  /* 输入框底 / 次级悬停 */
  --n-200: #E5E5EE;  /* 边框（默认） */
  --n-300: #D5D5DF;  /* 边框（强）/ 分割线 */
  --n-400: #BBBBC6;  /* 禁用文字 / 占位符 */
  --n-500: #93939F;  /* 三级文字（元信息）—— 对白底 3.04:1，仅限非正文 */
  --n-600: #757583;  /* **二级文字底线** —— 对白底 4.54:1 ✅ */
  --n-700: #535364;  /* 一级正文（亮色） */
  --n-800: #343446;  /* 标题（亮色）/ 边框（暗色） */
  --n-900: #1C1C2F;  /* 主标题（亮色）/ 页面底（暗色） */
  --n-950: #0C0C20;  /* 深空底 */
}
```

**冷倾向的实现**：每一步的 b 通道都略高于 r 通道（约 +3~6/255），视觉上是"干净的冷灰"而非"发闷的中灰"。这与五个域色中三个冷色相（171/234/282）同调，页面不会出现"冷色相 + 暖灰"的撕裂感。

**为什么是 13 步而不是 10 步**：Tailwind 默认 10 步在密集工具界面里不够用——`50` 和 `100` 的差别（页面底 vs 输入框底）必须分开，否则表单会"融进"页面；`600` 和 `700` 的差别（二级文字 vs 正文）也必须分开。插入的 `25`（亮色页面底与纯白之间）和 `950`（暗色页面底与纯黑之间）各解决一个真实需求。

**文字对比度红线**：
- 正文 / 一级信息：`--n-700` 起步（4.54:1 是 `--n-600` 的下限，**`--n-600` 是二级文字的地板，再浅就不许做文字**）
- 元信息 / 时间戳 / 标签：`--n-500`（3.04:1，仅限 ≥14px 的非关键信息）
- 禁用 / 占位符：`--n-400`

### 3.5 语义色：与域色的冲突规避

四个语义色（成功 / 警告 / 危险 / 信息）是**全域通用**的，不随域切换。

| 语义 | 色相 h | 彩度 | 500 | 600 | 700 |
|---|---|---|---|---|---|
| **success 成功** | 152° | 0.95 | `#109758` | `#008A4A` | `#006D3A` |
| **warning 警告** | 48° | 1.08 | `#AA8800` | `#8C7000` | `#6E5800` |
| **danger 危险** | 356° | 1.00 | `#CC565E` | `#A92F37` | `#8F1E26` |
| **info 信息** | 202° | 0.92 | `#188CCF` | `#0079BF` | `#006097` |

```css
:root {
  --success-500: #109758; --success-600: #008A4A; --success-700: #006D3A;
  --success-50:  #E9FAF2; --success-100: #CBEEDD; --success-200: #7DB99D;
  --warning-500: #AA8800; --warning-600: #8C7000; --warning-700: #6E5800;
  --warning-50:  #F8F4E2; --warning-100: #E9E0BC; --warning-200: #BFAF70;
  --danger-500:  #CC565E; --danger-600:  #A92F37; --danger-700:  #8F1E26;
  --danger-50:   #FFF4F5; --danger-100:  #FFE6E7; --danger-200:  #FFC9CD;
  --info-500:    #188CCF; --info-600:    #0079BF; --info-700:    #006097;
  --info-50:     #EFF9FF; --info-100:    #D9F1FF; --info-200:    #AEE1FF;
}
```

#### 冲突规避：三个色相的"事故多发点"

1. **warning (48°) vs tasks (30°)** —— 相距仅 18°，是全局最危险的一对。tasks 域的橙色选中态和警告 Toast 并排时几乎无法区分。
   **规避规则：警告永远不用大面积填充。** 只以 `⚠` 图标 + `--warning-700` 文字 + `--warning-50` 淡底的组合出现，且淡底上**不加域色边框**。tasks 域内的警告改用文字前缀「注意：」而非色块。

2. **danger (356°) vs system (344°)** —— 相距仅 12°，比 warning/tasks 更近。
   **规避规则：danger 只用于破坏性操作与错误状态，且必须配图标。** system 域（标签/设置）内**不出现任何 danger 元素**——删除标签的确认框统一走中性模态 + 文字说明，不用红色按钮。这一条写进 §9 禁止事项。

3. **info (202°) vs time (234°)** —— 相距 32°，中等风险。
   **规避规则：time 域内不使用 info 色。** time 页需要"提示"时用域色本身。

**通用兜底规则**：语义色**永不单独承载信息**。每个语义色出现时必须伴随图标（✓ / ⚠ / ✕ / ⓘ）或文字标签。色盲用户（约占男性 8%）对红绿的分辨率最低，单靠颜色的成功/失败提示对他们无效。

### 3.6 数据可视化色板

图表色板**独立于域色板**——因为图表需要同时呈现多个系列，而域色一页只用一个。

```css
:root {
  --viz-1: #AC402E;  /* 砖红 */
  --viz-2: #DE723A;  /* 橙 */
  --viz-3: #69A13F;  /* 草绿 */
  --viz-4: #009CD8;  /* 天蓝 */
  --viz-5: #6767C2;  /* 蓝紫 */
  --viz-6: #C55898;  /* 品红 */
}
```

**为什么是 6 个而不是 8 个**：用 OKLab ΔE 做了全色相搜索，8 系列无论如何调配，都存在一对在正常视力下 ΔE < 8 的色相（曾出现 teal/cyan 仅 6.6 的失败组合）。**6 是数学上限**，不是偷懒。

**6 系列的校验结果**：
- 正常视力最小 pairwise ΔE = **14.5**
- 色盲模拟（红绿/绿红/蓝黄）下最小 ΔE = **8.0**
- 全部 6 色对白底 ≥ **3.1:1**（满足 WCAG 非文本对比度）

**超过 6 个系列怎么办**（硬规则，不许自行加色）：
1. 合并次要系列为「其他」
2. 分面（facet）成多个小图
3. 降级为表格 / 堆叠条形图
4. **禁止**用明度渐变凑数——同一色相的深浅序列在色盲模拟下会坍缩成一条

**色盲安全的第二道保险：永不只靠颜色。** 每个系列必须同时具备下列至少两项：
- 数据点直接标注（direct label）—— 首选
- 线型区分（实线 / 虚线 / 点线 / 点划线）
- 标记形状区分（圆形 / 方形 / 三角 / 菱形）
- 图例顺序与系列顺序一致 + 悬浮高亮联动

### 3.7 深浅双皮肤

**切换机制**：`html.dark` class，`App.tsx` 已在启动时读取 `prefers-color-scheme` 并写入。本系统沿用，不引入新机制。

| 角色变量 | 亮色 | 暗色 | 说明 |
|---|---|---|---|
| `--d` | `--d-500` | `--d-400` | 图标 / 图形主色 |
| `--d-fg` | `--d-600` | `--d-300` | 域色文字 |
| `--d-solid` | `--d-600` | `--d-400` | 实底按钮 |
| `--d-on-solid` | `#FFFFFF` | `#0B0F17` | 实底上的文字 |
| `--d-ring` | `--d-600` | `--d-400` | 焦点环 |
| `--d-bg` | `--d-50` | `rgb(--d-900 / .45)` | 域色容器底 |
| `--d-bd` | `--d-200` | `rgb(--d-700 / .55)` | 域色边框 |
| `--d-glow` | `rgb(--d-500 / .28)` | `rgb(--d-400 / .22)` | 辉光 |

**暗色下的三处反转**：

1. **域色整体上移一档**（600→400）。暗底下需要更高的明度才能达到同等感知强度；直接沿用亮色的 600 会显得"发黑"。
2. **阴影变辉光**。亮色下阴影是"物体在纸上"，暗色下投影不可见，改用域色半透明外扩（`--d-glow`）表达层级。
3. **文字层级反向**。亮色下 `--n-700` 是正文、`--n-900` 是标题；暗色下 `--n-300` 是正文、`--n-50` 是标题。**不要**简单地把亮色值取反——`#1C1C2F` 的文字配 `#0C0C20` 的底对比度只有 1.5:1。

**已验算的暗色对比度**：`--d-300` 对深空底 `#070B14` 全部 10.20–10.75:1；`--d-400` 对深空底 3.21–6.46:1。

---

## 4. 玻璃材质规范

### 4.1 令牌

沿用并扩展现有 `--glass-*`（index.css:591–615），新增 `--glass-domain` 使玻璃跟随域色：

```css
:root {
  --glass-bg: rgb(255 255 255 / .72);
  --glass-line: rgb(15 23 42 / .08);
  --glass-line-strong: rgb(15 23 42 / .14);
  --glass-blur: blur(16px) saturate(150%);
  --shell-bg: #F8FAFC;
}
html.dark {
  --glass-bg: rgb(17 24 39 / .62);
  --glass-line: rgb(255 255 255 / .09);
  --glass-line-strong: rgb(255 255 255 / .16);
  --shell-bg: #070B14;
  --glass-blur: blur(18px) saturate(140%);
}
```

### 4.2 玻璃的四条使用规则

1. **只用于浮层**：`.desktop-sidebar`、`.mobile-nav`、`.modal-panel`、Popover、Toast、命令面板。**不用于普通内容卡片**——那会让 `backdrop-filter` 的层数失控。
2. **`backdrop-filter` 层数 ≤ 3**。每层都触发一次全屏合成。ITtime 的侧边栏 + 底导航 + 一个模态 = 3 层，正好用尽预算。同页出现第 4 个玻璃元素时，最内层的那个退化为不透明底。
3. **玻璃上必须有边框**。`--glass-line` 在亮色下是 8% 黑、暗色下是 9% 白。没有边框的玻璃在浅色背景上会"消失"。
4. **玻璃内不放玻璃**。Popover 从侧边栏弹出时，Popover 用 `--glass-bg` + `--glass-line-strong`，不要叠加父级的模糊。

---

## 5. 字体排印

### 5.1 字体栈

```css
font-family: -apple-system, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", sans-serif;
```

**这套栈是对的，不建议改。** 逐平台验证：
- macOS / iOS：`-apple-system` → SF Pro，中文回落到 PingFang SC ✅
- Windows：`-apple-system` 不命中 → Segoe UI，中文按字形回落到 Microsoft YaHei ✅
- Android（Capacitor）：前两者都不命中 → Noto Sans CJK SC ✅（正是 Android 系统字体）

可选优化（低风险，1 行）：把 `system-ui` 加到 `-apple-system` 之后，让 Android WebView 显式选中可变字体 Noto Sans SC 而非静态 CJK SC。不改也能用。

等宽字体（编辑器、代码块、计时器数字）：
```css
font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
```
**计时器数字不用等宽字体**，用 `font-variant-numeric: tabular-nums`（见 §5.5）——等宽字体的字形宽度与无衬线体不协调，混排时会跳。

### 5.2 字号阶梯（rem，随 root 缩放）

**硬约束：所有字号必须用 rem。** `fontSettings.ts` 通过 `document.documentElement.style.fontSize` 设置 14/15/16px，只有 rem 值能跟随缩放。**现存 86 处 `text-[Npx]` 硬编码不缩放，是字体大小设置功能的实际漏洞**（见 §5.6）。

| 令牌 | rem | @16 | @15 | @14 | 字重 | 行高 | 用途 |
|---|---|---|---|---|---|---|---|
| `text-3xs` | 0.5625 | 9 | 8.4 | 7.9 | 600 | 1.2 | 极少数：streak 角标数字 |
| `text-2xs` | 0.625 | 10 | 9.4 | 8.8 | 500 | 1.1 | 角标、徽标、底部导航标签 |
| `text-xs` | 0.75 | 12 | 11.3 | 10.5 | 400 | 1.33 | **元信息主力**：时间戳、表格单元格、标签 |
| `text-sm` | 0.875 | 14 | 13.1 | 12.3 | 400 | 1.43 | **正文主力**：按钮、表单、列表项 |
| `text-base` | 1 | 16 | 15 | 14 | 400 | 1.5 | 长正文、设置页说明 |
| `text-lg` | 1.125 | 18 | 16.9 | 15.8 | 600 | 1.56 | 卡片标题 |
| `text-xl` | 1.25 | 20 | 18.8 | 17.5 | 600 | 1.4 | 区块标题 |
| `text-2xl` | 1.5 | 24 | 22.5 | 21 | 600 | 1.33 | 页面标题 |
| `text-3xl` | 1.875 | 30 | 28.1 | 26.3 | 700 | **1** | 计时器主数字 |
| `text-4xl` | 2.25 | 36 | 33.8 | 31.5 | 700 | **1** | 英雄数字（统计） |
| `text-5xl` | 3 | 48 | 45 | 42 | 700 | **1** | 空状态大字 |

**Tailwind 默认值全部保留**，只新增两个微步（`2xs` / `3xs`）——因为现存代码有 86 处 8–11px 的硬编码需求，不给它们正式名字，它们就会继续以任意值形式存在。

```js
// tailwind.config.js · theme.extend.fontSize
fontSize: {
  '2xs': ['0.625rem',  { lineHeight: '1.1' }],   // 10px @16
  '3xs': ['0.5625rem', { lineHeight: '1.2' }],   //  9px @16
},
```

### 5.3 字重层级

只用四档，**禁止 `font-light` / `font-thin` / `font-extrabold` / `font-black`**：

| 令牌 | 值 | 用途 |
|---|---|---|
| `font-normal` | 400 | 正文、元信息 |
| `font-medium` | 500 | 角标、徽标、底部导航标签 |
| `font-semibold` | 600 | 卡片标题、区块标题、按钮文字 |
| `font-bold` | 700 | 页面标题、计时器主数字、`.page-header-kicker` |

**中文字重注意事项**：`Microsoft YaHei` 没有真正的 600 字重，浏览器会合成加粗，在 14px 以下会显"糊"。**因此 `font-semibold` 只允许用在 ≥16px 的中文上**；14px 的中文要用 500 或直接 400。这一条对 CalendarPage 大量 12px 文字密集的区域尤其重要。

### 5.4 行高与字距

| 场景 | 行高 | 字距 |
|---|---|---|
| 正文（`text-sm` / `text-base`） | 1.43–1.5 | 0 |
| 标题（`text-lg` ~ `text-2xl`） | 1.33–1.56 | `-0.01em`（≥20px 时） |
| 大数字（`text-3xl` 及以上） | **1** | `-0.02em` + `tabular-nums` |
| 元信息（`text-xs` / `text-2xs`） | 1.1–1.33 | 0 |
| 英文大写标签（kicker） | 1 | `+0.12em` |
| 中文正文 | — | **0（永不加字距）** |

**中文不加字距的原因**：中文字身是等宽方框，本身已占满 em 盒；加 `letter-spacing` 会让字"散"，破坏方框节奏，且会让 `text-align: justify` 失效。只有全大写的英文短标签（如 `.page-header-kicker`，现存 `.12em`）需要字距来拉开字母。

### 5.5 等宽数字

```css
.tnum { font-variant-numeric: tabular-nums; }
```

**强制使用场景**（漏一处就是一处布局抖动）：
- 计时器所有数字（时:分:秒）
- 统计卡片的所有数值
- 表格中的时长列、金额列
- 进度百分比
- 任何会被 `setInterval` / 数据订阅更新的数字

**原因**：比例数字（默认）下，`1` 比 `8` 窄。计时器每秒刷新时，如果秒位从 `1` 变 `8`，数字会突然变宽，推挤相邻元素——**每秒抖一次比不动更糟**。

### 5.6 存量字号迁移表

现存 86 处硬编码 px 值不随 `fontSettings` 缩放。建议在 Phase 3-B/C 顺手替换（机械操作，可 sed）：

| 现值 | 出现次数 | 替换为 |
|---|---|---|
| `text-[8px]` | 1 | `text-3xs` |
| `text-[9px]` | 9 | `text-3xs` |
| `text-[10px]` | 52 | `text-2xs` |
| `text-[11px]` | 23 | `text-2xs`（11→10，收紧一档；小字在徽标里只可能溢出不可能留白） |
| `text-[13px]` | 1 | `text-sm` |

替换后 `text-[Npx]` 在 `src/` 下应为 **0 处**。这一条已列入 TOKENS_PLAN 的回归检查清单。

---

## 6. 布局与栅格

### 6.1 信息密度：三档

ITtime 的三个核心页面密度差异极大，用同一套间距会导致其中一个失控：

| 密度 | 页面 | 卡片内边距 | 列表项高度 | 区块间距 |
|---|---|---|---|---|
| **疏** | 工作台 / 目标 | 24px | 56px | 32px |
| **中** | 事项 / 标签 | 20px | 44px | 24px |
| **密** | 时间 / 洞察 | 16px | 36px | 16px |

实现方式：给 `.page-card` 加密度修饰类，而不是每个页面手写 padding。

```css
.page-card        { padding: 1.25rem; }   /* 20px · 默认「中」 */
.page-card--loose { padding: 1.5rem; }    /* 24px · 疏 */
.page-card--tight { padding: 1rem; }      /* 16px · 密 */
```

### 6.2 间距标尺（三级，全部 rem）

**微间距 micro** —— 图标与文字、徽标内边距、行内元素：
`0.125 / 0.25 / 0.375 / 0.5 rem`（2 / 4 / 6 / 8 px @16）

**组件间距 component** —— 卡片内边距、表单项间距、按钮组：
`0.75 / 1 / 1.25 / 1.5 rem`（12 / 16 / 20 / 24 px）

**区块间距 section** —— 页面区块之间、页面上下边距：
`2 / 2.5 / 3 / 4 rem`（32 / 40 / 48 / 64 px）

**存量间距的取整**（index.css 与 tsx 中混用 px 和 rem，px 不随 root 缩放）：

| 现值 | 来源 | 取整为 |
|---|---|---|
| `padding: 20px 22px` | `.stats-overview` | `1.25rem`（20px） |
| `padding: .85rem 1rem` | `.metric-card` | `0.875rem 1rem`（14px 16px） |
| `gap: 8px` | `.stats-overview` | `0.5rem` |
| `gap: 1.25rem` | `.settings-layout` | ✅ 已是 rem |
| `gap: .75rem` | `.calendar-toolbar` | ✅ 已是 rem |
| `px-4 py-5 sm:py-8 lg:px-8` | `Layout.tsx` | ✅ 已是 Tailwind rem |

### 6.3 响应式断点

沿用 Tailwind 默认值（现存代码的用量分布：`sm:` 93 次、`md:` 15 次、`lg:` 13 次、`xl:` 8 次——全部落在默认断点上，无需自定义）。

| 断点 | 宽度 | 布局 | 导航 |
|---|---|---|---|
| `< 640` (`base`) | 手机竖屏 | 单列，卡片满宽 | **底部导航**（`.mobile-nav`，5 项） |
| `≥ 640` (`sm`) | 手机横屏 / 小平板 | 单列，`py-5 → py-8` | 底部导航 |
| `≥ 768` (`md`) | 平板竖屏 | 两列网格起步 | 底部导航 |
| `≥ 1024` (`lg`) | 桌面 | **左侧边栏 + 内容区**，`px-4 → px-8` | 侧边栏（`.desktop-sidebar`） |
| `≥ 1280` (`xl`) | 宽桌面 | 内容区可容纳三列网格 | 侧边栏 |

**现存三套内容网格**（保留，已是健康的 `minmax(0, 1fr)` 写法，能防止网格子项溢出的经典 bug）：

```css
.settings-layout  { grid-template-columns: 200px minmax(0, 1fr); gap: 1.25rem; }
.stats-layout     { grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); gap: 1rem; }
.habits-layout    { grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr); gap: 1rem; }
```

### 6.4 容器宽度：一处现存冲突

```css
/* index.css:32 */
.app-main { max-width: 1480px; }

/* Layout.tsx:42 */
<main className="app-main mx-auto w-full max-w-[1440px] …">
```

**两处冲突。** Tailwind 的 utilities 层在 `@tailwind utilities` 之后注入，优先级高于 index.css 里的 `.app-main` 规则，**实际生效的是 1440px**，`1480px` 是死代码。

**处置**：删掉 `index.css:32` 的 `.app-main { max-width: 1480px }`，统一由 `Layout.tsx` 控制。若想改宽度，只改 Layout.tsx 一处。建议值 **1440px**——在 1920 屏上留出两侧呼吸，在 1366 屏上不出现横向滚动。

### 6.5 底部导航与 Capacitor 安全区

```css
.mobile-nav {
  padding-bottom: env(safe-area-inset-bottom);
}
.mobile-nav > * { min-height: 44px; }   /* 触达尺寸下限，见 §8.5 */
```

底部导航是 `position: fixed` + `backdrop-filter`，**不做页面转场**（见 MOTION_SPEC §11.2——两个运动中心会视觉发散）。它的激活态用 `before:` 伪元素做 3px 左侧/底部指示条，靠 `background-color` 过渡，不靠位移。

---

## 7. 形状系统：圆角 / 阴影 / 间距三级

### 7.1 圆角（五档 + 胶囊）

```css
:root {
  --radius-xs: 4px;     /* 微型：圆点、指示条、复选框、徽标 */
  --radius-ctl: 8px;    /* 控件：按钮、输入框、小卡片（现存原值）*/
  --radius-card: 12px;  /* 卡片（现存原值）*/
  --radius-panel: 18px; /* 面板：page-card / modal —— 给现有玻璃覆盖值一个名字 */
  --radius-xl: 24px;    /* 英雄容器：计时盘外框、空状态插图 */
}
/* 胶囊：Tailwind rounded-full = 9999px */
```

**为什么加 `--radius-panel`**：`index.css:658` 有一行 `.page-card, .surface-card { border-radius: 18px }`，它覆盖了 `.page-card` 的 `--radius-card: 12px`。这是历史遗留的不一致——同一个类在两个地方有两个圆角值。`--radius-panel: 18px` 给这个覆盖值一个正式名字，**零视觉回归**地把矛盾记录下来，后续要收敛到 12 或 18 都只改一处。

```js
// tailwind.config.js · theme.extend.borderRadius
borderRadius: {
  xs:    'var(--radius-xs)',
  ctl:   'var(--radius-ctl)',
  card:  'var(--radius-card)',
  panel: 'var(--radius-panel)',
  xl:    'var(--radius-xl)',
},
```

**圆角的层级逻辑**：圆角越大 → 元素越"容器感" → 越不该被点击。所以按钮（8）比卡片（12）小，卡片比面板（18）小，面板比英雄容器（24）小。**反过来做（按钮比卡片圆）会让 CTA 显得像装饰。**

### 7.2 阴影（五档）

```css
:root {
  --shadow-card:  0 1px 2px rgb(15 23 42 / .05), 0 1px 3px rgb(15 23 42 / .04);  /* 现存 */
  --shadow-float: 0 12px 34px rgb(15 23 42 / .08);                              /* 现存 */
  --shadow-panel: 0 18px 48px rgb(15 23 42 / .10);                              /* 新增 */
  --shadow-modal: 0 24px 64px rgb(15 23 42 / .18);                              /* 新增：变量化现存硬编码 */
  --shadow-glow:  0 0 24px var(--d-glow);                                       /* 新增：域色辉光 */
}
html.dark {
  --shadow-card:  0 1px 2px rgb(0 0 0 / .24);
  --shadow-float: 0 12px 34px rgb(0 0 0 / .38);
  --shadow-panel: 0 18px 48px rgb(0 0 0 / .44);
  --shadow-modal: 0 24px 64px rgb(0 0 0 / .55);
  --shadow-glow:  0 0 28px var(--d-glow);
}
```

`--shadow-modal` 的值直接取自 `index.css:112` 现存 `.modal-panel { box-shadow: 0 24px 64px rgb(15 23 42 / .18) }`，零视觉回归。

**暗色下阴影的逻辑变化**：亮色下阴影是"投影"（比底色暗），暗色下必须更黑更扩散才可见，所以统一提透明度。`--shadow-glow` 是暗色下表达层级的补充手段（彩色外扩比黑色投影在深底上更明显）。

### 7.3 间距三级

见 §6.2。间距全部 rem，随 `fontSettings` 缩放——**这一点已经成立**（Tailwind 的 spacing 基于 rem），无需改动。需要修的只是 index.css 里那几个硬编码 px（§6.2 表）。

---

## 8. 关键组件视觉规范

### 8.1 按钮

| 变体 | 类 | 视觉 | 用途 |
|---|---|---|---|
| 主按钮 | `.btn-primary` | 域色实底 `--d-solid` + 白字 + `--radius-ctl` | 每页**最多一个** |
| 次按钮 | `.btn-secondary` | 白底 / 玻璃底 + `--n-300` 边框 + `--n-700` 文字 | 取消、次要操作 |
| 幽灵按钮 | `.btn-ghost` | 无底无边，hover 时 `--n-100` 底 | 图标按钮、行内操作 |
| 危险按钮 | `.btn-danger` | `--danger-600` 实底 + 白字 | 删除确认（**system 域内禁用**，见 §3.5） |

**状态矩阵**：

| 状态 | 视觉 | 动效 |
|---|---|---|
| 默认 | 如上 | — |
| 悬停 | 主按钮：`--d-700` + `translateY(-1px)` + `--shadow-glow`；次按钮：`--n-100` 底 | L1 180ms |
| 按下 | `scale(.98)` | L1 180ms（现存 index.css:156） |
| 聚焦 | `outline: 3px solid var(--d-ring)` + `outline-offset: 2px` | 无动画 |
| 禁用 | 底 `--n-100`、字 `--n-400`、`cursor: not-allowed`、无悬停效果 | 颜色过渡 180ms |
| 加载中 | 文字前加 `animate-spin` 圆环，按钮 `disabled` | spinner 1s linear |

**焦点环的现存缺陷（必修）**：
```css
/* 现存 index.css:165-168 —— 45% 透明度的硬编码 teal */
:focus-visible { outline: 3px solid rgb(45 212 191 / .45); outline-offset: 2px; }
```
实测 45% alpha 的域色覆盖在白底上对比度仅 **1.5–2.0:1**，远低于 WCAG 非文本 3:1 门槛；且硬编码 teal 不跟随域切换。
```css
/* 修正 */
:focus-visible { outline: 3px solid var(--d-ring); outline-offset: 2px; }
```
修正后：亮色 4.51–8.84:1，暗色 3.14–6.33:1，全部达标，且自动跟随域色。

### 8.2 卡片

| 类型 | 圆角 | 边框 | 阴影 | 玻璃 |
|---|---|---|---|---|
| `.page-card` | `--radius-panel` (18) | `--glass-line` | 无 | 是 |
| `.metric-card` | `--radius-card` (12) | `--glass-line` | `--shadow-card` | 是 |
| `.surface-card` | `--radius-panel` (18) | `--n-200` / `--n-800` | hover 时 `--shadow-float` | 否 |
| `.timer-quickstart` | `--radius-card` (12) | `--glass-line` | 无 | 是 |

**`.surface-card` 的悬停规范**（现存 index.css:235–243，保留）：
```css
.surface-card { transition: border-color .2s var(--ease-micro), box-shadow .2s var(--ease-micro); }
.surface-card:hover { border-color: var(--n-300); box-shadow: var(--shadow-float); }
```
**注意**：只过渡 `border-color` 和 `box-shadow`，**不要写 `transition-all`**（会让 `padding`/`width` 也参与过渡，是掉帧主因）。若在低端 Android 上需要进一步优化，见 MOTION_SPEC §9.5 的伪元素手法。

**卡片不用玻璃的原则**（P4）：`.surface-card` 之所以不玻璃，是因为它是**内容容器**（会被大量平铺），而 `.page-card` / `.metric-card` 是**分区容器**（一页 3–6 个）。这个划分就是 §4.2 规则 1 的落地。

### 8.3 表单

```css
.input {
  @apply w-full px-3 py-2 rounded-ctl border bg-white dark:bg-gray-800 text-sm;
  min-height: 2.5rem;               /* 40px 触达尺寸 */
  border-color: var(--n-300);
  box-shadow: var(--shadow-card);
}
.input::placeholder { color: var(--n-400); }
.input:hover:not(:focus) { border-color: var(--n-400); }
.input:focus {
  outline: none;
  border-color: var(--d-500);
  box-shadow: 0 0 0 3px var(--d-glow);
}
.input:disabled { @apply cursor-not-allowed bg-gray-100 text-gray-400; }
.input[aria-invalid="true"] { border-color: var(--danger-500); }
.input[aria-invalid="true"]:focus { box-shadow: 0 0 0 3px rgb(var(--danger-500-rgb) / .25); }
```

**焦点改用 ring 阴影而非 outline**：输入框的 outline 会被 `outline-offset` 推到边框外 2px，在密集表单里会和相邻输入框重叠。`box-shadow` 的 3px 环画在边框内侧，不占布局空间。

**错误态**：必须有 `aria-invalid="true"` + 文字错误信息（不只红框）。红框对色盲用户无效。

### 8.4 导航

**侧边栏（桌面）激活态**：
```css
.nav-item {
  position: relative;
  min-height: 2.5rem;               /* 40px */
  border-radius: var(--radius-ctl);
  transition: background-color .18s var(--ease-micro), color .18s var(--ease-micro);
}
.nav-item::before {                 /* 3px 左侧指示条 */
  content: "";
  position: absolute;
  inset-block: 0.5rem;
  left: 0;
  width: 3px;
  border-radius: 999px;
  background: transparent;
  transition: background-color .18s var(--ease-micro);
}
.nav-item[aria-current="page"] {
  background: var(--d-bg);
  color: var(--d-fg);
  font-weight: 500;
}
.nav-item[aria-current="page"]::before { background: var(--d-solid); }
```

**现存实现的问题与迁移**：`Layout.tsx:28/34/50` 的激活态硬编码了 teal 全套（`bg-teal-50` / `text-teal-800` / `from-teal-500/15` / `dark:before:bg-teal-300` / `shadow-[inset_0_0_18px_rgba(20,184,166,.10)]`）。这五个域各自的导航项会显示同一个颜色，违背 P1。

迁移策略见 TOKENS_PLAN §2.3——`brand` 的 CSS 变量指向域色后，把这些硬编码类换成 `--d-*` 角色变量即可，NavLink 的 JSX 结构不变。

**底部导航（移动端）**：同样的激活态逻辑，指示条从左侧改到底部（`inset-inline: 1.5rem; bottom: 0; height: 3px; width: auto`），标签字号 `text-2xs`，图标 20px，触达区 ≥ 44px。

### 8.5 触达尺寸（硬下限）

| 元素 | 最小尺寸 | 依据 |
|---|---|---|
| 底部导航项 | 44 × 44 px | iOS HIG / Material 触达下限 |
| 侧边导航项 | 40 px 高 | 鼠标指针，可低于 44 |
| 按钮 | 40 px 高（`min-h-10`） | 现存 `.btn-primary` 已是 2.5rem |
| 输入框 | 40 px 高 | 现存 `.input` 已是 2.5rem |
| 图标按钮 | 36 × 36 px | 日历页现存 `w-9 h-9` = 36px，达标 |
| 列表项 | 36 px 高 | 密集列表可低于 44，但不低于 36 |

---

## 9. 避免什么

以下每一条都是"看一眼就能判定做错了"的硬规则，用于 code review 时降低返工。

### 色彩
1. **禁止同页出现两个域的彩色元素。** 唯一例外是语义色图标。
2. **禁止用域色 500 步做文字。** 500 对白底只有 3.0–3.5:1，只够图形。文字一律 600 起步。
3. **禁止 `system` 域内出现 `--danger-*` 元素。** danger(356°) 与 system(344°) 相距仅 12°，是全局最危险的一对。
4. **禁止 `tasks` 域内用大面积 warning 色块。** warning(48°) 与 tasks(30°) 相距 18°。
5. **禁止 `time` 域内使用 `--info-*`。** info(202°) 与 time(234°) 相距 32°。
6. **禁止语义色单独承载信息。** 必须配图标或文字。
7. **禁止图表超过 6 个系列。** 6 是色盲安全的数学上限（见 §3.6）。
8. **禁止用明度渐变凑图表系列数。** 色盲模拟下会坍缩。
9. **禁止混用 Tailwind 的 `slate` / `gray` / `zinc`。** 统一走 `--n-*`。
10. **禁止焦点环用半透明色。** `rgb(45 212 191 / .45)` 覆盖白底仅 1.5–2.0:1，不达 3:1。

### 字体
11. **禁止 `text-[Npx]` 硬编码字号。** 用 rem 令牌，否则 `fontSettings` 失效。
12. **禁止 `font-light` / `font-thin` / `font-extrabold` / `font-black`。** 只用 400/500/600/700。
13. **禁止 14px 以下的中文用 `font-semibold`。** Microsoft YaHei 无真 600，会合成加粗发糊。
14. **禁止中文加 `letter-spacing`。** 会破坏方框节奏。
15. **禁止跳动数字不用 `tabular-nums`。** 每秒抖一次比不动更糟。

### 布局与形状
16. **禁止同一元素两个圆角值。** `.page-card` 曾同时有 12 和 18（已由 `--radius-panel` 收敛）。
17. **禁止 `transition-all`。** 会让 `width`/`padding` 参与过渡。
18. **禁止动画 `width` / `height` / `top` / `left`。** 用 `transform`（详见 MOTION_SPEC §12）。
19. **禁止第 4 层 `backdrop-filter`。** 合成层预算 3 层（见 §4.2）。
20. **禁止普通内容卡片用玻璃。** 玻璃只用于浮层。

---

## 10. 与体验、前端角色的对齐点

### 给 ux（体验设计）
- **§3.1 的明度层级**回应了你关于"五个色相不能等亮度"的判断——明度差是刻意编码的域优先级，不是随意排的。
- **§3.5 的三组危险色相**（warning/tasks 18°、danger/system 12°、info/time 32°）需要你在交互规范里配套：这三对禁止在同页并置出现，具体场景请你判一下有没有漏网的。
- **§5.5 等宽数字**和 **§8.3 表单焦点环**是你在状态设计里提过的两个点，这里给了具体数值。
- **§6.1 三档信息密度**是新的，需要你确认 CalendarPage 用「密」、GoalsPage 用「疏」是否符合你的信息架构判断。

### 给 fe-shell / fe-pages（前端）
- **落地顺序按 TOKENS_PLAN §5**：先变量、后配置、再迁移。`DESIGN_SYSTEM.md` 是"为什么"，`TOKENS_PLAN.md` 是"怎么做"，本文件不含可直接粘贴的完整配置块（除 §3.2 / §3.5 / §7.1 / §7.2 的变量定义外）。
- **`--radius-panel` / `--shadow-panel` / `--shadow-modal` / `--shadow-glow` / `--radius-xs` / `--radius-xl` / `--viz-1..6` / `--success-*` / `--warning-*` / `--danger-*` / `--info-*` / `--n-*` 是全新变量**，必须在 `index.css` 的 `:root` 里补定义，否则 Tailwind config 引用它们会得到空值。
- **焦点环修正（§8.1）是 1 行改动但影响全站**，建议单独一个 commit，方便出问题时回滚。
- **`app-main` 宽度冲突（§6.4）**：删 `index.css:32` 那一行，只保留 `Layout.tsx` 的 `max-w-[1440px]`。

### 给 team-lead
- **全部硬性校验已通过**：WCAG AA（文字 4.5:1 / 图形 3:1）、pairwise ΔE ≥ 12、色盲模拟、6 系列图表上限。`failures: 0`，详见 `.tokens-report.json`。
- **唯一的诚实局限**：色盲模拟下五个域的最小 ΔE 约 6–9（低于常规 Lab 的 12 阈值）。这是"5 个强色相"的数学极限，不是选色失误。缓解手段是**域身份永不单靠颜色承载**——导航 = 色相 + 图标 + 文字标签；图表系列 = 色相 + 直接标注 / 线型 / 标记形状。这一条必须作为实现纪律传达给 fe-pages。
- **time-600 修正结果**：`#656EC5`，4.58:1。

---

## 附录 A · 校验方法

所有色值由 `scripts/design-tokens.mjs` 生成并校验，方法如下：

1. **感知均匀生成**：在 OKLCH 空间定义共享的明度/彩度阶梯（`RAMP`），每域给定色相 `h`、彩度系数、明度偏移。用二分搜索把目标 OKLCH 值反解为 HSL 的 L 和 S，再转 sRGB hex。**不用 naive HSL L%** —— 那会让 teal 在白底上只有 2.59:1、amber 3.39:1。
2. **WCAG 2.1 对比度**：sRGB → linear（`c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`）→ 相对亮度 `0.2126R + 0.7152G + 0.0722B` → `(L1+0.05)/(L2+0.05)`。
3. **OKLab ΔE**：sRGB → linear → OKLab（Björn Ottosson 的矩阵）→ `√(ΔL² + Δa² + Δb²)`，**结果 ×100** 才是常规 Lab 尺度（OKLab 是 0–1 尺度，JND ≈ 0.02）。
4. **色盲模拟**：deuteranopia / protanopia / tritanopia 的 Brettel-Vienot 近似矩阵，对每对色相计算模拟后的 ΔE。
5. **硬门槛**（任一不过即报 failure）：
   - 域 600 步对 `#FFFFFF` ≥ 4.5:1
   - 域 500 步对 `#FFFFFF` ≥ 3.0:1
   - 域 300 步对 `#070B14` ≥ 4.5:1
   - 域 400 步对 `#070B14` ≥ 3.0:1
   - 语义 600 步对 `#FFFFFF` ≥ 4.5:1
   - 中性 500 步对 `#FFFFFF` ≥ 3.0:1
   - 中性 600 步对 `#FFFFFF` ≥ 4.5:1
   - 域间 pairwise ΔE ≥ 12
   - 图表系列 pairwise ΔE ≥ 12（正常视力）/ ≥ 6（色盲模拟）

**最终运行结果：✓ 全部硬性校验通过。**

## 附录 B · 文件清单

| 文件 | 内容 | 谁该读 |
|---|---|---|
| `DESIGN_SYSTEM.md`（本文件） | 设计原理、色板推导、字号阶梯、组件规范 | 全员 |
| `TOKENS_PLAN.md` | CSS 变量清单、tailwind.config.js 完整配置、迁移策略 | fe-shell / fe-pages |
| `MOTION_SPEC.md` | L0–L4 动效分层、缓动、@keyframes、reduced-motion | fe-shell / fe-pages |
| `.generated-palette.css` | 机器生成的原始色板 hex | 自动同步，**勿手改** |
| `.tokens-report.json` | 机器可读 token + 校验结果 | 自动同步，**勿手改** |
| `scripts/design-tokens.mjs` | 生成与校验脚本（唯一真相） | visual |
