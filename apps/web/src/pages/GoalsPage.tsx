import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Flame, GripVertical, Hourglass, Target } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../components/PageHeader'
import { ErrorBlockCard, RefreshErrorBanner } from '../components/StateViews'
import { announce, announceUrgent } from '../announce'
import type { Goal, Todo } from '../types'

const periods: Record<string, string> = { workday: '工作日', daily: '每日', weekly: '每周', monthly: '每月', once: '一次性', custom: '自定义周期' }
const weekDayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 四态状态机（与 StatsPage 同构，EMPTY_LOADING_ERROR.md §2.1）：
// loading 与 empty 严格互斥——旧版 goals 初始就是 []，用户会先看到一句错误的「还没有目标」再被替换。
// data 为 null = 从未成功加载（整页 E-Block）；非 null = 有旧数据（顶部 E-Banner，内容保留）。
type GoalsData = { goals: Goal[]; completed: Todo[] }
type GoalsState =
  | { kind: 'loading' }
  | { kind: 'refreshing'; data: GoalsData }
  | { kind: 'ready'; data: GoalsData }
  | { kind: 'error'; error: string; data: GoalsData | null }

const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

/**
 * 连续达标（streak）：只对 activity 目标有意义——只有它们会按周期生成待办（localData.ts:180），
 * 每条完成记录的 completedAt 就是「某期已达标」的证据，不依赖任何新 API。
 * tracking（计时/计次）目标的进度来自 timer entries，没有周期性 todo，算不出连续，返回 null。
 * 连续的单位跟周期走：每日/工作日按天倒推（工作日跳过周末），每周按周、每月按月。
 */
function goalStreak(goal: Goal, doneTodos: Todo[]): { count: number; unit: '天' | '周' | '月'; currentPeriodDone: boolean } | null {
  if (goal.kind !== 'activity' || goal.period === 'once' || goal.period === 'custom') return null
  const days = new Set<string>()
  for (const todo of doneTodos) {
    if (todo.goalId !== goal.id || !todo.completedAt) continue
    days.add(keyOf(new Date(todo.completedAt)))
  }
  const today = new Date(); today.setHours(0, 0, 0, 0)

  if (goal.period === 'daily' || goal.period === 'workday') {
    const cursor = new Date(today)
    // 周末不为工作日目标生成待办：倒推时光标先落在最近的工作日，周末空档不算中断
    if (goal.period === 'workday') while (isWeekend(cursor)) cursor.setDate(cursor.getDate() - 1)
    const currentPeriodDone = days.has(keyOf(cursor))
    // 今天/本期还没打卡不算断签：从上一期继续数，保住之前的纪录
    if (!currentPeriodDone) cursor.setDate(cursor.getDate() - 1)
    if (goal.period === 'workday') while (isWeekend(cursor)) cursor.setDate(cursor.getDate() - 1)
    let count = 0
    while (days.has(keyOf(cursor))) {
      count++
      cursor.setDate(cursor.getDate() - 1)
      if (goal.period === 'workday') while (isWeekend(cursor)) cursor.setDate(cursor.getDate() - 1)
    }
    return { count, unit: '天', currentPeriodDone }
  }

  if (goal.period === 'weekly') {
    // 周窗口与 localData 的计算保持同一边界：以 weekDay（缺省周一）为一周起点
    const weekDay = goal.weekDay ?? 1
    const weekStartOf = (d: Date) => {
      const c = new Date(d); c.setHours(0, 0, 0, 0)
      c.setDate(c.getDate() - ((c.getDay() - weekDay + 7) % 7))
      return c
    }
    const weeks = new Set<string>()
    days.forEach(day => {
      const [y, m, d] = day.split('-').map(Number)
      weeks.add(keyOf(weekStartOf(new Date(y, m, d))))
    })
    let cursor = weekStartOf(today)
    const currentPeriodDone = weeks.has(keyOf(cursor))
    if (!currentPeriodDone) cursor.setDate(cursor.getDate() - 7)
    let count = 0
    while (weeks.has(keyOf(cursor))) { count++; cursor.setDate(cursor.getDate() - 7) }
    return { count, unit: '周', currentPeriodDone }
  }

  // monthly：游标固定在每月 1 号，避开 setMonth 的月末溢出（1/31 setMonth(1) → 3/3）
  const months = new Set<string>()
  days.forEach(day => { const [y, m] = day.split('-').map(Number); months.add(`${y}-${m}`) })
  const cursor = new Date(today.getFullYear(), today.getMonth(), 1)
  const currentPeriodDone = months.has(`${cursor.getFullYear()}-${cursor.getMonth()}`)
  if (!currentPeriodDone) cursor.setMonth(cursor.getMonth() - 1)
  let count = 0
  while (months.has(`${cursor.getFullYear()}-${cursor.getMonth()}`)) { count++; cursor.setMonth(cursor.getMonth() - 1) }
  return { count, unit: '月', currentPeriodDone }
}

function displayTitleOf(goal: Goal) {
  // 旧数据把「每日{标签名}」写死进了 title；标签改名后标题就对不上了，这里动态还原
  const legacyDefaultTitle = goal.kind === 'activity' && goal.tag && goal.title === `每日${goal.tag.name}`
  if (!legacyDefaultTitle) return goal.title
  const prefix = goal.period === 'once' ? '一次性' : goal.period === 'workday' ? '工作日' : goal.period === 'weekly' ? `每${weekDayNames[goal.weekDay ?? 0]}` : goal.period === 'monthly' ? '每月' : '每日'
  return `${prefix}${goal.tag?.name ?? ''}`
}

/** 加载骨架：2 段各 3 行，宽度贴近真实卡片（手柄块 + 标题 + 进度条）。三件套 + .skeleton 语义类。 */
function GoalsSkeleton() {
  return (
    <div className="habits-layout items-stretch" role="status" aria-busy="true" aria-label="正在加载习惯结果">
      <section className="page-card p-4 sm:p-5" aria-hidden="true">
        <h2 className="mb-3 text-sm font-semibold text-gray-500">当前周期</h2>
        <div className="space-y-6">
          {[0, 1, 2].map(row => (
            <div key={row} className="flex items-start gap-3">
              <span className="skeleton mt-1 h-11 w-11 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="habits-history page-card min-w-0 max-h-[calc(100vh-10rem)] overflow-y-auto p-4 sm:p-5" aria-hidden="true">
        <h2 className="mb-3 text-sm font-semibold text-gray-500">已完成活动</h2>
        <div className="space-y-5">
          {[0, 1, 2].map(row => <div key={row} className="skeleton h-3.5 w-3/5 rounded" />)}
        </div>
      </section>
    </div>
  )
}

/** HTML5 拖拽在触屏上不可用且会劫持滚动（A11Y_RESPONSE §2.5）：只在 hover + 精确指针的环境启用
 *  draggable；触屏设备改用卡片里的 ↑↓ 按钮完成同样的排序，能力不缺席、只是换形态。 */
function useCanDrag() {
  const query = '(hover: hover) and (pointer: fine)'
  const [canDrag, setCanDrag] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setCanDrag(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return canDrag
}

export default function GoalsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [state, setState] = useState<GoalsState>({ kind: 'loading' })
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const seqRef = useRef(0)
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // 连续天数变化的播报基准：上一次成功加载时每个目标的 streak；首次加载只记基准、不播报
  const prevStreaksRef = useRef<Map<string, number>>(new Map())
  const streaksAnnouncedRef = useRef(false)
  const canDrag = useCanDrag()

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    setState(prev => {
      if (prev.kind === 'loading') return { kind: 'loading' }
      return prev.data ? { kind: 'refreshing', data: prev.data } : { kind: 'loading' }
    })
    try {
      const [goals, done] = await Promise.all([api.goals.list(), api.todos.list({ status: 'done' })])
      if (seq !== seqRef.current) return
      setState({ kind: 'ready', data: { goals, completed: done } })
      // 连续天数变化播报（分级表 §2.2「已连续 5 天达标」）：只在变长时播；
      // 用户在待办页打卡后，这里会随 ittime-data-changed 刷新并捕捉到变化
      if (streaksAnnouncedRef.current) {
        for (const goal of goals) {
          const streak = goalStreak(goal, done)
          if (!streak || streak.count === 0) continue
          if (streak.count > (prevStreaksRef.current.get(goal.id) ?? 0)) {
            announce(`已连续 ${streak.count} ${streak.unit}达标`)
          }
        }
      }
      prevStreaksRef.current = new Map(goals.map(goal => [goal.id, goalStreak(goal, done)?.count ?? 0]))
      streaksAnnouncedRef.current = true
    } catch (e) {
      if (seq !== seqRef.current) return
      const message = e instanceof Error ? e.message : String(e)
      // 分区页会把隐藏 tab 的面板也挂载出来（display:none）——隐藏页面的加载失败不该打扰
      // 当前页的用户，等他切到本页时会看到 E-Banner。offsetParent 为 null 即当前不可见。
      if (rootRef.current && rootRef.current.offsetParent !== null) announceUrgent(`加载失败：${message}`)
      setState(prev => ({ kind: 'error', error: message, data: prev.kind === 'loading' || !prev.data ? null : prev.data }))
    }
  }, [])

  useEffect(() => {
    void load()
    window.addEventListener('ittime-data-changed', load)
    return () => window.removeEventListener('ittime-data-changed', load)
  }, [load])

  // 整页错误时把焦点移到「重新加载」；display:none 下 focus() 是 no-op，不会抢隐藏面板的焦点
  useEffect(() => {
    if (state.kind === 'error' && !state.data) retryButtonRef.current?.focus()
  }, [state])

  const retry = () => void load()

  // 排序（拖拽 / 键盘 ↑↓ Home End / 触屏按钮共用一条路径）：乐观更新本地顺序，再持久化
  const moveGoal = async (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return
    const goals = state.kind === 'loading' ? [] : state.data?.goals ?? []
    const from = goals.findIndex(goal => goal.id === sourceId)
    const to = goals.findIndex(goal => goal.id === targetId)
    if (from < 0 || to < 0) return
    const reordered = [...goals]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const name = displayTitleOf(moved)
    setDraggedId(null)
    setDropTargetId(null)
    setState(prev => {
      if (prev.kind === 'loading' || !prev.data) return prev
      if (prev.kind === 'error') return { kind: 'error', error: prev.error, data: { ...prev.data, goals: reordered } }
      return { kind: prev.kind, data: { ...prev.data, goals: reordered } }
    })
    try {
      await Promise.all(reordered.map((goal, index) => api.goals.update(goal.id, { sortOrder: index * 10 })))
      await load()
      // 键盘/触屏用户听得到「移到了第几位」（A11Y_RESPONSE §2.5 的播报要求）
      announce(`${name} 已移到第 ${to + 1} 位，共 ${reordered.length} 项`)
    } catch (e) {
      const message = e instanceof Error ? e.message : '保存习惯顺序失败'
      announceUrgent(`保存习惯顺序失败：${message}`)
      await load()
      // load 成功会把页面拉回 ready 并清掉错误；这里补一条错误状态，视觉用户也要看到「移动失败」
      setState(prev => prev.kind === 'loading' || !prev.data ? prev : { kind: 'error', error: message, data: prev.data })
    }
  }

  const data = state.kind === 'loading' ? null : state.data
  const goals = data?.goals ?? []
  const completed = data?.completed ?? []

  return <div className="workspace-page habits-page space-y-5" ref={rootRef}>
    {!embedded && <PageHeader title="习惯结果" description="周期性目标与完成记录" actions={<Link to="/settings" className="text-sm text-brand">管理标签规则</Link>} />}
    {state.kind === 'loading' ? (
      <GoalsSkeleton />
    ) : state.kind === 'error' && !state.data ? (
      <ErrorBlockCard title="没能加载习惯结果" hint="可能是网络或本地数据库的问题，请稍后重试。" error={state.error} onRetry={retry} buttonRef={retryButtonRef} />
    ) : (
      <div className="space-y-4">
        {/* E-Banner：有旧数据时的刷新失败；关闭 = 回到 ready，下次失败会再次出现 */}
        {state.kind === 'error' && state.data && (
          <RefreshErrorBanner error={state.error} onRetry={retry} onDismiss={() => setState({ kind: 'ready', data: state.data! })} />
        )}
        <div className="habits-layout items-stretch" aria-busy={state.kind === 'refreshing' ? 'true' : undefined}>
          <section className="page-card p-4 sm:p-5" aria-label="当前周期目标">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-500">当前周期</h2>
              {state.kind === 'refreshing' && <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand dark:border-gray-600 dark:border-t-brand-400" aria-hidden="true" />}
            </div>
            {goals.map((goal, index) => {
              const current = goal.current ?? 0
              const unit = goal.kind === 'activity' ? '项' : goal.type === 'count' ? '次' : '分钟'
              const percent = Math.min(100, goal.target ? current / goal.target * 100 : 0)
              const displayTitle = displayTitleOf(goal)
              const streak = goalStreak(goal, completed)
              const periodNoun = streak?.unit === '天' ? '今天' : '本期'
              const achieved = current >= goal.target
              return <article
                key={goal.id}
                draggable={canDrag}
                onDragStart={(event) => { event.dataTransfer.setData('text/plain', goal.id); event.dataTransfer.effectAllowed = 'move'; setDraggedId(goal.id) }}
                onDragOver={(event) => { event.preventDefault(); setDropTargetId(goal.id) }}
                onDragLeave={() => setDropTargetId(prev => (prev === goal.id ? null : prev))}
                onDrop={(event) => { event.preventDefault(); setDropTargetId(null); void moveGoal(event.dataTransfer.getData('text/plain'), goal.id) }}
                onDragEnd={() => { setDraggedId(null); setDropTargetId(null) }}
                className={`habit-result-card relative flex gap-3 border-b border-gray-200 py-4 transition-opacity dark:border-gray-800 ${draggedId === goal.id ? 'opacity-40' : ''}`}
              >
                {/* 插入位置指示线：拖拽悬停到目标项时显示 2px 品牌色线（绝对定位，不产生布局位移） */}
                {draggedId && draggedId !== goal.id && dropTargetId === goal.id && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" aria-hidden="true" />}
                {/* 拖拽手柄改成可聚焦按钮（原来 aria-label 挂在不可聚焦的 svg 上，读屏与键盘都够不到）：
                    ↑/↓ 移动一位，Home/End 移到首尾，移动后播报落点 */}
                <button
                  type="button"
                  className="mt-1 grid h-11 w-11 shrink-0 cursor-grab place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing dark:hover:bg-white/5"
                  aria-label={`重新排序：${displayTitle}，当前第 ${index + 1} 项，共 ${goals.length} 项`}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault()
                      const target = goals[index + (event.key === 'ArrowUp' ? -1 : 1)]
                      if (target) void moveGoal(goal.id, target.id)
                    } else if (event.key === 'Home') {
                      event.preventDefault()
                      if (goals[0] && goals[0].id !== goal.id) void moveGoal(goal.id, goals[0].id)
                    } else if (event.key === 'End') {
                      event.preventDefault()
                      const last = goals[goals.length - 1]
                      if (last && last.id !== goal.id) void moveGoal(goal.id, last.id)
                    }
                  }}
                >
                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0"><strong>{displayTitle}</strong><p className="mt-1 text-xs text-gray-500">{goal.tag?.name} · {periods[goal.period]}{goal.period === 'weekly' && goal.weekDay !== null ? `（${weekDayNames[goal.weekDay]}）` : ''} · {goal.kind === 'activity' ? '活动目标' : goal.type === 'count' ? '计次目标，不累计时长' : '时长目标'}</p></div>
                    <span className={`shrink-0 text-sm tabular-nums ${achieved ? 'text-emerald-600' : 'text-gray-500'}`}>
                      {/* 达标不只靠颜色（A11Y §2.3）：加 ✓ 字形 + sr-only「已达标」 */}
                      {achieved && <><span aria-hidden="true">✓ </span><span className="sr-only">已达标，</span></>}{current} / {goal.target} {unit}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${displayTitle}完成进度${achieved ? '，已达标' : ''}`}>
                    <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300 dark:bg-brand-500" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {streak && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                        {streak.count > 0
                          ? <><Flame className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden="true" />连续 {streak.count} {streak.unit}{!streak.currentPeriodDone && ` · ${periodNoun}还没打卡`}</>
                          : streak.currentPeriodDone
                            ? <>✓ {periodNoun}已打卡</>
                            : <><Hourglass className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />{periodNoun}还没打卡</>}
                      </span>
                    )}
                    {/* 去打卡入口。TimerPage 不支持 ?tag= 深链（按分工不改 TimerPage），所以 tracking 目标
                        只能引导到工作台首屏由用户点对应标签；activity 目标的周期待办就长在待办页 */}
                    {goal.kind === 'activity' ? (
                      <Link to="/tasks?tab=todos" className="relative rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-brand-50 hover:underline dark:text-brand-300 dark:hover:bg-white/5">去打卡 →</Link>
                    ) : (
                      <Link to="/" className="relative rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-brand-50 hover:underline dark:text-brand-300 dark:hover:bg-white/5">{goal.type === 'count' ? '去工作台打卡 →' : '去工作台计时 →'}</Link>
                    )}
                    {/* 触屏兜底排序：hover:none 设备上没有拖拽也没有方向键，给真实的 44px ↑↓ 按钮 */}
                    <div className="ml-auto hidden gap-2 [@media(hover:none)]:flex">
                      <button type="button" aria-label={`上移：${displayTitle}`} disabled={index === 0} onClick={() => { const target = goals[index - 1]; if (target) void moveGoal(goal.id, target.id) }} className="grid h-11 w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-white/5"><ChevronUp className="h-4 w-4" aria-hidden="true" /></button>
                      <button type="button" aria-label={`下移：${displayTitle}`} disabled={index === goals.length - 1} onClick={() => { const target = goals[index + 1]; if (target) void moveGoal(goal.id, target.id) }} className="grid h-11 w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-white/5"><ChevronDown className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                  </div>
                </div>
              </article>
            })}
            {goals.length === 0 && (
              /* E4 依赖项缺失：目标长在标签页，这里给直达入口 */
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Target className="h-10 w-10 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">还没有习惯目标</p>
                <p className="max-w-[36ch] text-xs text-gray-400">目标决定了待办页的周期分组；在标签页给标签设一个目标，这里就会出现进度</p>
                <Link to="/tags" className="mt-1 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">去标签页设置目标 →</Link>
              </div>
            )}
          </section>
          <section className="habits-history page-card min-w-0 max-h-[calc(100vh-10rem)] overflow-y-auto p-4 sm:p-5" aria-label="已完成活动记录">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">已完成活动</h2>
            {completed.map(todo => <div key={todo.id} className="py-3 border-b border-gray-200 last:border-0 dark:border-gray-800 flex justify-between gap-4"><span className="min-w-0">{todo.title}</span><time className="shrink-0 text-xs text-gray-500 tabular-nums">{todo.completedAt ? new Date(todo.completedAt).toLocaleDateString('zh-CN') : '已完成'}</time></div>)}
            {!completed.length && (
              /* E1 首次使用：说清「这里什么时候会有东西」 */
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">完成的活动会出现在这里</p>
                <p className="max-w-[32ch] text-xs text-gray-400">在待办页完成带目标的活动后，会按完成日期记录</p>
              </div>
            )}
          </section>
        </div>
      </div>
    )}
  </div>
}
