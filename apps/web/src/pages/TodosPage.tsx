import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useStore } from '../store'
import type { Goal, Todo } from '../types'
import { MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PromptDialog } from '../components/PromptDialog'
import { ErrorBlockCard } from '../components/StateViews'
import { announce, announceUrgent } from '../announce'

const PRIORITY = [
  { value: 0, label: '普通', color: 'text-gray-400' },
  { value: 1, label: '重要', color: 'text-amber-500' },
  { value: 2, label: '紧急', color: 'text-red-500' },
]

type ActivityView = 'current' | 'all'
type TodoStatusView = 'pending' | 'done'
type ActivityCycle = 'workday' | 'daily' | 'weekly' | 'monthly'

const ACTIVITY_NOTIFICATION_START = 2000
const ACTIVITY_NOTIFICATION_END = 2099

async function syncActivityNotifications(todos: Todo[]) {
  const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.())
  if (!isNative) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions()
      if (requested.display !== 'granted') return
    }

    await LocalNotifications.cancel({
      notifications: Array.from({ length: ACTIVITY_NOTIFICATION_END - ACTIVITY_NOTIFICATION_START + 1 }, (_, index) => ({
        id: ACTIVITY_NOTIFICATION_START + index,
      })),
    })

    const now = Date.now()
    const notifications = todos
      .filter((todo) => todo.status === 'pending' && todo.dueDate)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 50)
      .flatMap((todo, index) => {
        const due = new Date(todo.dueDate!)
        const reminder = new Date(due.getTime() - 60 * 60 * 1000)
        const result = []
        if (reminder.getTime() > now + 30_000) {
          result.push({
            id: ACTIVITY_NOTIFICATION_START + index * 2,
            title: `活动提醒 · ${todo.title}`,
            body: '距离截止还有 1 小时',
            schedule: { at: reminder },
            autoCancel: true,
          })
        }
        if (due.getTime() > now + 30_000) {
          result.push({
            id: ACTIVITY_NOTIFICATION_START + index * 2 + 1,
            title: `活动到期 · ${todo.title}`,
            body: '活动尚未完成，超时完成时需要填写原因',
            schedule: { at: due },
            autoCancel: true,
          })
        }
        return result
      })
    if (notifications.length > 0) await LocalNotifications.schedule({ notifications })
  } catch (error) {
    console.warn('Activity notification sync warn:', error)
  }
}

function formatDate(d: Date) {
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
}

function currentCycleRange(cycle: ActivityCycle, now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (cycle === 'workday') return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) }
  if (cycle === 'daily') return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) }
  if (cycle === 'monthly') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) }
  const day = start.getDay() || 7
  start.setDate(start.getDate() - day + 1)
  return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) }
}

function isInCurrentCycle(todo: Todo, cycle: ActivityCycle): boolean {
  if (!todo.dueDate) return false
  const due = new Date(todo.dueDate)
  const range = currentCycleRange(cycle)
  // Keep overdue unfinished items visible in the current view; the all view also includes future cycles.
  return due < range.end
}

function sortActivityItems(items: Todo[]): Todo[] {
  return [...items].sort((a, b) =>
    (new Date(a.dueDate ?? '9999-12-31').getTime() - new Date(b.dueDate ?? '9999-12-31').getTime())
      || (b.priority - a.priority)
  )
}

/** 首屏加载骨架：必须包含 4 个周期模块的占位（EMPTY_LOADING_ERROR.md §2.2）——
 *  否则加载完成时页面会从一屏撑到两屏，产生大幅布局跳动。
 *  三件套（role=status + aria-busy + aria-label）+ .skeleton 语义类；元素数压在 ≤12 个。 */
function TodosSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="正在加载待办活动" className="space-y-3">
      <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/60" aria-hidden="true">
        <div className="skeleton mb-3 h-4 w-24 rounded" />
        <div className="space-y-2">
          <div className="skeleton h-12 w-full rounded-lg" />
          <div className="skeleton h-12 w-11/12 rounded-lg" />
        </div>
      </section>
      <div className="grid grid-cols-1 gap-3 items-start xl:grid-cols-2" aria-hidden="true">
        {[0, 1, 2, 3].map(block => (
          <div key={block} className="min-h-[150px] rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <div className="skeleton mb-3 h-4 w-20 rounded" />
            <div className="skeleton h-12 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TodosPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { tags, categories, running, start } = useStore()
  const [todos, setTodos] = useState<Todo[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  // 三态：loading（骨架）/ refreshing（有数据，后台刷新不清空）/ settled。
  // dataReady 区分「从来没加载成功过」（整页 E-Block）与「有旧数据 + 本次操作失败」（顶部提示条）。
  const [loadPhase, setLoadPhase] = useState<'loading' | 'refreshing' | 'settled'>('loading')
  const [dataReady, setDataReady] = useState(false)
  const [error, setError] = useState('')
  // 筛选状态写进 URL（?view= ?scope= ?cat=）：刷新不丢、返回键生效、可分享。
  // 默认值不写入参数，保持 URL 干净；setSearchParams 用函数式更新以保留 tab 等其他参数。
  const [searchParams, setSearchParams] = useSearchParams()
  const statusView: TodoStatusView = searchParams.get('view') === 'done' ? 'done' : 'pending'
  const activityView: ActivityView = searchParams.get('scope') === 'all' ? 'all' : 'current'
  const filterCat = searchParams.get('cat') ?? ''
  const setFilters = (updates: { view?: TodoStatusView; scope?: ActivityView; cat?: string }) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (updates.view === 'done') next.set('view', 'done')
      else if (updates.view === 'pending') next.delete('view')
      if (updates.scope === 'all') next.set('scope', 'all')
      else if (updates.scope === 'current') next.delete('scope')
      if (updates.cat) next.set('cat', updates.cat)
      else if (updates.cat === '') next.delete('cat')
      return next
    })
  }
  const [oneTimeCollapsed, setOneTimeCollapsed] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [editing, setEditing] = useState<Todo | null>(null)
  const [pickingTagFor, setPickingTagFor] = useState<Todo | null>(null)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [reasonPrompt, setReasonPrompt] = useState<{ kind: 'restore' | 'late'; todoId: string } | null>(null)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const loadSequence = useRef(0)
  const statusTablistRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const retryButtonRef = useRef<HTMLButtonElement>(null)

  // 操作失败统一走这里：E-Banner 只管视觉，读屏播报交给全局 assertive region（永久节点，比条件
  // 插入的 role="alert" 可靠，也避免两条机制叠加播两遍）
  const showError = (message: string) => {
    setError(message)
    announceUrgent(message)
  }

  const load = async () => {
    // Always load all todos so we can split pending/done locally
    const sequence = ++loadSequence.current
    setLoadPhase(dataReady ? 'refreshing' : 'loading')
    try {
      const all = await api.todos.list()
      if (sequence !== loadSequence.current) return
      setTodos(all)
      void syncActivityNotifications(all)
      setDataReady(true)
      setLoadPhase('settled')
      setError('')
    } catch (e) {
      if (sequence !== loadSequence.current) return
      const message = e instanceof Error ? e.message : '加载待办失败'
      setError(message)
      // 分区页会把隐藏 tab 的面板也挂载出来（display:none）——隐藏页面的加载失败不该打扰
      // 当前页的用户；offsetParent 为 null 即当前不可见
      if (rootRef.current && rootRef.current.offsetParent !== null) announceUrgent(`加载失败：${message}`)
      setLoadPhase('settled')
    }
  }

  useEffect(() => { void load() }, [])

  // 整页错误（从未加载成功）时把焦点移到「重新加载」；display:none 下 focus() 是 no-op
  useEffect(() => {
    if (!dataReady && error && loadPhase === 'settled') retryButtonRef.current?.focus()
  }, [dataReady, error, loadPhase])

  useEffect(() => {
    const loadGoals = () => { void api.goals.list().then(setGoals).catch(() => setGoals([])) }
    loadGoals()
    window.addEventListener('ittime-data-changed', loadGoals)
    return () => window.removeEventListener('ittime-data-changed', loadGoals)
  }, [])

  const quickAdd = async () => {
    if (!quickTitle.trim()) return
    try {
      await api.todos.create({ title: quickTitle.trim() })
      announce(`已添加活动：${quickTitle.trim()}`)
      setQuickTitle('')
      setShowQuickAdd(false)
      await load()
    } catch (e) {
      showError(e instanceof Error ? e.message : '新建待办失败')
    }
  }

  const applyToggle = async (id: string, lateReason?: string, restoreReason?: string) => {
    setTogglingIds((current) => new Set(current).add(id))
    try {
      // 播报要在 toggle 之前取旧状态：done→pending 是「恢复」，pending→done 是「完成」（分级表 §2.2）
      const todo = todos.find((item) => item.id === id)
      await api.todos.toggle(id, lateReason, restoreReason)
      if (todo) announce(todo.status === 'done' ? `已恢复为未完成：${todo.title}` : `已完成：${todo.title}`)
      await load()
    } catch (e) {
      showError(e instanceof Error ? e.message : '更新待办状态失败')
    } finally {
      setTogglingIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  const toggle = async (id: string) => {
    if (togglingIds.has(id)) return
    const todo = todos.find((item) => item.id === id)
    if (todo?.status === 'done') {
      // 恢复未完成：必须先填写原因（页内 PromptDialog，Esc 取消不改数据）
      setReasonPrompt({ kind: 'restore', todoId: id })
      return
    }
    if (todo?.dueDate && new Date(todo.dueDate).getTime() < Date.now()) {
      // 超时完成：必须先填写原因
      setReasonPrompt({ kind: 'late', todoId: id })
      return
    }
    await applyToggle(id)
  }

  const confirmReasonPrompt = async (rawReason: string) => {
    if (!reasonPrompt) return
    const reason = rawReason.trim()
    if (reasonPrompt.kind === 'restore') {
      if (!reason) {
        showError('恢复未完成必须填写原因')
        return
      }
      setReasonPrompt(null)
      await applyToggle(reasonPrompt.todoId, undefined, reason)
    } else {
      if (!reason) {
        showError('超时完成必须填写原因')
        return
      }
      setReasonPrompt(null)
      await applyToggle(reasonPrompt.todoId, reason)
    }
  }

  const remove = async (id: string) => {
    setPendingRemoveId(id)
  }

  const performRemove = async (id: string) => {
    setPendingRemoveId(null)
    try {
      const todo = todos.find((item) => item.id === id)
      await api.todos.remove(id)
      announce(`已删除：${todo?.title ?? '待办'}`)
      await load()
    } catch (e) {
      showError(e instanceof Error ? e.message : '删除待办失败')
    }
  }

  const startFromTodo = async (todo: Todo, tagId: string) => {
    try {
      await start({ tagId, note: todo.title, todoId: todo.id })
      setPickingTagFor(null)
      setError('')
      announce(`已开始计时：${tags.find((tag) => tag.id === tagId)?.name ?? todo.title}`)
    } catch (e) {
      showError(e instanceof Error ? e.message : '开始计时失败')
    }
  }

  const categoryFiltered = useMemo(() => {
    const filtered = todos.filter(todo => todo.status === statusView)
    if (!filterCat) return filtered
    if (filterCat === 'none') return filtered.filter((todo) => !todo.categoryId)
    return filtered.filter((todo) => todo.categoryId === filterCat)
  }, [todos, filterCat, statusView])

  // 筛选变化播报（分级表 §2.2）：让读屏用户知道切了筛选后还剩多少项
  const filterSignature = `${statusView}|${activityView}|${filterCat}`
  const prevFilterRef = useRef(filterSignature)
  useEffect(() => {
    if (prevFilterRef.current === filterSignature) return
    prevFilterRef.current = filterSignature
    announce(`显示 ${categoryFiltered.length} 项活动`)
  }, [filterSignature, categoryFiltered.length])

  const cycleItems = (cycle: ActivityCycle) => sortActivityItems(categoryFiltered.filter((todo) => {
    if (todo.repeatType !== cycle) return false
    if (statusView === 'pending' && activityView === 'current') return isInCurrentCycle(todo, cycle)
    return true
  }))

  const oneTimeItems = sortActivityItems(categoryFiltered.filter((todo) => {
    if (todo.repeatType !== 'none') return false
    return true
  }))
  // WAI-ARIA tabs 键盘模式：←→ 循环切换，Home/End 跳首末，焦点跟随选中项（与 SectionPage 同一模式）
  const onStatusTablistKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const ids = ['pending', 'done'] as const
    const index = ids.indexOf(statusView)
    let nextIndex: number | null = null
    if (event.key === 'ArrowLeft') nextIndex = (index + ids.length - 1) % ids.length
    else if (event.key === 'ArrowRight') nextIndex = (index + 1) % ids.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = ids.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextId = ids[nextIndex]
    setFilters({ view: nextId })
    if (nextId === 'done') setFilters({ scope: 'all' })
    statusTablistRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${nextId}"]`)?.focus()
  }

  return (
    <div className="workspace-page todo-page space-y-4" ref={rootRef}>
      {!embedded && <PageHeader
        title="待办活动"
        description="安排要做的事，按周期和状态快速处理"
        actions={<div className="flex flex-wrap items-center gap-2">
          {statusView === 'pending' && <button type="button" onClick={() => setShowQuickAdd((value) => !value)} className="btn-primary px-3 py-2 text-sm">{showQuickAdd ? '取消添加' : '+ 新建活动'}</button>}
        </div>}
      />}

      {/* 三态分发：loading 骨架 / 从未成功的整页 E-Block / 正常内容（+ 非阻塞错误条） */}
      {loadPhase === 'loading' ? (
        <TodosSkeleton />
      ) : !dataReady && error ? (
        <ErrorBlockCard title="没能加载待办活动" hint="可能是网络或本地数据库的问题，请稍后重试。" error={error} onRetry={() => void load()} buttonRef={retryButtonRef} />
      ) : (<>
      {error && (
        /* 操作失败的 E-Banner：琥珀色不用红色；读屏播报由 showError 里的 announceUrgent 负责，
           这里不放 role="alert"，避免同一句错误播两遍。错误不自动消失，直到用户关闭或下次成功。 */
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border-l-[3px] border-amber-500 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <span aria-hidden="true">⚠</span>
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="关闭错误提示" className="relative shrink-0 rounded p-2 after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-amber-100 dark:hover:bg-amber-900/40">✕</button>
        </div>
      )}

        <section className="page-card overflow-visible p-4 sm:p-5">
            <div className="sticky top-0 z-[5] -mx-5 -mt-5 mb-0 flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(226_232_240_/_0.9)] bg-[rgb(255_255_255_/_0.96)] px-5 py-4 backdrop-blur-md dark:border-[rgb(51_65_85_/_0.9)] dark:bg-[rgb(17_24_39_/_0.96)]">
              <div className="flex items-center gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{statusView === 'pending' ? '未完成活动' : '已完成活动'}</h2>
                  <p className="text-xs text-gray-500 mt-1">{statusView === 'pending' ? '完成记录会收进「习惯」页面的结果里' : '点击左侧勾选框可恢复为未完成，并填写恢复原因'}</p>
                </div>
                {/* refreshing 指示：内容保持可读，只转小圈 */}
                {loadPhase === 'refreshing' && <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand dark:border-gray-600 dark:border-t-brand-400" aria-hidden="true" />}
              </div>
              {/* WAI-ARIA tabs：←→ 循环 + Home/End + roving tabindex，焦点跟随选中项 */}
              <div ref={statusTablistRef} className="flex items-center gap-1 rounded-full bg-gray-100 p-1 dark:bg-gray-800" role="tablist" aria-label="待办状态" onKeyDown={onStatusTablistKeyDown}>
                {([['pending', '未完成'], ['done', '已完成']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    data-tab-id={value}
                    id={`todo-status-tab-${value}`}
                    aria-selected={statusView === value}
                    aria-controls="todo-status-panel"
                    tabIndex={statusView === value ? 0 : -1}
                    onClick={() => {
                      setFilters({ view: value })
                      if (value === 'done') setFilters({ scope: 'all' })
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusView === value ? 'bg-white text-brand shadow-sm dark:bg-gray-700 dark:text-brand-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div role="tabpanel" id="todo-status-panel" aria-labelledby={`todo-status-tab-${statusView}`} aria-busy={loadPhase === 'refreshing' ? 'true' : undefined}>
            {statusView === 'pending' && goals.some((goal) => goal.kind === 'tracking') && (
              /* 计时/计次目标的进度条与「习惯」页完全重复，这里只留一行摘要 + 直达入口（IA 去重） */
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                计时与计次目标的进度在 <Link to="/tasks?tab=habits" className="text-brand-700 hover:underline dark:text-brand-300">习惯页</Link>查看
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-4">
              {statusView === 'pending' && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="活动范围">
                  {([
                    ['current', '当前周期'],
                    ['all', '全部'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={activityView === value}
                      onClick={() => setFilters({ scope: value })}
                      className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors ${
                        activityView === value
                          ? 'bg-brand text-white'
                          : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <label className="text-xs text-gray-400" htmlFor="todo-cat-filter">分类</label>
              <select
                id="todo-cat-filter"
                value={filterCat}
                onChange={(event) => setFilters({ cat: event.target.value })}
                className="text-sm border border-gray-200 dark:border-gray-800 rounded-full px-3 py-1 bg-white dark:bg-gray-900 text-gray-500"
              >
                <option value="">全部</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
                <option value="none">未分类</option>
              </select>
            </div>

            {/* E2 筛选空：区分「真的没有」与「被筛选挡住了」，后者给清除筛选 */}
            {categoryFiltered.length === 0 && filterCat && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                <span>没有符合当前分类筛选的活动</span>
                <button type="button" onClick={() => setFilters({ cat: '' })} className="rounded px-2 py-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">清除筛选</button>
              </div>
            )}

            {statusView === 'pending' && showQuickAdd && (
              <div className="rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3 flex gap-2 mt-3">
                <input
                  value={quickTitle}
                  onChange={(event) => setQuickTitle(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && quickAdd()}
                  placeholder="活动内容，回车添加…"
                  aria-label="活动内容"
                  className="input"
                  autoFocus
                />
                <button type="button" onClick={quickAdd} className="px-4 py-2 rounded-lg text-sm bg-brand text-white hover:bg-brand-600 whitespace-nowrap">
                  添加
                </button>
              </div>
            )}

            <section className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/60">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">一次性活动</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">优先处理，不属于日、周、月循环</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{oneTimeItems.length} 项</span>
                  <button
                    type="button"
                    aria-expanded={!oneTimeCollapsed}
                    aria-controls="one-time-activities"
                    aria-label={oneTimeCollapsed ? '展开一次性活动' : '折叠一次性活动'}
                    title={oneTimeCollapsed ? '展开一次性活动' : '折叠一次性活动'}
                    onClick={() => setOneTimeCollapsed((collapsed) => !collapsed)}
                    className="relative flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    <span aria-hidden="true" className={`text-base leading-none transition-transform ${oneTimeCollapsed ? '-rotate-90' : ''}`}>⌄</span>
                  </button>
                </div>
              </div>
              <div id="one-time-activities" hidden={oneTimeCollapsed} className="space-y-2">
                {oneTimeItems.length === 0 ? (
                  /* E1：说清下一步怎么做，而不是一句「暂无」 */
                  <div className="py-3 text-center text-sm text-gray-400">还没有一次性活动{statusView === 'pending' && !embedded && '，点右上角「+ 新建活动」创建'}</div>
                ) : oneTimeItems.map((todo, index) => (
                  <TodoCard
                    key={todo.id}
                    todo={todo}
                    running={running}
                    busy={togglingIds.has(todo.id)}
                    onToggle={toggle}
                    onEdit={setEditing}
                    onDelete={remove}
                    onPickTag={setPickingTagFor}
                    isDone={todo.status === 'done'}
                    animationDelay={Math.min(index, 5) * 40}
                  />
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-3 mt-3 items-start xl:grid-cols-2">
              <ActivityModule title="工作日活动" subtitle="周一至周五" items={cycleItems('workday')} emptyText="今天没有工作日活动" running={running} togglingIds={togglingIds} onToggle={toggle} onEdit={setEditing} onDelete={remove} onPickTag={setPickingTagFor} />
              <ActivityModule title="日活动" subtitle="当前自然日" items={cycleItems('daily')} emptyText="今天暂无日活动" running={running} togglingIds={togglingIds} onToggle={toggle} onEdit={setEditing} onDelete={remove} onPickTag={setPickingTagFor} />
              <ActivityModule title="周活动" subtitle="当前自然周" items={cycleItems('weekly')} emptyText="本周暂无周活动" running={running} togglingIds={togglingIds} onToggle={toggle} onEdit={setEditing} onDelete={remove} onPickTag={setPickingTagFor} />
              <ActivityModule title="月活动" subtitle="当前自然月" items={cycleItems('monthly')} emptyText="本月暂无月活动" running={running} togglingIds={togglingIds} onToggle={toggle} onEdit={setEditing} onDelete={remove} onPickTag={setPickingTagFor} />
            </div>
            </div>
        </section>

      {/* Edit modal */}
      {editing && (
        <TodoEditModal
          todo={editing}
          categories={categories}
          tags={tags}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      {/* Tag picker modal */}
      {pickingTagFor && (
        <TagPickerModal
          todo={pickingTagFor}
          tags={tags.filter((t) => t.categoryId === pickingTagFor.categoryId && !t.parentId)}
          onClose={() => setPickingTagFor(null)}
          onPick={(tagId) => startFromTodo(pickingTagFor, tagId)}
        />
      )}

      {/* 恢复 / 超时原因输入（替代原生 prompt；空值保留弹窗并显示顶部错误条） */}
      <PromptDialog
        open={!!reasonPrompt}
        title={reasonPrompt?.kind === 'restore' ? '恢复未完成' : '超时完成'}
        message={reasonPrompt?.kind === 'restore' ? '请填写恢复未完成的原因' : '这项活动已经超时，请填写原因'}
        label="原因"
        confirmLabel="确定"
        onConfirm={(value) => void confirmReasonPrompt(value)}
        onCancel={() => setReasonPrompt(null)}
      />

      {/* 删除待办确认（替代原生 confirm） */}
      <ConfirmDialog
        open={!!pendingRemoveId}
        danger
        title="删除确认"
        message="确定删除这条待办吗？"
        onConfirm={() => {
          const id = pendingRemoveId
          setPendingRemoveId(null)
          if (id) void performRemove(id)
        }}
        onCancel={() => setPendingRemoveId(null)}
      />
      </>)}
    </div>
  )
}

function ActivityModule({
  title,
  subtitle,
  items,
  emptyText,
  running,
  togglingIds,
  onToggle,
  onEdit,
  onDelete,
  onPickTag,
}: {
  title: string
  subtitle: string
  items: Todo[]
  emptyText: string
  running: any[]
  togglingIds: Set<string>
  onToggle: (id: string) => void
  onEdit: (todo: Todo) => void
  onDelete: (id: string) => void
  onPickTag: (todo: Todo) => void
}) {
  return (
    // 空模块不占 min-height（EMPTY_LOADING_ERROR §3.2）：否则页面上全是 150px 高的「没有」
    <section className={`rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 ${items.length > 0 ? 'min-h-[150px]' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
        <span className="text-xs text-gray-400 tabular-nums">{items.length} 项</span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">{emptyText}</div>
        ) : items.map((todo, index) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            running={running}
            busy={togglingIds.has(todo.id)}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onPickTag={onPickTag}
            isDone={todo.status === 'done'}
            animationDelay={Math.min(index, 5) * 40}
          />
        ))}
      </div>
    </section>
  )
}

// ── Todo Card ─────────────────────────────────────────────────────────────
function TodoCard({
  todo,
  running,
  busy = false,
  onToggle,
  onEdit,
  onDelete,
  onPickTag,
  isDone = false,
  animationDelay,
}: {
  todo: Todo
  running: any[]
  busy?: boolean
  onToggle: (id: string) => void
  onEdit: (t: Todo) => void
  onDelete: (id: string) => void
  onPickTag: (t: Todo) => void
  isDone?: boolean
  /** 列表错峰延迟（MOTION_SPEC §2 L2）：40ms/项，最多错 6 项，第 7 项起齐出。
   *  260 + 5×40 = 460ms 封顶。传入即启用 list-in 入场；不传则静态渲染
   *  （用于编辑态复用等不该重播动画的场景）。 */
  animationDelay?: number
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div
      className={`group flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        isDone ? 'bg-green-50/70 border-green-200 dark:bg-green-950/20 dark:border-green-900/60' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
      } ${animationDelay !== undefined ? 'motion-safe:animate-list-in' : ''}`}
      style={animationDelay !== undefined ? { animationDelay: `${animationDelay}ms` } : undefined}
    >
      <button
        type="button"
        disabled={busy}
        aria-label={isDone ? `恢复未完成：${todo.title}` : `完成活动：${todo.title}`}
        onClick={() => onToggle(todo.id)}
        className="relative mt-0.5 -ml-2 -mt-2 w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 disabled:opacity-60 after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] disabled:after:hidden"
      >
        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          isDone ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-brand'
        }`}>
          {isDone && <span className="text-[0.667rem]">✓</span>}
        </span>
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${todo.status === 'done' ? 'line-through text-gray-400' : ''}`}>
          {/* 优先级不能只靠色点（A11Y §2.3）：emoji 对读屏不可预期，补 sr-only 文字 */}
          {todo.priority === 2 && <><span className="text-red-500 mr-1" aria-hidden="true">🔴</span><span className="sr-only">紧急：</span></>}
          {todo.priority === 1 && <><span className="text-amber-500 mr-1" aria-hidden="true">🟡</span><span className="sr-only">重要：</span></>}
          {todo.title}
        </div>
        {todo.description && (
          <div className="text-xs text-gray-400 mt-0.5">{todo.description}</div>
        )}
        {todo.lateReason && (
          <div className="text-xs text-orange-600/90 dark:text-orange-300/90 mt-0.5">超时原因：{todo.lateReason}</div>
        )}
        {todo.restoreReason && (
          <div className="text-xs text-amber-600/80 dark:text-amber-300/80 mt-0.5">恢复原因：{todo.restoreReason}</div>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {todo.category && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: todo.category.color + '22', color: todo.category.color }}
            >
              {todo.category.name}
            </span>
          )}
          {todo.tag && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
              {todo.tag.name}
            </span>
          )}
          {todo.repeatType !== 'none' && (
            <span className="text-xs text-brand-500">
              {todo.repeatType === 'workday' ? '工作日' : todo.repeatType === 'daily' ? '每日' : todo.repeatType === 'weekly' ? '每周' : '每月'}
            </span>
          )}
          {todo._count && todo._count.timeEntries > 0 && (
            <span className="text-xs text-gray-400">已记录 {todo._count.timeEntries} 次</span>
          )}
          {todo.dueDate && (
            <span className="ml-auto whitespace-nowrap text-xs text-gray-400">
              {todo.goalId ? `截止 ${formatActivityDueDate(todo.dueDate)}` : new Date(todo.dueDate).toLocaleDateString('zh-CN')}
            </span>
          )}
        </div>
      </div>
      {/* 操作区：移动端只留「计时 + ⋯」，编辑/删除收进菜单；桌面 hover 展开。
          视觉 28px 不变，用伪元素把触达热区外扩到 44px；gap-4 = 16px 保证两条 44px 热区恰好相接不相叠（WCAG 2.5.8）。
          桌面上 opacity-0 的按钮同时 pointer-events-none，避免「看不见却能点中」的陷阱，hover/焦点内才恢复。 */}
      <div className="relative flex shrink-0 items-center gap-4 whitespace-nowrap">
        {todo.status === 'pending' && todo.categoryId && (
          running.some((r) => r.todoId === todo.id) ? (
            <span className="inline-flex items-center gap-1 px-1.5 text-xs text-green-600 dark:text-green-400" title="计时中">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />计时中
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onPickTag(todo)}
              title="开始计时"
              aria-label={`开始计时：${todo.title}`}
              className="relative grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-brand-50 hover:text-brand-700 after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] dark:hover:bg-brand-900/30 dark:hover:text-brand-300"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onEdit(todo)}
          title="编辑"
          aria-label={`编辑：${todo.title}`}
          className="relative hidden h-7 w-7 place-items-center rounded-md text-gray-400 transition-opacity hover:bg-gray-100 hover:text-gray-700 after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] dark:hover:bg-gray-800 dark:hover:text-gray-200 sm:grid sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(todo.id)}
          title="删除"
          aria-label={`删除：${todo.title}`}
          className="relative hidden h-7 w-7 place-items-center rounded-md text-gray-400 transition-opacity hover:bg-red-50 hover:text-red-600 after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] dark:hover:bg-red-950/40 dark:hover:text-red-400 sm:grid sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={`更多操作：${todo.title}`}
          className="relative grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-gray-100 after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] dark:hover:bg-gray-800 sm:hidden"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div className="absolute right-0 top-8 z-40 w-28 rounded-ctl border border-gray-200 bg-white py-1 shadow-float dark:border-gray-700 dark:bg-gray-800" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(todo) }} className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />编辑
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDelete(todo.id) }} className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />删除
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────
function TodoEditModal({ todo, categories, tags, onClose, onSaved }: {
  todo: Todo
  categories: { id: string; name: string; color: string }[]
  tags: { id: string; name: string; categoryId: string | null }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(todo.title)
  const [description, setDescription] = useState(todo.description ?? '')
  const [priority, setPriority] = useState(todo.priority)
  const [categoryId, setCategoryId] = useState(todo.categoryId ?? '')
  const [tagId, setTagId] = useState(todo.tagId ?? '')
  const [repeatType, setRepeatType] = useState(todo.repeatType ?? 'none')
  const [dueDate, setDueDate] = useState(
    todo.dueDate ? new Date(todo.dueDate).toISOString().slice(0, 10) : ''
  )
  const [status, setStatus] = useState(todo.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Esc 关闭：焦点在输入框内时 keydown 冒泡到弹层根节点；document 级监听兜底焦点在弹层外的情况
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    if (!title.trim() || saving) {
      if (!title.trim()) setError('标题不能为空')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.todos.update(todo.id, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        categoryId: categoryId || null,
        tagId: tagId || null,
        ...(todo.goalId ? {} : {
          repeatType,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        }),
        status,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存待办失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    // 遮罩用 onMouseDown 关闭（A11Y §1.4）：按住拖拽选择文本时 onClick 会误关
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="todo-edit-title" onMouseDown={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 id="todo-edit-title" className="text-lg font-semibold mb-4">编辑待办</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">标题</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" autoFocus />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">描述（可选）</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-500 mb-1">优先级</label>
              <div className="flex gap-2">
                {PRIORITY.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPriority(p.value)}
                    className={`px-3 py-1 rounded-full text-xs border ${
                      priority === p.value
                        ? `${p.color} border-current font-medium`
                        : 'text-gray-400 border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-500 mb-1">状态</label>
              {todo.status === 'done' ? (
                <div className="text-sm text-green-600 dark:text-green-400">已完成（点击复选框可恢复，并填写原因）</div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setStatus('pending')}
                    className={`px-3 py-1 rounded-full text-xs border ${
                      status === 'pending' ? 'text-brand border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    待完成
                  </button>
                  <button
                    onClick={() => setStatus('done')}
                    className={`px-3 py-1 rounded-full text-xs border ${
                      status === 'done' ? 'text-green-500 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    已完成
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-500 mb-1">关联分类</label>
              <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setTagId('') }} className="input">
                <option value="">无分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-500 mb-1">活动标签</label>
              <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="input" disabled={!categoryId}>
                <option value="">无活动标签</option>
                {tags.filter((tag) => tag.categoryId === categoryId).map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
            </div>
          </div>
          {todo.goalId ? (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-xs text-gray-500">
              活动周期和截止时间由对应目标管理：{todo.dueDate ? formatActivityDueDate(todo.dueDate) : '未设置'}
            </div>
          ) : (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-500 mb-1">循环</label>
                <select value={repeatType} onChange={(e) => setRepeatType(e.target.value as Todo['repeatType'])} className="input">
                  <option value="none">不循环</option>
                  <option value="workday">工作日</option>
                  <option value="daily">每日</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-500 mb-1">截止日期</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
              </div>
            </div>
          )}
        </div>
        {error && <div className="mt-4 text-sm text-red-500">{error}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            取消
          </button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-brand text-white hover:bg-brand-600 disabled:opacity-50">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatActivityDueDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Tag Picker Modal ──────────────────────────────────────────────────────
function TagPickerModal({ todo, tags, onClose, onPick }: {
  todo: Todo
  tags: { id: string; name: string; color: string }[]
  onClose: () => void
  onPick: (tagId: string) => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="todo-tagpick-title" onMouseDown={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 id="todo-tagpick-title" className="text-lg font-semibold mb-1">选择标签开始计时</h3>
        <p className="text-sm text-gray-400 mb-4">{todo.title}</p>
        {tags.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            该分类下暂无标签，请先在标签管理中添加
          </div>
        ) : (
          <div className="space-y-2">
            {tags.map((t) => (
              <button
                key={t.id}
                onClick={() => onPick(t.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
                <span className="text-sm font-medium">{t.name}</span>
                <span className="ml-auto text-xs text-gray-400">▶ 开始</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
