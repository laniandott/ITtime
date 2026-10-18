import { useEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useStore, formatClock, formatDuration, toIsoSafe } from '../store'
import { api, resolveUploadUrl } from '../api'
import type { TimeEntry, Tag, Todo, Memo, PlanBlock } from '../types'
import { DateTimeSecondPicker } from '../components/DateTimeSecondPicker'
import { PageHeader } from '../components/PageHeader'
import { CategoryBadge } from '../components/CategoryBadge'
import { syncNativeStatusBarTheme } from '../nativeStatusBar'
import { GripVertical, ArrowUpDown } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { announce, announceUrgent } from '../announce'

// 辅助函数：格式化时间为 YYYY/MM/DD HH:mm:ss
const formatDateTimeWithSeconds = (isoStr: string) => {
  const d = new Date(isoStr)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`
}

// 辅助函数：格式化时间为 HH:mm:ss
const formatTimeWithSeconds = (isoStr: string) => {
  const d = new Date(isoStr)
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${min}:${ss}`
}

// 转换 ISO 时间字符串为 datetime-local (精确到秒 YYYY-MM-DDTHH:mm:ss)
const toLocalInputWithSeconds = (d: Date | string) => {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
}

const localDateKey = (date = new Date()) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}



/**
 * 快速开始的标签按钮。
 * 遵循「三色法则」：标签色只作为 5px 色点出现，文字/边框/底色一律中性；
 * 只有「正在计时」这一种状态才允许整块上主色浅底。
 */
function QuickStartTagButton({ tag, isRunning, onClick }: { tag: Tag; isRunning: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isRunning}
      className={`timer-tag inline-flex items-center gap-1.5 border px-2.5 py-2 text-sm font-medium transition-colors ${
        isRunning
          ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-200'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700'
      } ${tag.trackType === 'count' ? 'border-dashed' : ''}`}
    >
      <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: tag.color }} aria-hidden="true" />
      <span className="whitespace-nowrap">{tag.icon ? `${tag.icon} ` : ''}{tag.name}</span>
      {isRunning && <span className="text-[0.733rem] font-semibold text-brand-700 dark:text-brand-300">· 停止</span>}
      {tag.trackType === 'count' && <span className="text-[0.733rem] text-gray-400" aria-hidden="true">✓</span>}
    </button>
  )
}

export default function TimerPage() {
  const {
    tags,
    categories,
    running,
    pending,
    start,
    stop,
    stopAll,
    quickCount,
    resumeEntry,
    dismissPending,
    finishPending,
    terminateChain,
  } = useStore()
  const [todos, setTodos] = useState<Todo[]>([])
  const [quickTodoId, setQuickTodoId] = useState('')
  const [recent, setRecent] = useState<TimeEntry[]>([])
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [stoppingAll, setStoppingAll] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [memoTargetEntry, setMemoTargetEntry] = useState<TimeEntry | null>(null)
  const [pointTargetEntry, setPointTargetEntry] = useState<TimeEntry | null>(null)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const [filterCat, setFilterCat] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showStopDialog, setShowStopDialog] = useState<{ entryId: string; tag: Tag } | null>(null)
  const [showResumeDialog, setShowResumeDialog] = useState<TimeEntry | null>(null)
  const [showDismissDialog, setShowDismissDialog] = useState<TimeEntry | null>(null)
  const [showActivityPicker, setShowActivityPicker] = useState<{ interruptedFromId?: string } | null>(null)
  const [showRecoveryDialog, setShowRecoveryDialog] = useState<TimeEntry | null>(null)
  const [showTerminateDialog, setShowTerminateDialog] = useState<TimeEntry | null>(null)
  // 最近记录日期范围：默认显示当天
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7days' | '30days' | 'custom'>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [recentError, setRecentError] = useState('')
  const [feedback, setFeedback] = useState('')
  // 计时操作（开始/停止/删除记录）的行内错误：替代原生 alert，配 announceUrgent 播报
  const [actionError, setActionError] = useState('')
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | null>(null)
  const [sortingQuickStart, setSortingQuickStart] = useState(false)
  const [draggedQuickStartId, setDraggedQuickStartId] = useState<string | null>(null)
  const loadRecentSequence = useRef(0)
  const startingTagIds = useRef(new Set<string>())

  const saveOrder = async <T extends { id: string }>(items: T[], draggedId: string, targetId: string, save: (id: string, sortOrder: number) => Promise<unknown>) => {
    const from = items.findIndex((item) => item.id === draggedId)
    const to = items.findIndex((item) => item.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    if (to < 0 || to >= items.length) return
    const reordered = [...items]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    try {
      await Promise.all(reordered.map((item, index) => save(item.id, index * 10)))
      await useStore.getState().loadAll()
      setFeedback('快速开始顺序已保存')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '保存顺序失败')
    }
    setDraggedQuickStartId(null)
  }

  const loadTodos = async () => {
    try {
      setTodos(await api.todos.list({ status: 'pending' }))
    } catch {
      // Todo 只是活动的可选关联，加载失败不应阻塞计时。
    }
  }

  useEffect(() => { void loadTodos() }, [])

  // 加载最近记录（按日期范围筛选）
  const loadRecent = async () => {
    const sequence = ++loadRecentSequence.current
    let from: string | undefined
    let to: string | undefined
    const now = new Date()

    if (dateRange === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
    } else if (dateRange === 'yesterday') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      from = new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString()
      to = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59).toISOString()
    } else if (dateRange === '7days') {
      const f = new Date(now)
      f.setDate(f.getDate() - 6)
      from = new Date(f.getFullYear(), f.getMonth(), f.getDate()).toISOString()
      to = now.toISOString()
    } else if (dateRange === '30days') {
      const f = new Date(now)
      f.setDate(f.getDate() - 29)
      from = new Date(f.getFullYear(), f.getMonth(), f.getDate()).toISOString()
      to = now.toISOString()
    } else if (dateRange === 'custom') {
      if (customFrom) from = new Date(customFrom + 'T00:00:00').toISOString()
      if (customTo) to = new Date(customTo + 'T23:59:59').toISOString()
    }

    try {
      const list = await api.timer.list({ from, to })
      if (sequence !== loadRecentSequence.current) return
      setRecent(list)
      setRecentError('')
    } catch (e) {
      if (sequence !== loadRecentSequence.current) return
      // 保留当前时间线，避免临时网络错误被误显示成“暂无记录”。
      setRecentError(e instanceof Error ? e.message : '加载活动记录失败')
    }
  }

  useEffect(() => {
    void loadRecent()
  }, [running.length, dateRange, customFrom, customTo])

  const startActivity = async (tagId: string, todoId?: string, interruptedFromId?: string) => {
    const tag = tags.find((t) => t.id === tagId)
    if (tag?.trackType === 'count') {
      await quickCount(tagId, undefined, todoId || undefined)
    } else {
      await start({ tagId, note: undefined, todoId: todoId || undefined, interruptedFromId })
    }
    await loadRecent()
  }

  const handleStart = async (tagId: string) => {
    if (startingTagIds.current.has(tagId)) return
    startingTagIds.current.add(tagId)
    try {
      const active = running.find(entry => entry.tagId === tagId)
      if (active) { await handleStop(active.id); return }
      await startActivity(tagId, quickTodoId || undefined)
      setFeedback('已保存到本机：' + (tags.find(tag => tag.id === tagId)?.trackType === 'count' ? '打卡成功' : '计时已开始'))
    } catch (e) {
      const message = (e as Error).message
      setActionError(message)
      announceUrgent(message)
    } finally {
      startingTagIds.current.delete(tagId)
    }
  }

  const openNextRecovery = () => {
    const next = useStore.getState().pending[0]
    setShowRecoveryDialog(next ?? null)
  }

  const handleStop = async (id: string, note?: string) => {
    const entry = running.find(e => e.id === id)
    if (!entry) return

    // 有序 tag 弹窗选择
    if (entry.tag?.mode === 'ordered') {
      setShowStopDialog({ entryId: id, tag: entry.tag })
      return
    }

    // 混沌 tag 直接停止
    setStoppingId(id)
    try {
      await stop(id, note, false)
      setFeedback('计时已结束并保存到本机，可在下方最近记录中查看')
      await loadRecent()
      openNextRecovery()
    } catch (e) {
      const message = (e as Error).message
      setActionError(message)
      announceUrgent(message)
    } finally {
      setStoppingId(null)
    }
  }

  const handleStopAll = async () => {
    setStoppingAll(true)
    try {
      await stopAll()
      await loadRecent()
      setFeedback('所有计时均已结束并保存到本机，可在下方最近记录中查看')
    } catch (e) {
      const message = (e as Error).message
      setActionError(message)
      announceUrgent(message)
    } finally {
      setStoppingAll(false)
    }
  }

  const handleDelete = (id: string) => {
    setPendingDeleteEntryId(id)
  }

  // 按分类分组标签
  const orderedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const orderedTags = (items: Tag[]) => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const tagsByCategory = orderedCategories.map((cat) => ({
    category: cat,
    tags: orderedTags(tags.filter((t) => t.categoryId === cat.id && !t.parentId)),
  }))
  const uncategorized = orderedTags(tags.filter((t) => !t.categoryId && !t.parentId))
  // 空分类不渲染，因此「首块跨整行」需要基于实际可见的分组来判断
  const visibleCategoryGroups = tagsByCategory.filter((group) => group.tags.length > 0)

  // 按结束时间倒序排序（进行中的在最上方，即 endTime 为 null 当作无穷大，已结束的按 endTime 倒序）
  const sortedRecent = useMemo(() => [...recent]
    .filter((e) => {
      if (filterCat && !(filterCat === 'none' ? !e.tag?.categoryId : e.tag?.categoryId === filterCat)) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const tagName = e.tag?.name?.toLowerCase() ?? ''
        const todoTitle = e.todo?.title?.toLowerCase() ?? ''
        const note = e.note?.toLowerCase() ?? ''
        const memoMatch = e.memos?.some((m) => m.content.toLowerCase().includes(q)) ?? false
        if (!tagName.includes(q) && !todoTitle.includes(q) && !note.includes(q) && !memoMatch) return false
      }
      return true
    })
    .sort((a, b) => {
      const timeA = a.endTime ? new Date(a.endTime).getTime() : Number.MAX_SAFE_INTEGER
      const timeB = b.endTime ? new Date(b.endTime).getTime() : Number.MAX_SAFE_INTEGER
      if (timeA !== timeB) return timeB - timeA
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    }), [recent, filterCat, searchQuery])

  return (
    <div className="workspace-page timer-page space-y-6">
      {feedback && <div role="status" className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-300">{feedback}</div>}
      {actionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{actionError}</div>}
      <PageHeader title="工作台" description="正在进行的计时、快速开始与最近记录" />

      {/* 布局：运行中为「计时 + 时间线 | 快速开始」两栏，空闲时单栏（session 自身 hidden） */}
      <div className={`timer-workspace grid items-start gap-5 ${running.length > 0 ? 'grid-cols-[minmax(0,1fr)_minmax(300px,360px)] max-lg:grid-cols-1' : 'grid-cols-1'}`}>
      <div className={`timer-session min-w-0 ${running.length > 0 ? 'sticky top-4 max-lg:static' : 'hidden'}`}>
      {/* 暂存条 */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">⏸ 暂存待续（{pending.length}）</h3>
          </div>
          <div className="space-y-2">
            {pending.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg border border-blue-100 dark:border-blue-900 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.tag?.color }} />
                  <span className="font-medium text-sm truncate">{entry.tag?.name}</span>
                  {entry.totalFocusedMs !== undefined && (
                    <span className="text-xs text-gray-500">· 专注 {formatDuration(entry.totalFocusedMs)}</span>
                  )}
                  {entry.note && <span className="text-xs text-gray-400 truncate">· {entry.note.slice(0, 30)}</span>}
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-2">
                  <button
                    onClick={() => setShowResumeDialog(entry)}
                    className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200"
                  >
                    续接
                  </button>
                  <button
                    onClick={() => setShowDismissDialog(entry)}
                    className="text-xs px-2 py-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    算了
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 进行中的计时卡片 */}
      {running.length > 0 ? (
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2 text-sm text-gray-500">
              {/* 呼吸圆点（MOTION_SPEC §2 L4 · pulse-live 2400ms）：装饰性，aria-hidden。
                  motion-safe: 前缀 + index.css 全局 reduce 兜底双保险（§0.3 硬规则 2）；
                  reduce 下脉冲圈被压成 .01ms 即停，视觉只剩静态实心点，符合 P5。
                  P4：循环动画元素 pointer-events-none，不拦截点击。 */}
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className="pointer-events-none absolute inline-flex h-full w-full motion-safe:animate-pulse-live rounded-full bg-brand/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
              {running.length > 1 ? `${running.length} 个计时进行中` : '正在计时'}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const c = (window as any).Capacitor
                  if (!c?.isNativePlatform?.()) {
                    document.documentElement.requestFullscreen?.().catch(() => { /* noop */ })
                  }
                  setShowFullscreen(true)
                }}
                className="text-sm text-brand hover:underline"
                title="全屏常显：持续时长 + 当前时间 + 当前任务，屏幕不熄灭"
              >
                ⛶ 全屏常显
              </button>
              {running.length > 1 && (
                <button
                  onClick={handleStopAll}
                  disabled={stoppingAll}
                  className="text-sm text-red-500 hover:underline disabled:opacity-50"
                >
                  {stoppingAll ? '停止中…' : '全部停止'}
                </button>
              )}
            </div>
          </div>
          <div className={`grid gap-3 ${running.length >= 2 ? 'grid-cols-1 sm:grid-cols-2' : ''}`}>
            {running.map((entry) => (
              <RunningTimer
                key={entry.id}
                entry={entry}
                stopping={stoppingId === entry.id}
                onStop={(note) => handleStop(entry.id, note)}
                todos={todos}
                onTodoChange={async (todoId) => {
                  await api.timer.update(entry.id, { todoId: todoId || null })
                  await useStore.getState().loadRunning()
                }}
                onTerminate={() => setShowTerminateDialog(entry)}
                onAddMemo={() => setMemoTargetEntry(entry)}
                onAddPointRecord={() => setPointTargetEntry(entry)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="timer-empty rounded-lg border border-gray-300 dark:border-gray-700 p-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-xl text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">◷</div>
          <div className="text-lg font-semibold mb-1 text-gray-800 dark:text-gray-100">现在还没有计时项目</div>
          <div className="text-sm text-gray-500">点下面任意标签即可开始。正在计时的标签会清楚标出来。</div>
        </div>
      )}
      </div>

      {/* 标签选择器 + 补录入口 */}
      <div className={`timer-quickstart min-w-0 rounded-xl border border-[rgb(209_213_219_/_0.9)] bg-white p-4 dark:border-[rgb(55_65_81_/_0.9)] dark:bg-gray-900 xl:px-6 xl:py-5 ${running.length > 0 ? 'sticky top-4 max-h-[calc(100vh_-_2rem)] overflow-y-auto max-lg:static max-lg:max-h-none max-lg:overflow-visible' : ''}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            快速开始
          </h2>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSortingQuickStart(value => !value)} aria-pressed={sortingQuickStart} title={sortingQuickStart ? '完成排序' : '调整分类和标签顺序'} className={`grid h-9 w-9 place-items-center rounded-lg ${sortingQuickStart ? 'bg-brand/10 text-brand' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button onClick={() => setShowManual(true)} className="text-sm text-brand hover:underline">+ 补录</button>
          </div>
        </div>
        {todos.length > 0 && (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">关联待办</span>
            <select
              value={quickTodoId}
              onChange={(e) => setQuickTodoId(e.target.value)}
              className="max-w-full input !w-auto !py-1.5 text-sm"
            >
              <option value="">不关联待办</option>
              {todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}
            </select>
          </div>
        )}
        {tags.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            还没有标签，去 <Link to="/tags" className="text-brand underline">标签管理</Link> 创建一些吧
          </div>
        ) : (
          <div className={`grid gap-3 ${running.length > 0 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'}`}>
            {visibleCategoryGroups.map(({ category, tags: ts }, groupIndex) =>
              (
                <div key={category.id} draggable={sortingQuickStart} onDragStart={(event) => { event.dataTransfer.setData('text/plain', category.id); event.dataTransfer.effectAllowed = 'move'; setDraggedQuickStartId(category.id) }} onDragOver={(event) => { if (sortingQuickStart) event.preventDefault() }} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/plain'); if (sourceId) void saveOrder(orderedCategories, sourceId, category.id, (id, sortOrder) => api.categories.update(id, { sortOrder })) }} onDragEnd={() => setDraggedQuickStartId(null)} className={`timer-category min-w-0 ${draggedQuickStartId === category.id ? 'opacity-40' : ''}`}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span
                      className="h-[6px] w-[6px] shrink-0 rounded-full"
                      style={{ background: category.color }}
                    />
                    <CategoryBadge category={category} />
                    <span className="text-[0.733rem] text-gray-400">{ts.length}</span>
                    {sortingQuickStart && <GripVertical className="ml-auto h-4 w-4 cursor-grab text-gray-400 active:cursor-grabbing" aria-label="拖动分类排序" />}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ts.map((tag) => (
                      <div key={tag.id} draggable={sortingQuickStart} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('text/plain', tag.id); event.dataTransfer.effectAllowed = 'move'; setDraggedQuickStartId(tag.id) }} onDragOver={(event) => { if (sortingQuickStart) event.preventDefault() }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const sourceId = event.dataTransfer.getData('text/plain'); if (sourceId) void saveOrder(ts, sourceId, tag.id, (id, sortOrder) => api.tags.update(id, { sortOrder })) }} onDragEnd={() => setDraggedQuickStartId(null)} className={`flex items-center gap-1 ${draggedQuickStartId === tag.id ? 'opacity-40' : ''}`}>
                        <QuickStartTagButton tag={tag} isRunning={running.some(entry => entry.tagId === tag.id)} onClick={() => handleStart(tag.id)} />
                        {sortingQuickStart && <GripVertical className="h-4 w-4 cursor-grab text-gray-400 active:cursor-grabbing" aria-label="拖动标签排序" />}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
            {uncategorized.length > 0 && (
              <div className="timer-category min-w-0">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">未分类</span>
                  <span className="text-[0.733rem] text-gray-400">{uncategorized.length}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {uncategorized.map((tag) => (
                    <div key={tag.id} draggable={sortingQuickStart} onDragStart={(event) => { event.dataTransfer.setData('text/plain', tag.id); event.dataTransfer.effectAllowed = 'move'; setDraggedQuickStartId(tag.id) }} onDragOver={(event) => { if (sortingQuickStart) event.preventDefault() }} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/plain'); if (sourceId) void saveOrder(uncategorized, sourceId, tag.id, (id, sortOrder) => api.tags.update(id, { sortOrder })) }} onDragEnd={() => setDraggedQuickStartId(null)} className={`flex items-center gap-1 ${draggedQuickStartId === tag.id ? 'opacity-40' : ''}`}>
                    <QuickStartTagButton tag={tag} isRunning={running.some(entry => entry.tagId === tag.id)} onClick={() => handleStart(tag.id)} />
                    {sortingQuickStart && <GripVertical className="h-4 w-4 cursor-grab text-gray-400 active:cursor-grabbing" aria-label="拖动标签排序" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* 最近记录时间线 */}
      <div>
        {recentError && <div className="mb-3 text-xs text-red-500">{recentError}</div>}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <span>📅 活动时间线</span>
              <span className="text-xs font-normal text-gray-400">（按结束时间倒序）</span>
            </h2>
          </div>
          <div className="flex w-full items-center gap-2 flex-wrap sm:w-auto">
            {/* 搜索框 */}
            <div className="relative w-full sm:w-auto">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索活动/待办/备注/打点…"
                className="w-full text-xs border border-gray-200 dark:border-gray-800 rounded-lg pl-7 pr-2 py-1 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 sm:w-36 sm:focus:w-48 transition-[width] focus:outline-none focus:border-brand"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
            </div>
            {/* 日期范围快捷选项 */}
            <div className="flex max-w-full gap-1 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
              {([
                { key: 'today', label: '今天' },
                { key: 'yesterday', label: '昨天' },
                { key: '7days', label: '近7天' },
                { key: '30days', label: '近30天' },
                { key: 'custom', label: '自定义' },
              ] as const).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setDateRange(r.key)}
                  className={`shrink-0 px-2 py-1 rounded-full text-xs ${dateRange === r.key ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {/* 自定义日期区间 */}
            {dateRange === 'custom' && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  max={customTo || undefined}
                  className="text-xs border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300"
                />
                <span className="text-gray-400 text-xs">至</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  min={customFrom || undefined}
                  className="text-xs border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300"
                />
              </div>
            )}
            {/* 分类筛选 */}
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="text-xs border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 text-gray-500"
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="none">未分类</option>
            </select>
          </div>
        </div>

        {/* 最近活动时间线列表 */}
        {sortedRecent.length > 0 ? (
          <div className="pt-2">
            {sortedRecent.map((e, index) => (
              <TimelineEntryItem
                key={e.id}
                entry={e}
                animationDelay={Math.min(index, 5) * 40}
                onAddMemo={(entry) => setMemoTargetEntry(entry)}
                onAddPoint={(entry) => setPointTargetEntry(entry)}
                onEdit={(entry) => setEditingEntry(entry)}
                onDelete={(id) => handleDelete(id)}
                onReload={loadRecent}
              />
            ))}
          </div>
        ) : (
          tags.length > 0 && (
            <div className="text-center py-8 text-gray-400 text-sm bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              {dateRange === 'custom' && !customFrom && !customTo
                ? '请选择日期区间'
                : '该时间段暂无记录'}
            </div>
          )
        )}
      </div>

      {/* 点记录弹窗 */}
      {pointTargetEntry && (
        <PointRecordModal
          entry={pointTargetEntry}
          onClose={() => setPointTargetEntry(null)}
          onSaved={async () => {
            setPointTargetEntry(null)
            await loadRecent()
          }}
        />
      )}

      {/* 记事/日记弹窗 */}
      {memoTargetEntry && (
        <MemoCreateModal
          entry={memoTargetEntry}
          onClose={() => setMemoTargetEntry(null)}
          onSaved={async () => {
            setMemoTargetEntry(null)
            await loadRecent()
          }}
        />
      )}

      {/* 补录弹窗 */}
      {showManual && (
        <ManualEntryModal
          tags={tags}
          categories={categories}
          todos={todos}
          onClose={() => setShowManual(false)}
          onSaved={async () => {
            setShowManual(false)
            await loadRecent()
          }}
        />
      )}

      {/* 编辑记录弹窗 */}
      {editingEntry && (
        <EntryEditModal
          entry={editingEntry}
          tags={tags}
          todos={todos}
          onClose={() => setEditingEntry(null)}
          onSaved={async () => {
            setEditingEntry(null)
            await loadRecent()
          }}
        />
      )}

      {/* 有序 tag 停止选择弹窗 */}
      {showStopDialog && (
        <StopDialog
          entryId={showStopDialog.entryId}
          tag={showStopDialog.tag}
          onClose={() => setShowStopDialog(null)}
          onConfirm={async (pendingResume, note) => {
            setStoppingId(showStopDialog.entryId)
            try {
              await stop(showStopDialog.entryId, note, pendingResume)
              setFeedback(pendingResume ? '计时已结束并保存到本机，活动已暂存待续' : '计时已结束并保存到本机，可在下方最近记录中查看')
              if (pendingResume) {
                setShowActivityPicker({ interruptedFromId: showStopDialog.entryId })
              } else {
                openNextRecovery()
              }
              await loadRecent()
            } catch (e) {
              const message = (e as Error).message
              setActionError(message)
              announceUrgent(message)
            } finally {
              setStoppingId(null)
            }
          }}
        />
      )}

      {/* 续接弹窗 */}
      {showResumeDialog && (
        <ResumeDialog
          entry={showResumeDialog}
          onClose={() => setShowResumeDialog(null)}
          onConfirm={async () => {
            await resumeEntry(showResumeDialog.id)
            await loadRecent()
          }}
        />
      )}

      {showActivityPicker && (
        <ActivityPickerDialog
          categories={categories}
          tags={tags}
          todos={todos}
          interruptedFromId={showActivityPicker.interruptedFromId}
          onClose={() => setShowActivityPicker(null)}
          onStart={async (tagId, todoId) => {
            await startActivity(tagId, todoId, showActivityPicker.interruptedFromId)
          }}
        />
      )}

      {showRecoveryDialog && (
        <RecoveryDialog
          entries={pending}
          onClose={() => setShowRecoveryDialog(null)}
          onResume={async (entry) => {
            await resumeEntry(entry.id)
            setShowRecoveryDialog(null)
            await loadRecent()
          }}
          onFinish={async (entry) => {
            await finishPending(entry.id)
            openNextRecovery()
          }}
          onStartAnother={(entry) => {
            setShowRecoveryDialog(null)
            setShowActivityPicker({ interruptedFromId: entry.id })
          }}
        />
      )}

      {showTerminateDialog && (
        <TerminateDialog
          entry={showTerminateDialog}
          onClose={() => setShowTerminateDialog(null)}
          onConfirm={async (reason) => {
            await terminateChain(showTerminateDialog.id, reason)
            setShowTerminateDialog(null)
            await loadRecent()
          }}
        />
      )}

      {/* 放弃暂存弹窗 */}
      {showDismissDialog && (
        <DismissDialog
          entry={showDismissDialog}
          onClose={() => setShowDismissDialog(null)}
          onConfirm={async (reason) => {
            await dismissPending(showDismissDialog.id, reason)
          }}
        />
      )}

      {/* 全屏常显时钟 */}
      {showFullscreen && <FullscreenClockOverlay onClose={() => setShowFullscreen(false)} />}

      {/* 删除时间记录确认（替代原生 confirm） */}
      <ConfirmDialog
        open={!!pendingDeleteEntryId}
        danger
        title="删除确认"
        message="确定要删除这条时间记录吗？"
        onConfirm={async () => {
          const id = pendingDeleteEntryId
          if (!id) return
          try {
            await api.timer.remove(id)
            await loadRecent()
          } catch (e) {
            const message = e instanceof Error ? e.message : '删除时间记录失败'
            setActionError(message)
            announceUrgent(message)
          } finally {
            setPendingDeleteEntryId(null)
          }
        }}
        onCancel={() => setPendingDeleteEntryId(null)}
      />
    </div>
  )
}

type PlanDraft = {
  content: string
  start: string
  end: string
  tagId: string
  todoId: string
}

const minuteFromTime = (value: string) => {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

const timeFromMinute = (minute: number) => {
  const h = Math.floor(minute / 60) % 24
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const planStatusLabel: Record<string, string> = {
  upcoming: '待开始',
  active: '进行中',
  paused: '已暂停',
  done: '已完成',
  partial: '部分完成',
  missed: '未执行',
}

const planDispositionLabel: Record<string, string> = { planned: '按原计划', skipped: '已跳过', deferred: '已推迟' }

function PlanPanel({
  plans,
  tags,
  todos,
  error,
  onReload,
  onStart,
  onChanged,
}: {
  plans: PlanBlock[]
  tags: Tag[]
  todos: Todo[]
  error: string
  onReload: () => Promise<void>
  onStart: (plan: PlanBlock, tagId: string) => Promise<void>
  onChanged: () => Promise<void>
}) {
  const [showComposer, setShowComposer] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [startingPlanId, setStartingPlanId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // 计划操作失败的行内错误（面板级）与编辑器内的校验/保存错误，替代原生 alert
  const [panelError, setPanelError] = useState('')
  const [editorError, setEditorError] = useState('')
  const [pendingDeletePlan, setPendingDeletePlan] = useState<PlanBlock | null>(null)
  const [deferringPlan, setDeferringPlan] = useState<PlanBlock | null>(null)
  const [draft, setDraft] = useState<PlanDraft>(() => {
    const now = new Date()
    const start = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15
    return { content: '', start: timeFromMinute(Math.min(start, 23 * 60 + 45)), end: timeFromMinute(Math.min(start + 60, 24 * 60 - 1)), tagId: '', todoId: '' }
  })
  const [editDraft, setEditDraft] = useState<PlanDraft | null>(null)
  const resetDraft = () => {
    const now = new Date()
    const start = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15
    setDraft({ content: '', start: timeFromMinute(Math.min(start, 23 * 60 + 45)), end: timeFromMinute(Math.min(start + 60, 24 * 60 - 1)), tagId: '', todoId: '' })
  }

  const submitNew = async () => {
    if (!draft.content.trim()) return
    const startMinute = minuteFromTime(draft.start)
    const endMinute = minuteFromTime(draft.end)
    if (endMinute <= startMinute) {
      setEditorError('结束时间必须晚于开始时间')
      return
    }
    setSaving(true)
    try {
      await api.plans.create({
        date: localDateKey(),
        startMinute,
        endMinute,
        content: draft.content.trim(),
        tagId: draft.tagId || null,
        todoId: draft.todoId || null,
      })
      setEditorError('')
      resetDraft()
      setShowComposer(false)
      await onChanged()
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建计划失败'
      setEditorError(message)
      announceUrgent(message)
    } finally {
      setSaving(false)
    }
  }

  const beginEdit = (plan: PlanBlock) => {
    setEditingId(plan.id)
    setEditDraft({
      content: plan.content,
      start: timeFromMinute(plan.startMinute),
      end: timeFromMinute(plan.endMinute),
      tagId: plan.tagId ?? '',
      todoId: plan.todoId ?? '',
    })
  }

  const saveEdit = async (plan: PlanBlock) => {
    if (!editDraft || !editDraft.content.trim()) return
    const startMinute = minuteFromTime(editDraft.start)
    const endMinute = minuteFromTime(editDraft.end)
    if (endMinute <= startMinute) {
      setEditorError('结束时间必须晚于开始时间')
      return
    }
    setSaving(true)
    try {
      await api.plans.update(plan.id, {
        content: editDraft.content.trim(),
        startMinute,
        endMinute,
        tagId: editDraft.tagId || null,
        todoId: editDraft.todoId || null,
      })
      setEditorError('')
      setEditingId(null)
      setEditDraft(null)
      await onChanged()
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存计划失败'
      setEditorError(message)
      announceUrgent(message)
    } finally {
      setSaving(false)
    }
  }

  const perform = async (plan: PlanBlock, action: () => Promise<unknown>) => {
    setActionId(plan.id)
    try {
      await action()
      await onChanged()
    } catch (error) {
      const message = error instanceof Error ? error.message : '计划操作失败'
      setPanelError(message)
      announceUrgent(message)
    } finally {
      setActionId(null)
    }
  }

  const deferPlan = (plan: PlanBlock) => {
    setDeferringPlan(plan)
  }

  const renderEditor = (value: PlanDraft, setValue: (next: PlanDraft) => void, onSave: () => void, onCancel?: () => void) => (
    <div className="mt-3 space-y-2 rounded-xl border border-brand/20 bg-brand/5 p-3">
      {editorError && <p role="alert" className="text-xs text-red-500">{editorError}</p>}
      <textarea
        value={value.content}
        onChange={(event) => setValue({ ...value, content: event.target.value })}
        placeholder="具体要做什么？"
        rows={2}
        maxLength={2000}
        className="input min-h-16 w-full resize-y"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs text-gray-500">开始<input type="time" value={value.start} onChange={(event) => setValue({ ...value, start: event.target.value })} className="input mt-1 w-full" /></label>
        <label className="text-xs text-gray-500">结束<input type="time" value={value.end} onChange={(event) => setValue({ ...value, end: event.target.value })} className="input mt-1 w-full" /></label>
        <label className="col-span-2 text-xs text-gray-500 sm:col-span-1">标签（可选）<select value={value.tagId} onChange={(event) => setValue({ ...value, tagId: event.target.value })} className="input mt-1 w-full"><option value="">不挂标签</option>{tags.filter((tag) => !tag.parentId).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}{tag.trackType === 'count' ? ' · 次数型（不可启动计划）' : ''}</option>)}</select></label>
        <label className="col-span-2 text-xs text-gray-500 sm:col-span-1">待办（可选）<select value={value.todoId} onChange={(event) => setValue({ ...value, todoId: event.target.value })} className="input mt-1 w-full"><option value="">不关联待办</option>{todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}</select></label>
      </div>
      <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="btn-secondary px-3 py-1.5 text-sm">取消</button><button type="button" onClick={onSave} disabled={saving || !value.content.trim()} className="btn-primary px-3 py-1.5 text-sm">{saving ? '保存中…' : '保存计划'}</button></div>
    </div>
  )

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">今日计划</h2><p className="mt-0.5 text-xs text-gray-500">写清楚这一段时间要完成的具体事情</p></div>
        <button type="button" onClick={() => setShowComposer((value) => !value)} className="btn-primary px-3 py-1.5 text-sm">{showComposer ? '收起' : '＋ 新建计划'}</button>
      </div>
      {showComposer && renderEditor(draft, setDraft, submitNew, () => setShowComposer(false))}
      {error && <div className="mt-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300"><span>{error}</span><button type="button" onClick={onReload} className="underline">重试</button></div>}
      {panelError && <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{panelError}</div>}
      {plans.length === 0 ? <div className="py-6 text-center text-sm text-gray-500">今天还没有计划，先写下第一件要做的事。</div> : <div className="mt-4 space-y-2">{[...plans].sort((a, b) => a.startMinute - b.startMinute).map((plan) => {
        const selectedTagId = plan.tagId ?? ''
        const tag = tags.find((item) => item.id === selectedTagId)
        const editing = editingId === plan.id && editDraft
        return <div key={plan.id} className={`rounded-xl border p-3 ${plan.disposition === 'skipped' ? 'border-gray-200 opacity-60 dark:border-gray-800' : 'border-gray-200 dark:border-gray-800'}`}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-24 shrink-0 text-xs font-medium text-gray-500">{timeFromMinute(plan.startMinute)} - {timeFromMinute(plan.endMinute)}<div className="mt-1 text-[0.733rem]">{planStatusLabel[plan.executionStatus ?? 'upcoming'] ?? '待开始'}</div><div className="mt-0.5 text-[0.667rem] text-gray-400">{planDispositionLabel[plan.disposition ?? 'planned']}{plan.confirmed ? ' · 已确认' : ''}</div></div>
            <div className="min-w-0 flex-1"><div className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{plan.content}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500"><select value={selectedTagId} onChange={(event) => void perform(plan, () => api.plans.update(plan.id, { tagId: event.target.value || null }))} className="input !w-auto !py-0.5 text-xs"><option value="">选择标签</option>{tags.filter((item) => !item.parentId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{tag && <span>{tag.trackType === 'count' ? '次数型' : '时长型'}</span>}{plan.actualMs != null && <span>已记录 {formatDuration(plan.actualMs)}</span>}{plan.coverageRate != null && <span>覆盖 {Math.round(plan.coverageRate * 100)}%</span>}</div></div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{plan.disposition !== 'skipped' && (selectedTagId ? <button type="button" disabled={actionId === plan.id || tag?.trackType === 'count'} onClick={() => tag?.trackType === 'time' && void perform(plan, () => onStart(plan, selectedTagId))} className="btn-primary px-2.5 py-1 text-xs">{tag?.trackType === 'count' ? '次数标签不可启动' : '开始'}</button> : startingPlanId === plan.id ? <select autoFocus aria-label="选择计划计时标签" defaultValue="" onChange={(event) => { const id = event.target.value; if (id) { setStartingPlanId(null); void perform(plan, () => onStart(plan, id)) } }} className="input !w-auto !py-1 text-xs"><option value="" disabled>选择时长型标签</option>{tags.filter((item) => item.trackType === 'time' && !item.parentId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <button type="button" disabled={actionId === plan.id || !tags.some((item) => item.trackType === 'time' && !item.parentId)} onClick={() => setStartingPlanId(plan.id)} className="btn-primary px-2.5 py-1 text-xs">开始</button>)}{plan.disposition === 'skipped' ? <button type="button" disabled={actionId === plan.id} onClick={() => void perform(plan, () => api.plans.unskip(plan.id))} className="btn-secondary px-2.5 py-1 text-xs">恢复</button> : <button type="button" disabled={actionId === plan.id} onClick={() => void perform(plan, () => api.plans.skip(plan.id))} className="btn-secondary px-2.5 py-1 text-xs">跳过</button>}<button type="button" disabled={actionId === plan.id} onClick={() => void perform(plan, () => api.plans.confirm(plan.id))} className="btn-secondary px-2.5 py-1 text-xs">确认</button>{plan.disposition !== 'deferred' && <button type="button" disabled={actionId === plan.id} onClick={() => setDeferringPlan(plan)} className="btn-secondary px-2.5 py-1 text-xs">推迟</button>}<button type="button" onClick={() => beginEdit(plan)} className="btn-secondary px-2.5 py-1 text-xs">编辑</button><button type="button" disabled={actionId === plan.id} onClick={() => setPendingDeletePlan(plan)} className="btn-secondary px-2.5 py-1 text-xs text-red-500">删除</button></div>
          </div>
          {editing && renderEditor(editDraft, setEditDraft, () => void saveEdit(plan), () => { setEditingId(null); setEditDraft(null) })}
        </div>
      })}</div>}

      {/* 删除计划确认（替代原生 confirm） */}
      <ConfirmDialog
        open={!!pendingDeletePlan}
        danger
        title="删除确认"
        message="确定要删除这项计划？"
        onConfirm={async () => {
          const plan = pendingDeletePlan
          if (!plan) return
          setPendingDeletePlan(null)
          await perform(plan, () => api.plans.remove(plan.id))
        }}
        onCancel={() => setPendingDeletePlan(null)}
      />

      {/* 推迟计划：日期 + 起止时间一次填完（替代三次原生 prompt） */}
      {deferringPlan && (
        <PlanDeferDialog
          plan={deferringPlan}
          onClose={() => setDeferringPlan(null)}
          onSubmit={(value) => perform(deferringPlan, () => api.plans.defer(deferringPlan.id, value))}
        />
      )}
    </section>
  )
}

/** 推迟计划弹窗：默认值语义同原原生 prompt（今天 / 原开始 / 原结束）。 */
function PlanDeferDialog({ plan, onClose, onSubmit }: {
  plan: PlanBlock
  onClose: () => void
  onSubmit: (value: { date: string; startMinute: number; endMinute: number }) => Promise<void>
}) {
  const [date, setDate] = useState(localDateKey())
  const [start, setStart] = useState(timeFromMinute(plan.startMinute))
  const [end, setEnd] = useState(timeFromMinute(plan.endMinute))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const startMinute = minuteFromTime(start)
    const endMinute = minuteFromTime(end)
    if (endMinute <= startMinute) {
      setError('结束时间必须晚于开始时间')
      return
    }
    setSaving(true)
    try {
      await onSubmit({ date, startMinute, endMinute })
    } finally {
      setSaving(false)
    }
    onClose()
  }

  return (
    <ModalShell title="推迟计划" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-xs text-gray-500">
          推迟到哪一天
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input mt-1" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-gray-500">
            新的开始时间
            <input type="time" value={start} onChange={(event) => setStart(event.target.value)} className="input mt-1" />
          </label>
          <label className="block text-xs text-gray-500">
            新的结束时间
            <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} className="input mt-1" />
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1.5 text-sm">取消</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="btn-primary px-3 py-1.5 text-sm">{saving ? '处理中…' : '确定推迟'}</button>
        </div>
      </div>
    </ModalShell>
  )
}

// ===== 全屏常显时钟（手机端：持续时长 + 当前任务 + 当前时间，屏幕不熄灭）=====
function FullscreenClockOverlay({ onClose }: { onClose: () => void }) {
  const running = useStore((s) => s.running)
  const clockOffset = useStore((s) => s.clockOffset)
  const [now, setNow] = useState(Date.now())
  const [wakeLocked, setWakeLocked] = useState(false)
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(orientation: portrait)').matches : true
  )

  // 监听横竖屏切换，动态调整布局
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)')
    const onChange = (e: MediaQueryListEvent) => setIsPortrait(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // 每秒刷新
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // 屏幕常亮：Wake Lock，切后台回来自动重新获取
  useEffect(() => {
    let sentinel: any = null
    let cancelled = false
    const acquire = async () => {
      try {
        const wl = (navigator as any).wakeLock
        if (!wl) return
        sentinel = await wl.request('screen')
        setWakeLocked(true)
        sentinel?.addEventListener?.('release', () => setWakeLocked(false))
      } catch {
        /* 权限被拒或环境不支持时静默降级 */
      }
    }
    acquire()
    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      try { sentinel?.release?.() } catch { /* noop */ }
    }
  }, [])

  // 进入全屏，退出时恢复
  // 浏览器的 requestFullscreen 已在按钮点击手势中同步调用（此处不再重复）
  // 原生端隐藏系统状态栏；同时隐藏页头并锁定 body（见 index.css fullscreen-clock-active）
  useEffect(() => {
    const Capacitor = (window as any).Capacitor
    const isNative = Boolean(Capacitor?.isNativePlatform?.())
    document.body.classList.add('fullscreen-clock-active')

    const hideNativeStatusBar = async () => {
      try {
        if (!isNative) return
        const { StatusBar } = await import('@capacitor/status-bar')
        try { await StatusBar.setOverlaysWebView({ overlay: false }) } catch { /* noop */ }
        await StatusBar.hide()
      } catch { /* noop */ }
    }
    hideNativeStatusBar()

    return () => {
      document.body.classList.remove('fullscreen-clock-active')
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* noop */ })
      if (isNative) {
          import('@capacitor/status-bar')
          .then(async ({ StatusBar }) => {
            await StatusBar.show()
            await syncNativeStatusBarTheme()
            window.dispatchEvent(new Event('resize'))
          })
          .catch(() => { /* noop */ })
      }
    }
  }, [])

  const wallTime = new Date(now)
  const count = running.length

  // 布局（方向感知）：竖屏 2个上下堆叠 / 3个上通栏+下左右；横屏 2个左右 / 3个左右+下中；4个均为田字格
  const gridClass =
    count === 1 ? 'grid-cols-1 grid-rows-1'
    : count === 2 ? (isPortrait ? 'grid-cols-1 grid-rows-2' : 'grid-cols-2 grid-rows-1')
    : count === 3 ? 'grid-cols-2 grid-rows-2'
    : 'grid-cols-2'

  // 字号随任务数与方向自适应（时钟 8 个等宽字符宽 ≈ 4.8 倍字号，需同时容纳于格子宽度与高度）
  const clockSize =
    count === 1 ? 'min(19vw, 50dvh)'
    : count === 2 ? (isPortrait ? 'min(19vw, 22dvh)' : 'min(9.5vw, 40dvh)')
    : count === 3 ? (isPortrait ? 'min(9.5vw, 20dvh)' : 'min(9.5vw, 28dvh)')
    : count === 4 ? (isPortrait ? 'min(9.5vw, 20dvh)' : 'min(9.5vw, 24dvh)')
    : 'min(8.5vw, 16dvh)'
  const nameSize =
    count === 1 ? 'min(6vw, 5dvh)'
    : count === 2 ? (isPortrait ? 'min(5vw, 3.5dvh)' : 'min(4.5vw, 3.5dvh)')
    : count === 3 ? 'min(4vw, 3dvh)'
    : 'min(3.5vw, 2.5dvh)'

  return createPortal((
    <div
      className="fullscreen-clock-overlay fixed inset-0 z-[100] flex flex-col select-none overflow-hidden bg-black text-white"
    >
      {/* 顶部状态 */}
      <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-1 text-sm text-gray-400">
        <span className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${count > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}
          />
          {count > 0 ? `${count} 个计时进行中` : '未在计时'}
          {wakeLocked && <span className="text-xs text-gray-600">· 屏幕常亮</span>}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none p-2" title="退出全屏">
          ✕
        </button>
      </div>

      {/* 中部：任务网格，每格尽量占满 */}
      <div className={`fullscreen-clock-grid flex-1 min-h-0 w-full grid gap-x-2 gap-y-3 px-2 py-2 ${gridClass} ${count > 4 ? 'is-scrollable overflow-y-auto' : ''}`}>
        {count === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center text-gray-500 space-y-3">
            <div className="text-6xl">⏱</div>
            <div className="text-lg">未在计时</div>
            <div className="text-xs text-gray-600">回 App 选择标签开始</div>
          </div>
        ) : (
          running.map((entry, i) => {
            const elapsed = Math.max(0, (now - clockOffset) - new Date(entry.startTime).getTime())
            const color = entry.tag?.color ?? '#0f766e'
            return (
              <div
                key={entry.id}
                className={`flex flex-col items-center justify-center text-center min-h-0 min-w-0 p-2 ${count === 3 && (isPortrait ? i === 0 : i === 2) ? 'col-span-2' : ''}`}
              >
                <div className="flex items-center justify-center gap-2 mb-2 flex-wrap min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="font-medium truncate max-w-[46vw]" style={{ color, fontSize: nameSize }}>
                    {entry.tag?.icon ? `${entry.tag.icon} ` : ''}{entry.tag?.name}
                  </span>
                  {entry.tag?.category && count <= 3 && (
                    <CategoryBadge category={entry.tag.category} size="xs" className="shrink-0" style={{ fontSize: 'min(2.5vw, 2.2vh)' }} />
                  )}
                </div>
                <div
                  className="font-mono font-bold tabular-nums leading-none"
                  style={{ color, fontSize: clockSize }}
                >
                  {formatClock(elapsed)}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 底部：当前时间（保持字号，压缩高度给任务区让空间） */}
      <div className="shrink-0 text-center px-2 pb-2 pt-1 sm:pb-4">
        <div className="fullscreen-clock-walltime font-mono font-light tabular-nums text-gray-100 leading-tight">
          {wallTime.toLocaleTimeString('zh-CN', { hour12: false })}
        </div>
        <div className="mt-1 text-sm text-gray-500">
          {wallTime.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </div>
      </div>
    </div>
  ), document.body)
}

// 进行中计时卡片（内部自带每秒时钟，避免整页重渲染）
function RunningTimer({ entry, stopping, todos, onStop, onTodoChange, onTerminate, onAddMemo, onAddPointRecord }: {
  entry: TimeEntry
  stopping: boolean
  todos: Todo[]
  onStop: (note?: string) => void
  onTodoChange: (todoId: string) => Promise<void>
  onTerminate: () => void
  onAddMemo: () => void
  onAddPointRecord: () => void
}) {
  const clockOffset = useStore((s) => s.clockOffset)
  const [note, setNote] = useState(entry.note ?? '')
  const [noteSaved, setNoteSaved] = useState(false)
  const [todoSaving, setTodoSaving] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const elapsed = Math.max(0, (now - clockOffset) - new Date(entry.startTime).getTime())

  const saveNote = async () => {
    try {
      await api.timer.update(entry.id, { note })
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 1500)
    } catch (e) {
      const message = e instanceof Error ? e.message : '保存备注失败'
      setError(message)
      announceUrgent(message)
    }
  }

  const changeTodo = async (todoId: string) => {
    setTodoSaving(true)
    try {
      await onTodoChange(todoId)
    } catch (e) {
      const message = e instanceof Error ? e.message : '关联待办失败'
      setError(message)
      announceUrgent(message)
    } finally {
      setTodoSaving(false)
    }
  }

  return (
    <div className="timer-running-card relative rounded-xl border p-3 text-center sm:p-4">
      <div className="mb-1 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5 font-medium text-brand-700 dark:text-brand-300">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600 dark:bg-brand-400" aria-hidden="true" />
          正在计时
        </span>
        {entry.tag?.category && (
          <CategoryBadge category={entry.tag.category} size="xs" />
        )}
      </div>
      <div className="text-lg font-semibold leading-tight text-gray-900 dark:text-gray-50">
        {entry.tag?.name}
      </div>
      <div className="clock-hero my-1.5 font-mono text-4xl font-semibold tabular-nums tracking-tight text-gray-900 sm:text-5xl">
        {formatClock(elapsed)}
      </div>
      <div className="text-[0.667rem] text-gray-400 mb-2">
        开始于 {formatTimeWithSeconds(entry.startTime)}
      </div>
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="text-[0.667rem] text-gray-500 dark:text-gray-400">待办</span>
        <select
          value={entry.todoId ?? ''}
          disabled={todoSaving}
          onChange={(e) => void changeTodo(e.target.value)}
          className="max-w-[min(22rem,80vw)] input !w-auto !py-1 text-[0.733rem]"
        >
          <option value="">不关联待办</option>
          {todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}
        </select>
      </div>
      {/* 备注编辑 */}
      <div className="flex gap-2 mb-2 max-w-sm mx-auto">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="添加简单备注…"
          className="input !py-1 text-xs"
        />
        <button
          onClick={saveNote}
          className="whitespace-nowrap rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {noteSaved ? '✓ 已存' : '存备注'}
        </button>
      </div>
      {error && <p role="alert" className="mb-2 text-xs text-red-500">{error}</p>}
      {/* 按钮行：点记录 / 记日记 / 停止 */}
      <div className="flex justify-center items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onAddPointRecord}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          点记录
        </button>

        <button
          type="button"
          onClick={onAddMemo}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          记日记
        </button>

        <button
          onClick={() => onStop(note)}
          disabled={stopping}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {stopping ? '停止中…' : '停止'}
        </button>
        <button
          type="button"
          onClick={onTerminate}
          className="rounded-lg px-2 py-1.5 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          title="终止当前活动及其接管链，必须填写原因"
        >
          终止链路
        </button>
      </div>
    </div>
  )
}

// 活动时间线单条组件（节点线 + 结束时间倒序 + 内联下拉点记录/日记）
function TimelineEntryItem({
  entry,
  onAddMemo,
  onAddPoint,
  onEdit,
  onDelete,
  onReload,
  animationDelay,
}: {
  entry: TimeEntry
  onAddMemo: (e: TimeEntry) => void
  onAddPoint: (e: TimeEntry) => void
  onEdit: (e: TimeEntry) => void
  onDelete: (id: string) => void
  onReload: () => void
  /** 列表错峰延迟：40ms/项，最多错 6 项，第 7 项起齐出（同 TodosPage 范式）。 */
  animationDelay?: number
}) {
  const pointMemos = useMemo(() => (entry.memos || []).filter((m) => m.type === 'point'), [entry.memos])
  const diaryMemos = useMemo(() => (entry.memos || []).filter((m) => m.type !== 'point'), [entry.memos])

  const [showPoints, setShowPoints] = useState(false)
  const [showDiaries, setShowDiaries] = useState(false)
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewVideo, setPreviewVideo] = useState<string | null>(null)
  const [pendingDeleteMemo, setPendingDeleteMemo] = useState<Memo | null>(null)
  const [error, setError] = useState('')

  const isRunning = !entry.endTime
  const displayEndTime = entry.endTime ? formatTimeWithSeconds(entry.endTime) : '进行中'

  const confirmDeleteMemo = async () => {
    const memo = pendingDeleteMemo
    if (!memo) return
    setPendingDeleteMemo(null)
    try {
      await api.memos.remove(memo.id)
      await onReload()
    } catch (e) {
      // 原实现此处无 catch，删除失败会静默；按行内错误规范补上播报
      const message = e instanceof Error ? e.message : '删除失败'
      setError(message)
      announceUrgent(message)
    }
  }

  return (
    <div
      className={`relative pl-8 pb-6 group last:pb-0 ${animationDelay !== undefined ? 'motion-safe:animate-list-in' : ''}`}
      style={animationDelay !== undefined ? { animationDelay: `${animationDelay}ms` } : undefined}
    >
      {/* 时间线连接轴 (Vertical Line Stem) */}
      <div className="absolute left-3 top-3 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-800 group-last:hidden" />

      {/* 时间线节点图标/圆圈 (Node Dot / Icon) */}
      <div
        className={`absolute -left-[1px] top-1.5 w-6 h-6 rounded-full border-2 border-white dark:border-gray-900 shadow-sm z-10 flex items-center justify-center text-xs transition-transform ${isRunning ? 'animate-pulse ring-2 ring-brand' : ''}`}
        style={{ background: entry.tag?.color ?? '#0f766e' }}
      >
        {entry.tag?.icon ? (
          <span className="text-[0.733rem] leading-none">{entry.tag.icon}</span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
        )}
      </div>

      {/* 时间线主体卡片 */}
      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 p-4 shadow-sm hover:shadow-md transition-shadow">
        {error && <p role="alert" className="mb-2 text-xs text-red-500">{error}</p>}
        {/* 卡片头部信息 */}
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold text-gray-800 dark:text-gray-100 truncate">
                {entry.tag?.icon ? `${entry.tag.icon} ` : ''}{entry.tag?.name}
              </span>
              {entry.tag?.category && (
                <CategoryBadge category={entry.tag.category} />
              )}
              {entry.todo && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium truncate max-w-[18rem]" title={entry.todo.title}>
                  待办：{entry.todo.title}
                </span>
              )}
              {isRunning && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 font-medium">
                  ● 进行中
                </span>
              )}

              {/* 小三角折叠/展开：点记录 */}
              {pointMemos.length > 0 && (
                <button
                  onClick={() => setShowPoints(!showPoints)}
                  className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 transition-colors flex items-center gap-1"
                >
                  <span>{showPoints ? '▼' : '►'} 📍 点记录 ({pointMemos.length}条)</span>
                </button>
              )}

              {/* 小三角折叠/展开：日记/随感 */}
              {diaryMemos.length > 0 && (
                <button
                  onClick={() => setShowDiaries(!showDiaries)}
                  className="text-xs px-2.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium hover:bg-green-100 transition-colors flex items-center gap-1"
                >
                  <span>{showDiaries ? '▼' : '►'} 📝 日记 ({diaryMemos.length}篇)</span>
                </button>
              )}
            </div>

            {/* 时间线时间范围 (突出结束时间排序) */}
            <div className="text-xs text-gray-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-gray-600 dark:text-gray-300 font-medium bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                结束: {displayEndTime}
              </span>
              <span>•</span>
              <span>
                {formatDateTimeWithSeconds(entry.startTime)}
                {entry.endTime ? ` → ${formatTimeWithSeconds(entry.endTime)}` : ''}
              </span>
            </div>

            {/* 备注 */}
            {entry.note && (
              <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-2.5 py-1.5 mt-2 border border-gray-100 dark:border-gray-800 inline-block">
                💬 {entry.note}
              </div>
            )}
          </div>

          {/* 右侧时长与操作按钮：点记录 / 记日记 / 编辑 / 删除 */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-shrink-0 sm:justify-end">
            <span className="text-sm font-mono font-semibold text-brand bg-brand-50 dark:bg-brand-900/30 px-2.5 py-1 rounded-lg">
              {entry.endTime
                ? formatDuration(new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime())
                : '进行中'}
            </span>
            <button
              onClick={() => onAddPoint(entry)}
              className="text-xs px-2 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center gap-1"
              title="添加点记录"
            >
              📍 打点
            </button>
            <button
              onClick={() => onAddMemo(entry)}
              className="text-xs px-2 py-1.5 rounded-lg border border-brand-200 dark:border-brand-800 text-brand hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors flex items-center gap-1"
              title="写关联日记"
            >
              📝 记日记
            </button>
            <button
              onClick={() => onEdit(entry)}
              className="text-gray-400 hover:text-brand p-1 text-sm transition-colors"
              title="编辑"
            >
              ✎
            </button>
            <button
              onClick={() => onDelete(entry.id)}
              className="text-gray-400 hover:text-red-500 p-1 text-sm transition-colors"
              title="删除"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 内联下拉：点记录列表 */}
        {showPoints && pointMemos.length > 0 && (
          <div className="mt-3 rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-900/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <span className="text-[0.667rem]">▼</span> 📍 点记录 ({pointMemos.length}条)
              </span>
              <button
                onClick={() => onAddPoint(entry)}
                className="text-xs px-2 py-1 rounded-lg bg-brand text-white font-medium hover:bg-brand-600 transition-colors"
              >
                + 添加打点
              </button>
            </div>
            <div className="space-y-2">
              {pointMemos.map((m: Memo) => (
                <MemoInlineItem
                  key={m.id}
                  memo={m}
                  onEdit={() => setEditingMemo(m)}
                  onDelete={() => setPendingDeleteMemo(m)}
                  onPreviewImage={(url) => setPreviewImage(url)}
                  onPreviewVideo={(url) => setPreviewVideo(url)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 内联下拉：日记列表 */}
        {showDiaries && diaryMemos.length > 0 && (
          <div className="mt-3 rounded-xl border border-green-100 dark:border-green-900/50 bg-green-50/40 dark:bg-green-900/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
                <span className="text-[0.667rem]">▼</span> 📝 关联日记 ({diaryMemos.length}篇)
              </span>
              <button
                onClick={() => onAddMemo(entry)}
                className="text-xs px-2 py-1 rounded-lg bg-brand text-white font-medium hover:bg-brand-600 transition-colors"
              >
                + 写日记
              </button>
            </div>
            <div className="space-y-2">
              {diaryMemos.map((m: Memo) => (
                <MemoInlineItem
                  key={m.id}
                  memo={m}
                  onEdit={() => setEditingMemo(m)}
                  onDelete={() => setPendingDeleteMemo(m)}
                  onPreviewImage={(url) => setPreviewImage(url)}
                  onPreviewVideo={(url) => setPreviewVideo(url)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 大图预览弹窗 */}
        {previewImage && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <img src={previewImage} alt="大图预览" className="max-w-full max-h-full rounded-lg object-contain" />
          </div>
        )}

        {/* 视频全屏播放弹窗 */}
        {previewVideo && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setPreviewVideo(null)}
          >
            <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setPreviewVideo(null)}
                className="absolute -top-10 right-0 text-white text-xl font-bold p-2"
              >
                ✕ 关闭
              </button>
              <video src={previewVideo} controls autoPlay className="w-full max-h-[80vh] rounded-lg" />
            </div>
          </div>
        )}

        {/* 编辑弹窗 */}
        {editingMemo && (
          <MemoEditModal
            memo={editingMemo}
            onClose={() => setEditingMemo(null)}
            onSaved={async () => {
              setEditingMemo(null)
              await onReload()
            }}
          />
        )}

        {/* 删除记录确认（替代原生 confirm） */}
        <ConfirmDialog
          open={!!pendingDeleteMemo}
          danger
          title="删除确认"
          message={pendingDeleteMemo?.type === 'point' ? '确定要删除这条点记录吗？' : '确定要删除这篇日记吗？'}
          onConfirm={confirmDeleteMemo}
          onCancel={() => setPendingDeleteMemo(null)}
        />
      </div>
    </div>
  )
}

// 内联展示单条 Memo（点记录 / 日记通用）
function MemoInlineItem({
  memo,
  onEdit,
  onDelete,
  onPreviewImage,
  onPreviewVideo,
}: {
  memo: Memo
  onEdit: () => void
  onDelete: () => void
  onPreviewImage: (url: string) => void
  onPreviewVideo: (url: string) => void
}) {
  return (
    <div className="p-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-brand font-semibold">
          {formatTimeWithSeconds(memo.createdAt)}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="text-xs text-gray-400 hover:text-brand">✎ 编辑</button>
          <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500">✕ 删除</button>
        </div>
      </div>
      <div className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">{memo.content}</div>
      {memo.attachments && memo.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {memo.attachments.map((att) =>
            att.mimeType.startsWith('image/') ? (
              <button
                key={att.id || att.path}
                type="button"
                onClick={() => onPreviewImage(resolveUploadUrl(att.path))}
                className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex-shrink-0"
              >
                <img src={resolveUploadUrl(att.path)} alt={att.filename} className="w-full h-full object-cover" />
              </button>
            ) : att.mimeType.startsWith('video/') ? (
              <button
                key={att.id || att.path}
                type="button"
                onClick={() => onPreviewVideo(resolveUploadUrl(att.path))}
                className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-black flex items-center justify-center flex-shrink-0 relative"
              >
                <span className="text-lg">🎬</span>
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[0.6rem] text-white text-center">播放</span>
              </button>
            ) : null
          )}
        </div>
      )}
    </div>
  )
}

// 点记录弹窗
export function PointRecordModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimeEntry
  onClose: () => void
  onSaved: () => void
}) {
  const [pointTime, setPointTime] = useState(toLocalInputWithSeconds(new Date()))
  const [content, setContent] = useState('')
  const [error, setError] = useState('')

  const save = async () => {
    if (!content.trim()) {
      setError('请输入点记录内容')
      return
    }
    const pointIso = toIsoSafe(pointTime)
    if (!pointIso) {
      setError('请选择有效的打点时间')
      return
    }
    setError('')
    try {
      await api.memos.create({
        content: content.trim(),
        type: 'point',
        timeEntryId: entry.id,
        tagId: entry.tagId,
        createdAt: pointIso,
      })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <ModalShell title={`添加点记录 · ${entry.tag?.name ?? ''}`} onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm text-gray-500">
          打点时刻 (精准到秒)
          <DateTimeSecondPicker value={pointTime} onChange={setPointTime} />
        </label>

        <label className="block text-sm text-gray-500">
          这个时间点做了什么事？
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="如：拉了个屎、看了下邮件、洗了个手..."
            className="input mt-1"
            autoFocus
          />
        </label>

        {error && <div className="text-sm text-red-500">{error}</div>}
      </div>
      <FormActions onCancel={onClose} onSave={save} saveLabel="保存点记录" />
    </ModalShell>
  )
}

// 补录弹窗
function ManualEntryModal({ tags, categories, todos, onClose, onSaved }: {
  tags: Tag[]
  categories: { id: string; name: string; color: string }[]
  todos: Todo[]
  onClose: () => void
  onSaved: () => void
}) {
  const now = new Date()
  const nowLocal = toLocalInputWithSeconds(now)
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600000)
  const twoHoursAgoLocal = toLocalInputWithSeconds(twoHoursAgo)

  const [tagId, setTagId] = useState(tags[0]?.id ?? '')
  const [startTime, setStartTime] = useState(twoHoursAgoLocal)
  const [endTime, setEndTime] = useState(nowLocal)
  const [note, setNote] = useState('')
  const [todoId, setTodoId] = useState('')
  const [error, setError] = useState('')

  const save = async () => {
    setError('')
    if (!tagId) {
      setError('请选择标签')
      return
    }
    const startIso = toIsoSafe(startTime)
    const endIso = toIsoSafe(endTime)
    if (!startIso || !endIso) {
      setError('请填写有效的开始/结束时间')
      return
    }
    if (new Date(endIso) <= new Date(startIso)) {
      setError('结束时间必须晚于开始时间')
      return
    }
    try {
      await api.timer.manual({
        tagId,
        startTime: startIso,
        endTime: endIso,
        note: note || undefined,
        todoId: todoId || undefined,
      })
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <ModalShell title="补录时间记录" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm text-gray-500">
          标签
          <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="input mt-1">
            <option value="">请选择…</option>
            {categories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {tags.filter((t) => t.categoryId === c.id && !t.parentId).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            ))}
            {tags.filter((t) => !t.categoryId && !t.parentId).length > 0 && (
              <optgroup label="未分类">
                {tags.filter((t) => !t.categoryId && !t.parentId).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-gray-500">
            开始时间 (带秒)
            <input
              type="datetime-local"
              step="1"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="input font-mono text-sm mt-1"
            />
          </label>
          <label className="block text-sm text-gray-500">
            结束时间 (带秒)
            <input
              type="datetime-local"
              step="1"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="input font-mono text-sm mt-1"
            />
          </label>
        </div>
        <label className="block text-sm text-gray-500">
          备注（可选）
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1" placeholder="如：完成了 XX 任务" />
        </label>
        {todos.length > 0 && (
          <label className="block text-sm text-gray-500">
            关联待办（可选）
            <select value={todoId} onChange={(e) => setTodoId(e.target.value)} className="input mt-1">
              <option value="">不关联待办</option>
              {todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}
            </select>
          </label>
        )}
        {error && <div className="text-sm text-red-500">{error}</div>}
      </div>
      <FormActions onCancel={onClose} onSave={save} saveLabel="补录" />
    </ModalShell>
  )
}

// 编辑记录弹窗
function EntryEditModal({ entry, tags, todos, onClose, onSaved }: {
  entry: TimeEntry
  tags: Tag[]
  todos: Todo[]
  onClose: () => void
  onSaved: () => void
}) {
  const [tagId, setTagId] = useState(entry.tagId)
  const [startTime, setStartTime] = useState(toLocalInputWithSeconds(entry.startTime))
  const [endTime, setEndTime] = useState(entry.endTime ? toLocalInputWithSeconds(entry.endTime) : '')
  const [note, setNote] = useState(entry.note ?? '')
  const [todoId, setTodoId] = useState(entry.todoId ?? '')
  const [error, setError] = useState('')

  // 次数型标签的记录 startTime === endTime（零时长打卡），编辑时需同步起止时间
  // 兼容 tags 尚未加载或标签已删除的情况，回退到 entry 自带的 tag
  const isCountEntry = (tags.find((t) => t.id === tagId)?.trackType ?? (entry as any).tag?.trackType) === 'count'

  const handleStartChange = (value: string) => {
    setStartTime(value)
    if (isCountEntry && endTime) setEndTime(value)
  }

  const save = async () => {
    setError('')
    const startIso = toIsoSafe(startTime)
    if (!startIso) {
      setError('请填写有效的开始时间')
      return
    }
    let endIso: string | null = null
    if (endTime) {
      endIso = toIsoSafe(endTime)
      if (!endIso) {
        setError('请填写有效的结束时间')
        return
      }
    }
    if (!isCountEntry && endIso && new Date(endIso) <= new Date(startIso)) {
      setError('结束时间必须晚于开始时间')
      return
    }
    try {
      await api.timer.update(entry.id, {
        tagId,
        startTime: startIso,
        endTime: endIso,
        note,
        todoId: todoId || null,
      })
      useStore.getState().loadRunning()
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <ModalShell title="编辑时间记录" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm text-gray-500">
          标签
          <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="input mt-1">
            {tags.filter((t) => !t.parentId).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-gray-500">
            开始时间 (带秒)
            <DateTimeSecondPicker value={startTime} onChange={handleStartChange} />
          </label>
          <div role="group" aria-label="结束时间 (带秒)">
            <div className="flex items-center justify-between mb-1">
              <span className="block text-sm text-gray-500">结束时间 (带秒)</span>
              {endTime && (
                <button
                  onClick={() => setEndTime('')}
                  className="text-xs text-red-500 hover:underline"
                  title="清除结束时间，保存后该活动将恢复为进行中"
                >
                  ✕ 清除
                </button>
              )}
            </div>
            {endTime ? (
              <DateTimeSecondPicker value={endTime} onChange={setEndTime} />
            ) : (
              <div className="flex items-center justify-between gap-2 h-[42px]">
                <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 px-2.5 py-1.5 rounded-lg">
                  ● 保存后恢复为进行中
                </span>
                <button
                  onClick={() => setEndTime(toLocalInputWithSeconds(new Date()))}
                  className="text-xs text-brand hover:underline whitespace-nowrap"
                >
                  撤销清除
                </button>
              </div>
            )}
          </div>
        </div>
        <label className="block text-sm text-gray-500">
          备注
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1" />
        </label>
        {todos.length > 0 && (
          <label className="block text-sm text-gray-500">
            关联待办（可选）
            <select value={todoId} onChange={(e) => setTodoId(e.target.value)} className="input mt-1">
              <option value="">不关联待办</option>
              {todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}
            </select>
          </label>
        )}
        {error && <div className="text-sm text-red-500">{error}</div>}
      </div>
      <FormActions onCancel={onClose} onSave={save} saveLabel="保存" />
    </ModalShell>
  )
}

// 通用弹窗壳
function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function FormActions({ onCancel, onSave, saveLabel }: { onCancel: () => void; onSave: () => void; saveLabel: string }) {
  return (
    <div className="flex justify-end gap-2 mt-6">
      <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
        取消
      </button>
      <button onClick={onSave} className="px-4 py-2 rounded-lg text-sm bg-brand text-white hover:bg-brand-600">
        {saveLabel}
      </button>
    </div>
  )
}

// 关联到计时的记事/日记弹窗
export function MemoCreateModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimeEntry
  onClose: () => void
  onSaved: () => void
}) {
  const [content, setContent] = useState('')
  const [uploading, setUploading] = useState(false)
  const [attachments, setAttachments] = useState<{ filename: string; path: string; mimeType: string; size: number }[]>([])
  const [error, setError] = useState('')
  const [memoTime, setMemoTime] = useState(toLocalInputWithSeconds(new Date()))

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setError('')
    try {
      const results = await Promise.all(Array.from(files).map((f) => api.memos.upload(f)))
      setAttachments((prev) => [...prev, ...results])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const save = async () => {
    if (!content.trim() && attachments.length === 0) {
      setError('请输入记事内容或上传文件')
      return
    }
    const memoIso = toIsoSafe(memoTime)
    if (!memoIso) {
      setError('请选择有效的记事时间')
      return
    }
    setError('')
    try {
      await api.memos.create({
        content: content.trim() || '（无文字附记）',
        type: 'diary',
        timeEntryId: entry.id,
        tagId: entry.tagId,
        createdAt: memoIso,
        attachments,
      })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <ModalShell title={`添加日记 / 随手记 · ${entry.tag?.name ?? ''}`} onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm text-gray-500">
          记事时间 (精准到秒)
          <DateTimeSecondPicker value={memoTime} onChange={setMemoTime} />
        </label>

        <label className="block text-sm text-gray-500">
          感悟 / 记事内容
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="写下当前计时时间段内的想法、收获或日志..."
            className="input mt-1"
            autoFocus
          />
        </label>

        <label className="block text-sm text-gray-500">
          多媒体附件（图片 / 视频）
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileUpload}
            disabled={uploading}
            className="block w-full text-xs text-gray-500 mt-1 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand dark:file:bg-brand-900/40 dark:file:text-brand-300 hover:file:bg-brand-100"
          />
          {uploading && <div className="text-xs text-brand mt-1">文件上传中...</div>}
        </label>

        {attachments.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 h-20 flex items-center justify-center">
                {att.mimeType.startsWith('image/') ? (
                  <img src={resolveUploadUrl(att.path)} alt={att.filename} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-1">
                    <span className="text-lg">🎬</span>
                    <div className="text-[0.667rem] truncate max-w-[80px]">{att.filename}</div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="text-sm text-red-500">{error}</div>}
      </div>
      <FormActions onCancel={onClose} onSave={save} saveLabel="保存记事" />
    </ModalShell>
  )
}

// 编辑记事弹窗
export function MemoEditModal({
  memo,
  onClose,
  onSaved,
}: {
  memo: Memo
  onClose: () => void
  onSaved: () => void
}) {
  const [content, setContent] = useState(memo.content)
  const [memoTime, setMemoTime] = useState(toLocalInputWithSeconds(memo.createdAt))
  const [uploading, setUploading] = useState(false)
  const [attachments, setAttachments] = useState(
    (memo.attachments ?? []).map((a) => ({
      filename: a.filename,
      path: a.path,
      mimeType: a.mimeType,
      size: a.size,
    }))
  )
  const [error, setError] = useState('')

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')
    try {
      const results = await Promise.all(Array.from(files).map((f) => api.memos.upload(f)))
      setAttachments((prev) => [...prev, ...results])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const save = async () => {
    if (!content.trim() && attachments.length === 0) {
      setError('请输入记事内容或上传文件')
      return
    }
    const memoIso = toIsoSafe(memoTime)
    if (!memoIso) {
      setError('请选择有效的记事时间')
      return
    }
    setError('')
    try {
      await api.memos.update(memo.id, {
        content: content.trim() || '（无文字附记）',
        createdAt: memoIso,
        attachments,
      })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <ModalShell title="编辑记事" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm text-gray-500">
          记事时间 (精准到秒)
          <DateTimeSecondPicker value={memoTime} onChange={setMemoTime} />
        </label>

        <label className="block text-sm text-gray-500">
          感悟 / 记事内容
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="input mt-1"
            autoFocus
          />
        </label>

        <label className="block text-sm text-gray-500">
          多媒体附件（图片 / 视频）
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileUpload}
            disabled={uploading}
            className="block w-full text-xs text-gray-500 mt-1 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand dark:file:bg-brand-900/40 dark:file:text-brand-300 hover:file:bg-brand-100"
          />
          {uploading && <div className="text-xs text-brand mt-1">文件上传中...</div>}
        </label>

        {attachments.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 h-20 flex items-center justify-center">
                {att.mimeType.startsWith('image/') ? (
                  <img src={resolveUploadUrl(att.path)} alt={att.filename} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-1">
                    <span className="text-lg">🎬</span>
                    <div className="text-[0.667rem] truncate max-w-[80px]">{att.filename}</div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="text-sm text-red-500">{error}</div>}
      </div>
      <FormActions onCancel={onClose} onSave={save} saveLabel="保存修改" />
    </ModalShell>
  )
}

// 暂停后选择下一活动
function ActivityPickerDialog({ categories, tags, todos, interruptedFromId, onClose, onStart }: {
  categories: { id: string; name: string; sortOrder: number; color: string; icon: string | null }[]
  tags: Tag[]
  todos: Todo[]
  interruptedFromId?: string
  onClose: () => void
  onStart: (tagId: string, todoId?: string) => Promise<void>
}) {
  const orderedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const orderedTags = (items: Tag[]) => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const timeTags = tags.filter((tag) => tag.trackType === 'time' && !tag.parentId)
  const groupedTags = orderedCategories
    .map((category) => ({
      category,
      tags: orderedTags(timeTags.filter((tag) => tag.categoryId === category.id)),
    }))
    .filter((group) => group.tags.length > 0)
  const uncategorizedTags = orderedTags(timeTags.filter((tag) => !tag.categoryId))
  const firstTag = groupedTags[0]?.tags[0] ?? uncategorizedTags[0]
  const [tagId, setTagId] = useState(firstTag?.id ?? '')
  const [todoId, setTodoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    if (!tagId) {
      setError('请选择一个时长型活动')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onStart(tagId, todoId || undefined)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '开始活动失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title={interruptedFromId ? '选择接下来做什么' : '选择活动'} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          原活动已经暂存，可以现在开始下一项，也可以稍后再处理。
        </p>
        <label className="block text-sm text-gray-500">
          活动
          <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="input mt-1">
            <option value="">请选择活动…</option>
            {groupedTags.map(({ category, tags: categoryTags }) => (
              <optgroup key={category.id} label={`${category.icon ? `${category.icon} ` : ''}${category.name}`}>
                {categoryTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.icon ? `${tag.icon} ` : ''}{tag.name}</option>
                ))}
              </optgroup>
            ))}
            {uncategorizedTags.length > 0 && (
              <optgroup label="未分类">
                {uncategorizedTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.icon ? `${tag.icon} ` : ''}{tag.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {todos.length > 0 && (
          <label className="block text-sm text-gray-500">
            关联待办（可选）
            <select value={todoId} onChange={(e) => setTodoId(e.target.value)} className="input mt-1">
              <option value="">不关联待办</option>
              {todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}
            </select>
          </label>
        )}
        {timeTags.length === 0 && <div className="text-sm text-gray-500">当前没有可计时的时长型活动。</div>}
        {error && <div className="text-sm text-red-500">{error}</div>}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => void handleStart()}
            disabled={loading || timeTags.length === 0}
            className="flex-1 px-4 py-2.5 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 disabled:opacity-50"
          >
            {loading ? '开始中…' : '开始活动'}
          </button>
          <button onClick={onClose} disabled={loading} className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            稍后处理
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// 当前活动结束后的待续回退选择
function RecoveryDialog({ entries, onClose, onResume, onFinish, onStartAnother }: {
  entries: TimeEntry[]
  onClose: () => void
  onResume: (entry: TimeEntry) => Promise<void>
  onFinish: (entry: TimeEntry) => Promise<void>
  onStartAnother: (entry: TimeEntry) => void
}) {
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0]

  if (!selected) return null

  const run = async (action: (entry: TimeEntry) => Promise<void>) => {
    setLoading(true)
    try {
      await action(selected)
    } catch (e) {
      const message = e instanceof Error ? e.message : '处理待续活动失败'
      setError(message)
      announceUrgent(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="接下来处理哪个活动？" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          当前活动已经结束，暂存中的活动还没有丢失。
        </p>
        {entries.length > 1 && (
          <div>
            <label className="block text-sm text-gray-500">
              选择待续活动
              <select value={selected.id} onChange={(e) => setSelectedId(e.target.value)} className="input mt-1">
                {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.tag?.name} · {entry.note || '无续接备注'}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: selected.tag?.color }} />
            <span className="font-medium">{selected.tag?.name}</span>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 whitespace-pre-wrap">{selected.note || '没有留下续接备注'}</div>
        </div>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => void run(onResume)} disabled={loading} className="px-3 py-2.5 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50">继续活动</button>
          <button onClick={() => onStartAnother(selected)} disabled={loading} className="px-3 py-2.5 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 disabled:opacity-50">开始新活动</button>
          <button onClick={() => void run(onFinish)} disabled={loading} className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">结束此活动</button>
          <button onClick={onClose} disabled={loading} className="px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">稍后处理</button>
        </div>
      </div>
    </ModalShell>
  )
}

// 终止本次链路：高警戒、原因必填
function TerminateDialog({ entry, onClose, onConfirm }: {
  entry: TimeEntry
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('必须填写终止本次链路的具体原因')
      return
    }
    setLoading(true)
    try {
      await onConfirm(reason.trim())
    } catch (e) {
      const message = e instanceof Error ? e.message : '终止链路失败'
      setError(message)
      announceUrgent(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="终止本次链路" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
          这会结束当前活动，并一并结束它接管过的上游活动。已有时间记录会保留，但这条链路不会再自动回收。
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">当前活动：{entry.tag?.name}</div>
        <label className="block text-sm text-gray-500">
          具体原因 *
          <textarea value={reason} onChange={(e) => { setReason(e.target.value); setError('') }} rows={3} className="input resize-y mt-1" placeholder="例如：需求取消，今天不再继续这组工作" autoFocus />
          {error && <p role="alert" className="mt-1 text-xs text-red-500">{error}</p>}
        </label>
        <div className="flex gap-2 pt-2">
          <button onClick={() => void handleConfirm()} disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50">{loading ? '终止中…' : '确认终止链路'}</button>
          <button onClick={onClose} disabled={loading} className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">取消</button>
        </div>
      </div>
    </ModalShell>
  )
}

// 有序 tag 停止选择弹窗
function StopDialog({ entryId, tag, onClose, onConfirm }: {
  entryId: string
  tag: Tag
  onClose: () => void
  onConfirm: (pendingResume: boolean, note?: string) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async (pendingResume: boolean) => {
    if (pendingResume && !note.trim()) {
      setError('有序标签暂停时需要记一下接下来怎么续')
      return
    }
    setLoading(true)
    try {
      await onConfirm(pendingResume, note.trim() || undefined)
      onClose()
    } catch (e) {
      const message = (e as Error).message
      setError(message)
      announceUrgent(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell onClose={onClose} title="接下来怎么续？">
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <span className="w-3 h-3 rounded-full" style={{ background: tag.color }} />
          <span className="font-medium">{tag.name}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">有序模式</span>
        </div>
        <label className="block text-sm text-gray-500">
          下一步怎么续（暂停时必填）
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); setError('') }}
            placeholder="写一句回来后马上能接上的提示…"
            className="input min-h-20 resize-y mt-1"
          />
        </label>
        {error && <p role="alert" className="mt-1 text-xs text-red-500">{error}</p>}
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => handleConfirm(true)}
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            ⏸ 暂停
          </button>
          <button
            onClick={() => handleConfirm(false)}
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 disabled:opacity-50"
          >
            ⏹ 直接结束
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            取消
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// 续接弹窗
function ResumeDialog({ entry, onClose, onConfirm }: {
  entry: TimeEntry
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      const message = (e as Error).message
      setError(message)
      announceUrgent(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell onClose={onClose} title={`接续：${entry.tag?.name ?? '任务'}`}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <span className="w-3 h-3 rounded-full" style={{ background: entry.tag?.color }} />
          <span className="font-medium">{entry.tag?.name}</span>
        </div>
        <div>
          <div className="block text-sm text-gray-500 mb-1">接下来怎么续</div>
          <div className="input min-h-20 whitespace-pre-wrap text-gray-600 dark:text-gray-300">
            {entry.note || '（没有备注）'}
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '接续中…' : '接续此任务'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            取消
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// 算了弹窗
function DismissDialog({ entry, onClose, onConfirm }: {
  entry: TimeEntry
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('请输入算了的原因')
      return
    }
    setLoading(true)
    try {
      await onConfirm(reason)
      onClose()
    } catch (e) {
      const message = (e as Error).message
      setError(message)
      announceUrgent(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell onClose={onClose} title="这件事算了不续了 ——">
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <span className="w-3 h-3 rounded-full" style={{ background: entry.tag?.color }} />
          <span className="font-medium">{entry.tag?.name}</span>
        </div>
        <label className="block text-sm text-gray-500">
          原因 *
          <input
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError('') }}
            placeholder="如：不重要、已完成、计划变更…"
            className="input mt-1"
          />
        </label>
        {error && <p role="alert" className="mt-1 text-xs text-red-500">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gray-500 text-white font-medium hover:bg-gray-600 disabled:opacity-50"
          >
            {loading ? '处理中…' : '算了'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            取消
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
