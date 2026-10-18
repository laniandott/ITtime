# ITtime Phase 3-B 规范符合性验收清单

> **用途**：Phase 3-B 六个任务实现完成后，由 ux 逐条核对实现是否落在规范上。
> **用法**：每条独立判定，填 ✅ / ❌ / `N/A（理由）`。**🔴 = 一票否决项**，任一 ❌ 即不通过。
> **出处**精确到文档小节，便于回溯；不引入规范外的新要求。
> **三份主规范**：`INTERACTION_SPEC.md`（交互流程）、`A11Y_RESPONSE.md`（无障碍/响应式）、`EMPTY_LOADING_ERROR.md`（空/加载/错误态）。
> **两份配套规范**（视觉已产出，验收时对照）：`MOTION_SPEC.md`（L0–L4 动效分层 + reduce 处置）、`TOKENS_PLAN.md`（token 落地）。
> **关联文档**：`IA_REVIEW.md`（信息架构）。

## 0. 判定方法与工具

| 手段 | 对应条目 |
|---|---|
| `grep` 静态检查 | aria-live 挂载方式、原生弹窗残留、`<a href>`、文案禁语 |
| DevTools 网络限速（Slow 3G） | 全部 loading / empty 区分条目 |
| DevTools 设备模式量尺寸 | 全部触达条目 |
| 纯键盘走一遍（不碰鼠标） | GoalsPage 打卡、拖拽排序、Tablist、弹层焦点 |
| 读屏抽查（NVDA/VoiceOver） | 播报文本、live region 时机 |
| 断网/断开后端 | 错误态与重试 |
| 系统设置开「减弱动态效果」 | K 组全部动效降级条目 |
| 时长对照 `MOTION_SPEC.md §5 逐场景映射表` | K 组全部时长条目 |

**当前一票否决项共 27 条**（A 组 4 / B 组 6 / C 组 6 / D 组 2 / E 组 3 / F 组 3 / K 组 3；G/H/I 组无否决项）。

---

## A. 任务 1：aria-live 永久挂载 + 全局 announce 工具

出处：`A11Y_RESPONSE.md §2.2`、`INTERACTION_SPEC.md §1.3 / §2.1 / §2.5 / §3.1`

- [ ] 🔴 A1 App 层挂两个**永久存在**的 live region：`role="status" aria-live="polite"` + `role="alert" aria-live="assertive"`，均 `aria-atomic="true"` + `sr-only`。判定：DevTools 搜 `aria-live`，节点在 App 首次渲染即存在，**不是** `{msg && <div role="status">}` 式条件渲染
- [ ] 🔴 A2 全局 `announce(msg, tone)` 工具，**播报前先清空 textContent 再赋值**（否则相同文本不重播）。判定：连续两次相同操作，读屏两次都有播报
- [ ] 🔴 A3 **assertive 同一时刻只有一个**在播。判定：代码中不存在两个并发 assertive 播报路径，错误类播报统一走同一容器
- [ ] 🔴 A4 计时大时钟**不得**加 `aria-live`；数字包 `aria-hidden="true"`，另设 `sr-only` + `role="timer"` 每 60s 更新 `已计时 1 小时 24 分`。判定：grep `RunningTimer` 无 aria-live，存在 `role="timer"`
- [ ] A5 事件表 12 条逐条落地，播报文本与规范表一致：计时启动/停止/全部停止、次数打卡、待办完成/恢复/删除、习惯连续天数 → polite；计时失败、保存失败 → assertive（§2.2 表格）
- [ ] A6 筛选变化播报**数量**而非"筛选已应用"（`显示 12 项活动`）（`INTERACTION_SPEC §2.5`）
- [ ] A7 `SettingsPage` 两处条件渲染的 `role="status"` 修正为永久挂载或改走 announce（迁移提示 `:51`、保存成功 `:146`；对照 `:84` 的永久挂载写法是对的）

## B. 任务 2：空 / 加载 / 错误状态

出处：`EMPTY_LOADING_ERROR.md §2 / §3 / §4 / §5 / §6`

- [ ] 🔴 B1 基建三件落地：`useLoadState<T>()` hook + `<AsyncSection>` 组件 + Toast（§4.1）。判定：文件存在于 `apps/web/src/hooks|components`，四态分发由 AsyncSection 承担而非每页手写 4 个分支
- [ ] 🔴 B2 **StatsPage / TodosPage / GoalsPage 三页引入 loading，且加载态与空态不同形**（§5 三行 P0 + §6）。判定：Slow 3G 下三页只见骨架，不出现 `暂无` / `0s` 文案
- [ ] 🔴 B3 loading 与 empty **互斥**（§2.1 状态机 `loading | refreshing | ready | empty | error`）。判定：不存在同时满足两个状态的分支；`store.loading` 被真实消费（此前定义了无人用）
- [ ] 🔴 B4 断网打开任一数据页 → E-Block 卡片（琥珀色 + 可展开原始错误 + 「重试」按钮），**不出现任何 `alert()`**（§2.2 / §6）
- [ ] 🔴 B5 错误**不吞数据**：`refreshing` 失败保留旧内容 + 局部 spinner，内容不消失（§4.3 / §6）
- [ ] B6 恢复后点「重试」→ 正常加载，**无需刷新页面**（§6）
- [ ] B7 骨架统一用 `.skeleton`（`index.css 245–256` 已定义但零使用）或局部 spinner；无纯文字「加载中...」（§6 末行）
- [ ] B8 三种空态文案区分（`INTERACTION_SPEC §2.5`）：真无数据 `还没有活动，点右上角新建` / 筛选无结果 `没有符合当前筛选的活动` + 清除按钮 / 搜索无结果 `未找到匹配「xyz」的活动`
- [ ] B9 空态都给下一步动作（CTA 按钮），不让用户猜（§4.2 文案规范）
- [ ] 🔴 B10 文案**不含易变导航名**：全文 grep `打卡页` `待办页` 为 0；`StatsPage` 原 76 行「去「打卡」页」改为「去「工作台」」并补真实按钮（`INTERACTION_SPEC §5.2`）
- [ ] B11 `StatsPage` 两处 `<a href>` → `<Link>`；判定：全项目 grep `<a href` 为 0（SPA 内不出现硬跳转）
- [ ] B12 `StatsPage` 周期切换**不触发全页 loading**，仅局部 `refreshing`（§5 StatsPage 行）
- [ ] B13 `TodosPage` 5 个模块各自骨架；空模块不占 min-height（§5 TodosPage 行）
- [ ] B14 `GoalsPage` 裸红字 → E-Block；空态改 E4 + CTA（§5 GoalsPage 行）
- [ ] B15 `DiaryPanel` 的「未找到匹配的日记」保持不回归（§3.8 已是正确范式）

## C. 任务 3：GoalsPage 可执行化

出处：`INTERACTION_SPEC.md §3.1–§3.4`、`EMPTY_LOADING_ERROR.md §3.3`

- [ ] 🔴 C1 `tracking + count` 目标有大号圆形打卡按钮（直径 ≥56px，显示 `3 / 8次`），`aria-label="给{标题}打卡，当前 3/8 次"`；点击后播报 `已打卡：每日读书，4/8 次`（§3.1）。判定：键盘可聚焦、回车可触发、读屏有播报
- [ ] 🔴 C2 **零 Server API 改动**（§3.1 风险标注 + 授权边界）。判定：diff 不含 `apps/server`；若需打卡走降级方案——跳工作台并预选标签 `Link to="/?tag={tagId}"`，TimerPage 读 `?tag=` 自动定位；`count` 型验证 `quickCount` 可复用
- [ ] C3 `tracking + time` 型显示 `已累计 128 / 200 分钟` + 引导按钮 `去工作台计时`（§3.1）
- [ ] C4 `activity` 型列表项 + 圆圈勾选，复用 TodosPage 的圆圈组件与交互（§3.1）
- [ ] 🔴 C5 连续天数徽章三种态齐全：`🔥 连续 5 天` / `⏳ 今天还没打卡` / `—` 无历史；≥7 天用 🔥，≥30 天加 ⚡（§3.2）
- [ ] 🔴 C6 徽章**不能只靠颜色**：文字 + 图标 + `aria-label="已连续 5 天达标"`（§3.2）
- [ ] C7 进度条现有 `role="progressbar"` + `aria-valuenow/max/min` **保留不回归**（§3.3 标注为全项目 a11y 最佳实践）
- [ ] C8 达标态加 `ring-1 ring-emerald-500/40` + 左侧 `✓` 图标（**不只** `text-emerald-600` 数字变色）；数字加 `tabular-nums`（§3.3）
- [ ] 🔴 C9 拖拽排序改可聚焦按钮：`aria-label="拖动排序：{标题}，当前第 {i+1} / 共 {n} 项"`，聚焦后 `↑/↓` 移动、`Home/End` 首尾、`Enter` 拾取，移动后播报 `{标题} 已移动到第 3 位，共 5 项`（§3.4）。判定：**纯键盘可完成排序**
- [ ] 🔴 C10 触屏兜底：`GripVertical` 点击 → `ModalShell` 内列表 `上移 / 下移 / 移到最前 / 移到最后`，不依赖 HTML5 拖拽（§3.4）
- [ ] C11 `TagsPage` 标签列表、`TimerPage` 快速开始两处拖拽同理改造（§3.4 末句：「这是必须项，不是可选优化」）

## D. 任务 4：TodosPage 去重 + 筛选 URL 化

出处：`INTERACTION_SPEC.md §2.5 / §2.6`

- [ ] 🔴 D1 删除顶部重复的 tracking 进度条（269–288 行），替换为一行摘要 `本周目标 3/5 · 查看 →`（`Link to="/tasks?tab=habits"`）。判定：同一份目标数据只在习惯页一处可交互，不再两处重复渲染
- [ ] 🔴 D2 三个筛选值写入 URL：`?view=` `?cycle=` `?cat=`（`useSearchParams`，与 SectionPage 同一模式）。判定：改筛选 URL 随之变化；刷新与分享链接可恢复
- [ ] D3 筛选层级落地：`statusView` 为主 tab 移到 PageHeader 下方；`activityView` 降为次级文字按钮；`filterCat` 收进「筛选」按钮触发的 popover（§2.5）
- [ ] D4 新增搜索框，范围 = 标题 + 描述 + 标签名 + 分类名；`role="searchbox"` + `aria-label="搜索活动"`（§2.5）
- [ ] D5 任一筛选生效时，筛选行右侧显示 `清除筛选 (N)`，N 为生效条件数（§2.5）
- [ ] D6 三种空态文案区分（同 B8，TodosPage 场景）

## E. 任务 5：原生弹窗清除

出处：`INTERACTION_SPEC.md §8 Top5 #1 / §9 R6`、`EMPTY_LOADING_ERROR.md §5 / §6`、`A11Y_RESPONSE.md §1.4`

- [ ] 🔴 E1 全文无 `window.alert` / `window.confirm` / `window.prompt`（含裸 `alert(` 调用）。判定：`grep -rn "window\.\(alert\|confirm\|prompt\)\|[^.]alert(" apps/web/src` 为 0
- [ ] 🔴 E2 替代方案 = `ModalShell` + toast + **撤销**（删除待办填原因这类高频路径）（§8 #1）
- [ ] 🔴 E3 `ModalShell` 统一规格：`role="dialog"` + `aria-modal="true"` + 焦点陷阱（Tab 循环不出框）+ `Esc` 关闭 + **关闭后焦点还原到触发元素**（A11Y §1.4）
- [ ] E4 高频 6 个优先覆盖：Todo 勾选/编辑、习惯确认、删除确认、日历新建（§9 R6）；低频弹层可暂留但需在交付说明里登记
- [ ] E5 弹层移动端统一底部抽屉（A11Y §4.2）

## F. 任务 6：触达尺寸修复

出处：`A11Y_RESPONSE.md §3.1–§3.3`

- [ ] 🔴 F1 移动端所有可点击 ≥44×44px（§3.2，WCAG 2.5.5）。判定：设备模式逐个量
- [ ] 🔴 F2 小按钮用 `.tap-expand` 伪元素扩到 44px 热区、**视觉尺寸不变**（§3.2 代码块）：`TodosPage` 5 处 `h-7 w-7`、`TagsPage` 折叠 `h-6 w-6`、`CalendarPage` 关闭 `h-8 w-8`
- [ ] 🔴 F3 **必须真实放大**（伪元素不够，会误触相邻项）：`ColorPicker` 色块槽位 44×44（视觉圆点 24px、`gap` 8px）、`SectionPage` tab（约 30px 高且是主导航）、移动端完成圆圈（§3.2 末段）
- [ ] F4 相邻独立目标间距 ≥8px（§3.2，WCAG 2.5.8）
- [ ] F5 主要按钮 `.btn-primary` 40 → 44px（`min-height: 2.75rem`）（§3.2）
- [ ] F6 移动端输入框 `text-base`（16px），防 iOS 聚焦自动放大页面（§3.3）
- [ ] F7 `PageHeader` 加 `pt-[env(safe-area-inset-top)]`（刘海屏）（§3.3）
- [ ] F8 吸底元素（新建按钮、toast、命令面板）`bottom` ≥ 4.35rem 底栏高 + safe-area（§3.3）
- [ ] F9 按钮加 `touch-action: manipulation`，去掉双击 tap 缩放延迟（§3.3）
- [ ] F10 横向滚动容器（日历工具栏、目标条、日记切换）隐藏滚动条或加渐隐遮罩（§3.3）
- [ ] F11 软键盘遮挡：输入框聚焦时 `scrollIntoView({block:'center'})`（§3.3，工作量大可延后，需登记）

## K. 动效与减弱动效（任务 2 的骨架/toast/错误条 + 全局约定）

出处：`MOTION_SPEC.md §0.3 / §5 / §6`、`A11Y_RESPONSE.md §5`、`EMPTY_LOADING_ERROR.md §4.3`

- [ ] 🔴 K1 新增动效**一律带 `motion-safe:` 前缀**（`page-in` / `list-in` / `modal-in` 等），不允许裸 `animate-*`（A11Y §5.3）
- [ ] 🔴 K2 骨架屏：`.skeleton` 微光循环 **1200ms**（现为 1.5s，按 MOTION_SPEC §5.2 改）；容器 `role="status" aria-busy="true" aria-label="正在加载"` 三缺一不可（MOTION_SPEC §5.2 代码片段）
- [ ] 🔴 K3 **reduce 下加载 spinner 必须仍在转**：`animate-spin` 不加 `motion-safe:`，且 reduce 块内需有 `.animate-spin { animation-duration: 3s !important }` 例外——否则被全局 `.01ms + iteration-count:1` 冻住（A11Y §5.2/§5.3）。**注意 MOTION_SPEC §6.2 的合并规则目前会杀死 spinner，与它自己 §6.3 的意图矛盾，需视觉补例外行**
- [ ] K4 骨架 → 内容首次 180ms（L1）；`refreshing` 仅局部 spinner 淡入 120ms、**无位移动画**；错误 banner 200ms（L2）；toast 260ms 入 / 180ms 出（L2，出入不同 easing）；列表项 260ms + 40ms/项错峰（EMPTY §4.3 + MOTION_SPEC §5）
- [ ] K5 打卡数字翻倍 240ms（INTERACTION §3.1）= L4 数字滚动的短版；环形进度 900ms（L4）；柱状图生长 700ms（L4）——均在"活"页面（Timer/Insights/Calendar/Goals）才挂（MOTION_SPEC §2 L4）
- [ ] K6 ⌘K 命令面板：L3 语义 / L2 时长 **200ms**、`translateY(-8px)→0`、`motion-safe:animate-cmdk-in`（MOTION_SPEC §5.1，UX 原裁定）
- [ ] K7 reduce 下全局规则补齐 `animation-delay: 0ms !important` + `transition-delay: 0ms !important`（MOTION_SPEC §6.2 洞 1/洞 2，**必改**）——否则错峰列表在 reduce 下逐项延迟闪现
- [ ] K8 reduce 下极光背景关闭并 `filter: blur(40px)` 降 GPU；`.timer-progress` / `.habit-progress` 进度条保留 200ms（信息传达）（A11Y §5.3）
- [ ] K9 Recharts 动画走 `useReducedMotion` hook 降级，**不能只靠 CSS**（CSS 够不到 JS 动画）（MOTION_SPEC §6.4）
- [ ] K10 待办条目移出、打卡 scale、toast 位移在 reduce 下关闭或改淡入（A11Y §5.2 末四行）
- [ ] K11 任何位移不超过视口 5%；一个动画不同时干两件事（MOTION_SPEC P2/P3）

## G. 回归项：Phase 3-A 已落地行为不能被 3-B 破坏


出处：`IA_REVIEW.md` + 本轮复审结论（已同步 fe-shell）

- [ ] G1 `SectionPage` 仍用 `display:none` 切面板，**不得改回条件渲染**（否则筛选/草稿/日期状态保持回归）
- [ ] G2 SectionPage 的 roving tabindex + `←/→/Home/End` + 焦点跟随仍工作
- [ ] G3 五个一级入口（`/` `/time` `/tasks` `/insights` `/tags` `/settings`）与旧路由全量 `replace` 重定向仍生效（`/todos /habits /calendar /plans /diary /stats /system /system/* /notes/*`）
- [ ] G4 `<main key={location.pathname}>` 不变（同路径切 tab 不重挂载）
- [ ] G5 移动端 5 项底栏、桌面 5+设置结构不变（若按 P1 建议调整设置/退出登录入口，需在交付说明中记录改动位置）
- [ ] G6 若修 P1（移动端无设置/退出登录）：设置入口在移动端可达且触达 ≥44px；退出登录在桌面移动均可到达
- [ ] 🔴 G7 `App.tsx` 两个 `<SectionPage>` 必须带 `label="时间"` / `label="事项"`（67eabe5 加入）。**曾因并行改 App.tsx 被静默丢弃**——该属性缺失时 tsc 与测试均通过、只会退回默认「分区」，属无声回归。判定：`grep -n 'label="时间"\|label="事项"' apps/web/src/App.tsx` 各命中 1 次
- [ ] G8 `announce.ts` 两条导出存在且语义正确：`announce()` 走 polite、`announceUrgent()` 走 assertive；页面不得自建第三个 live region

## H. 前瞻占位：Phase 3-C 图表第二区分通道（team-lead 已定为硬约束）

> 依据本轮 deuteranopia 实测：`viz-4 ↔ viz-5` 模拟色相差仅 5°，正常视觉下 `viz-1 ↔ viz-2` 也只差 11°。**任何图表不得单靠颜色区分。**
> 以下条目**不在 Phase 3-B 验收范围**，列出以免 3-C 时漏项。色值进度：视觉的 `TOKENS_PLAN.md` 已规划 6 个 viz 基色进 tailwind + `index.css :root`，但 **`-ink` / `-on-dark` 三档与 `--tag-*` 映射尚未纳入该计划**（已反馈视觉）；未落地前 H8 记 N/A。

- [ ] H1 日历 4 类型加形状 + 文字图标（⏱ 计时 / ▦ 计划 / ✓ 活动 / ↗ 外部），保留色点；条目 `aria-label` 含类型词（A11Y §2.3、`INTERACTION_SPEC §4.3`）
- [ ] H2 `StatsPage` 排行条改用 `row.color` 与色点一致（修掉当前不一致 bug）+ 前 3 名加文本徽章（`INTERACTION_SPEC §5.2`）
- [ ] H3 排行条可聚焦 + `aria-label="{name}，{duration}，占最高项的 {percent}%"`（`INTERACTION_SPEC §5.2`）
- [ ] H4 优先级徽标（当前用红圆/黄圆 emoji 表示）补文字或 `sr-only`；普通项 `aria-label` 写明「优先级：普通」（A11Y §2.3）
- [ ] H5 达标态加 ✓ + `sr-only「已达标」`（A11Y §2.3）
- [ ] H6 覆盖率 `0%` 与「无数据」区分：`尚未开始` vs `0%（未开始）`（A11Y §2.3）
- [ ] H7 日记时间线同色标签用内容摘要首句区分条目（A11Y §2.3）
- [ ] H8 图表色用 `viz-*` token，暗色换 `-on-dark` 档；标签 `color` 字段存 token 名而非裸 hex（`INTERACTION_SPEC §6.2`）
- [ ] H9 相邻撞色校验：同分类内色相间隔 <25° 时保存后非阻断提示（`INTERACTION_SPEC §6.2`）

## I. 明确不在本期范围（防止验收时 scope creep）

出处：`INTERACTION_SPEC.md §8 延后项`

- [ ] I1 批量操作、语法化快速添加、待办列表虚拟滚动
- [ ] I2 **图表筛选联动**（点击排行条跳日历过滤）——`§5.2` 写了「新增」但 `§8` 延后项明确列入，**以 §8 为准，本期不做**
- [ ] I3 日历「新建记录」吸底 FAB——`§4.2` 提了但 `§8` 延项列入，**以 §8 为准，本期不做**
- [ ] I4 排名条 `role="listitem"` 语义化
- [ ] I5 以上各项若实现团队主动做了，按加分记录，不按扣分项验收

## J. 验收记录

| 组 | 条目数 | 🔴 数 | 结果 | 备注 |
|---|---|---|---|---|
| A aria-live | 7 | 4 | | |
| B 空加载错误 | 15 | 6 | | |
| C GoalsPage | 11 | 6 | | |
| D TodosPage | 6 | 2 | | |
| E 原生弹窗 | 5 | 3 | | |
| F 触达尺寸 | 11 | 3 | | |
| K 动效/reduce | 11 | 3 | | |
| G 回归 | 6 | 0 | | |
| **合计（A–G + K）** | **72** | **27** | | |

> 验收人：ux ｜ 验收对象：Phase 3-B 改动清单（由 team-lead 提供）
> 任一族 🔴 ❌ → 该任务不通过，返修后复验该族即可，无需全量重跑。
