# ITtime 状态设计规范（空 / 加载中 / 错误 / 成功）

> Phase 2 · 体验设计
> 配套：`IA_REVIEW.md` / `INTERACTION_SPEC.md` / `A11Y_RESPONSE.md`

---

## 1. 现状审计：四种状态的覆盖情况

**审计方法**：逐页读源码，判断每个数据区块在 `loading / empty / error / ready` 四态下的实际渲染。

### 1.1 总览表

| 页面 | 数据源 | 有 `loading` 态？ | 有 `empty` 态？ | 有 `error` 态？ | 有 `ready` 态？ | 致命问题 |
|---|---|---|---|---|---|---|
| **StatsPage** | `api.timer.list()` + `api.plans.list()` | ❌ **无** | ✅ | ⚠️裸文本 | ✅ | **加载态与空态同形**：首屏显示「0s / 此周期暂无记录」，数据到达后突然替换 |
| **TagsPage** | `useStore()` + `api.goals.list()` | ❌ 无 | ⚠️仅分类有 | ⚠️有 | ✅ | goals 无空态（`goals.length>0` 才渲染目标段，无"还没有目标"引导）；删除标签失败走 `alert()` |
| **TodosPage** | `api.todos.list()` + `api.goals.list()` | ❌ **无** | ⚠️分散在 5 个模块 | ⚠️顶部红条 | ✅ | **加载态=空态**：首屏 5 个模块全部显示「暂无」，数据到达后全部替换，用户看到"闪一下全是内容" |
| **GoalsPage** | `api.goals.list()` + `api.todos.list({status:'done'})` | ❌ **无** | ⚠️ 2 处纯文字 | ⚠️裸文本 | ✅ | 同上：`goals=[]` 初始 → 先显示「标签中还没有设置目标」再替换 |
| **CalendarPage** | 多源 + 外部日历订阅 | ✅ 有 | ✅ | ✅ | ✅ | **本项目状态最完整的页面**（可作为范式） |
| **TimerPage** | `api.timer.list()` 时间线 | ❌ 时间线无 | ✅ | ✅ `recentError` | ✅ | `loadRecent` 有 sequence 防竞态 ✓ 且**错误时保留已有数据** ✓ 值得推广 |
| **PlansPage** | 3 个 `Promise.allSettled` | ✅ 局部 | ✅ | ✅带重试 | ✅ | `Promise.allSettled` 部分失败仍 `setError`（会覆盖前一个错误） |
| **DiaryPanel** | `api.memos.list()` | ✅ 有 | ✅ 区分搜索空/无数据/期间空 | ✅ | ✅ | 空态文案分三种 ✓ 好实践；但**加载态是纯文字「加载日记...」而非骨架** |
| **SettingsPage** | 同步/账户/迁移 | ✅ `busy` | — | ✅ | ✅ | ✅ 较好 |
| **App 级** | `AuthGate` | ✅ | — | ✅ `offline` 降级 | — | ✅ `offline` 模式（跳过鉴权直接进应用）设计得好 |
| **ErrorBoundary** | React 错误 | — | — | ✅ 全屏兜底 | — | ✅ 有，但展示 `error.message` 原始文本，且只有一个"刷新页面"按钮 |

### 1.2 三个最严重的问题

#### 问题 A：`.skeleton` 类被定义了但**全项目零使用**

```css
/* index.css 245–256 —— 定义完整、含暗色变体 */
.skeleton {
  background: linear-gradient(100deg, rgb(226 232 240 / .7) 30%, ... );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}
.dark .skeleton { ... }
@keyframes skeleton-shimmer { to { background-position: -200% 0; } }
```

grep 结果：`skeleton` 只出现在 `index.css`（定义处），**没有任何 `.tsx` 使用它**。

这意味着：有人已经按需要准备好了骨架屏方案并写进了设计系统，但**从未接线**。这不是"缺一个功能"，而是"方案存在但未落地"——修复成本最低的一项。

#### 问题 B：StatsPage / TodosPage / GoalsPage 三页**完全没有 `loading` 状态**

三页都是这个模式：

```tsx
// StatsPage.tsx 11–12
const [entries, setEntries] = useState<TimeEntry[]>([])   // 初始就是空数组
const [plans, setPlans] = useState<PlanBlock[]>([])
// 全文 126 行无 loading 状态
```

**后果（用户视角）**：
1. 打开页面 → 立刻看到「已保存的项目时长 0s」「此周期暂无已保存的计时记录。」「当前周期还没有安排计划」→ **用户以为自己的数据丢了**。
2. 200–800ms 后数据到达，内容突然替换。
3. 这个"闪一下空态"的模式，在慢网络（Android WebView + PouchDB 本地库初始化可能更慢）下会停留更久，**首屏体验被定义为"你的数据是空的"**。

这是**数据可信度问题**，不只是体验问题——对一个时间追踪工具，"看起来像没数据"会让用户不信任本地存储。

#### 问题 C：错误态的形态极度不一致（5 种并存）

| 形态 | 位置 | 表现 |
|---|---|---|
| ① 裸红色文本 | StatsPage 49 `<p role="alert" className="text-red-500">` | 一行红字，无容器无按钮 |
| ② 右上红条 | TagsPage 92（只有文字，无关闭按钮） | 卡片内红条，文字版 |
| ③ 顶部红条 + 关闭 | TodosPage 239、DiaryPanel 116 | 带关闭按钮 ✓ 最好 |
| ④ 带重试按钮 | PlansPage 148 `role="alert"` + 「重试」 | ✅ 最好 |
| ⑤ 原生 `alert()` | TimerPage 11 处、TagsPage 236 | 阻塞模态 |

`alert()` 是最严重的一种：它**打断心流、无样式、无法自定义、在 WebView 里体验割裂**，而且**屏幕阅读器会朗读但不给出上下文**（用户听到"保存备注失败"，不知道是哪个备注）。

---

## 2. 统一规范

### 2.1 状态机（每个数据区块独立管理）

**每个页面组件必须维护一个显式状态，而不是靠数组是否为空推断**：

```tsx
type LoadState = 
  | { kind: 'loading' }                    // 首次加载，无缓存数据
  | { kind: 'refreshing'; data: T }        // 已有数据，后台刷新中
  | { kind: 'ready'; data: T }             // 成功且有数据
  | { kind: 'empty'; data: T }             // 成功但数据为空（可为空数组/null）
  | { kind: 'error'; error: string; data?: T }  // 失败（可带旧数据）
```

**关键规则**

| 规则 | 说明 |
|---|---|
| R1 | `loading` 与 `empty` **必须互斥**。绝不允许用 `data.length === 0` 同时代表两者 |
| R2 | 有旧数据时刷新 → `refreshing`，**不清空数据**（避免闪烁）。这正是 TimerPage `loadRecent` 已有的好实践（181 行注释明确写了"保留当前时间线，避免临时网络错误被误显示成'暂无记录'"） |
| R3 | `error` 时若已有数据，**显示数据 + 一个非阻塞的顶部提示条**，不替换内容 |
| R4 | 每个 `state` 在 UI 上必须**视觉可区分**：loading 有骨架/进度、empty 有图标+文案+CTA、error 有边框色+图标+重试 |
| R5 | `empty` 必须区分**语义空**（真没数据，引导创建）与**筛选空**（有数据但不匹配，给清除筛选） |

**接线示例（StatsPage）**

```tsx
// 改造前：无 loading，首屏闪空态
const [entries, setEntries] = useState<TimeEntry[]>([])

// 改造后
const [state, setState] = useState<LoadState>({ kind: 'loading' })
useEffect(() => {
  const seq = ++seqRef.current
  const load = async () => {
    // 有旧数据 → 不退回 loading，用 refreshing
    setState(prev => prev.kind === 'ready' || prev.kind === 'empty'
      ? { kind: 'refreshing', data: prev.data }
      : { kind: 'loading' })
    try {
      const [e, p] = await Promise.all([api.timer.list(), api.plans.list()])
      if (seq !== seqRef.current) return
      const next = { entries: e, plans: p }
      setState(hasContent(next) ? { kind: 'ready', data: next } : { kind: 'empty', data: next })
    } catch (err) {
      if (seq !== seqRef.current) return
      setState(prev => ('data' in prev ? { kind: 'error', error: msg(err), data: prev.data }
                                             : { kind: 'error', error: msg(err) }))
    }
  }
  void load()
  window.addEventListener('ittime-data-changed', load)
  return () => window.removeEventListener('ittime-data-changed', load)
}, [])
```

> `refreshing` 也必须区分于 `ready`：视觉上是一个**局部小 spinner**（如页面标题右侧的 12px 旋转圈）+ 内容保持可读。**不要**整页遮罩、不要骨架重绘。

### 2.2 四态的视觉规范

#### 骨架屏（loading）

**用 `.skeleton` 类**（已存在，直接用）。

| 规则 | 说明 |
|---|---|
| 尺寸匹配 | 骨架块的宽高必须**贴近真实内容的布局**。一个 3 行文本列表用 3 个骨架条，不是一个大方块 |
| 不溢出 | 骨架总高度 ≤ 真实内容高度，避免加载完成时布局跳动（CLS） |
| 数量 | 列表默认渲染 3–5 条骨架，不渲染 10 条（视觉噪音）或 1 条（看不出是列表） |
| `prefers-reduced-motion` | 已在 index.css 259–266 全局降为静态灰块 ✓ 无需额外处理 |
| a11y | 骨架容器 `aria-hidden="true"`；外层 `<section>` 加 `aria-busy="true"`；旁边一个 `<span className="sr-only" role="status">正在加载投入统计</span>` |
| **禁止** | 不用 `animate-spin` 大转圈做列表加载；不用纯文字「加载中...」做列表加载 |

**各页骨架结构**

```
StatsPage
┌──────────────────────────────────────┐
│ ▇▇▇▇▇▇▇▇▇▇▇  (stats-overview: 3 行: label/number/sub) │
├──────────────────────────────────────┤
│ ▇▇▇▇▇▇▇▇▇▇        近 14 天趋势         │  ← 标题实文字
│ ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ │  ← 168px 高的图表区
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ ▇▇▇▇▇▇▇▇▇▇  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇   │  ← 排行 5 行，每行 [色点][名称][条]
│ ▇▇▇▇▇▇▇▇▇▇  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇   │
└──────────────────────────────────────┘

TodosPage
┌──────────────────────────────────────┐
│ [实文字标题「未完成活动」+ 状态 tab]      │  ← 标题区不用骨架（立即可见）
├──────────────────────────────────────┤
│ ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  │  ← 一次性活动: 2 条
│ ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  │
├───────────────┬──────────────────────┤
│ ▇▇▇▇▇▇▇▇▇▇  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  │  ← 工作日 / 日（2列）
├───────────────┼──────────────────────┤
│ ▇▇▇▇▇▇▇▇▇▇  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  │  ← 周 / 月
└───────────────┴──────────────────────┘
```
> **关键**：TodosPage 的骨架**必须包含 4 个 ActivityModule 的位置**，否则加载完成时页面会从 400px 撑到 1200px，产生大幅布局跳动。

**GoalPage / TagsPage 目标段**
```
▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  (3 行: 名称/说明/进度条)
▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇
```

**TimerPage 时间线**
```
▇▇▇▇▇▇  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  (3 条：圆点 + [标题][标签][时长][按钮])
▇▇▇▇▇▇  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇
```
> 注意：快速开始区的标签**不用骨架**（来自 `useStore`，通常已在内存中）。

#### 空态（empty）

**四类空态，文案与 CTA 各不相同**

| 类型 | 判据 | 文案模板 | CTA | 图标 |
|---|---|---|---|---|
| **E1 首次使用** | 从未创建过任何数据 | `{对象}还是空的` + 一句价值说明 | 主按钮 `+ 新建第一个{对象}` | 单色大图标 40px |
| **E2 当前视图无数据** | 有数据但当前筛选/周期不匹配 | `本{周期}暂无{对象}` | `查看全部` 或 `清除筛选` | 同上但更小 |
| **E3 搜索无结果** | 搜索关键词无匹配 | `未找到匹配「{关键词}」的{对象}` | `清除搜索` + 展示搜索词 | 搜索图标 |
| **E4 依赖项缺失** | 前置条件未满足 | `{对象}依赖{前置}，请先{动作}` | `{去创建前置}` | 警示图标 |

**布局规范**
```
┌────────────────────────────────┐
│                                │
│            ( ◷ )               │  ← 图标 40px，opacity 40%，aria-hidden
│                                │
│      目前还没有计时记录          │  ← 14px，font-medium，text-gray-600
│                                │
│   开始记录第一段时间，之后可以   │  ← 12px，text-gray-400，max-w-[32ch]，居中
│   在洞察里看到投入分布           │
│                                │
│      [ + 补录一段时间 ]         │  ← btn-primary，44px 高
│                                │
└────────────────────────────────┘
   高度：列表区 160px / 卡片内 120px
   上边距：24px（不是 48px，紧跟标题）
```

**现有空态文案的问题与修正**

| 位置 | 现状 | 问题 | 修正 |
|---|---|---|---|
| `StatsPage` 74–77 | 「还没有计时记录」/「去「打卡」页开始第一条记录吧」 | ①"打卡"是旧导航名（现为「工作台」）；②无按钮，纯文字引导；③没有"补录"这个入口（`TimerPage` 有 `+ 补录` 按钮，用户不知道） | 见上方 E1 模板，CTA 为 `[ + 补录一段时间 ]`→`/`，或`[ 开始第一条记录 ]` |
| `StatsPage` 96 | 「此周期暂无已保存的计时记录。」 | 这是 **E2**（切到"今日"而记录在"本周"）但文案没说清是周期问题 | `今日暂无记录 · 本周共 12 小时` + `[ 查看本周 ]` |
| `StatsPage` 101–105 | 「当前周期还没有安排计划」+ `<a href="/plans">` | `<a href>` 整页刷新（见 IA_REVIEW §2 问题 7） | 改 `<Link to="/time?tab=plans">`，文案「这个周期还没有计划」+ CTA `[ 写一条计划 ]` |
| `TodosPage` 363 | 「暂无一次性活动」 | **E1**，但没说下一步做什么 | `还没有一次性活动` + `[ + 新建活动 ]` |
| `TodosPage` 446 | 「今天没有工作日活动」等 4 处 | **E2**，且 4 个模块各占 `min-h-[150px]`，空态时页面全是"没有" | 空模块**不渲染 min-height**，改为紧凑单行（`py-3 text-xs`），或整体折叠为「今天没有周期性活动」一行 |
| `GoalsPage` 81 | 「标签中还没有设置目标。」 | **E4**（依赖：先在标签页设目标） | `还没有习惯目标` + 一句说明「目标决定了待办页的周期分组」+ `[ 去标签页设置目标 ]`→`/tags` |
| `GoalsPage` 82 | 「暂无已完成活动。」 | **E1** | `完成的活动会出现在这里` |
| `TagsPage` 107–109 | 「还没有分类，创建一个（如：日常、工作、宝宝）」 | ✅ **这是全项目最好的空态**——有示例、有引导、无图标噪音。**作为模板** | 保持 |
| `TimerPage` 407–411 | `.timer-empty` 卡片 | 好（有说明"点下面任意标签即可开始"），但可加 CTA | 保持，可加 `[ + 补录 ]` |
| `TimerPage` 441–444 | 「还没有标签，去 标签管理 创建一些吧」 | `<a href>` 整页刷新 | 改 `<Link to="/tags">`，文案补「标签是计时与统计的基础」 |

#### 错误态（error）

**三档错误，按可恢复性分级**

| 档 | 类型 | 判据 | 表现 |
|---|---|---|---|
| **E-Block** | 阻断 | 整个页面无数据可用 | 卡片内居中：错误图标 + 主文案 + 原因 + `[ 重试 ]` |
| **E-Inline** | 局部 | 某个区块失败，其他正常 | 该区块内 `E-Block` 样式 + 其他区块照常渲染 |
| **E-Banner** | 轻量 | 操作失败但数据完好 | 顶部非阻塞提示条 + 操作上下文 |

**E-Block / E-Inline 规范**
```
┌────────────────────────────────────┐
│ 页面标题 (实文字，不遮挡)              │
├────────────────────────────────────┤
│         ( ⚠ )                      │  ← 32px，text-amber-500，aria-hidden
│                                    │
│    没能加载投入统计                │  ← 15px font-semibold
│                                    │
│  网络请求失败：请求超时             │  ← 13px text-gray-500，mono 字体显示
│                                    │    原始错误
│         [ 重新加载 ]                │  ← btn-primary
│                                    │
│   上次成功加载于 14:32              │  ← 有缓存数据时才显示，12px
│                                    │
└────────────────────────────────────┘
```
- 容器：`border-amber-200 bg-amber-50/60`（**不要用红色**——红色会和"危险/删除"混淆）。
- 图标：`⚠` 加 `aria-hidden`，文案承载语义。
- 错误原文：`font-mono text-xs`，`max-h-24 overflow-y-auto break-all`（参考 `App.tsx` ErrorBoundary 41–43 行已有的做法 ✓）。
- **必须有重试按钮**，且重试要有 loading 态（`disabled` + spinner）。
- **不要把技术错误直接怼给用户**：`NetworkError: Failed to fetch` → `网络请求失败，请检查连接后重试`。原始错误放在次要行或折叠区。

**E-Banner 规范**（替代所有 `alert()`）
```
┌──────────────────────────────────────────┐
│ ⚠ 保存备注失败：连接中断    [重试]  [关闭] │  ← 顶部/操作处，amber-500 左边条 3px
└──────────────────────────────────────────┘
```
- `role="alert"`（assertive）。
- **必须含操作上下文**：`保存备注失败` 而不是 `请求失败`（用户知道是哪个动作）。
- 含`重试`（复用同一 action）+ `关闭`。
- 自动消失：成功类 4s，错误类**不自动消失**（直到用户关闭或下次成功）。

**Toast 规范**（成功反馈）
```
桌面右下角 / 移动端底栏上方
┌────────────────────────────────┐
│ ✓ 已完成：评审 UI 一致性  [撤销] │
└────────────────────────────────┘
```
- `role="status" aria-live="polite"`（详见 `A11Y_RESPONSE.md` §2.2）。
- 单条最多 2 行；超长截断。
- 同类toast 堆叠上限 3 条，超出丢弃最旧。
- 成功类 4s 自动消失；带`撤销` 的 8s。
- 位置避开移动端底栏（`bottom: calc(4.35rem + safe-area + 12px)`）。

**现有错误态的具体问题**

| 位置 | 问题 | 修正 |
|---|---|---|
| `TimerPage` 11 处 `alert()` | 阻塞、无样式、无上下文、无重试 | E-Banner 或 E-Inline |
| `TagsPage` 236 `alert()` | 同上 | E-Banner |
| `TagsPage` 92 错误条 | 无 `role="alert"`、无关闭按钮 | 加 `role="alert"` + 关闭按钮（对齐 TodosPage 239 的做法） |
| `StatsPage` 49 | 裸 `<p role="alert" className="text-red-500">`，红色 | E-Block 卡片 + 琥珀色 + 重试 |
| `GoalsPage` 52 | 裸红字 | 同 StatsPage |
| `PlansPage` 65–69 | `Promise.allSettled` 中两次失败会**互相覆盖** `setError`（后一次覆盖前一次，用户只看到一个原因） | 收集所有失败原因，合并显示；或用 E-Inline 分别标注对应列 |
| `App.tsx` ErrorBoundary | 显示 `error.message` 原始文本，只有一个"刷新页面"按钮 | ① 原始错误折叠到 `<details>`；② 加「返回工作台」按钮（不刷新页面） |
| `DiaryPanel` 35 | 注释写"网络抖动时保留当前列表" ✓ 好实践 | 推广到所有页面（R2） |
| 全局 | 无 `Toast` 组件 | 新建（见 `INTERACTION_SPEC.md` §9 R7 轻量方案：挂在 `store.ts`） |

### 2.3 成功态（ready）的规范

| 规则 | 说明 |
|---|---|
| 数据到达的过渡 | **不做**整页淡入。若有旧内容（`refreshing` → `ready`），内容原地保持，仅移除刷新指示器 |
| 首次渲染 | 骨架 → 内容，用 `opacity 0→1` 180ms（或直接替换，避免闪烁） |
| 局部更新 | 列表项增删走 `INTERACTION_SPEC.md` §2.1 的动画规范 |
| 写操作成功 | 一律 toast（`role="status"` 播报），不改变页面布局 |
| 写操作进行中 | 触发按钮 `disabled` + 文案变化（`保存中…` — 现状 ✓）+ spinner。**禁止**整页遮罩 |
| 乐观更新 | 见 `INTERACTION_SPEC.md` §2.1（待办勾选）。失败时回滚 + E-Banner |
| 多请求并发 | 各区块独立管理状态，**不要**共用一个 `loading`（`Promise.all` 会让任一慢请求拖垮全页）。日历/计划页已用 `allSettled` ✓ 方向正确 |

---

## 3. 逐页规范

### 3.1 StatsPage（**改造优先级最高**）

```
状态         趋势图区                排行区                  计划遵循区
─────────────────────────────────────────────────────────────────────────────
loading      168px 高骨架图          5 行骨架 [色点][名][条]   4 个数字骨架 + 4 行骨架
empty        E1 图标+文案            E2「今日暂无 · 本周共…」   E4「这个周期还没有计划」
             +[补录一段时间]         +[查看本周]               +[写一条计划](Link)
ready        图表                    排行条（改用标签色）        数字 + 覆盖率为主指标
error        E-Inline                E-Inline                 E-Inline
refreshing   右上角 12px spinner      同左                      同左
```

- **周期切换**（今日/本周/本月）不重置为 `loading`，用 `refreshing`（数据已在内存，切周期是纯计算）。当前 `periodBounds` + `elapsed` 是纯函数，切周期**根本不需要重新请求** → 规范：`range` 变化**不触发 load**，只重算。`useEffect` 依赖数组保持 `[]`。这同时消除了"切周期闪一下"的问题。
- 趋势图固定 14 天，**与 `range` 无关**（当前代码注释已说明 ✓）——保持，但要在 UI 上明确（标题写"近 14 天"✓）。
- 「已保存的项目时长」大数字：加载中显示 `—`（em dash）而不是 `0s`，避免误读。

### 3.2 TodosPage

- **加载态**：5 个模块全部骨架（结构见 §2.2）。
- **空态分级**：
  - 5 个模块全空 → 页面级 E1：`还没有活动` + `[ + 新建活动 ]` + 一句「活动可以是一次性的，也可以按工作日/每日/每周/每月循环」。
  - 部分模块空 → **空模块不渲染**（当前 4 个 `min-h-[150px]` 的空模块改为不渲染或压成单行）。
  - 筛选/搜索无结果 → E2/E3 + `清除筛选`。
- **搜索无结果时**：`activityView` 与 `statusView` 仍显示但整体变灰，避免用户以为切换失效。
- 加载时**不显示**顶部 `tracking` 进度条（数据未到）。

### 3.3 GoalsPage

- **加载态**：2 段各 3 行骨架。
- **空态**：
  - `goals.length === 0` → E4（依赖标签目标）+ `[ 去标签页设置目标 ]`→`/tags`
  - `completed.length === 0` → E1（完成后会出现在这里）
- **无 loading 的具体危害**：当前首屏会先显示「标签中还没有设置目标。」，如果用户真的还没设目标，看到的就是**正确的空态**；但如果用户已设目标，会先看到一句**错误的空态**再被替换。所以不是"无害的空态"，是"误导性空态"。

### 3.4 TagsPage

- **加载态**：分类列表 3 行 + 标签列表 6 行骨架（来自 `useStore`，通常很快；只有 `goals` 走 API，需要骨架）。
- **目标段**：`goals.length === 0` 时当前**整段不渲染**（252 行 `{goals.length > 0 && ...}`）→ 用户完全看不到"目标"这个概念。规范：始终渲染该段，`goals.length === 0` 时显示 E4 空态 + `[ + 给标签设目标 ]`（打开第一个标签的 GoalForm）。
- **错误**：删除标签失败走 `alert()`（236 行）→ E-Banner。

### 3.5 TimerPage

- **时间线**：`loadRecent` 已有 sequence 防竞态 ✓ 且错误时保留数据 ✓。补 `refreshing` 视觉（标题右侧 spinner）。
- **快速开始**：来自 `useStore`，App 启动时 `loadAll()` 已执行。规范：加载中显示 `skeleton` 色块行（3 个分类 × 4 个标签），数据到达后替换。**当前** `tags.length === 0` → 显示「还没有标签，去 标签管理 创建一些吧」——**加载中会闪现这句误导**（`loadAll` 未完成时 `tags` 确实是空数组）。这是与 StatsPage 同类的问题。
- **正在计时区**：`running.length === 0` 时 `.timer-empty` 卡片。但 App 启动瞬间 `running` 也是 `[]`，会闪现空态。规范：`store.loading === true` 时显示骨架卡片（时钟位置骨架 + 按钮骨架），而不是 `.timer-empty`。
  > 注：`store.ts` 已有 `loading: boolean` 字段但**当前没有任何组件消费它**（grep 确认）。这个字段就是为此准备的。

### 3.6 CalendarPage（**本项目最佳实践，作为范式**）

现状已实现：
- ✅ `calendarLoading && !hasCalendarContent` → 加载态
- ✅ `!hasCalendarContent` → E2 空态「该时段暂无时间记录」+ 📅 图标
- ✅ `calendarError` → 错误条
- ✅ `externalEventsCachedAt` → `role="status"` 提示「当前显示本机缓存」——**这是很好的降级提示**

**要补的**：
- 加载态是纯文字 `加载日历中...`（654 行）→ 换骨架（月视图 5×7 网格骨架 / 周视图时间轴骨架）。
- 空态 `该时段暂无时间记录` → E2，补「切换到其他时间」或「补录一段」CTA。
- `calendarError` 条无 `role="alert"`、无关闭、无重试。
- **移动端默认不渲染月视图**（见 `A11Y_RESPONSE.md` §4.1）。

### 3.7 PlansPage

- ✅ `loading` 有（165/173 行，两列各自显示「正在加载…」）
- ✅ 空态有（166/172 行，「双击空白处写计划」/「当天暂无打卡记录」）
- ✅ 错误带「重试」（148 行）—— **最佳实践**
- ⚠️ 但 166 行文案说「双击空白处写计划」，而 `addFromTimeline` 是 `onClick`（106 行）—— **文案与实现不符**（单击，不是双击）。修正为「点击空白处写计划」。
- ⚠️ `Promise.allSettled` 的错误覆盖问题（见 §2.2）。

### 3.8 DiaryPanel

- ✅ `loading` 有（纯文字「加载日记...」→ 换骨架，3 张卡片骨架）
- ✅ 空态**区分三种**（126–130 行：搜索无结果 / 全部无数据 / 期间无数据）—— **全项目最佳空态实现**
- ✅ 错误带关闭按钮
- ⚠️ 加载时用纯文字，建议骨架

### 3.9 SettingsPage

- ✅ `busy` 覆盖测试连接/保存/迁移
- ✅ `role="status"`（91 行同步消息）/ `role="alert"`（152 行账户错误）
- ⚠️ **CouchDB 密码是明文 `type="password"`**，但保存到 `localStorage`（28 行）。这不是状态问题，但 UX 上应告知：「密码保存在此浏览器」（92 行已有说明 ✓）。保留。
- ⚠️ `migrationMessage` 用 `role="status"` ✓ 但 `role="status"` 是条件渲染的（59 行 `{migrationMessage && ...}`）→ live region 不可靠（见 `A11Y_RESPONSE.md` §2.2）。

### 3.10 AuthGate

- ✅ 5 态：`checking / login / setup / offline / app`
- ✅ `checking` 有 spinner + `role="status"` + 文字「正在检查登录状态…」
- ✅ **`offline` 降级**：服务端不可达时直接进应用（`if (mode === 'offline') return <Layout>{children}</Layout>`）—— 这是很好的容错设计。
- ⚠️ `offline` 模式下**用户看不到任何提示**说"当前处于离线模式，数据可能不完整"。规范：进应用后顶部显示一条可关闭的 amber banner：「当前无法连接服务器，正在使用本机数据」。
- ⚠️ 无「重试」：`offline` 是终态，用户只能刷新。规范：`offline` 状态下显示一个 `[ 重试连接 ]` 按钮。

### 3.11 ErrorBoundary（App.tsx 20–59）

现状：全屏卡片 + ⚠️ + `error.message` 原始文本 + `🔄 刷新页面重试`。

**规范**
```
⚠️ 页面出了点问题

[可折叠的原始错误]
  <details><summary>技术细节</summary><pre>...</pre></details>

[ 返回工作台 ]   [ 重新加载 ]
```
- 标题不用"异常"这种技术词。
- 原始错误折叠（`ErrorBoundary` 页面里几乎没人需要看堆栈）。
- 加「返回工作台」（`window.history` 不可靠时用 `<a href="/">`，会重挂 React 但不会重新鉴权）。

---

## 4. 全局实现约定

### 4.1 需要新增的 3 个基建件

| 件 | 位置建议 | 内容 |
|---|---|---|
| `useLoadState<T>()` hook | `apps/web/src/hooks/useLoadState.ts` | 封装 §2.1 的状态机 + sequence 防竞态 + `refreshing` + 错误保留旧数据。返回 `{ state, reload, setData }` |
| `<AsyncSection state={...} skeleton={<…/>} empty={<E1 …/>} error={…}>{data => …}</AsyncSection>` | `apps/web/src/components/AsyncSection.tsx` | 四态渲染分发。避免每个页面手写 4 个分支 |
| `<Toast />` + `store.toast` | `store.ts` + `components/Toast.tsx` | 见 `INTERACTION_SPEC.md` §9 R7 |

**注意 `hooks/` 目录已存在**（`apps/web/src/hooks/`）——实际读的是我看到 `ls` 有该目录，但未读其内容，可能已有类似工具。**Phase 3 需先确认**。

### 4.2 文案规范

| 原则 | 反例 | 正例 |
|---|---|---|
| 说人话 | `请求失败 (TypeError: Failed to fetch)` | `网络请求失败，请检查连接后重试` |
| 空态给下一步 | `暂无数据` | `还没有计时记录 · 点下方标签开始记录` |
| 错误给动作 | `操作失败` | `保存备注失败 · 重试` |
| 区分"没有"与"没找到" | 两者都写 `暂无数据` | `还没有活动` vs `没有符合筛选的活动` |
| 不写"打卡页"等易变导航名 | `去「打卡」页开始` | `去「工作台」开始记录`（或直接给按钮，不提页面名） |
| 加载不承诺时间 | `加载中...` | 骨架屏（无文字）或 `正在加载`（不用省略号假装在动） |

### 4.3 状态与动效的对应

| 状态切换 | 动效 | 时长 | reduce 下 |
|---|---|---|---|
| 骨架 → 内容（首次） | opacity 0→1 | 180ms | 保留（无位移） |
| 内容 → 内容（`refreshing`） | **无动画**，仅局部 spinner 出现 | spinner 淡入 120ms | 保留 |
| 内容 → 骨架（主动刷新按钮） | 内容 opacity→.5 | 120ms | 关闭 |
| 错误 banner 出现 | 从上滑入 + 淡入 | 200ms | 改为淡入 |
| toast 出现 | 淡入 + 4px 上移 | 180ms | 仅淡入 |
| 列表项增删 | 见 `INTERACTION_SPEC.md` §2.1 | 240ms | 直接移除 |

---

## 5. 改造清单（按页面工作量）

| 页面 | 优先级 | 必做项 |
|---|---|---|
| **StatsPage** | **P0** | 引入 `loading` 状态；骨架；裸红字 → E-Block；「打卡」文案修正；两处 `<a href>` → `<Link>`；`range` 切换不触发 load |
| **TodosPage** | **P0** | 引入 `loading`；5 模块骨架；空模块不占 min-height；空态加 CTA |
| **GoalsPage** | **P0** | 引入 `loading`；裸红字 → E-Block；空态改 E4 + CTA |
| **TimerPage** | **P1** | `tags.length===0` 与 `running.length===0` 区分 loading 与 empty（消费 `store.loading`）；11 处 `alert()` → E-Banner；`<a href="/tags">` → `<Link>` |
| **TagsPage** | **P1** | 目标段空态（当前整段消失）；`alert()` → E-Banner；错误条加 `role="alert"` + 关闭；goals 骨架 |
| **CalendarPage** | **P2** | 纯文字加载 → 骨架；错误条加 role/关闭/重试；空态加 CTA |
| **PlansPage** | **P2** | `allSettled` 错误合并；「双击」文案修正（实为单击） |
| **DiaryPanel** | **P2** | 纯文字加载 → 骨架 |
| **AuthGate** | **P2** | `offline` 态加提示 banner + 重试按钮 |
| **ErrorBoundary** | **P2** | 原始错误折叠；加「返回工作台」 |

**统一基建（先做，其余依赖它）**：`useLoadState` + `AsyncSection` + `Toast` + 接线 `.skeleton`。

---

## 6. 验收清单

每项可在浏览器直接验证：

- [ ] 打开 StatsPage，慢网络下**看不到**「0s」或「暂无记录」，只看到骨架
- [ ] 打开 TodosPage，慢网络下看到的是骨架，**不是** 5 个「暂无」
- [ ] 打开工作台，慢网络下**不闪现**「还没有标签」
- [ ] 打开工作台，慢网络下**不闪现**「现在还没有计时项目」
- [ ] 断开后端打开任一数据页 → E-Block 卡片 + 琥珀色 + 可展开原始错误 + 有点「重试」
- [ ] 断开后端打开任一数据页 → **不出现**任何 `alert()`
- [ ] 恢复后端点「重试」→ 正常加载，无需刷新页面
- [ ] 有数据时点「刷新」→ 内容**不消失**，仅右上角出现小 spinner
- [ ] 待办页筛选后无结果 → 显示「没有符合当前筛选的活动」+「清除筛选」
- [ ] 日记页搜索无结果 → 显示「未找到匹配的日记」（当前已正确 ✓，需保持）
- [ ] 全文搜索无 `window.alert` / `window.confirm` / `window.prompt`
- [ ] 所有空态文案不含"打卡页""待办页"等易变导航名
- [ ] 所有 loading 态用 `.skeleton` 或局部 spinner，无纯文字「加载中...」（设置页的同步按钮除外，那是操作态非页面加载）