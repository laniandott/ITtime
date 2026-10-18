# ITtime 信息架构诊断与重构建议

> Phase 2 · 体验设计
> 依据代码：`App.tsx` / `Layout.tsx` / `SectionPage.tsx` / `TimerPage.tsx` / `TodosPage.tsx` / `StatsPage.tsx` / `TagsPage.tsx` / `CalendarPage.tsx` / `GoalsPage.tsx` / `SettingsPage.tsx` / `DiaryPanel.tsx` / `PlansPage.tsx` / `PageHeader.tsx` / `index.css` / `tailwind.config.js`
> 截图：`ui-review/assets/c2-*-after.png`、`crop-mobile.png`

---

## 0. 我实际读了什么 / 没读什么

**已完整读取**：`App.tsx`、`Layout.tsx`、`SectionPage.tsx`、`PageHeader.tsx`、`StatsPage.tsx`、`TodosPage.tsx`、`GoalsPage.tsx`、`SettingsPage.tsx`、`TagsPage.tsx`、`DiaryPanel.tsx`、`DiaryPage.tsx`、`PlansPage.tsx`、`AuthGate.tsx`、`index.css`、`tailwind.config.js`、`store.ts`（前80 行）。

**部分读取（结构扫描 + 关键段精读）**：`TimerPage.tsx`（2594 行，读了 1–520、1151–1290，以及全文件的函数/交互标记 grep 索引）、`CalendarPage.tsx`（1808 行，读了 480–660 + 全文件标记 grep）。

**明确未读**：`NotesPage.tsx`、`NotesGraphPage.tsx`、`NoteEditorPage.tsx`、`VaultPage.tsx`、`editor/` 目录、`api.ts`、`couchSync.ts`、`localData.ts`。
**这四个 Notes/Vault 页面在 `App.tsx` 中没有任何路由挂载**（grep 确认：只有它们互相 import，`App.tsx` 只 import 了 Timer/Todos/Diary/Stats/Tags/Calendar/Plans/Settings/Goals）。`/notes/*` 被重定向到 `/`。**即「笔记」功能目前事实上已下线但代码与 CSS 仍在**——`.prose-preview`、`.ittime-editor`、`.vault-page` 三大段 CSS（index.css 286–465 行，约 180 行）全部是死代码。这条不在我的授权范围内，但作为 IA 事实记录在此。

---

## 1. 现状结构（代码事实）

```
主导航（Layout.tsx，桌面侧栏分两组 / 移动底栏 5 格）
├─ 日常
│  ├─ /            工作台   → TimerPage
│  ├─ /time        时间     → SectionPage[日历 | 计划 | 日记]
│  └─ /tasks       事项     → SectionPage[待办 | 习惯]
├─ 回顾与整理
│  ├─ /insights    洞察     → StatsPage（无 tab）
│  └─ /system      体系     → SectionPage[标签与分类 | 设置]
└─ (侧栏底部独立) /settings  → 重定向到 /system?tab=settings

旧路由全部 <Navigate replace>：/todos /habits /calendar /plans /diary /stats /tags /settings /notes/*
```

`SectionPage` 把 tab 写进 `?tab=`（首个 tab 不写参数），用 `useSearchParams` 读回。这一层是健壮的（见§2.1）。

---

## 2. 现状问题诊断

###问题 1（严重）：「习惯」是一个**只读页**，但它挂在「事项」这个**动作域**下面

`GoalsPage.tsx` 全文 85 行，**没有任何 `<button>` 与 `onClick`**（grep `onClick|button` 零命中）。它只做两件事：渲染 `api.goals.list()` 的进度条、渲染 `api.todos.list({status:'done'})` 的完成记录。

也就是说：**用户被导航到「事项 → 习惯」，看到一个"当前周期"的进度条，但无法在这里打卡。** 打卡动作实际发生在两处：
- `TodosPage` 里 `goal.kind === 'activity'` 生成的待办项（点左侧圆圈 → `api.todos.toggle`）；
- `TimerPage` 快速开始里 `tag.trackType === 'count'` 的标签按钮（→ `store.quickCount`）。

而 `TodosPage` 顶部又把 `goal.kind === 'tracking'` 的进度条**重复渲染了一遍**（TodosPage.tsx 269–288 行），`TodosPage` 的说明文字还写着"完成记录会收进「习惯」页面的结果里"。

**后果**：一个「回顾型」内容被放在「执行型」导航下，用户带着"我要打卡"的预期点进去却什么都做不了，只能退回「待办」tab 找对应条目。三个页面（待办 / 习惯 / 标签）都在展示同一份goal 数据，但只有两处能打卡。**这是导航语义与页面能力不匹配**，属于 Nielsen「信息架构」与「匹配用户目标」双重违背。

### 问题 2（严重）：「设置」在导航上出现了两次，且其中一次是死胡同

- `Layout.tsx` 第 34 行：侧栏底部 `<NavLink to="/settings">设置</NavLink>` —— 独立于 5 个主入口的第6 个入口。
- 第 10 行：`/system` 的 label 是「体系」，tab 里第二项叫「设置」。

结果：侧栏同时有「体系」和「设置」两个可点项，都通向设置。而 `SettingsPage` 自己内部又有一个 tablist（`SettingsPage.tsx` 43 行）：`标签与分类 / 账户 / CouchDB 同步 / 数据迁移 / 常规`。

其中第一个 tab「标签与分类」的**全部内容就是一句"已合并到标签页面统一管理"+一个跳转到 `/tags` 的按钮**（SettingsPage.tsx 45–51 行）。于是用户在「设置」里点「标签与分类」，被告知"请去标签页"，点按钮跳到 `/system?tab=tags`——**也就是回到了「体系」的第一个 tab**。

这是一个 3 跳的绕路循环：`/system?tab=settings` → 点"标签与分类" → "去标签页管理" → `/tags` → 重定向 → `/system?tab=tags`。

### 问题 3（严重）：日记的**创建入口**和**阅读入口**分属两个一级域，且创建入口比阅读入口更隐蔽

- **阅读**：`/time?tab=diary` → DiaryPage → DiaryPanel，有筛选、搜索、时间线。
- **创建**：DiaryPanel 空状态里写着"在计时界面点击「📝 记日记」即可记录感悟和照片"（DiaryPanel.tsx 129 行）。也就是说**主路径是工作台的计时卡片**（`TimerPage` RunningTimer 的「记日记」按钮，1256–1262 行）或时间线条目上的图标（1413 行）。
- DiaryPanel 自己也有一个「✍️ 写日记」按钮（107–112 行），但它排在筛选/分类/搜索之后，在移动端会被挤到折行末尾。

`App.tsx` 154 行还保留着 `/notes/*` → `/` 的重定向，注释写"旧版笔记链接平滑回到计时页"——但笔记页早已无路由，重定向只是兜底。

**后果**：日记是"时间域"的产物，却在"工作台"里创建、在"时间"里阅读。用户对"我刚才写的东西去哪了"没有稳定预期。而 v0.4 产品文档把日记定位为记录行为，与计时强关联（这个定位是对的），问题只在**导航归属**和**入口可见性**。

### 问题 4（中）：标签放在「体系」下，语义模糊，且与设置重叠

「体系」这个词在产品里没有定义。实际内容是「标签与分类」+「设置」。这两件事的共性只是"都是配置"，但它们的**使用频次与心智模型完全不同**：
- 标签与分类：用户每天在快速开始时使用它，是**高频、视觉性、影响全局配色**的对象。
- 设置：低频、偶发、纯文本表单。

把它们放在同一个 tablist 里，用「体系」这个词作为父级，导致**高频对象被低频容器拖累**。同时 `SettingsPage` 里的「标签与分类」tab 又构成第2 个入口（见问题 2）。

从截图 `c2-tags-after.png` 也能看出：标签管理页的实际内容是"分类 + 标签 + 目标/习惯"三段，是一个**独立的工作台**，不是设置的子项。

### 问题 5（中）：`SectionPage` 的 tab 切换是**整页卸载重挂**，子页面状态全丢

```tsx
// SectionPage.tsx 51–53
<div key={active} className="motion-safe:animate-page-in">
  {render(active)}
</div>
```

`key={active}` 意味着切 tab 时 React 会**销毁旧页面组件、挂载新组件**，不是隐藏。因此：

- `/tasks` 下：切到「习惯」再切回「待办」，`TodosPage` 的全部局部状态归零——`statusView`（未完成/已完成）、`activityView`（当前周期/全部）、`filterCat`（分类筛选）、`oneTimeCollapsed`（一次性折叠）、`showQuickAdd` + `quickTitle` 草稿，**全部丢失**。
- `/time` 下：日历的 `currentDate` / `view`（月/周/4天）/ `calendarFilter` / `selectedCategoryKeys`，切到「计划」再切回，**日期跳回今天、视图回到月**。
- 切 tab 还会重跑子页面的 `useEffect` → 重新拉数据 → 白屏闪烁。`CalendarPage` 尤其重（外部日历订阅也要重拉）。

这直接违反「状态可见」和「用户控制（保持上下文）」。

### 问题 6（中）：`TodosPage` 的三个筛选维度是**局部 state + 无视觉锚点**，且刷新后丢失

`TodosPage` 有 `statusView`（未完成/已完成）、`activityView`（当前周期/全部）、`filterCat`（分类）三个筛选，全部 `useState`，全部不进 URL 也不持久化。用户在「已完成」里筛选了「工作」分类，刷新页面回到「未完成 / 当前周期 / 全部分类」。

同时这三个控件在视觉上无法区分层级：`statusView` 有 `role="tablist"` 语义（251–267 行），`activityView` 是两个圆角按钮（无 role，296–309 行），`filterCat` 是一个 `<select>`。用户看到的是"三个长得差不多的东西"。

### 问题 7（轻但影响信任）：两处 `<a href>` 硬跳转，与 SPA 路由冲突

- `StatsPage.tsx` 104 行：`<a href="/plans">去计划页安排 →</a>`
- `TimerPage.tsx` 443 行：`<a href="/tags">标签管理</a>`

这两处会触发**整页刷新**（不是客户端路由跳转）。用户会丢失应用状态、看到白屏、重新执行 `AuthGate` 的鉴权流程。在 Capacitor Android 上，整页刷新体验更差。

### 问题 8（轻）：`StatsPage` 空状态文案指向不存在的页面名

```tsx
// StatsPage.tsx 76
<p className="text-xs text-gray-400">去「打卡」页开始第一条记录吧</p>
```

"打卡"是**旧版导航名**（见 `c2-timer-after.png` 截图侧栏还是"打卡/待办/日记/习惯/统计/日历/计划/标签"8 项）。当前一级入口叫「工作台」。文案与现实不符。

---

## 3. 重构方案（两个备选）

### 方案 A：保留 5 域，改标签与依赖关系（**推荐**）

**改了什么**

| 项 | 现状 | 方案 A |
|---|---|---|
| 一级入口 | 5 个（工作台/时间/事项/洞察/体系） | **5 个（工作台/时间/事项/回顾/设置）**——只换两个名字 |
| `/time` tabs | 日历 / 计划 / 日记 | 不变 |
| `/tasks` tabs | 待办 / 习惯 | 不变，但**习惯页补上打卡能力**（见下） |
| `/insights` | 洞察（无 tab） | 改名「回顾」，吸收习惯页的"目标达成"卡片 |
| `/system` tabs | 标签与分类 / 设置 | **拆开**：`标签与分类` 升为一级入口；`设置` 独立 |
| 侧栏底部「设置」 | 与 `/system` 重复 | 删除（并入一级「设置」） |
| `SettingsPage` 内「标签与分类」tab | 绕路 3 跳 | **删除该 tab**，设置只剩 账户/同步/迁移/常规 |
| 习惯页 | 只读 | 增加"去打卡"跳转 + 连续天数 + 本周打卡热力格 |
| 日记创建入口 | 隐藏在计时卡片 | 保留计时入口，**日记 tab 内的「写日记」提升为 PageHeader 主操作** |

**为什么**

1. **改动面最小**：路由表不动，只调整 2 个一级 label + 拆分 `/system` 的 tab 挂载 + 删掉 1 个重复侧栏项 + 删掉 1 个死 tab。前端改动约 100 行。
2. **修掉问题 2/ 4 / 7**：设置不再是"体系"的子项，标签不再是设置的子项，两处绕路循环都消失。
3. **保持用户的空间记忆**：`/time` `/tasks` `/insights` 三个路径完全不变，旧书签不受影响。
4. **符合使用频次**：标签高频→ 一级；设置低频 → 一级但排在最后。

**用户会失去什么**

- 侧栏从5 项变 6 项（标签独立后）。**缓解**：移动端底栏仍保持 5 格（把「回顾」换成标签，或把设置收进「更多」——见 §5 断点策略）。
- 「体系」这个词消失，如果用户已经记住"标签在体系里"，需要一次重新学习。**缓解**：旧 `/system?tab=tags` 保持重定向到新位置。

---

### 方案 B：4 域 + 统一"今日"聚合（更激进）

**改了什么**

```
/            工作台（计时 + 今日待办 + 今日计划摘要，三合一)
/time        时间（日历 / 计划 / 日记）
/review      回顾（统计 / 目标与习惯）
/manage      管理（标签与分类 / 设置）
```

4 个一级入口。「洞察」与「习惯」合并为「回顾」——理由：两者都是**回看数据**而非执行动作，当前拆成两个一级入口浪费了宝贵的导航位。

**为什么**

- 4 项导航在移动端底栏是舒适的（4 格 = 每格 90px+，比现在 5 格的 72px 更易点）。
- 「回顾」内部天然是"统计趋势 + 目标达成"的组合，符合 v0.4 文档里"洞察产出"阶段的定位。
- 一级入口从 5 降到 4，是移动端可达性的直接改善。

**用户会失去什么**

- **损失明显**：习惯页从一级入口降为 tab，日常打卡路径变长（需 2 跳）。考虑到习惯打卡是高频行为，这是真实退化。
- 设置与标签合并进「管理」，又回到了问题 4 的老问题。
- 改动面比 A 大：`/habits`、`/stats` 需要新增重定向到 `/review?tab=...`。

**结论：不推荐。** 收益（底栏多 18px 触达面积）不足以抵消习惯打卡路径变长的代价。

---

## 4. 明确推荐：方案 A

**一句话理由**：**把"高频视觉对象（标签）"和"低频表单（设置）"从同一个容器里拆开，让 5 个一级入口各自语义完整，同时把"习惯"从只读页变成可执行页——改动最小、收益最大、不动任何路由路径。**

---

## 5. 推荐 IA 的最终形态

```
主导航（桌面侧栏 2 组 / 移动底栏 5 格）
├─ 日常
│  ├─ /                工作台        TimerPage
│  ├─ /time            时间          SectionPage[日历 | 计划 | 日记]
│  └─ /tasks           事项          SectionPage[待办 | 习惯]
├─ 回顾与整理
│  ├─ /tags            标签与分类    TagsPage          ← 从 /system 提升
│  ├─ /insights        回顾          StatsPage
│  └─ /settings        设置          SettingsPage      ← 从 /system 移出
```

### 路由迁移路径（旧路由继续可用）

```tsx
// App.tsx 替换片段
<Route path="/tags" element={<Navigate to="/tags" replace />} />        // 原地不动
<Route path="/system" element={<Navigate to="/tags" replace />} />      // 旧入口 → 标签
<Route path="/system?tab=settings" /> // 由下面的 splat 兜底
<Route path="/settings" element={<Navigate to="/settings" replace />} /> // 原地不动
<Route path="/insights" element={<StatsPage />} />                        // 原地不动
// 兜底：旧书签带 query 的情况
<Route path="/system/*" element={<Navigate to="/settings" replace />} />
```

**不变清单（Phase 3 必须保证零回归）**

| 旧路径 | 新目标 | 状态 |
|---|---|---|
| `/` | `/` | 不变 |
| `/time` `/time?tab=calendar|plans|diary` | 同 | 不变 |
| `/tasks` `/tasks?tab=todos|habits` | 同 | 不变 |
| `/insights` `/stats` | `/insights` | 不变 |
| `/tags` | `/tags` | 不变 |
| `/settings` | `/settings` | 不变 |
| `/system` | `/tags` | 重定向（新增） |
| `/system?tab=settings` | `/settings` | 重定向（新增） |
| `/system?tab=tags` | `/tags` | 重定向（新增） |
| `/todos` `/habits` `/calendar` `/plans` `/diary` | 现有 `?tab=` 重定向 | 不变 |
| `/notes/*` | `/` | 保持现状（笔记功能事实上已下线） |

### 移动端底栏（5 格，不能加到 6 格）

方案 A 有一级入口从 5 变 6，移动端必须取舍。**建议底栏保持 5 格：**

```
工作台 | 时间 | 事项 | 回顾 | 标签
```

「设置」在移动端**不占底栏位**，改为：
1. 桌面侧栏保留（≥1024px）；
2. 移动端从「回顾」页/任意页的 PageHeader 右上角溢出菜单进入；
3. 或者：标签页 PageHeader 的 `⋯` 菜单里放「设置」入口。

理由：设置是**配置项**，不是每日动作，不该和"工作台"抢同一个 72px 的位置。

---

## 6. 需要 team-lead 决策的开放问题

1. **「回顾」这个名字是否接受？**备选：洞察（保留原名，改动更小，但"洞察"偏数据、"回顾"偏行动，而习惯页是行动）。我倾向保留「洞察」以降低改动面，**把习惯的"去打卡"能力补上就足够**，不必改名。
2. **侧栏第6 项的空间**。如果坚持视觉一致，可把「设置」做成侧栏底部的文字链接（现状就是这样），只是不再与「体系」并列成两个语义冲突的项——即：**删掉「体系」这个一级 label，直接把标签和设置都放侧栏，标签归入「日常」组、设置留在底部**。这是我更倾向的最小改动版本。
3. **`TodosPage` 顶部那排 tracking 进度条是否保留**。它与习惯页重复。倾向：删掉，改为一行"本周目标 3/5 → 查看"，点击跳习惯tab。