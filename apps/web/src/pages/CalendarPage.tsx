import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { formatDuration, useStore, toIsoSafe } from '../store'
import type { TimeEntry, Memo, Todo, Tag, PlanBlock } from '../types'
import { DateTimeSecondPicker } from '../components/DateTimeSecondPicker'
import { CalendarSyncModal } from '../components/CalendarSyncModal'
import { SubscriptionManager } from '../components/SubscriptionManager'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { CalendarDays } from 'lucide-react'
import { CategoryBadge } from '../components/CategoryBadge'
import type { CalendarEvent } from '../types'
import { Solar } from 'lunar-javascript'
import { readCalendarEventSnapshot, saveCalendarEventSnapshot } from '../calendarCache'

// 农历工具：公历转农历
function getLunarText(d: Date): string {
  const solar = Solar.fromDate(d)
  const lunar = solar.getLunar()
  const jieQi = lunar.getJieQi()
  if (jieQi) return jieQi
  // 初一显示月份，否则显示日期
  if (lunar.getDay() === 1) {
    return lunar.getMonth() > 0 ? `${lunar.getMonth()}月` : `闰${-lunar.getMonth()}月`
  }
  return lunar.getDayInChinese()
}

// ===== 日期工具函数 =====

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

// 周一为一周的第一天
function startOfWeek(d: Date): Date {
  const r = startOfDay(d)
  const day = r.getDay()
  const diff = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + diff)
  return r
}

function endOfWeek(d: Date): Date {
  const s = startOfWeek(d)
  const r = new Date(s)
  r.setDate(r.getDate() + 6)
  return endOfDay(r)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

function getWeekDays(d: Date): Date[] {
  const start = startOfWeek(d)
  return Array.from({ length: 7 }, (_, i) => {
    const r = new Date(start)
    r.setDate(r.getDate() + i)
    return r
  })
}

function getMonthGrid(d: Date): Date[] {
  const start = startOfWeek(startOfMonth(d))
  const end = endOfWeek(endOfMonth(d))
  const days: Date[] = []
  const cur = new Date(start)
  while (cur <= end) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date())
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const WEEKDAYS_FULL = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function formatDateRange(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) {
    return `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getDate()}日`
  }
  return `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`
}

function minutesFromStartOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

function toLocalInputWithSeconds(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function externalEventRange(event: CalendarEvent): { start: number; end: number } {
  const start = new Date(event.dtstart).getTime()
  const fallbackDuration = event.allday ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000
  const end = event.dtend ? new Date(event.dtend).getTime() : start + fallbackDuration
  return { start, end }
}

function externalEventOverlapsDay(event: CalendarEvent, dayStart: number, dayEnd: number): boolean {
  const { start, end } = externalEventRange(event)
  return Number.isFinite(start) && Number.isFinite(end) && start < dayEnd && end > dayStart
}

function formatExternalEventLabel(event: CalendarEvent): string {
  if (event.allday) return event.summary
  const start = new Date(event.dtstart)
  const startText = start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (!event.dtend) return `${startText} ${event.summary}`
  const end = new Date(event.dtend)
  const endText = end.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `${startText}-${endText} ${event.summary}`
}

function externalEventKind(event: CalendarEvent): 'holiday' | 'workday' | 'other' {
  // 节假日源的说明通常也会写“调休/上班”，不能用整段说明文字
  // 优先判断类型，否则“仅放假”订阅会被误显示成“班”。标题在这类
  // 订阅中明确区分了“假期”和“补班”，只有标题没有类型时才回退到说明。
  const summary = event.summary || ''
  if (/(补班|上班日|工作日)/.test(summary)) return 'workday'
  if (/(节|假|休|放假|假期|清明|劳动|端午|中秋|国庆|春节|元旦)/.test(summary)) return 'holiday'

  const description = event.description ?? ''
  if (/(节|假|休|放假|假期|清明|劳动|端午|中秋|国庆|春节|元旦)/.test(description)) return 'holiday'
  if (/(补班|调休|上班|上班日|工作日)/.test(description)) return 'workday'
  return 'other'
}

function activityDate(todo: Todo): Date | null {
  const value = todo.completedAt ?? todo.dueDate
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function activityIsOnDay(todo: Todo, day: Date): boolean {
  const date = activityDate(todo)
  return date ? isSameDay(date, day) : false
}

async function loadExternalEvents(params: { from: string; to: string }) {
  try {
    const events = await api.calendars.events(params)
    await saveCalendarEventSnapshot(params.from, params.to, events)
    return { events, fetchedAt: null as string | null }
  } catch (error) {
    const snapshot = await readCalendarEventSnapshot(params.from, params.to)
    if (!snapshot) throw error
    return { events: snapshot.events, fetchedAt: snapshot.fetchedAt }
  }
}

// ===== 重叠布局算法（同 Google Calendar）=====

interface LayoutItem {
  entry: TimeEntry
  start: number
  end: number
  col: number
  cols: number
}

function layoutEntries(entries: TimeEntry[], dayStart: number, dayEnd: number): LayoutItem[] {
  const items = entries
    .map((entry) => {
      const start = Math.max(new Date(entry.startTime).getTime(), dayStart)
      const end = Math.min(
        entry.endTime ? new Date(entry.endTime).getTime() : Date.now(),
        dayEnd
      )
      return { entry, start, end }
    })
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start)

  if (items.length === 0) return []

  // 分组重叠的条目
  const groups: (typeof items)[] = []
  let currentGroup: typeof items = []
  let currentEnd = 0

  for (const item of items) {
    if (item.start >= currentEnd && currentGroup.length > 0) {
      groups.push(currentGroup)
      currentGroup = []
    }
    currentGroup.push(item)
    currentEnd = Math.max(currentEnd, item.end)
  }
  if (currentGroup.length > 0) groups.push(currentGroup)

  // 在每组内分配列
  const result: LayoutItem[] = []
  for (const group of groups) {
    const columns: number[] = []
    const colMap: number[] = []
    for (const item of group) {
      let col = -1
      for (let i = 0; i < columns.length; i++) {
        if (columns[i] <= item.start) { col = i; break }
      }
      if (col === -1) { col = columns.length; columns.push(0) }
      columns[col] = item.end
      colMap.push(col)
    }
    const totalCols = columns.length
    group.forEach((item, i) => {
      result.push({ ...item, col: colMap[i], cols: totalCols })
    })
  }

  return result
}

// ===== 主组件 =====

const HOUR_HEIGHT_DAY = 60
const HOUR_HEIGHT_WEEK = 48

export default function CalendarPage() {
  const { categories, tags } = useStore()
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<'month' | 'week' | 'four'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [memos, setMemos] = useState<Memo[]>([])
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null)
  const [dayDetailDate, setDayDetailDate] = useState<Date | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [quickCreateDefaults, setQuickCreateDefaults] = useState<{ date: Date; startTime?: Date; endTime?: Date } | null>(null)
  const [planCreateDate, setPlanCreateDate] = useState<Date | null>(null)
  const [editingPlan, setEditingPlan] = useState<PlanBlock | null>(null)
  const [showSubManager, setShowSubManager] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState<Set<string> | null>(null)
  const [externalEvents, setExternalEvents] = useState<CalendarEvent[]>([])
  const [activities, setActivities] = useState<Todo[]>([])
  const [plans, setPlans] = useState<PlanBlock[]>([])
  const [calendarFilter, setCalendarFilter] = useState<'all' | 'timer' | 'activity'>('all')
  const [now, setNow] = useState(new Date())
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [dataRevision, setDataRevision] = useState(0)
  const [calendarError, setCalendarError] = useState('')
  const [externalEventsCachedAt, setExternalEventsCachedAt] = useState<string | null>(null)

  // 每分钟更新当前时间（用于"现在"指示线）
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const refresh = () => setDataRevision((value) => value + 1)
    window.addEventListener('ittime-data-changed', refresh)
    return () => window.removeEventListener('ittime-data-changed', refresh)
  }, [])

  // 支持从笔记 [[date:YYYY-MM-DD]] 跳转：定位到月视图中的指定日期
  useEffect(() => {
    const d = searchParams.get('date')
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const parts = d.split('-').map(Number)
      setCurrentDate(new Date(parts[0], parts[1] - 1, parts[2]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 计算日期范围
  const range = useMemo(() => {
    switch (view) {
      case 'week':
        return { from: startOfWeek(currentDate), to: endOfWeek(currentDate) }
      case 'four': {
        const to = startOfDay(currentDate)
        to.setDate(to.getDate() + 3)
        return { from: startOfDay(currentDate), to: endOfDay(to) }
      }
      case 'month':
        return {
          from: startOfWeek(startOfMonth(currentDate)),
          to: endOfWeek(endOfMonth(currentDate)),
        }
    }
  }, [view, currentDate])

  const allCategoryKeys = useMemo(
    () => new Set([...categories.map((category) => category.id), '_none']),
    [categories],
  )

  // 标签/分类筛选在前端完成，避免切换筛选器时重复请求。
  const visibleEntries = useMemo(() => {
    const categoryEntries = selectedCategoryKeys
      ? entries.filter((entry) => selectedCategoryKeys.has(entry.tag?.categoryId ?? '_none'))
      : entries
    return calendarFilter === 'activity' ? [] : categoryEntries
  }, [entries, selectedCategoryKeys, calendarFilter])

  const visibleActivities = useMemo(() => {
    const categoryActivities = selectedCategoryKeys
      ? activities.filter((todo) => selectedCategoryKeys.has(todo.categoryId ?? '_none'))
      : activities
    return calendarFilter === 'timer' ? [] : categoryActivities
  }, [activities, selectedCategoryKeys, calendarFilter])

  const visiblePlans = useMemo(() => {
    const from = startOfDay(range.from).getTime()
    const to = endOfDay(range.to).getTime()
    const filtered = plans.filter((plan) => {
      const day = Date.parse(`${plan.date}T00:00:00`)
      return Number.isFinite(day) && day >= from && day <= to
    })
    if (!selectedCategoryKeys) return filtered
    return filtered.filter((plan) => selectedCategoryKeys.has(plan.tag?.categoryId ?? '_none'))
  }, [plans, range.from, range.to, selectedCategoryKeys])

  const memosByDay = useMemo(() => {
    const map = new Map<string, Memo[]>()
    for (const memo of memos) {
      const key = startOfDay(new Date(memo.createdAt)).toISOString()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(memo)
    }
    return map
  }, [memos])

  // 加载当前视图所需的三类数据，并避免快速翻页时旧请求覆盖新页面。
  useEffect(() => {
    let cancelled = false
    setCalendarLoading(true)
    const params = { from: range.from.toISOString(), to: range.to.toISOString() }

    Promise.allSettled([
      api.timer.list(params),
      loadExternalEvents(params),
      api.memos.list(params),
      api.todos.list({ status: 'pending' }),
      api.plans.list(),
    ]).then(([entryResult, externalResult, memoResult, activityResult, plansResult]) => {
      if (cancelled) return
      const failures: string[] = []
      const optionalFailures: string[] = []
      if (entryResult.status === 'fulfilled') setEntries(entryResult.value)
      else failures.push('时间记录')
      if (externalResult.status === 'fulfilled') {
        setExternalEvents(externalResult.value.events)
        setExternalEventsCachedAt(externalResult.value.fetchedAt)
      }
      else optionalFailures.push('外部日历订阅')
      if (memoResult.status === 'fulfilled') setMemos(memoResult.value)
      else failures.push('记事')
      if (activityResult.status === 'fulfilled') setActivities(activityResult.value)
      else failures.push('活动')
      if (plansResult.status === 'fulfilled') setPlans(plansResult.value)
      else optionalFailures.push('计划')
      const messages = [
        failures.length ? `${failures.join('、')}加载失败，请稍后重试` : '',
        optionalFailures.length ? `${optionalFailures.join('、')}暂时不可用，本地日历仍可正常使用` : '',
      ].filter(Boolean)
      setCalendarError(messages.join('；'))
      setCalendarLoading(false)
    })

    return () => { cancelled = true }
  }, [range.from, range.to, dataRevision])

  // 导航
  const navigate = (dir: number) => {
    const d = new Date(currentDate)
    switch (view) {
      case 'week': d.setDate(d.getDate() + dir * 7); break
      case 'four': d.setDate(d.getDate() + dir * 4); break
      case 'month': d.setMonth(d.getMonth() + dir); break
    }
    setCurrentDate(d)
  }

  // 按天分组条目（跨午夜的计时会出现在它跨越的每一天）
  const entriesByDay = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    const rangeStart = range.from.getTime()
    const rangeEnd = range.to.getTime()
    for (const e of visibleEntries) {
      const rawStart = new Date(e.startTime).getTime()
      const rawEnd = e.endTime ? new Date(e.endTime).getTime() : Date.now()
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd < rangeStart || rawStart > rangeEnd) continue

      // 只遍历当前视图范围内的日期。长时间运行的计时如果从数月前开始，
      // 不应在月视图中把范围外的每一天都展开一次。
      const entryStart = startOfDay(new Date(Math.max(rawStart, rangeStart)))
      const entryEnd = startOfDay(new Date(Math.min(rawEnd, rangeEnd)))
      // 遍历计时跨越的每一天
      const cur = new Date(entryStart)
      while (cur <= entryEnd) {
        const dayKey = cur.toISOString()
        if (!map.has(dayKey)) map.set(dayKey, [])
        map.get(dayKey)!.push(e)
        cur.setDate(cur.getDate() + 1)
      }
    }
    return map
  }, [visibleEntries, range.from, range.to])

  // 计算当日总时长（跨午夜计时只计算当天部分）
  const dayTotal = useCallback((day: Date): number => {
    const key = startOfDay(day).toISOString()
    const dayEntries = entriesByDay.get(key) ?? []
    const dStart = startOfDay(day).getTime()
    const dEnd = endOfDay(day).getTime()
    return dayEntries.reduce((sum, e) => {
      const eStart = new Date(e.startTime).getTime()
      const eEnd = e.endTime ? new Date(e.endTime).getTime() : Date.now()
      // 裁剪到当天范围
      const clippedStart = Math.max(eStart, dStart)
      const clippedEnd = Math.min(eEnd, dEnd)
      return sum + (clippedEnd - clippedStart)
    }, 0)
  }, [entriesByDay, now])

  // 当前周期总时长
  const periodTotal = useMemo(() => {
    const rangeStart = range.from.getTime()
    const rangeEnd = range.to.getTime()
    return visibleEntries.reduce((sum, e) => {
      const start = Math.max(new Date(e.startTime).getTime(), rangeStart)
      const end = Math.min(e.endTime ? new Date(e.endTime).getTime() : Date.now(), rangeEnd)
      return sum + Math.max(0, end - start)
    }, 0)
  }, [visibleEntries, range.from, range.to, now])

  const hasCalendarContent = visibleEntries.length > 0 || visibleActivities.length > 0 || visiblePlans.length > 0 || externalEvents.length > 0 || memos.length > 0
  const filterCount = selectedCategoryKeys?.size ?? allCategoryKeys.size

  const setQuickCreateForDate = (date: Date, startTime?: Date, endTime?: Date) => {
    setQuickCreateDefaults({ date, startTime, endTime })
  }

  // 标题
  const title = useMemo(() => {
    switch (view) {
      case 'week':
        return formatDateRange(startOfWeek(currentDate), endOfWeek(currentDate))
      case 'four': {
        const to = new Date(currentDate)
        to.setDate(to.getDate() + 3)
        return formatDateRange(currentDate, to)
      }
      case 'month':
        return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`
    }
  }, [view, currentDate])

  return (
    <div className="workspace-page calendar-page space-y-4">
      {/* 头部：与其他 9 个页面统一走 PageHeader（kicker + 图标块 + h1）；
          翻页/今天/新建/视图切换等控件全部迁入 actions 插槽，功能与相对顺序不变。
          工具栏自带 border-bottom 会与 PageHeader 的分隔线叠成双线，
          而 .calendar-toolbar 的边框定义在 @tailwind utilities 之后（同特异性下后者优先），
          需用 !important 工具类覆盖，同时去掉为分隔线预留的 padding-bottom。 */}
      <PageHeader
        title={title}
        description="计时记录、日程安排与日历订阅"
        icon={<CalendarDays size={19} />}
        actions={
          <>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate(-1)}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
              >
                ‹
              </button>
              <button
                onClick={() => navigate(1)}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
              >
                ›
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-4 py-1.5 rounded-full text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                今天
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setPlanCreateDate(currentDate)} className="btn-secondary border border-gray-300 px-3 text-sm dark:border-gray-700">新建计划</button>
              <button type="button" onClick={() => setQuickCreateForDate(currentDate)} className="btn-primary bg-brand px-3 text-sm text-white hover:bg-brand-600">新建记录</button>
            </div>
            <div className="flex shrink-0 bg-gray-100 dark:bg-gray-800 rounded-full p-0.5">
              {(['month', 'week', 'four'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 ${
                    view === v
                      ? 'bg-white dark:bg-gray-700 text-brand shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {v === 'month' ? '月' : v === 'week' ? '周' : '4天'}
                </button>
              ))}
            </div>
          </>
        }
      />
      <div className="calendar-toolbar !border-b-0 !pb-0">
        <div className="calendar-toolbar-options flex w-full items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:overflow-visible sm:pb-0">
          {periodTotal > 0 && (
            <span className="text-xs text-gray-400 mr-1">
              合计 <span className="font-mono font-medium text-gray-500 dark:text-gray-400">{formatDuration(periodTotal)}</span>
            </span>
          )}
          <div className="flex shrink-0 items-center rounded-full bg-gray-100 dark:bg-gray-800 p-0.5">
            {([['all', '全部'], ['timer', '计时'], ['activity', '活动']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setCalendarFilter(value)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  calendarFilter === value
                    ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-100 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setShowFilter((open) => !open)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategoryKeys ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              筛选{selectedCategoryKeys ? ` (${filterCount})` : ''}
            </button>
            {showFilter && (
              <div className="absolute right-0 top-full mt-2 z-30 w-60 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-200">显示分类</span>
                  <button onClick={() => setSelectedCategoryKeys(null)} className="text-[0.667rem] text-brand hover:underline">全部</button>
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {categories.map((category) => {
                    const checked = selectedCategoryKeys === null || selectedCategoryKeys.has(category.id)
                    return (
                      <label key={category.id} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedCategoryKeys((prev) => {
                            const next = new Set(prev ?? allCategoryKeys)
                            if (next.has(category.id)) next.delete(category.id)
                            else next.add(category.id)
                            return next
                          })}
                        />
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
                        <span className="truncate">{category.name}</span>
                      </label>
                    )
                  })}
                  <label className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCategoryKeys === null || selectedCategoryKeys.has('_none')}
                      onChange={() => setSelectedCategoryKeys((prev) => {
                        const next = new Set(prev ?? allCategoryKeys)
                        if (next.has('_none')) next.delete('_none')
                        else next.add('_none')
                        return next
                      })}
                    />
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    <span>未分类</span>
                  </label>
                </div>
                <div className="flex justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button onClick={() => setSelectedCategoryKeys(new Set())} className="text-[0.667rem] text-gray-400 hover:text-red-500">全部取消</button>
                  <button onClick={() => setShowFilter(false)} className="text-[0.667rem] text-brand hover:underline">完成</button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowSyncModal(true)}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            title="日历同步 (iCalendar)"
          >
            🗓️
          </button>
          <button
            onClick={() => setShowSubManager(true)}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            title="外部日历订阅管理"
          >
            📡
          </button>
        </div>
      </div>

      {view === 'month' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.733rem] text-gray-400" aria-label="月视图图例">
          <span className="font-medium text-gray-500 dark:text-gray-300">月视图</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-brand" />计时记录</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded border border-dashed border-slate-500" />计划</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />活动</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />外部日历</span>
        </div>
      )}

      {/* 日历主体 */}
      {externalEventsCachedAt && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200" role="status">
          当前显示本机缓存的外部日历，缓存于 {new Date(externalEventsCachedAt).toLocaleString()}。
        </div>
      )}
      {calendarError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{calendarError}</div>}
      {calendarLoading && !hasCalendarContent && view !== 'month' ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center text-gray-400">加载日历中...</div>
      ) : !hasCalendarContent && view !== 'month' ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-12 text-center text-gray-400">
          <div className="text-4xl mb-2">📅</div>
          <div>该时段暂无时间记录</div>
        </div>
      ) : view === 'week' || view === 'four' ? (
        <WeekView
          days={view === 'week' ? getWeekDays(currentDate) : Array.from({ length: 4 }, (_, index) => {
            const day = startOfDay(currentDate)
            day.setDate(day.getDate() + index)
            return day
          })}
          selectedDate={currentDate}
          entries={visibleEntries}
          activities={visibleActivities}
          plans={visiblePlans}
          memosByDay={memosByDay}
          externalEvents={externalEvents}
          now={now}
          dayTotal={dayTotal}
          onEntryClick={setSelectedEntry}
          onDayClick={(date) => { setCurrentDate(date); setDayDetailDate(date) }}
        />
      ) : (
        <div className="calendar-month-shell">
          <MonthView
            date={currentDate}
            selectedDate={currentDate}
            entriesByDay={entriesByDay}
            activities={visibleActivities}
            plans={visiblePlans}
            memosByDay={memosByDay}
            externalEvents={externalEvents}
            onDayClick={(date) => { setCurrentDate(date); setDayDetailDate(date) }}
          />
        </div>
      )}

      {dayDetailDate && <DayDetailPopup
        date={dayDetailDate}
        entries={visibleEntries}
        activities={visibleActivities}
        plans={visiblePlans}
        dayMemos={memosByDay.get(startOfDay(dayDetailDate).toISOString()) ?? []}
        externalEvents={externalEvents}
        now={now}
        onClose={() => setDayDetailDate(null)}
        onEntryClick={(entry) => { setDayDetailDate(null); setSelectedEntry(entry) }}
        onCreate={(start, end) => { setDayDetailDate(null); setQuickCreateForDate(start, start, end) }}
      />}

      {/* 条目详情弹窗 */}
      {selectedEntry && (
        <EntryDetail
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onChanged={async () => {
            const params = { from: range.from.toISOString(), to: range.to.toISOString() }
            const [nextEntries, nextMemos] = await Promise.all([api.timer.list(params), api.memos.list(params)])
            setEntries(nextEntries)
            setMemos(nextMemos)
            setCalendarError('')
            setSelectedEntry(null)
          }}
        />
      )}

      {/* 日历同步弹窗 */}
      {showSyncModal && <CalendarSyncModal onClose={() => setShowSyncModal(false)} />}

      {/* 快速创建计时弹窗 */}
      {quickCreateDefaults && (
        <QuickCreateModal
          defaultDate={quickCreateDefaults.date}
          defaultStartTime={quickCreateDefaults.startTime}
          defaultEndTime={quickCreateDefaults.endTime}
          onClose={() => setQuickCreateDefaults(null)}
          onSaved={() => {
            setQuickCreateDefaults(null)
            api.timer.list({ from: range.from.toISOString(), to: range.to.toISOString() })
              .then((nextEntries) => { setEntries(nextEntries); setCalendarError('') })
              .catch((err) => setCalendarError(err instanceof Error ? err.message : '刷新时间记录失败'))
          }}
        />
      )}

      {(planCreateDate || editingPlan) && <PlanCreateModal plan={editingPlan ?? undefined} date={planCreateDate ?? new Date(`${editingPlan!.date}T00:00:00`)} tags={tags} todos={activities} onClose={() => { setPlanCreateDate(null); setEditingPlan(null) }} onSaved={async () => { setPlanCreateDate(null); setEditingPlan(null); setDataRevision((value) => value + 1) }} />}

      {/* 外部日历订阅管理弹窗 */}
      {showSubManager && <SubscriptionManager onClose={() => {
        setShowSubManager(false)
        loadExternalEvents({ from: range.from.toISOString(), to: range.to.toISOString() })
          .then((result) => { setExternalEvents(result.events); setExternalEventsCachedAt(result.fetchedAt); setCalendarError('') })
          .catch((err) => setCalendarError(err instanceof Error ? err.message : '刷新外部日历失败'))
      }} />}

    </div>
  )
}

function PlanCreateModal({ date, plan, tags, todos, onClose, onSaved }: {
  date: Date
  plan?: PlanBlock
  tags: Tag[]
  todos: Todo[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [content, setContent] = useState(plan?.content ?? '')
  const [start, setStart] = useState(plan ? `${String(Math.floor(plan.startMinute / 60)).padStart(2, '0')}:${String(plan.startMinute % 60).padStart(2, '0')}` : '09:00')
  const [end, setEnd] = useState(plan ? `${String(Math.floor(plan.endMinute / 60)).padStart(2, '0')}:${String(plan.endMinute % 60).padStart(2, '0')}` : '10:00')
  const [tagId, setTagId] = useState(plan?.tagId ?? '')
  const [todoId, setTodoId] = useState(plan?.todoId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const toMinute = (time: string) => {
      const [hour, minute] = time.split(':').map(Number)
      return hour * 60 + minute
    }
    if (toMinute(end) <= toMinute(start)) { setError('结束时间必须晚于开始时间'); return }
    setSaving(true)
    setError('')
    try {
      const data = { date: localDateKey(date), startMinute: toMinute(start), endMinute: toMinute(end), content: content.trim(), tagId: tagId || null, todoId: todoId || null }
      if (plan) await api.plans.update(plan.id, data)
      else await api.plans.create(data)
      await onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建计划失败')
    } finally {
      setSaving(false)
    }
  }
  const performDelete = async () => {
    setPendingDelete(false)
    if (!plan) return
    setSaving(true)
    try {
      await api.plans.remove(plan.id)
      await onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除计划失败')
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
    <Modal title={plan ? '编辑计划' : '新建计划'} onClose={onClose} width="lg">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-500">{date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
        <label className="block text-sm font-medium">计划内容<textarea autoFocus required maxLength={2000} rows={4} value={content} onChange={(event) => setContent(event.target.value)} placeholder="写下这段时间具体要做什么" className="input mt-1 w-full resize-y" /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">开始时间<input required type="time" value={start} onChange={(event) => setStart(event.target.value)} className="input mt-1 w-full" /></label><label className="text-sm">结束时间<input required type="time" value={end} onChange={(event) => setEnd(event.target.value)} className="input mt-1 w-full" /></label></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-sm">Tag（可选）<select value={tagId} onChange={(event) => setTagId(event.target.value)} className="input mt-1 w-full"><option value="">不挂 Tag</option>{tags.filter((tag) => !tag.parentId).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label className="text-sm">Todo（可选）<select value={todoId} onChange={(event) => setTodoId(event.target.value)} className="input mt-1 w-full"><option value="">不关联 Todo</option>{todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}</select></label></div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-between gap-2">{plan ? <button type="button" disabled={saving} onClick={() => setPendingDelete(true)} className="text-sm text-red-600">删除</button> : <span />}<div className="flex gap-2"><button type="button" onClick={onClose} className="btn-secondary px-3 py-2 text-sm">取消</button><button type="submit" disabled={saving || !content.trim()} className="btn-primary px-4 py-2 text-sm">{saving ? '保存中…' : '保存计划'}</button></div></div>
      </form>
    </Modal>
    {/* 删除计划确认（替代原生 confirm；作为遮罩的兄弟节点，避免点击冒泡误关外层弹窗） */}
    <ConfirmDialog
      open={pendingDelete}
      danger
      title="删除确认"
      message="删除这项计划？"
      confirmLabel="删除"
      onConfirm={() => void performDelete()}
      onCancel={() => setPendingDelete(false)}
    />
    </>
  )
}

// ===== 日视图 =====

function DayView({ date, entries, activities, plans, dayMemos, externalEvents, now, onEntryClick, onCreate }: {
  date: Date
  entries: TimeEntry[]
  activities: Todo[]
  plans: PlanBlock[]
  dayMemos: Memo[]
  externalEvents: CalendarEvent[]
  now: Date
  onEntryClick: (e: TimeEntry) => void
  onCreate: (start: Date, end: Date) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dayStart = startOfDay(date).getTime()
  const dayEnd = endOfDay(date).getTime()
  const layout = layoutEntries(entries, dayStart, dayEnd)
  const countEntries = entries.filter((entry) => entry.tag?.trackType === 'count' && isSameDay(new Date(entry.startTime), date))
  const dayActivities = activities.filter((todo) => activityIsOnDay(todo, date))
  const dayPlans = plans.filter((plan) => plan.date === localDateKey(date))
  const topExternal = externalEvents.filter((event) => externalEventOverlapsDay(event, dayStart, dayEnd))
  const uniqueTopExternal = topExternal.filter((event, index, list) => list.findIndex((item) => item.summary === event.summary) === index)

  // 自动滚动到当前时间附近
  useEffect(() => {
    if (!scrollRef.current) return
    const nowMinutes = minutesFromStartOfDay(new Date())
    const reverseMinutes = 24 * 60 - nowMinutes
    const scrollTop = Math.max(0, (reverseMinutes / 60) * HOUR_HEIGHT_DAY - 200)
    scrollRef.current.scrollTop = scrollTop
  }, [date])

  const nowTop = isToday(date) ? ((24 * 60 - minutesFromStartOfDay(now)) / 60) * HOUR_HEIGHT_DAY : -1

  const handleTimelineDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const scrollTop = scrollRef.current?.scrollTop ?? 0
    const rawMinutes = ((event.clientY - rect.top + scrollTop) / HOUR_HEIGHT_DAY) * 60
    const minutes = Math.min(23 * 60 + 45, Math.max(0, 24 * 60 - Math.round(rawMinutes / 15) * 15))
    const start = new Date(date)
    start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    const end = new Date(start)
    end.setMinutes(end.getMinutes() + 60)
    onCreate(start, end)
  }

  return (
    <div
      ref={scrollRef}
      className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 180px)' }}
    >
      {/* 外部 ICS 事件和次数打卡栏，避免占用时间轴 */}
      {(dayActivities.length > 0 || topExternal.length > 0 || countEntries.length > 0) && (
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-2 py-1 gap-1 flex-wrap">
          {dayActivities.map((todo) => (
            <div
              key={todo.id}
              className={`text-[0.667rem] font-semibold rounded px-2 py-0.5 border ${todo.status === 'done' ? 'line-through opacity-60' : ''}`}
              style={{ color: todo.tag?.color ?? todo.category?.color ?? '#0f766e', borderColor: todo.tag?.color ?? todo.category?.color ?? '#0f766e', backgroundColor: `${todo.tag?.color ?? todo.category?.color ?? '#0f766e'}12` }}
              title={todo.lateReason ?? undefined}
            >
              ◆ {todo.title}
            </div>
          ))}
          {countEntries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onEntryClick(entry)}
              className="text-[0.667rem] font-semibold rounded px-2 py-0.5 border border-dashed"
              style={{ color: entry.tag?.color ?? '#0f766e', borderColor: entry.tag?.color ?? '#0f766e', backgroundColor: `${entry.tag?.color ?? '#0f766e'}12` }}
            >
              ● {entry.tag?.name}
            </button>
          ))}
          {uniqueTopExternal.map((event) => {
            const color = event.subscription?.color ?? '#2ecc71'
            return (
              <div key={event.id} className="text-[0.667rem] font-semibold text-white rounded px-2 py-0.5" style={{ backgroundColor: color }} title={event.summary}>
                {formatExternalEventLabel(event)}
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)]">
        {/* 小时刻度 */}
        <div className="relative" style={{ height: 24 * HOUR_HEIGHT_DAY }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="text-xs text-gray-400 text-right pr-2 border-t border-gray-100 dark:border-gray-800"
              style={{ height: HOUR_HEIGHT_DAY, lineHeight: `${HOUR_HEIGHT_DAY}px` }}
            >
              {h === 0 ? '24:00' : `${String(24 - h).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>
        <div className="relative border-l border-gray-200 dark:border-gray-800" style={{ height: 24 * HOUR_HEIGHT_DAY }} onDoubleClick={handleTimelineDoubleClick}>
          <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 px-2 py-1 text-[0.667rem] font-semibold text-gray-500 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">实际打卡</div>
          {/* 水平网格线 */}
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="border-t border-gray-100 dark:border-gray-800" style={{ height: HOUR_HEIGHT_DAY }} />
          ))}
          {/* 条目块 */}
          {layout.map(({ entry, start, end, col, cols }) => {
            const topMin = (dayEnd - end) / 60000
            const heightMin = (end - start) / 60000
            const top = (topMin / 60) * HOUR_HEIGHT_DAY
            const height = Math.max((heightMin / 60) * HOUR_HEIGHT_DAY, 20)
            const widthPercent = 100 / cols
            const leftPercent = (col / cols) * 100
            const color = entry.tag?.color ?? '#0f766e'
            const hasMemos = entry.memos && entry.memos.length > 0
            return (
              <button
                key={entry.id}
                onClick={() => onEntryClick(entry)}
                className="absolute z-[1] rounded-lg text-left overflow-hidden hover:z-10 hover:shadow-md transition-shadow duration-150 group"
                style={{
                  top: top + 1,
                  height: height - 2,
                  left: `calc(${leftPercent}% + 2px)`,
                  width: `calc(${widthPercent}% - 4px)`,
                  backgroundColor: `${color}15`,
                  borderLeft: entry.dismissed ? '2px solid rgb(156 163 175)' : entry.resumedFromId ? `2px solid ${color}` : `3px solid ${color}`,
                }}
              >
                <div className="px-2 py-0.5 text-xs font-semibold truncate" style={{ color }}>
                  {entry.tag?.name}
                </div>
                {height > 32 && (
                  <div className="px-2 text-[0.667rem] text-gray-400 flex items-center gap-1">
                    <span>
                      {new Date(entry.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      {' - '}
                      {entry.endTime
                        ? new Date(entry.endTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                        : '进行中'}
                    </span>
                    {hasMemos && <span title={`${entry.memos!.length} 条记事`}>📝</span>}
                  </div>
                )}
                {height > 50 && entry.note && (
                  <div className="px-2 text-[0.667rem] text-gray-400 truncate">{entry.note}</div>
                )}
              </button>
            )
          })}
          {nowTop >= 0 && <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: nowTop }}><div className="h-px bg-red-500" /></div>}
        </div>
        <div className="relative border-l border-gray-200 dark:border-gray-800" style={{ height: 24 * HOUR_HEIGHT_DAY }}>
          <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 px-2 py-1 text-[0.667rem] font-semibold text-gray-500 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">计划</div>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={`plan-grid-${h}`} className="pointer-events-none border-t border-gray-100 dark:border-gray-800" style={{ height: HOUR_HEIGHT_DAY }} />
          ))}
          {dayPlans.map((plan) => {
            const top = ((1440 - plan.endMinute) / 60) * HOUR_HEIGHT_DAY
            const height = Math.max(((plan.endMinute - plan.startMinute) / 60) * HOUR_HEIGHT_DAY, 20)
            const color = plan.tag?.color ?? '#64748b'
            return (
              <div key={plan.id} className={`absolute left-1 right-1 z-10 overflow-hidden rounded-md border border-dashed px-2 py-1 text-left shadow-sm ${plan.executionStatus === 'done' ? 'opacity-50' : ''}`} style={{ top, height, minHeight: 24, backgroundColor: `${color}16`, borderColor: `${color}99` }} title={plan.content}>
                <div className="truncate text-[0.667rem] font-medium" style={{ color }}>{String(Math.floor(plan.startMinute / 60)).padStart(2, '0')}:{String(plan.startMinute % 60).padStart(2, '0')} · {plan.content}</div>
              </div>
            )
          })}
        </div>
      </div>
      {dayMemos.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">📝 当日记事 ({dayMemos.length})</div>
          <div className="space-y-1">
            {dayMemos.slice(0, 8).map((memo) => (
              <div key={memo.id} className="text-xs text-gray-600 dark:text-gray-300 truncate">
                {new Date(memo.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · {memo.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 周视图 =====

function WeekView({ days, selectedDate, entries, activities, plans, memosByDay, externalEvents, now, dayTotal, onEntryClick, onDayClick }: {
  days: Date[]
  selectedDate: Date
  entries: TimeEntry[]
  activities: Todo[]
  plans: PlanBlock[]
  memosByDay: Map<string, Memo[]>
  externalEvents: CalendarEvent[]
  now: Date
  dayTotal: (d: Date) => number
  onEntryClick: (e: TimeEntry) => void
  onDayClick: (date: Date) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const nowTop = ((24 * 60 - minutesFromStartOfDay(now)) / 60) * HOUR_HEIGHT_WEEK

  useEffect(() => {
    if (!scrollRef.current) return
    const nowMinutes = minutesFromStartOfDay(new Date())
    const scrollTop = Math.max(0, ((24 * 60 - nowMinutes) / 60) * HOUR_HEIGHT_WEEK - 200)
    scrollRef.current.scrollTop = scrollTop
  }, [])

  return (
    <div
      ref={scrollRef}
      className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 180px)' }}
    >
      {/* 星期表头 */}
      <div className="flex sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex-shrink-0 w-10" />
        {days.map((d) => (
          <button type="button" key={d.toISOString()} onClick={() => onDayClick(d)} className={`flex-1 text-center py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/70 ${isToday(d) ? 'text-brand' : 'text-gray-500'}`} aria-label={`打开${d.toLocaleDateString('zh-CN')}日视图`}>
            <div className="text-xs">{WEEKDAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
            <div className={`text-sm font-semibold w-6 h-6 mx-auto flex items-center justify-center rounded-full ${
              isToday(d)
                ? 'bg-brand text-white'
                : isSameDay(d, selectedDate)
                  ? 'border border-dashed border-brand text-brand'
                  : ''
            }`}>
              {d.getDate()}
            </div>
          </button>
        ))}
      </div>

      {/* 外部 ICS 事件栏（所有事件均置于时间轴顶部） */}
      {(() => {
        const hasTopContent = days.some((d) => {
          const dS = startOfDay(d).getTime()
          const dE = endOfDay(d).getTime()
          const hasExternal = externalEvents.some((ev) => externalEventOverlapsDay(ev, dS, dE))
          const hasCount = entries.some((entry) => entry.tag?.trackType === 'count' && isSameDay(new Date(entry.startTime), d))
          const hasActivities = activities.some((todo) => activityIsOnDay(todo, d))
          return hasExternal || hasCount || hasActivities
        })
        if (!hasTopContent) return null
        return (
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            <div className="flex-shrink-0 w-10" />
            {days.map((d) => {
              const dS = startOfDay(d).getTime()
              const dE = endOfDay(d).getTime()
              const dayExt = externalEvents.filter((ev) => externalEventOverlapsDay(ev, dS, dE))
              const countEntries = entries.filter((entry) => entry.tag?.trackType === 'count' && isSameDay(new Date(entry.startTime), d))
              const dayActivities = activities.filter((todo) => activityIsOnDay(todo, d))
              const seen = new Set<string>()
              const unique = dayExt.filter((e) => { if (seen.has(e.summary)) return false; seen.add(e.summary); return true })
              return (
                <div key={d.toISOString()} className="flex-1 min-h-[24px] px-0.5 py-0.5 space-y-0.5">
                  {dayActivities.slice(0, 2).map((todo) => (
                    <div
                      key={todo.id}
                      className={`text-[0.6rem] font-semibold rounded px-1 py-0.5 border truncate ${todo.status === 'done' ? 'line-through opacity-60' : ''}`}
                      style={{ color: todo.tag?.color ?? todo.category?.color ?? '#0f766e', borderColor: todo.tag?.color ?? todo.category?.color ?? '#0f766e', backgroundColor: `${todo.tag?.color ?? todo.category?.color ?? '#0f766e'}12` }}
                      title={todo.title}
                    >
                      ◆ {todo.title}
                    </div>
                  ))}
                  {countEntries.slice(0, 2).map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => onEntryClick(entry)}
                      className="w-full text-left text-[0.6rem] font-semibold rounded px-1 py-0.5 border border-dashed truncate"
                      style={{ color: entry.tag?.color ?? '#0f766e', borderColor: entry.tag?.color ?? '#0f766e', backgroundColor: `${entry.tag?.color ?? '#0f766e'}12` }}
                    >
                      ● {entry.tag?.name}
                    </button>
                  ))}
                  {unique.slice(0, 2).map((ev) => {
                    const color = ev.subscription?.color ?? '#2ecc71'
                    return (
                      <div
                        key={ev.id}
                        className="text-[0.6rem] font-semibold text-white rounded px-1 py-0.5 truncate leading-tight"
                        style={{ backgroundColor: color }}
                        title={ev.summary}
                      >
                        {formatExternalEventLabel(ev)}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )
      })()}

      <div className="flex">
        {/* 小时刻度 */}
        <div className="flex-shrink-0 w-10 relative" style={{ height: 24 * HOUR_HEIGHT_WEEK }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="text-[0.667rem] text-gray-400 text-right pr-1 border-t border-gray-100 dark:border-gray-800"
              style={{ height: HOUR_HEIGHT_WEEK, lineHeight: `${HOUR_HEIGHT_WEEK}px` }}
            >
              {h === 0 ? '24' : `${24 - h}`}
            </div>
          ))}
        </div>
        {/* 7天列 */}
          {days.map((d) => {
            const dayStart = startOfDay(d).getTime()
            const dayEnd = endOfDay(d).getTime()
          const dayEntries = entries.filter((e) => {
            const es = new Date(e.startTime).getTime()
            const ee = e.endTime ? new Date(e.endTime).getTime() : Date.now()
            // 计时与该天有重叠即显示（支持跨午夜）
            return es < dayEnd && ee > dayStart
          })
            const layout = layoutEntries(dayEntries, dayStart, dayEnd)
            const dayPlans = plans.filter((plan) => plan.date === localDateKey(d))
            const showNowLine = isToday(d)
          return (
            <div
              key={d.toISOString()}
              className="flex-1 relative border-l border-gray-100 dark:border-gray-800"
              style={{ height: 24 * HOUR_HEIGHT_WEEK }}
            >
              {/* 水平网格线 */}
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="border-t border-gray-100 dark:border-gray-800" style={{ height: HOUR_HEIGHT_WEEK }} />
              ))}
              {/* 条目块 */}
              {layout.map(({ entry, start, end, col, cols }) => {
                const topMin = (dayEnd - end) / 60000
                const heightMin = (end - start) / 60000
                const top = (topMin / 60) * HOUR_HEIGHT_WEEK
                const height = Math.max((heightMin / 60) * HOUR_HEIGHT_WEEK, 16)
                const widthPercent = 100 / cols
                const leftPercent = (col / cols) * 100
                const color = entry.tag?.color ?? '#0f766e'
                const hasMemos = entry.memos && entry.memos.length > 0
                return (
                  <button
                    key={entry.id}
                    onClick={() => onEntryClick(entry)}
                    className="absolute z-[1] rounded-md text-left overflow-hidden hover:z-10 hover:shadow-md transition-shadow duration-150"
                    style={{
                      top: top + 1,
                      height: height - 2,
                      left: `calc(${leftPercent}% + 1px)`,
                      width: `calc(${widthPercent}% - 2px)`,
                      backgroundColor: `${color}15`,
                      borderLeft: entry.dismissed ? '2px solid rgb(156 163 175)' : entry.resumedFromId ? `2px solid ${color}` : `2.5px solid ${color}`,
                    }}
                  >
                    {height > 18 && (
                      <div className="px-1.5 text-[0.667rem] font-semibold truncate flex items-center gap-0.5" style={{ color }}>
                        {entry.tag?.name}
                        {hasMemos && <span className="text-[0.533rem]">📝</span>}
                      </div>
                    )}
                  </button>
                )
              })}
              {dayPlans.map((plan) => {
                const top = ((1440 - plan.endMinute) / 60) * HOUR_HEIGHT_WEEK
                const height = Math.max(((plan.endMinute - plan.startMinute) / 60) * HOUR_HEIGHT_WEEK, 16)
                const color = plan.tag?.color ?? '#64748b'
                return <div key={plan.id} className={`absolute left-0.5 right-0.5 z-0 overflow-hidden rounded border border-dashed px-1 text-[0.6rem] ${plan.executionStatus === 'done' ? 'opacity-50' : ''}`} style={{ top, height, backgroundColor: `${color}0d`, borderColor: `${color}99`, color }} title={plan.content}>▷ {plan.content}</div>
              })}
              {/* 现在时间线 */}
              {showNowLine && (
                <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
                  <div className="h-px bg-red-500" />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex border-t border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/30">
        <div className="flex-shrink-0 w-10" />
        {days.map((d) => {
          const dayMemos = memosByDay.get(startOfDay(d).toISOString()) ?? []
          const total = dayTotal(d)
          return (
            <div key={d.toISOString()} className="flex-1 min-w-0 px-1 py-1 text-center text-[0.6rem] text-gray-400 truncate">
              {total > 0 && <span className="font-mono">{formatDuration(total)}</span>}
              {dayMemos.length > 0 && <span className="ml-1">📝{dayMemos.length}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===== 月视图 =====

function MonthView({ date, selectedDate, entriesByDay, activities, plans, memosByDay, externalEvents, onDayClick }: {
  date: Date
  selectedDate: Date
  entriesByDay: Map<string, TimeEntry[]>
  activities: Todo[]
  plans: PlanBlock[]
  memosByDay: Map<string, Memo[]>
  externalEvents: CalendarEvent[]
  onDayClick: (d: Date) => void
}) {
  const days = getMonthGrid(date)

  const getUniqueColors = (dayEntries: TimeEntry[]): string[] => {
    const seen = new Set<string>()
    const colors: string[] = []
    for (const e of dayEntries) {
      const c = e.tag?.color ?? '#0f766e'
      if (!seen.has(c)) { seen.add(c); colors.push(c) }
    }
    return colors
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(226_232_240_/_0.9)] bg-white p-2 shadow-[0_12px_34px_rgb(15_23_42_/_0.045)] dark:border-[rgba(255,255,255,0.09)] dark:shadow-[0_12px_34px_rgb(0_0_0_/_0.15)] sm:p-4">
      <div className="mb-1 grid grid-cols-7 border-y border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-800/40">
        {WEEKDAYS_FULL.map((w, index) => (
          <div key={w} className={`text-center py-2 text-sm font-medium ${index >= 5 ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>{w.replace('周', '')}</div>
        ))}
      </div>
      <div className="calendar-month-grid grid grid-cols-7 overflow-hidden rounded-xl border-l border-t border-gray-200 dark:border-gray-800">
        {days.map((d, dayIndex) => {
          const key = startOfDay(d).toISOString()
          const dayEntries = entriesByDay.get(key) ?? []
          const dayActivities = activities.filter((todo) => activityIsOnDay(todo, d))
          const dayPlans = plans.filter((plan) => plan.date === localDateKey(d))
          const dayMemos = memosByDay.get(key) ?? []
          const inMonth = isSameMonth(d, date)
          const today = isToday(d)
          const selected = isSameDay(d, selectedDate)
          const uniqueColors = getUniqueColors(dayEntries)
          const dayExternalEvents = externalEvents.filter((ev) => externalEventOverlapsDay(ev, startOfDay(d).getTime(), endOfDay(d).getTime()))
          const allDayLabels = dayExternalEvents
            .filter((ev) => ev.allday)
            .filter((ev, index, list) => list.findIndex((item) => item.summary === ev.summary) === index)
            .slice(0, 2)
          const hasOtherExternal = dayExternalEvents.some((ev) => !ev.allday)
          const holidayEvent = dayExternalEvents.find((ev) => externalEventKind(ev) === 'holiday')
          const workdayEvent = dayExternalEvents.find((ev) => externalEventKind(ev) === 'workday')
          const weekend = d.getDay() === 0 || d.getDay() === 6

          return (
            <button
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              aria-pressed={selected}
              className={`relative min-h-[92px] border-b border-r border-gray-200 p-2 text-left transition-colors group sm:min-h-[112px] sm:p-3 dark:border-gray-800 ${dayIndex % 7 === 6 ? 'border-r-0' : ''} ${dayIndex >= days.length - 7 ? 'border-b-0' : ''} ${selected ? 'bg-brand-50 ring-1 ring-inset ring-brand-500 dark:bg-brand-900/25' : holidayEvent ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'} ${!inMonth ? 'opacity-30' : ''}`}
            >
              {holidayEvent && <span className="absolute right-1.5 top-1.5 rounded bg-red-500 px-1 text-[0.667rem] font-bold text-white">休</span>}
              {workdayEvent && !holidayEvent && <span className="absolute right-1.5 top-1.5 rounded bg-slate-500 px-1 text-[0.667rem] font-bold text-white">班</span>}
              <div className="flex items-start justify-between gap-1">
                <div className="flex flex-col gap-0.5">
                  <span className={`text-2xl font-semibold leading-none sm:text-3xl ${weekend || holidayEvent ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
                    {d.getDate()}
                  </span>
                  <span className={`text-[0.733rem] ${getLunarText(d) === Solar.fromDate(d).getLunar().getJieQi() ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>{getLunarText(d)}</span>
                </div>
              </div>
              {allDayLabels.length > 0 && (
                <div className="mt-2 space-y-0.5" aria-label="全天外部日历">
                  {allDayLabels.map((event) => {
                    const kind = externalEventKind(event)
                    const color = kind === 'workday' ? '#2563eb' : kind === 'holiday' ? '#d97706' : (event.subscription?.color ?? '#059669')
                    return (
                        <div key={event.id} className="truncate rounded px-1 py-0.5 text-[0.667rem] font-medium leading-tight" style={{ color, backgroundColor: `${color}15` }} title={event.summary}>
                        {event.summary}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="mt-2 flex min-h-5 items-center gap-1.5" aria-label="当天日历内容">
                {uniqueColors.slice(0, 5).map((c, i) => <span key={i} className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} title="计时记录" />)}
                {dayPlans.length > 0 && <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-slate-500" title={`${dayPlans.length} 项计划`} />}
                {dayActivities.length > 0 && <span className="h-2.5 w-2.5 rounded-full bg-amber-400" title="活动" />}
                {(hasOtherExternal || allDayLabels.length > 0) && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" title="外部日历" />}
                {dayMemos.length > 0 && <span className="h-2.5 w-2.5 rounded-full bg-gray-400" title="备忘" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ===== 条目详情弹窗 =====

function EntryDetail({ entry, onClose, onChanged }: {
  entry: TimeEntry
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const start = new Date(entry.startTime)
  const end = entry.endTime ? new Date(entry.endTime) : new Date()
  const duration = end.getTime() - start.getTime()
  const color = entry.tag?.color ?? '#0f766e'
  const memos = entry.memos ?? []
  const [editing, setEditing] = useState(false)
  const [editStart, setEditStart] = useState(toLocalInputWithSeconds(start))
  const [editEnd, setEditEnd] = useState(entry.endTime ? toLocalInputWithSeconds(new Date(entry.endTime)) : '')
  const [editNote, setEditNote] = useState(entry.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(false)

  const saveEdit = async () => {
    const startIso = toIsoSafe(editStart)
    const endIso = editEnd ? toIsoSafe(editEnd) : null
    if (!startIso || (editEnd && !endIso)) {
      setError('请选择有效的起止时间')
      return
    }
    if (endIso && new Date(endIso) <= new Date(startIso)) {
      setError('结束时间必须晚于开始时间')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.timer.update(entry.id, { startTime: startIso, endTime: endIso, note: editNote })
      await onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const removeEntry = () => {
    setPendingDelete(true)
  }

  const performRemoveEntry = async () => {
    setPendingDelete(false)
    setSaving(true)
    try {
      await api.timer.remove(entry.id)
      await onChanged()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <>
    <Modal showHeader={false} ariaLabel="时间记录详情" onClose={onClose} width="md">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-4 w-4 flex-shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold" style={{ color }}>{entry.tag?.name}</h3>
          {entry.tag?.category && (
            <CategoryBadge category={entry.tag.category} size="xs" className="mt-0.5" />
          )}
        </div>
      </div>
        {editing ? (
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs text-gray-400"><span className="block mb-1">开始时间</span><DateTimeSecondPicker value={editStart} onChange={setEditStart} /></label>
            </div>
            <div>
              <label className="block text-xs text-gray-400"><span className="block mb-1">结束时间（留空表示进行中）</span><DateTimeSecondPicker value={editEnd} onChange={setEditEnd} /></label>
            </div>
            <div>
              <label className="block text-xs text-gray-400"><span className="block mb-1">备注</span><textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} rows={3} className="input text-sm" /></label>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 text-sm mb-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">开始</span>
            <span className="text-gray-700 dark:text-gray-200">{start.toLocaleString('zh-CN', { hour12: false })}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">结束</span>
            <span className="text-gray-700 dark:text-gray-200">{entry.endTime ? end.toLocaleString('zh-CN', { hour12: false }) : <span className="text-brand animate-pulse">进行中…</span>}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">时长</span>
            <span className="font-mono font-semibold text-brand">{formatDuration(duration)}</span>
          </div>
          {entry.todo && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-xs">关联待办</span>
              <span className="text-gray-700 dark:text-gray-200 text-xs truncate max-w-[180px]">✅ {entry.todo.title}</span>
            </div>
          )}
          {entry.note && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="text-gray-400 text-xs mb-1">备注</div>
              <div className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">{entry.note}</div>
            </div>
          )}
          </div>
        )}
        {memos.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mb-4">
            <div className="text-xs text-gray-400 mb-2">📖 关联记事 ({memos.length})</div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {memos.slice(0, 5).map((m) => (
                <div key={m.id} className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 leading-relaxed">
                  <span className="text-gray-400">{new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="mx-1">·</span>
                  <span className="line-clamp-2">{m.content}</span>
                </div>
              ))}
              {memos.length > 5 && <div className="text-[0.667rem] text-gray-400 text-center">…还有 {memos.length - 5} 条</div>}
            </div>
          </div>
        )}
        {error && <p role="alert" className="mb-3 text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          {editing ? (
            <>
              <button type="button" onClick={() => { setEditing(false); setError('') }} className="flex-1 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">取消</button>
              <button type="button" onClick={saveEdit} disabled={saving} className="btn-primary flex-1 py-2.5 rounded-xl text-sm disabled:opacity-50">{saving ? '保存中…' : '保存修改'}</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 rounded-xl text-sm">关闭</button>
              <button type="button" onClick={() => setEditing(true)} className="px-3 py-2.5 rounded-xl text-sm text-brand hover:bg-brand-50 dark:hover:bg-brand-900/30">编辑</button>
              <button type="button" onClick={removeEntry} disabled={saving} className="px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">删除</button>
            </>
          )}
        </div>
    </Modal>
    {/* 删除时间记录确认（替代原生 confirm；作为遮罩的兄弟节点，避免点击冒泡误关外层弹窗） */}
    <ConfirmDialog
      open={pendingDelete}
      danger
      title="删除确认"
      message="确定要删除这条时间记录吗？"
      confirmLabel="删除"
      onConfirm={() => void performRemoveEntry()}
      onCancel={() => setPendingDelete(false)}
    />
    </>
  )
}

// ===== 快速创建计时弹窗 =====

function QuickCreateModal({ defaultDate, defaultStartTime, defaultEndTime, onClose, onSaved }: {
  defaultDate: Date
  defaultStartTime?: Date
  defaultEndTime?: Date
  onClose: () => void
  onSaved: () => void
}) {
  const { tags, categories } = useStore()
  const [todos, setTodos] = useState<Todo[]>([])
  const [tagId, setTagId] = useState<string>('')
  const [todoId, setTodoId] = useState<string>('')
  const [note, setNote] = useState('')
  const initialStartTime = defaultStartTime ?? (() => {
    const date = new Date(defaultDate)
    if (isSameDay(date, new Date())) return new Date()
    date.setHours(9, 0, 0, 0)
    return date
  })()
  const [startTime, setStartTime] = useState(toLocalInputWithSeconds(initialStartTime))
  const [endTime, setEndTime] = useState(defaultEndTime ? toLocalInputWithSeconds(defaultEndTime) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.todos.list({ status: 'pending' }).then(setTodos).catch(() => setTodos([]))
  }, [])

  const groupedTags = useMemo(() => {
    const groups = new Map<string, { category: typeof categories[0] | null; tags: typeof tags }>()
    for (const t of tags) {
      if (t.parentId) continue
      const catId = t.categoryId ?? '_none'
      if (!groups.has(catId)) {
        const cat = categories.find((c) => c.id === t.categoryId) ?? null
        groups.set(catId, { category: cat, tags: [] })
      }
      groups.get(catId)!.tags.push(t)
    }
    return Array.from(groups.values())
  }, [tags, categories])

  const save = async () => {
    if (!tagId) { setError('请选择标签'); return }
    const startIso = toIsoSafe(startTime)
    if (!startIso) { setError('请选择有效时间'); return }
    setSaving(true)
    setError('')
    try {
      if (endTime) {
        const endIso = toIsoSafe(endTime)
        if (!endIso) { setError('结束时间无效'); setSaving(false); return }
        await api.timer.manual({ tagId, startTime: startIso, endTime: endIso, note: note || undefined, todoId: todoId || undefined })
      } else {
        await api.timer.start({ tagId, note: note || undefined, todoId: todoId || undefined })
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="⚡ 快速创建" onClose={onClose} width="md">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-xs font-semibold text-gray-500">标签 *</div>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-700">
            {groupedTags.map((g) => (
              <div key={g.category?.id ?? '_none'}>
                {g.category && (
                  <div className="mb-1 px-1 text-[0.667rem] font-semibold uppercase tracking-wider text-gray-400">
                    {g.category.icon ? `${g.category.icon} ` : ''}{g.category.name}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {g.tags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTagId(t.id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-shadow duration-150 ${
                        tagId === t.id
                          ? 'ring-2 ring-offset-1 shadow-sm ring-offset-white dark:ring-offset-gray-900'
                          : 'hover:shadow-sm'
                      }`}
                      style={{
                        backgroundColor: `${t.color}18`,
                        color: t.color,
                        ...(tagId === t.id ? { boxShadow: `0 0 0 2px ${t.color}40` } : {}),
                      }}
                    >
                      {t.icon ? `${t.icon} ` : ''}{t.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500"><span className="mb-1 block">开始时间</span><DateTimeSecondPicker value={startTime} onChange={setStartTime} /></label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500">
            <span className="mb-1 block">结束时间 <span className="font-normal text-gray-400">（留空 = 开始计时）</span></span>
            <DateTimeSecondPicker value={endTime} onChange={setEndTime} />
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500"><span className="mb-1 block">备注</span><input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="可选备注…"
            className="input text-sm"
          /></label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500"><span className="mb-1 block">关联待办（可选）</span><select value={todoId} onChange={(event) => setTodoId(event.target.value)} className="input text-sm">
            <option value="">不关联待办</option>
            {todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}
          </select></label>
        </div>

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-2 text-sm">取消</button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            {saving ? '创建中…' : endTime ? '📥 补录' : '▶️ 开始计时'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ===== 月视图点击日期详情弹窗 =====

function DayDetailPopupLegacy({ date, entries, activities, dayMemos, externalEvents, onClose, onEntryClick }: {
  date: Date
  entries: TimeEntry[]
  activities: Todo[]
  dayMemos: Memo[]
  externalEvents: CalendarEvent[]
  onClose: () => void
  onEntryClick: (e: TimeEntry) => void
}) {
  const dayStart = startOfDay(date).getTime()
  const dayEnd = endOfDay(date).getTime()

  const dayEntries = entries.filter((e) => {
    const es = new Date(e.startTime).getTime()
    const ee = e.endTime ? new Date(e.endTime).getTime() : Date.now()
    return es < dayEnd && ee > dayStart
  }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  const dayActivities = activities.filter((todo) => activityIsOnDay(todo, date))

  const dayExternal = externalEvents.filter((ev) => externalEventOverlapsDay(ev, dayStart, dayEnd))
  const seenExt = new Set<string>()
  const uniqueExternal = dayExternal.filter((e) => { if (seenExt.has(e.summary)) return false; seenExt.add(e.summary); return true })

  const lunarText = getLunarText(date)
  const totalMs = dayEntries.reduce((sum, e) => {
    const start = Math.max(new Date(e.startTime).getTime(), dayStart)
    const end = Math.min(e.endTime ? new Date(e.endTime).getTime() : Date.now(), dayEnd)
    return sum + Math.max(0, end - start)
  }, 0)

  const weekDay = WEEKDAYS_FULL[date.getDay() === 0 ? 6 : date.getDay() - 1]

  return (
    <Modal
      showHeader={false}
      ariaLabel={`${date.getMonth() + 1}月${date.getDate()}日详情`}
      onClose={onClose}
      width="md"
      padded={false}
      scrollable={false}
      className="flex flex-col"
    >
        <div className="border-b border-gray-100 px-5 pt-5 pb-3 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{date.getMonth() + 1}月{date.getDate()}日</span>
                <span className="text-sm text-gray-400">{weekDay}</span>
              </div>
              <div className="mt-0.5 text-xs text-gray-400">农历{lunarText}</div>
            </div>
          </div>
          {totalMs > 0 && (
            <div className="mt-2 text-xs text-gray-400">
              当日合计 <span className="font-mono font-medium text-brand">{formatDuration(totalMs)}</span> · {dayEntries.length} 条记录
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {dayActivities.length > 0 && (
            <div className="space-y-1 mb-3">
              <div className="text-[0.667rem] text-gray-400">◆ 活动 ({dayActivities.length})</div>
              {dayActivities.map((todo) => (
                <div key={todo.id} className={`text-xs truncate ${todo.status === 'done' ? 'line-through text-gray-400' : 'text-gray-600 dark:text-gray-300'}`} title={todo.lateReason ?? undefined}>
                  {todo.status === 'done' ? '已完成 · ' : '待完成 · '}{todo.title}
                </div>
              ))}
            </div>
          )}
          {uniqueExternal.length > 0 && (
            <div className="space-y-1 mb-3">
              {uniqueExternal.map((ev) => {
                const color = ev.subscription?.color ?? '#2ecc71'
                return (
                  <div key={ev.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium" style={{ color }}>{formatExternalEventLabel(ev)}</span>
                  </div>
                )
              })}
            </div>
          )}
          {dayMemos.length > 0 && (
            <div className="space-y-1 mb-3">
              <div className="text-[0.667rem] text-gray-400">📝 当日记事 ({dayMemos.length})</div>
              {dayMemos.slice(0, 5).map((memo) => (
                <div key={memo.id} className="text-xs text-gray-600 dark:text-gray-300 truncate">
                  {new Date(memo.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · {memo.content}
                </div>
              ))}
            </div>
          )}
          {dayEntries.length === 0 && dayActivities.length === 0 && uniqueExternal.length === 0 && dayMemos.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">当日暂无记录</div>
          ) : dayEntries.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-xs">暂无计时记录</div>
          ) : (
            <div className="space-y-1">
              {dayEntries.map((e) => {
                const start = new Date(e.startTime)
                const end = e.endTime ? new Date(e.endTime) : null
                const color = e.tag?.color ?? '#0f766e'
                const dur = end ? end.getTime() - start.getTime() : Date.now() - start.getTime()
                return (
                  <button
                    key={e.id}
                    onClick={() => onEntryClick(e)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color }}>{e.tag?.name}</span>
                        {e.tag?.category && <CategoryBadge category={e.tag.category} size="xs" />}
                      </div>
                      <div className="text-[0.667rem] text-gray-400">
                        {start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        {end && ` - ${end.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
                        {e.note && ` · ${e.note}`}
                      </div>
                    </div>
                    <span className="text-[0.667rem] font-mono text-gray-400">{formatDuration(dur)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button type="button" onClick={onClose} className="btn-secondary w-full rounded-xl py-2 text-sm font-medium">
            关闭
          </button>
        </div>
    </Modal>
  )
}

function DayDetailPopup({ date, entries, activities, plans, dayMemos, externalEvents, now, onClose, onEntryClick, onCreate }: {
  date: Date
  entries: TimeEntry[]
  activities: Todo[]
  plans: PlanBlock[]
  dayMemos: Memo[]
  externalEvents: CalendarEvent[]
  now: Date
  onClose: () => void
  onEntryClick: (entry: TimeEntry) => void
  onCreate: (start: Date, end: Date) => void
}) {
  const dateLabel = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const dayKey = startOfDay(date).toISOString()
  return (
    createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`${dateLabel}日视图`} className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-gray-50 shadow-2xl shadow-gray-950/20 dark:bg-gray-950 sm:max-h-[calc(100dvh-3rem)]" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
          <div className="min-w-0"><div className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{dateLabel}</div><div className="mt-0.5 text-xs text-gray-500">当天时间线 · 双击空白处补录时长</div></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200" aria-label="关闭日视图">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
          <DayView
            date={date}
            entries={entries}
            activities={activities}
            plans={plans}
            dayMemos={dayMemos}
            externalEvents={externalEvents}
            now={now}
            onEntryClick={onEntryClick}
            onCreate={onCreate}
          />
          {dayMemos.length === 0 && entries.length === 0 && activities.filter((todo) => activityIsOnDay(todo, date)).length === 0 && plans.filter((plan) => plan.date === localDateKey(date)).length === 0 && externalEvents.every((event) => !externalEventOverlapsDay(event, startOfDay(date).getTime(), endOfDay(date).getTime())) && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 rounded-xl bg-white/90 px-4 py-2 text-xs text-gray-400 shadow-sm dark:bg-gray-900/90">当天还没有记录</div>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
          <span className="text-[0.733rem] text-gray-400">{dayKey === startOfDay(new Date()).toISOString() ? '今天' : getLunarText(date)}</span>
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">完成</button>
        </footer>
      </section>
    </div>,
    document.body,
    )
  )
}
