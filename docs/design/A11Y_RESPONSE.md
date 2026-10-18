# ITtime 无障碍与响应式规范

> Phase 2 · 体验设计
> 配套：`IA_REVIEW.md` / `INTERACTION_SPEC.md` / `EMPTY_LOADING_ERROR.md`

**代码事实基线（先说清现状，避免规范脱离现实）**

| 项| 现状 |
|---|---|
| `:focus-visible` 全局样式 | ✅ 已有（index.css 165–168）：`outline: 3px solid rgb(45 212 191 / .45); outline-offset: 2px` |
| `aria-live` 区域 | ❌ **零个**（grep `aria-live` 全项目无命中） |
| `role="dialog"` | ⚠️仅 4 处（TagsPage Modal、CalendarPage DayDetailPopup、CalendarPage 的另一处、PlansPage ActualEntryDialog）；而 `fixed inset-0 z-50` 出现在 **9 个文件** |
| 全局 `prefers-reduced-motion` | ✅ 已有（index.css 259–266）：`animation-duration: .01ms !important` + `transition-duration: .01ms !important` —— 这是**正确的兜底**，但见 §5 的问题 |
| 语义化 tablist | ⚠️ SectionPage ✓、SettingsPage ✓、TodosPage ✓；但**全项目没有一处实现方向键导航** |
| 移动端最小点击区 | ❌ 大量 24–36px：`TodosPage` 5 处 `h-7 w-7`（28px）、`ColorPicker` 9 个 `w-6 h-6`（24px）、`CalendarPage` 工具栏 `w-9 h-9`（36px） |
| 键盘快捷键 | ❌ 只有 3 处 `keydown`：TagsPage 的 Esc、VaultPage 的 Ctrl+S、TodosPage 的回车。**无全局快捷键** |
| 跳转主内容链接 | ❌ 无 skip link |
| `<label for>` 关联 | ❌ TodosPage 大量 `<label className="block…">` 无 `htmlFor`/`id` |

---

## 1. 键盘导航

### 1.1 全局焦点顺序

**现状问题**：`Layout.tsx` 的 DOM 顺序是「侧栏 logo → 侧栏导航 → 侧栏底部设置 → `<main>` 内容 → 移动底栏」。桌面端视觉顺序与 DOM 顺序一致 ✓。但：
- **移动端（`<lg`）侧栏是 `hidden`，但它仍在 DOM 中且 `display:none` 的子元素不可聚焦** ✓ 没问题。
- **移动底栏在 `<main>` 之后**，所以键盘用户在 Tab 到页面底部才能到导航。而视觉上底栏在屏幕最下方——顺序勉强合理，但**没有任何"跳到主内容"捷径**。
- 没有 `<a href="#main">` skip link，键盘用户每次切换一级页面都要 Tab 穿过 ~12 个导航项。

**规范**

```
1. Skip link（仅键盘可见，Tab 一次即达）
     [跳到主要内容]  ← position:absolute; translateY(-200%); :focus-visible → translateY(0)
2. 桌面侧栏：logo(非交互，跳过) → 5 个主导航 → 设置 → 用户名/退出
3. <main id="main" tabIndex={-1}>  ← 路由切换后焦点落点
4. 移动底栏 5 项
```

| 规则 | 实现 |
|---|---|
| skip link 目标 | `<main id="main" tabIndex={-1}>`；`Layout.tsx` 42 行的 `<main>` 加 `id` 与 `tabIndex` |
| skip link 样式 | 视觉隐藏直到 `:focus-visible`：`absolute left-4 top-2 -translate-y-24 focus:translate-y-0 z-50 px-3 py-2 rounded-ctl bg-brand text-white text-sm` |
| **路由切换后焦点** | 焦点移到 `#main`（而不是 `<body>`）。理由：读屏用户切页后需要新位置播报，但**不应**把焦点丢到页首 |
| 焦点不隐藏 | 全局已设 `:focus-visible` outline ✓。**禁止**任何 `outline: none` 而不提供替代（当前 `.input:focus:outline-none` + `focus:ring-2` 是配对的 ✓ 合格） |

### 1.2 快捷键（新增）

**必须避开输入框**：`if (e.target.matches('input,textarea,select,[contenteditable]')) return`

#### 全局

| 键 | 动作 |
|---|---|
| `?` | 打开快捷键帮助（overlay 列表） |
| `g` 然后 `w/t/k/i/g/s` | 跳转：工作台 / 时间 / 事项 / 洞察 / 标签 / 设置（**序列键**，类似 GitHub） |
| `⌘/Ctrl + K` | **命令面板**（见 §1.5） |
| `Esc` | 关闭最上层浮层 |
| `?` 帮助中列出全部 | |

#### 计时（工作台）

| 键 | 动作 | 前置条件 |
|---|---|---|
| `1`–`9` | 启动/停止「快速开始」容器内第 N 个可见标签 | 焦点不在输入框；不消耗原生按键 |
| `Space` | 启动/停止**当前聚焦的标签**（roving tabindex 焦点） | 焦点在快速开始容器内 |
| `Enter` | 在快速开始容器内：启动聚焦的标签 | 同上 |
| `n` | 打开「补录时间记录」弹层（ManualEntryModal） | 全局 |
| `m` | 打开「写日记」弹层（NewJournalModal） | 全局 |
| `.` | 停止全部计时 | 仅 `running.length > 1` 时 |

**roving tabindex 实现要求**（这是让 `1`–`9` 与 `Space` 可用的前提）：

```
快速开始容器  tabIndex={-1}  onKeyDown={容器级键盘处理}
  ├─ 标签按钮[0] tabIndex={0}   ← 容器只有一个 0，其余 -1
  ├─ 标签按钮[1] tabIndex={-1}
  └─ 标签按钮[n] tabIndex={-1}
```
- `Tab` 进入容器 → 落在第 0 个。
- `↑↓←→` 在标签间移动（`Tab` 会跳出容器，这是标准 toolbar 模式）。
- `Home`/`End` 跳首尾。
- 分类折叠按钮 `Enter`/`Space` 切换，其子标签随之展开并进入 tab 序列。
- **鼠标点击行为不变**（一点即启动），仅键盘走焦点即选中，不引入额外点击步骤。

#### 日历（时间）

| 键 | 动作 |
|---|---|
| `j` / `k` | 下一天 / 上一天（`view='month'` 时是 ±1 月） |
| `h` / `l` | 上一周 / 下一周（`view='week'` 时等价 `j/k`） |
| `t` | 跳到今天 |
| `w` / `m` | 切周视图 / 月视图 |
| `n` | 在当前聚焦日期新建计划 |
| `r` | 在当前聚焦日期补录记录 |
| `Enter` | 打开聚焦日期的日视图弹层 |

#### 待办（事项）

| 键 | 动作 |
|---|---|
| `n` | 聚焦快速添加输入框 |
| `/` | 聚焦搜索框 |
| `x` | 勾选/取消勾选聚焦的待办 |
| `e` | 编辑聚焦项 |
| `Backspace` | 删除聚焦项（走删除流程，见 INTERACTION_SPEC §2.4） |
| `Shift + ↑/↓` | 多选模式下扩展选择 |

#### 全局要求

- 快捷键**在 `<select>` 聚焦时不劫持**（`e.target.matches('select')` 也要 return）。
- 所有快捷键在帮助面板 `?` 中列出，按分组展示。
- 快捷键实现放在一个新的 `useHotkeys` hook，`App.tsx` 顶层挂一次。
- **Android 物理键盘 / 外接键盘**：Capacitor WebView 中 `e.key` 正常工作 ✓，但要确认软键盘弹出时不要绑 `Space`（软键盘本身会响应空格）。规范：`Capacitor.getPlatform() === 'android'` 且软键盘可见时禁用 `Space`。

### 1.3 Tablist 的方向键导航（**当前全项目缺失**）

**现状**：`SectionPage`、`SettingsPage`、`TodosPage` 的待办状态切换、CalendarPage 的视图切换都用了 `role="tablist"` + `role="tab"` + `aria-selected`，**但没有一处实现方向键**。这在 WAI-ARIA 里是**不合规的**：`role="tab"` 容器必须响应 `←`/`→`。

**规范（三处 tablist 统一实现）**

```tsx
// 伪代码
function useTablist(ids: string[], activeId: string, onChange: (id: string) => void) {
  const refs = useRef<Map<string, HTMLElement>>(new Map())
  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    let nextIndex = -1
    if (delta !== 0) nextIndex = (ids.indexOf(activeId) + delta + ids.length) % ids.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = ids.length - 1
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { /* 下拉型tablist：上下也切换 */ }
    if (nextIndex < 0) return
    e.preventDefault()
    onChange(ids[nextIndex])
    refs.current.get(ids[nextIndex])?.focus()   // ← 必须同步移动焦点
  }
  return { onKeyDown, refs }
}
```

配套要求：
- `role="tab"` 上加 `tabIndex={id === activeId ? 0 : -1}`（roving tabindex）。
- 每个 tab 加 `id={`${baseId}-tab-${id}`}`、`aria-controls={panelId}`。
- 面板加 `id={panelId}`、`role="tabpanel"`、`aria-labelledby={tabId}`、`tabIndex={0}`。
- `SectionPage` 的 `role="tablist" aria-label="分区"` → 改为 `aria-label={`${当前一级域名}分区`}`，如"时间分区"/"事项分区"，否则读屏用户只听到"分区"。
- **面板加 `tabIndex={0}` 很重要**：面板内如果没有可聚焦元素，键盘用户无法滚动面板内容（Chrome/Firefox 的 scrollable region 行为差异）。

### 1.4 焦点陷阱与恢复

**现状**：全项目零焦点陷阱。所有 `fixed inset-0 z-50` 弹层都可以 Tab 到背后的内容，然后消失到屏幕外——这是典型的键盘用户陷阱。

**规范**

| 项 | 要求 |
|---|---|
| 陷阱范围 | 所有 `role="dialog" aria-modal="true"` 的浮层。共约 15 个弹层（TagsPage 4、TimerPage 8、TodosPage 2、CalendarPage 2、DiaryPanel 2、CalendarSyncModal、SubscriptionManager、GalleryPanel） |
| 实现 | 抽 `useFocusTrap(ref)` hook：`keydown` 监听 `Tab`/`Shift+Tab`，在`focusable` 列表（`a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])`）内循环 |
| 初始焦点 | 优先 `[data-autofocus]`，否则第一个可聚焦元素；**若第一个是危险按钮（如「删除」）则跳过到第二个** |
| 关闭后恢复 | `const opener = useRef(document.activeElement)` 挂在打开时；关闭时 `opener.current?.focus()` |
| 背景 inert | 打开时给 `document.getElementById('root')` 的兄弟容器加 `inert` 属性（或 `aria-hidden="true"` + `tabindex="-1"`）。**注意**：`aria-hidden` 打在仍有焦点的祖先上会让读屏彻底失焦，必须配合 blur |
| `Esc` | 所有浮层支持。**例外**：全屏常显时钟（`FullscreenClockOverlay`）的 `Esc` 退出全屏而非关闭 |
| 点击遮罩 | 现状已在（`onClick={onClose}` + `stopPropagation`）。规范：点击遮罩关闭**要支持 `onMouseDown` 而非 `onClick`**，避免拖拽选择文本时误关（PlansPage 已用 `onMouseDown` ✓，TagsPage/DiaryPanel 用 `onClick` ✗） |

### 1.5 命令面板（`⌘K`）

**目标**：8–9 个页面、5 个一级域、约 20 个二级功能，键盘用户没有导航手段。命令面板是最划算的补偿。

```
┌────────────────────────────────────────────┐
│ 🔍 输入标签、页面或动作…                Esc │
├────────────────────────────────────────────┤
│ 页面                                          │
│  工作台                  ⌘1                 │
│  时间 › 日历                                  │
│  事项 › 待办                                   │
│ 🏷 标签                                        │
│  「编码实现」                     teal · 工作 │
│ ⚡ 动作                                        │
│  开始计时：编码实现                            │
│  补录时间记录                                  │
│  写日记                                        │
└────────────────────────────────────────────┘
```

| 项 | 规范 |
|---|---|
| 数据源 | 标签从 `useStore(s => s.tags)` 实时读；页面与动作为静态清单 |
| 过滤 | 简单 `includes` 匹配（标签名/页面名/动作名），不做拼音首字母（YAGNI） |
| 键盘 | `↑↓` 移动、`Enter` 执行、`Esc` 关闭、`⌘Enter` 在新标签打开链接 |
| a11y | `role="dialog" aria-modal="true"`，输入框 `role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={选中项 id}`，列表 `role="listbox"`，项 `role="option" aria-selected` |
| 触屏 | Android 软键盘弹出时，`⌘K` 不可用 → 在标签页 `⋯` 菜单里放「搜索」入口 |

---

## 2. 语义化标注

### 2.1 页面骨架

**现状**：`PageHeader` 输出 `<header className="page-header">` + `<h1>`（PageHeader.tsx 9/14）✓。但：
- `PageHeader` 的 kicker `<div className="page-header-kicker">ITTIME / 工作区</div>` **硬编码字符串**——在"标签与分类"页也显示"ITTIME / 工作区"，语义错误。
- 页面 `<h1>` 与分区 tab 无层级关系：切到「习惯」时，`<h1>` 仍是页面级标题，用户不知道自己在哪个分区。

**规范**
- `PageHeader` 接受 `section` prop，渲染 `<nav aria-label="面包屑">`（首页可省略）：
  ```
  工作区 / 时间 / 日记
  ```
  实现：`<div className="page-header-kicker"><Link to="/time">时间</Link> / <span aria-current="page">日记</span></div>`。
- 每页唯一 `<h1>` ✓ 保持。分区内的子标题用 `<h2>`（当前 StatsPage/TagsPage 正确 ✓，CalendarPage 工具栏标题也是 `<h1>` —— **与 PageHeader 的 h1 冲突？** 实际 CalendarPage **不用** PageHeader（自己写了工具栏 + `<h1>`），所以只有一个 h1 ✓，但它缺少 `PageHeader` 的 kicker，与其他页视觉不一致。规范：CalendarPage 改用 `PageHeader`，把工具栏内容放进 `actions` 或作为紧邻的第二个 section）。
- 每个内容 `<section>` 有 `aria-label`（当前部分有：DiaryPanel ✓ `aria-label="日记面板"`、PlansPage ✓ `aria-label="每日计划与实际记录"`、TodoCard 无 ✗）。

### 2.2 动态内容播报（**当前完全缺失**）

`aria-live` 全项目零使用。当前唯一机制是 `role="status"`（TimerPage feedback、PlansPage error、SettingsPage message）与 `role="alert"`（错误）。但 **`role="status"` 容器是条件渲染的**（TimerPage 309 行 `{feedback && <div role="status">…}`），**条件挂载的 live region 播报不可靠**——屏幕阅读器可能不播报一个刚被插入 DOM 的 live region。

**规范：全局固定 live region + 事件驱动**

```
在 App.tsx 挂两个永久存在的容器（视觉隐藏）：
  <div role="status" aria-live="polite" aria-atomic="true" class="sr-only" id="live-polite" />
  <div role="alert" aria-live="assertive" aria-atomic="true" class="sr-only" id="live-assertive" />
```

`.sr-only` 工具类（若 Tailwind 未启用，用自定义）：
```css
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
```

| 事件 | 播报文本 | 语气 |
|---|---|---|
| 计时启动 | `已开始计时：编码实现` | polite |
| 计时停止 | `已停止，本次记录 1 小时 24 分` | polite |
| 全部停止 | `已停止全部 3 个计时` | polite |
| 次数打卡 | `已打卡：每日读书，今日 4 次` | polite |
| 待办完成 | `已完成：评审 UI 一致性` | polite |
| 待办恢复 | `已恢复为未完成：评审 UI 一致性` | polite |
| 待办删除 | `已删除：写周报。可按撤销恢复` | polite |
| 习惯连续天数变化 | `已连续 5 天达标` | polite |
| 计时失败 | `启动失败：{原因}` | assertive |
| 保存失败 | `保存失败：{原因}`，并把焦点移到错误元素 | assertive |
| 待办超时未填原因 | `完成超时活动需要填写原因` | polite |
| 加载完成（有内容） | `已加载 12 项活动` | polite（可选，量大时可省） |

**注意**：每次播报前先 `textContent = ''` 再赋值，否则相同文本不会重播。规范：`setLive(msg, id)` helper 做这个清空。

**TimerPage 的时钟**：`RunningTimer` 每秒 `setNow` 更新大字号时钟（1167–1171 行）。**绝对不能加 `aria-live`**。规范：时钟数字包 `aria-hidden="true"`，另加一个 `<p className="sr-only" role="timer">`每 60s 更新 `已计时 1 小时 24 分`。

### 2.3 颜色不能作为唯一信息载体

**当前违反点（逐条基于代码）**

| 位置 | 问题 |
|---|---|
| `CalendarPage` 637–643 月视图图例 | 4 种类型只用色点 + 虚线边框区分：`<i className="h-2 w-2 rounded-full bg-brand" />计时记录`、`<i className="rounded border border-dashed border-slate-500" />计划`、`<i className="rounded-full bg-amber-400" />活动`、`<i className="rounded-full bg-emerald-500" />外部日历`。**amber 与 emerald 在 deuteranopia 下几乎同色** |
| `StatsPage` 86, 92 | 色点用 `row.color`，但进度条用 `bg-brand-600`——**两者不一致**，用户看色点认不出对应哪条 |
| `TodosPage` 507–508 | 优先级用 **emoji** 🔴 / 🟡 表示，无文字标签。读屏会读"红圆"/"黄圆"（不一致），且色弱用户看不出区别 |
| `GoalsPage` 74 | 达标态只把数字改成 `text-emerald-600` |
| `StatsPage` 111 | 覆盖率 0% 与"无数据"都显示 `0%`，无区分 |
| `TimerPage` 1200 | 计时中的小圆点 `bg-brand-600` + 文字"正在计时" ✓ 有文字，合格 |
| `DiaryPanel` 150 | 时间线圆点用标签色，**同色标签的日记在视觉上无法区分** |

**规范**

| 项 | 要求 |
|---|---|
| 优先级 | 🔴/🟡 **保留 emoji 但补文字**：`🔴 紧急` / `🟡 重要`，或在卡片上渲染 `<span className="sr-only">紧急</span>` + 视觉小竖条。同一行内 优先级0（普通）不渲染任何标记 → **这本身也是信息缺失**（普通=无标记 vs 缺优先级不可区分，规范：普通项用灰色 `—` 或不加，但 `aria-label` 要写明"优先级：普通"） |
| 日历图例/条目 | 4 种类型加**形状 + 文字**：⏱ 计时 / ▦ 计划 / ✓ 活动 / ↗ 外部。同时保留色点。条目内 `aria-label` 也要含类型词 |
| 日记时间线 | 同色标签的日记之间用**内容摘要首句**（前 20 字）作为区分依据，不用颜色区分条目 |
| 达标态 | 加✓ 图标 + `sr-only`「已达标」，不只变色 |
| 覆盖率 | 与"无计划"区分：0% 但有计划 → `尚未开始`；有计划且 0% → `0%（未开始）` |
| StatsPage 排行 | 进度条改用 `row.color`（同时修掉不一致 bug） |
| 全局 | 任何用颜色表达的状态，都必须有第二重信号（图标 / 文字 / 形状 / 位置） |

### 2.4 表单标注

**现状问题**
- `TodosPage` 669/672/677/695 等：`<label className="block text-sm text-gray-500 mb-1">标题</label>` + 相邻 `<input>` —— **无 `htmlFor`/`id`**。点 label 无效，读屏器无法建立关联。
- `TagsPage` `Field` 组件（589–596 行）：同样模式，`<label className="block text-sm…">{label}</label>` + children，**无 id 生成**。
- 优先级/状态/记录方式/专注模式等"按钮组"（如 `TagsPage` 475–487、`TodoEditModal` 679–693）视觉是 radio，**但无 `role="radio"`**。
- 错误信息（`setError`）渲染在表单底部，**未与对应字段 `aria-describedby` 关联**。

**规范**
- 统一 `<Field id label error hint>` 组件：
  ```
  <label htmlFor={id}>{label}</label>
  <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} />
  {hint && <p id={`${id}-hint`}>{hint}</p>}
  {error && <p id={`${id}-err`} role="alert">{error}</p>}
  ```
- 所有按钮组改 `role="radiogroup" aria-labelledby` + 每项 `role="radio" aria-checked`，`←`/`→` 可切换。**同时补 `aria-label` 或可见文本**（如「时长计时」「次数打卡」已有文本 ✓）。
- 必填项 `required` + `aria-required`（原生 `required` 已隐含）。`minLength`/`pattern` 已有 ✓（`GoalForm` 657–681 校验完整 ✓ 这块做得好）。
- **内联校验优先于提交时校验**：`GoalForm` 目前是点保存才校验（652–682）。规范：字段 `blur` 时校验并显示，提交时聚焦第一个错误字段。

### 2.5 拖拽的无障碍等价（**必做项**）

**现状**：6 处 HTML5 `draggable`——`TagsPage` 分类/标签/目标、`TimerPage` 快速开始分类/标签、`GoalsPage` 习惯。`GripVertical` 上有 `aria-label="拖动排序"`（`TagsPage` 121/196/274、`GoalsPage` 70、`TimerPage` 459/471 等）——**但它是个 `<svg>`（lucide 图标），不是 `<button>`**。所以：**不可聚焦、读屏不可达、键盘无法操作、移动端无法操作**。`aria-label` 挂在一个不可交互的元素上，屏幕阅读器用户甚至可能都听不到（不可聚焦元素通常不在 Tab 序列，读屏浏览模式下才可能读到）。

**规范**
- 把 `GripVertical` 换成**可聚焦按钮**：
  ```
  <button type="button" className="drag-handle" tabIndex={0}
    aria-label="重新排序：{name}，当前第 {i+1} 项，共 {n} 项"
    onKeyDown={handleDragKey}>
    <GripVertical aria-hidden="true" />
  </button>
  ```
- 键盘操作：`↑`/`↓` 移动（**移动后立即调 API 持久化**），`Home`/`End` 移到首尾。播报 `{name} 已移到第 {n} 位，共 {m} 项`（`role="status"`）。
- 触屏：点击手柄 → 底部抽屉 `上移 / 下移 / 移到最前 / 移到最后`。**规范要求触屏下不渲染 `draggable`**（HTML5 DnD 在触屏不可用且会干扰滚动），用 `@media (hover: hover) and (pointer: fine)` 包裹。
- 视觉：拖拽时 `aria-grabbed`（已废弃但无替代时保留）+ 目标项显示 2px `border-t-brand` 插入线（当前只有 `opacity-40`，无插入位置指示）。
- 每处拖拽提供"非拖拽"的兜底路径：分类/标签页加一个「排序」模式开关（`TimerPage` 已有 `sortingQuickStart` 模式 ✓ 思路正确），开关打开后显示 ↑↓ 按钮。

---

## 3. 触达尺寸

### 3.1 现状清单（实测自代码）

| 位置 | 当前 | 尺寸 |
|---|---|---|
| `TodosPage` 编辑/删除/计时/更多按钮 | `h-7 w-7` | **28px** ✗ |
| `TodosPage` 完成圆圈 | `w-9 h-9` | 36px ⚠️ |
| `TodosPage` 一次性折叠按钮 | `h-7 w-7` | 28px ✗ |
| `TagsPage` `ColorPicker` 预设色 | `w-6 h-6` | **24px** ✗✗ |
| `TagsPage` `ColorPicker` 原生 color | `w-10 h-10` | 40px ⚠️ |
| `TagsPage` 折叠按钮 | `h-6 w-6` | 24px ✗✗ |
| `TimerPage` 折叠按钮 | `h-7 w-7` | 28px ✗ |
| `TimerPage` 排序开关 | `h-9 w-9` | 36px ⚠️ |
| `CalendarPage` 工具栏 `‹` `›` | `w-9 h-9` | 36px ⚠️ |
| `CalendarPage` `🗓️` `📡` | `w-9 h-9` | 36px ⚠️ |
| `CalendarPage` 关闭按钮 | `h-8 w-8` | 32px ✗ |
| `.timer-tag`（快速开始标签） | `min-height: 44px`（index.css 181） | 44px ✓ |
| `.input` / `.btn-primary` | `min-height: 2.5rem` | 40px ⚠️ |
| `SectionPage` tab | `px-4 py-1.5` | 约 30px ⚠️ |
| Layout 侧栏导航项 | `min-h-10` | 40px ⚠️ |
| Layout 移动底栏项 | `h-[4.35rem]` 内 `my-1` | 约 54px ✓ |

### 3.2 规范

| 类别 | 最小尺寸 | 说明 |
|---|---|---|
| **移动端**所有可点击 | **44×44px** | WCAG 2.5.5 (AAA) |
| 桌面端密集控件（行内图标） | 28–32px |鼠标精度高，但**必须有 44px 的触达热区**（伪元素扩��） |
| 相邻独立目标间距 | ≥ 8px | WCAG 2.5.8 (AA) |
| 主要按钮高度 | 44px | `.btn-primary` 从 40 → 44（`min-height: 2.75rem`） |
| 输入框高度 | 44px（移动）/ 40px（桌面） | |
| 色块选择器槽位 | **44×44px** | 视觉圆点 24px，槽位 44px，`gap` 8px |

**不改变视觉密度的实现技巧**（关键——否则移动端布局会被撑破）：

```css
/* 给小按钮加触达热区，不改变视觉尺寸 */
.tap-expand { position: relative; }
.tap-expand::after {
  content: "";
  position: absolute;
  inset: 50% 50% 50% 50%;
  width: 44px; height: 44px;
  transform: translate(-50%, -50%);
  /*pointer-events 由父级继承，透明但可接收点击 */
}
```
**适用**：`TodosPage` 5 处 `h-7 w-7`、`TagsPage` 折叠 `h-6 w-6`、`CalendarPage` 关闭 `h-8 w-8`。

**必须真实放大的**：`ColorPicker` 的 9 个色块（24px，相邻 6px，会误触相邻色）、`SectionPage` 的 tab（30px 高且是主导航）、移动端的完成圆圈。

### 3.3 移动端其他

| 项 | 规范 |
|---|---|
| `env(safe-area-inset-*)` | 底栏已有 `pb-[env(safe-area-inset-bottom)]` ✓。**顶部也要**：`PageHeader` 在刘海屏机型应加 `pt-[env(safe-area-inset-top)]`（当前无） |
| 输入框字号 ≥16px | iOS Safari 对 `<16px` 的输入框会在聚焦时自动放大页面。检查 `.input`（`text-sm` = 14px）→ **移动端输入框必须 `text-base`（16px）** |
| 软键盘遮挡 | 时间线视图（`PlansPage` `.plan-scroll`、`CalendarPage` 时间轴）在软键盘弹出时高度塌陷。规范：监听 `visualViewport`，输入框聚焦时把焦点元素 `scrollIntoView({block:'center'})` |
| 双击缩放 | `touch-action: manipulation` 加到按钮上，禁用双击 tap 缩放延迟（当前全局 `* { -webkit-tap-highlight-color: transparent }` 只去掉了高亮，没去掉延迟） |
| 横向滚动容器 | `CalendarPage` 工具栏（526 行 `overflow-x-auto`）、`TodosPage` 目标条（270 行 `overflow-x-auto`）、`DiaryPanel` 日历切换（67 行）。规范：加 `scrollbar-width: none` + 滚动条隐藏，或加左右渐隐提示遮罩 |
| 底部安全区 | 所有吸底元素（TodosPage 新建按钮、toast、命令面板）的 `bottom` 需 ≥ `4.35rem`（底栏高度）+ safe-area，避免被底栏遮住 |

---

## 4. 响应式断点策略

### 4.1 现状评估

**Tailwind 默认断点**（`tailwind.config.js` 只extend 了圆角/阴影/颜色/动画，**未改 screens**）：

| 断点 | 值 | 项目用法 |
|---|---|---|
| `sm` | 640px | `sm:p-5`、`sm:grid-cols-2`（多处在用） |
| `md` | 768px | `md:flex-col`、`md:grid-cols-2`（TagForm） |
| `lg` | 1024px | **侧栏出现**（`lg:flex` / `lg:hidden`）、TimerPage 双栏变单栏、`.settings-layout`/`.stats-layout`/`.tag-rows` 变单栏 |
| `xl` | 1280px | TagsPage 双栏、快速开始 3 列 |
| `2xl` | 1536px | 未用 |

**评估结论：断点不需要改。** 理由：

1. **`lg` (1024px) 作为侧栏开关是正确的**——低于 1024 用底栏导航，符合 5 格底栏的宽度需求。
2. **项目已形成三档清晰的语义**：`sm` 微调间距 → `lg` 导航形态切换 + 单双栏 → `xl` 密度提升。语义一致，没有"同一断点干不同事"的情况。
3. 只需补两个**语义断点**（不新增 screens，用 `max-md:` / `min-lg:` 组合即可）。

**唯一的问题断点**：`CalendarPage` 的月视图。在 640–1024px 之间，侧栏已隐藏（`lg:hidden`）但内容区仍被月视图的 7 列挤压。当前月视图格子宽度 = 容器宽 / 7。在 640px 时每格约 78px（可用），在 375px 时约 44px（**不可点**）。

**规范：新增一个语义断点 `md`（768px）作为日历密度分界**—— 不改 Tailwind 配置，在 CalendarPage 内用 `max-md:` 控制：
- `< 768px`：**默认不渲染月视图**，改为周视图 + 顶部月份选择器（`Google Calendar` 移动端做法）。月视图入口放在「视图」菜单里显式选择。
- `≥ 768px`：月视图正常可用。

**为什么不改 Tailwind screens**：改 screens 会影响全局 `max-*` 变体的含义，且需要同步审查所有 30+ 处用法。收益不匹配。

### 4.2 三档布局差异

#### 移动 `< 768px`

| 区域 | 规范 |
|---|---|
| 导航 | 底栏 5 格（保持现状）；若采纳 IA 方案 A 增到 6 个一级入口，「设置」不进底栏，改从 `⋯` 菜单进 |
| 页边距 | `px-4 py-5`（现状 ✓） |
| **TimerPage** | **单栏**。当前顺序：暂存条 → 计时卡片 → 快速开始 → 时间线。这个顺序有问题：快速开始在计时卡片下方，用户启动计时后要滚动才能看到标签列表。**规范**：单栏时改为 计时卡片（sticky top，含大时钟 + 停止）→ 快速开始（横向可滚动或 2 列紧凑）→ 时间线。快速开始区 `max-h-[38vh] overflow-y-auto` |
| **TodosPage** | 4 个 `ActivityModule`（工作日/日/周/月）当前 `xl:grid-cols-2` → 移动端 1 列，**4 个模块顺序堆叠，每模块 `min-h-[150px]` = 600px+ 滚动**。规范：① 空模块折叠（`今日暂无` 的不占高度）；② 只展开有内容的模块；③ 提供「全部展开」链接 |
| **CalendarPage** | 视图默认周；工具栏两行（日期行 + 操作行），操作行 `overflow-x-auto`；「新建记录」为吸底 FAB |
| **TagsPage** | 当前 `xl:grid-cols-[260px,1fr]` → 移动端 1 列堆叠（分类在上、标签在下）。规范：移动端用 **accordion**——分类列表折叠为一组可横滑的 chip，选中后下方只显示该分类的标签（减少滚动） |
| **StatsPage** | `.stats-layout` 在 <1024px 已变单栏 ✓。「标签投入排行」每行是 `flex justify-between`，移动端 OK。趋势图 `h-[168px]` ✓ |
| **PlansPage** | 两列时间轴 `grid-cols-[3rem_1fr_1fr]` → 在 375px 下每列约 132px，太窄。规范：移动端**改为上下堆叠**（先「计划」列全宽，再「实际」列全宽），或默认只显示「计划」列并提供切换 |
| **GoalsPage** | `.habits-layout` <1024 已变单栏 ✓。「已完成活动」历史面板 `max-h-[calc(100vh-10rem)] overflow-y-auto` → 移动端 `max-h-none`（index.css 94 行已处理 ✓） |
| **SettingsPage** | `.settings-nav` 在 <768 变 `flex-row overflow-x-auto`（index.css 86–90 ✓）横向 tab 条 ✓ |
| 弹层 | 统一底部抽屉：`items-end sm:items-center` + `rounded-t-xl`（**PlansPage 已如此 ✓，TodosPage/DiaryPanel/TagForm 需统一**） |
| 字体大小 | 设置页已有 3 档（紧凑 14/标准 15/舒适 16）✓。规范：**所有输入框在移动端强制 ≥16px**（见 §3.3） |

#### 平板 `768–1023px`

| 区域 | 规范 |
|---|---|
| 导航 | 底栏（`lg:hidden` 仍生效）✓ |
| TimerPage | 单栏（`max-lg:grid-cols-1` ✓），但快速开始可用 `sm:grid-cols-2`（当前 `running.length>0` 时强制 1 列，见 INTERACTION_SPEC §1.2） |
| TodosPage | ActivityModule 用 `sm:grid-cols-2`（当前 `xl:grid-cols-2`，768–1279 单列 → **浪费空间**）。规范：改为 `md:grid-cols-2` |
| TagsPage | `.tag-rows` 在 ≥768 已 `repeat(auto-fill, minmax(300px,1fr))` ✓，但外层 grid 是 `xl:grid-cols-[...]` → 768–1279 时分类与标签上下堆叠，各占全宽。规范：改为 `lg:grid-cols-[240px_1fr]` |
| CalendarPage | 月视图可用 ✓；周视图 7 天列在 768px 下每列约 100px，够用 |
| StatsPage | 单栏（`max-width:1023px` 规则 ✓），但「标签投入排行」在大屏单栏下会过宽（1480px 内容区）。规范：`max-width` 约束到 900px 居中，或保持双栏到 900px |

#### 桌面 `≥ 1024px`

| 区域 | 规范 |
|---|---|
| 侧栏 | `w-64` 固定，`lg:pl-64` ✓。分组「日常 / 回顾与整理」✓ |
| **TimerPage** | 双栏 `grid-cols-[minmax(0,1fr)_minmax(300px,360px)]`，右栏 sticky `top-4 max-h-[calc(100vh-2rem)] overflow-y-auto` ✓。**规范**：右栏宽从 360 → 400（标签不挤，见 INTERACTION_SPEC §1.2） |
| 空闲态 | 快速开始 `lg:grid-cols-2 xl:grid-cols-3`，首个分类 `lg:col-span-full` ✓（449 行） |
| 内容最大宽 | `.app-main { max-width: 1480px }`（index.css 32）✓ |
| 日历 | 月/周/4天全可用 |
| 弹层 | 居中卡片，`max-h-[calc(100vh-2rem)]` + 内部滚动 ✓。TagForm 用 `size="wide"` → `max-w-3xl` ✓ |
| 键盘 | 完整快捷键 + `⌘K` 命令面板 + `?` 帮助 |

### 4.3 横屏与折叠屏

- **`@media (orientation: landscape) and (max-height: 500px)`**：全屏常显时钟（`FullscreenClockOverlay`）已处理 `body.fullscreen-clock-active { overflow:hidden }` ✓。规范：底部抽屉在此断点下改为**居中**（因为垂直空间不足，从底部升起会占满屏）。
- 折叠屏展开（`min-width: 1200px` 但有铰链）：当前无处理。规范：**不做特殊处理**（YAGNI），仅确保 `.app-main` 的 `max-w-[1440px]` 不会让内容跨过铰链——可在 `lg` 断点内用 `max-w-full`。

---

## 5. 减弱动效（`prefers-reduced-motion`）

### 5.1 现状

```css
/* index.css 259–266 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

**这个兜底是对的**（覆盖了 `animate-spin` / `skeleton-shimmer` / `aurora-drift` / `page-in` 全部），但它是**一刀切关闭**，缺失三件事：

1. **没有关掉 `backdrop-filter` 的性能代价**——`aurora-drift` 动画停了，但 `.app-shell::before/::after` 的 `filter: blur(120px)` 常驻，占 GPU。规范：reduce 模式下 `filter: blur(40px)` 或改为 `display:none`（保留 `--shell-bg` 纯色背景即可，视觉几乎无差）。
2. **`transition-duration: .01ms` 会破坏依赖 transitionend 的逻辑**（若前端有 `onTransitionEnd`）。当前项目没有，但 Phase 3 加动效时要注意。
3. **`.skeleton` 在 reduce 下变成静态灰块**（动画 duration→0.01ms，1次迭代，`background-position` 不再移动）——这是**正确的期望行为** ✓。

### 5.2 分类处置表

| 动效 | 位置 | reduce 下 | 理由 |
|---|---|---|---|
| `.app-shell::before/::after` 极光漂移 | index.css 620–643 | **关闭 + 移除 blur** | 26s/32s 大面积位移模糊，前庭障碍触发源 |
| `.skeleton` 微光扫动 | index.css 245 | **关闭**（保留静态灰块） | 循环动画 |
| `animate-spin`（PageFallback、AuthGate、上传中） | App.tsx 64、AuthGate | **可保留**：spinner 是状态指示，静止会失去含义。但需降低转速：从 `1s` 改 `2.5s`，并加 `animation-iteration-count: 1`？→ **不，spinner 必须循环**（用户在等）。规范：**保留 spinner，但改为 3s 一圈**（降低闪烁频率），并给它加 `role="status"` + 文字（当前 PageFallback 有 `aria-label="页面加载中"` ✓） |
| `animate-page-in`（Layout main、SectionPage） | index.css 268、`motion-safe:` 前缀 | **关闭**（已由 `motion-safe:` 处理 ✓） | 正确 —— 用 `motion-safe:` 前缀而非全局 kill 是好实践 |
| `modal-in` / `overlay-in` | index.css 105–129 | **关闭**（已被 135–140 行的 `@media` 覆盖 ✓） | 弹层位移（`translateY(14px) scale(.985)`）触发前庭反应 |
| 按钮 `active:scale(.98)` | index.css 156 | **关闭** | 缩放动画 |
| `.btn-primary:hover { translateY(-1px) }` | index.css 227 | **可保留**：位移 1px，无缩放，不触发前庭反应 | |
| 计时大时钟每秒更新 | TimerPage 1167 | **可保留**：数字变化非动画，无 transition | |
| 习惯进度条 `transition-[width] duration-300` | GoalsPage 77 | **保留**：宽度动画是信息传达（进度变化），200ms 内完成，无循环 | 前庭风险极低 |
| 待办条目移出（新增） | INTERACTION_SPEC §2.1 | **关闭移出动画**，改为直接消失 + toast | 列表项位移 |
| 打卡数字翻倍（新增） | INTERACTION_SPEC §3.1 | **关闭 scale**，只换数字 | |
| toast 滑入（新增） | INTERACTION_SPEC §2.1 | 改为淡入（无位移） | |
| 拖拽跟随（新增） | INTERACTION_SPEC §6.4 | **保留**：拖拽是用户主动的直接操作反馈，关闭会导致无法追踪 | |
| `aurora-drift` 之外的全屏常显时钟 | TimerPage `FullscreenClockOverlay` | **保留**：这是用户的核心诉求（盯着计时） | |

### 5.3 实现要求

新增动效**一律用 `motion-safe:` 前缀**，不要依赖全局 kill：

```tsx
// ✅ 正确
<div className="motion-safe:animate-page-in" />
<div className="transition-opacity motion-safe:duration-300" />

// ❌ 错误（会被全局 kill 意外影响其他属性）
<div className="animate-page-in" />
```

同时在 `index.css` 补充（收窄全局 kill 的副作用）：

```css
@media (prefers-reduced-motion: reduce) {
  /* 极光背景：去掉大面积模糊，降低 GPU 占用 */
  .app-shell::before, .app-shell::after {
    animation: none !important;
    filter: blur(40px);
  }
  /* 加载 spinner：降频但保留循环 */
  .animate-spin { animation-duration: 3s !important; }
  /* 计时环等关键进度动画：保留 */
  .timer-progress, .habit-progress { transition-duration: .2s !important; }
}
```

---

## 6. 无障碍自检清单（Phase 3 验收用）

每项可直接勾选，Phase 3 完成后逐条验证。

### 键盘
- [ ] Tab 能一次到达「跳到主要内容」链接
- [ ] 路由切换后焦点落在 `<main>`（非 `<body>`）
- [ ] 所有 `role="tablist"` 支持 `←`/`→`/`Home`/`End`，焦点随动
- [ ] 所有 `role="dialog"` 有焦点陷阱、`Esc` 关闭、关闭后焦点回到触发元素
- [ ] 6 处拖拽全部有键盘替代（`↑`/`↓`/`Home`/`End`）与触屏替代（抽屉菜单）
- [ ] 快速开始容器是 roving tabindex 的 toolbar，`1`–`9` 可用
- [ ] 日历 `j/k/h/l/t/w/m` 可用
- [ ] `⌘K` 命令面板可打开、可键盘导航
- [ ] 输入框聚焦时快捷键不劫持
- [ ] 无任何 `outline: none` 缺少替代焦点样式

### 语义
- [ ] 永久存在的两个 live region（polite + assertive）
- [ ] 计时启动/停止、待办完成/删除、打卡成功均有播报
- [ ] 计时大时钟 `aria-hidden`，另设 60s 更新的 `role="timer"`
- [ ] 每页唯一 `<h1>`；`PageHeader` kicker 改为可导航的面包屑
- [ ] 所有 `Field` 有 `htmlFor`/`id`；错误用 `aria-describedby` 关联
- [ ] 所有按钮组（优先级/状态/视图/筛选）有 `role="radio"` 或 `aria-pressed`
- [ ] 优先级 🔴🟡 有文字或 `sr-only` 标签
- [ ] 日历 4 种类型有图标 + 文字，不只靠颜色
- [ ] 标签色板（`viz-1..viz-6`）每槽三档达标：色块 ≥3:1（白底）、`-ink` 文字 ≥4.5:1（白底）、`-on-dark` ≥4.5:1（gray-800）；暗色禁止沿用亮色值
- [ ] 图表/色点不单靠颜色区分：每块带直接标签（数值或名称），红绿色盲下有第二通道

### 触达
- [ ] 移动端所有可点击 ≥44×44px（含 `.tap-expand` 热区）
- [ ] 相邻目标间距 ≥8px
- [ ] 移动端所有输入框 `font-size ≥16px`
- [ ] 顶部有 `env(safe-area-inset-top)`
- [ ] 吸底元素避开 4.35rem 底栏+ safe-area

### 响应式
- [ ] 移动端默认不渲染日历月视图
- [ ] 移动端 TodosPage 的 4 个 ActivityModule 空态不占高度
- [ ] 移动端 PlansPage 时间轴上下堆叠
- [ ] 弹层移动端统一底部抽屉
- [ ] `≥768px` TodosPage 用 `md:grid-cols-2`
- [ ] `≥1024px` TagsPage 用 `lg:grid-cols-[240px_1fr]`

### 减弱动效
- [ ] 新增动效全部带 `motion-safe:` 前缀
- [ ] reduce 下极光 blur 降低、spinner 降频到 3s
- [ ] reduce 下进度条/计时环动画保留
- [ ] reduce 下 toast/列表移出改为淡入

---

## 7. 优先级（若时间不足，按此顺序）

**P0（阻塞发布）**
1. 永久 live region + 计时/待办/打卡播报
2. 所有弹层的 `role="dialog"` + `aria-modal` + `Esc` + 焦点恢复（尤其TodosPage 的编辑弹层——当前**完全没有**）
3. 标签色板 AA 对比度 + 色盲安全（这是视觉分色的地基）
4. 移动端 44px 触达（`ColorPicker` 24px 色块 + TodosPage 28px 按钮）

**P1**
5. Tablist 方向键导航（3 处）
6. 拖拽的键盘/触屏替代（6 处）
7. 优先级不只靠 emoji
8. 快捷键子集（计时 `1`–`9`/`Space`、日历 `j/k`、`n`）
9. 移动端输入框 16px + 顶部 safe-area

**P2**
10. `⌘K` 命令面板
11. skip link
12. `PageHeader` 面包屑
13. 日历视图/日期 URL 化（也是 a11y 的"可分享性"）
14. 移动端日历默认周视图