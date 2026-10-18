import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { api } from '../api'
import { DateTimeSecondPicker } from '../components/DateTimeSecondPicker'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { layoutPlans, type PlanLayout } from '../planLayout'
import { formatDuration, toIsoSafe, useStore } from '../store'
import type { Category, PlanBlock, Tag, TimeEntry, Todo } from '../types'

const HOUR_HEIGHT = 60
const DAY_MINUTES = 1440

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function minuteText(minute: number) {
  const hour = Math.floor(minute / 60)
  const rest = minute % 60
  return `${String(hour).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function minuteValue(value: string) {
  if (value === '24:00') return DAY_MINUTES
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export default function PlansPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { tags, categories } = useStore()
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [plans, setPlans] = useState<PlanBlock[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<PlanBlock | null | undefined>(undefined)
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null)
  const [recordStart, setRecordStart] = useState<string | null>(null)
  const [draftStart, setDraftStart] = useState(9 * 60)
  const [now, setNow] = useState(Date.now())
  const timelineRef = useRef<HTMLDivElement>(null)
  const loadSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setError('')
    const dayStart = new Date(`${selectedDate}T00:00:00`)
    const dayEnd = new Date(`${selectedDate}T00:00:00`)
    dayEnd.setDate(dayEnd.getDate() + 1)
    const [planResult, todoResult, entryResult] = await Promise.allSettled([
      api.plans.list({ date: selectedDate }),
      api.todos.list({ status: 'pending' }),
      api.timer.list({ from: dayStart.toISOString(), to: dayEnd.toISOString() }),
    ])
    if (sequence !== loadSequence.current) return
    if (planResult.status === 'fulfilled') setPlans(planResult.value)
    else setError(planResult.reason instanceof Error ? planResult.reason.message : '加载计划失败')
    if (todoResult.status === 'fulfilled') setTodos(todoResult.value)
    if (entryResult.status === 'fulfilled') setEntries(entryResult.value)
    else setError(entryResult.reason instanceof Error ? entryResult.reason.message : '加载打卡记录失败')
    setLoading(false)
  }, [selectedDate])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const refresh = () => { void load() }
    window.addEventListener('ittime-data-changed', refresh)
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => {
      window.removeEventListener('ittime-data-changed', refresh)
      window.clearInterval(timer)
    }
  }, [load])

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => a.startMinute - b.startMinute), [plans])
  const actualBlocks = useMemo(() => layoutActualEntries(entries, selectedDate, now), [entries, selectedDate, now])
  const actualSummary = useMemo(() => actualBlocks.reduce((summary, item) => {
    if (!item.entry.dismissed) {
      if (item.point) summary.countEntries += 1
      else summary.elapsedMs += Math.max(0, item.endMinute - item.startMinute) * 60_000
    }
    return summary
  }, { elapsedMs: 0, countEntries: 0 }), [actualBlocks])
  const selectedDateValue = new Date(`${selectedDate}T00:00:00`)
  const today = dateKey(new Date())

  useEffect(() => {
    if (!timelineRef.current || selectedDate !== today) return
    timelineRef.current.scrollTop = Math.max(0, new Date().getHours() * HOUR_HEIGHT - 180)
  }, [selectedDate, today])

  const openNew = (startMinute: number) => {
    setDraftStart(startMinute)
    setEditing(null)
  }

  const addFromTimeline = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-plan-block]')) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const minute = Math.max(0, Math.min(1439, Math.floor((event.clientY - bounds.top) / HOUR_HEIGHT * 60)))
    openNew(Math.floor(minute / 5) * 5)
  }

  const addActualFromTimeline = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-actual-block]')) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const minute = Math.max(0, Math.min(1439, Math.floor((event.clientY - bounds.top) / HOUR_HEIGHT * 60)))
    const start = new Date(`${selectedDate}T00:00:00`)
    start.setMinutes(minute)
    setRecordStart(toLocalInputWithSeconds(start.toISOString()))
  }

  const createNextPlan = () => {
    const next = sortedPlans.at(-1)?.endMinute ?? 9 * 60
    openNew(Math.min(Math.floor(next / 5) * 5, 23 * 60))
  }

  const planLayouts = useMemo(() => layoutPlans(sortedPlans), [sortedPlans])

  return (
    <div className="workspace-page plan-page space-y-4">
      {!embedded && <PageHeader
        title="每日计划"
        description="用分钟安排一天，并与实际记录并列复盘"
        icon={<CalendarClock size={19} />}
        actions={<div className="toolbar-surface flex items-center gap-1 shadow-[0_1px_2px_rgb(15_23_42_/_0.04)]">
          <button type="button" title="前一天" aria-label="前一天" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} className="grid h-9 w-9 place-items-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"><ChevronLeft size={18} /></button>
          <input aria-label="计划日期" type="date" value={selectedDate} onChange={(event) => event.target.value && setSelectedDate(event.target.value)} className="input !w-auto !py-1.5 tabular-nums" />
          <button type="button" title="后一天" aria-label="后一天" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} className="grid h-9 w-9 place-items-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"><ChevronRight size={18} /></button>
          <button type="button" onClick={() => setSelectedDate(today)} className="ml-1 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">今天</button>
        </div>}
      />}

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-800">
        <div><div className="text-lg font-semibold">{selectedDateValue.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</div><div className="mt-1 text-xs text-gray-500">计划 {sortedPlans.length} 项 · {formatDuration(sortedPlans.reduce((sum, plan) => sum + plan.plannedMs!, 0))} <span className="px-1.5">|</span> 实际计时 {formatDuration(actualSummary.elapsedMs)} · {actualBlocks.length} 条记录{actualSummary.countEntries ? `（含 ${actualSummary.countEntries} 次数打卡）` : ''}</div></div>
        <button type="button" onClick={createNextPlan} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"><Plus size={16} />写计划</button>
      </div>

      {error && <div role="alert" className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}<button type="button" onClick={() => void load()} className="underline">重试</button></div>}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_10px_30px_rgb(15_23_42_/_0.05)] dark:border-gray-800 dark:bg-gray-900" aria-label="每日计划与实际记录">
        <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] border-b border-gray-200 bg-white text-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="border-r border-gray-200 dark:border-gray-800" />
          <div className="border-r border-gray-200 px-2 py-2.5 dark:border-gray-800">计划</div>
          <div className="px-2 py-2.5">实际打卡</div>
        </div>
        <div className="plan-scroll max-h-[calc(100vh-250px)] min-h-[420px] overflow-y-auto" ref={timelineRef}>
          <div className="relative grid min-h-[1440px] grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)]" style={{ height: DAY_MINUTES * (HOUR_HEIGHT / 60) }}>
            <div className="relative sticky left-0 z-10 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" aria-hidden="true">
              {Array.from({ length: 25 }, (_, hour) => <div key={hour} className="absolute right-0 w-full pr-1 text-right text-[0.75rem] tabular-nums text-gray-500 dark:text-gray-400 sm:pr-2" style={{ top: hour * HOUR_HEIGHT, transform: hour === 0 ? 'none' : 'translateY(-50%)' }}>{hour === 24 ? '24:00' : `${String(hour).padStart(2, '0')}:00`}</div>)}
            </div>
            <div className="relative min-w-0 border-r border-gray-200 dark:border-gray-800" onClick={addFromTimeline}>
              <TimelineGrid />
              {selectedDate === today && <CurrentTimeLine now={now} />}
              {sortedPlans.map((plan) => <PlanTimelineBlock key={plan.id} plan={plan} layout={planLayouts.get(plan.id)!} onClick={() => { setDraftStart(plan.startMinute); setEditing(plan) }} />)}
              {loading && <div className="absolute inset-x-1 top-4 rounded bg-white/90 py-2 text-center text-[0.667rem] text-gray-500 dark:bg-gray-900/90 sm:inset-x-4 sm:text-xs">正在加载…</div>}
              {!loading && sortedPlans.length === 0 && <div className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-xs text-gray-400">双击空白处写计划</div>}
            </div>
            <div className="relative min-w-0" onClick={addActualFromTimeline}>
              <TimelineGrid />
              {selectedDate === today && <CurrentTimeLine now={now} />}
              {actualBlocks.map((item) => <ActualTimelineBlock key={item.entry.id} item={item} onClick={() => setSelectedEntry(item.entry)} />)}
              {!loading && actualBlocks.length === 0 && <div className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-xs text-gray-400">当天暂无打卡记录</div>}
              {loading && <div className="absolute inset-x-1 top-4 rounded bg-white/90 py-2 text-center text-[0.667rem] text-gray-500 dark:bg-gray-900/90 sm:inset-x-4 sm:text-xs">正在加载…</div>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-gray-200 px-3 py-2 text-[0.733rem] text-gray-500 dark:border-gray-800"><span>计划列空白处新建计划 · 实际列空白处补录时长</span><span>两列共用分钟刻度</span></div>
      </section>

      {editing !== undefined && <PlanNoteEditor date={selectedDate} plan={editing ?? undefined} startMinute={draftStart} tags={tags} categories={categories} todos={todos} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await load() }} />}
      {selectedEntry && <ActualEntryDialog entry={selectedEntry} tags={tags} todos={todos} onClose={() => setSelectedEntry(null)} onSaved={async () => { setSelectedEntry(null); await load() }} />}
      {recordStart && <ActualRecordEditor startTime={recordStart} tags={tags} todos={todos} onClose={() => setRecordStart(null)} onSaved={async () => { setRecordStart(null); await load() }} />}
    </div>
  )
}

interface ActualLayoutItem {
  entry: TimeEntry
  startMinute: number
  endMinute: number
  col: number
  cols: number
  point: boolean
}

function localMinute(value: Date) {
  return value.getHours() * 60 + value.getMinutes() + value.getSeconds() / 60
}

function layoutActualEntries(entries: TimeEntry[], date: string, now: number): ActualLayoutItem[] {
  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd = new Date(`${date}T00:00:00`)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const dayStartMs = dayStart.getTime()
  const dayEndMs = dayEnd.getTime()
  const items: ActualLayoutItem[] = entries.flatMap((entry) => {
    const entryStart = new Date(entry.startTime).getTime()
    const entryEnd = entry.endTime ? new Date(entry.endTime).getTime() : now
    const clippedStart = Math.max(entryStart, dayStartMs)
    const clippedEnd = Math.min(entryEnd, dayEndMs)
    if (clippedEnd < clippedStart || clippedStart >= dayEndMs || clippedEnd < dayStartMs) return []
    const point = clippedEnd === clippedStart
    const startMinute = clippedStart === dayStartMs ? 0 : localMinute(new Date(clippedStart))
    const endMinute = clippedEnd === dayEndMs ? DAY_MINUTES : localMinute(new Date(clippedEnd))
    return [{ entry, startMinute, endMinute, col: 0, cols: 1, point }]
  }).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)

  const groups: ActualLayoutItem[][] = []
  let group: ActualLayoutItem[] = []
  let groupEnd = -1
  for (const item of items) {
    const visualEnd = Math.max(item.endMinute, item.startMinute + 14)
    if (group.length && item.startMinute >= groupEnd) {
      groups.push(group)
      group = []
      groupEnd = -1
    }
    group.push(item)
    groupEnd = Math.max(groupEnd, visualEnd)
  }
  if (group.length) groups.push(group)

  for (const overlapGroup of groups) {
    const columns: number[] = []
    for (const item of overlapGroup) {
      const visualEnd = Math.max(item.endMinute, item.startMinute + 14)
      let col = columns.findIndex((end) => end <= item.startMinute)
      if (col < 0) { col = columns.length; columns.push(0) }
      columns[col] = visualEnd
      item.col = col
    }
    for (const item of overlapGroup) item.cols = columns.length
  }
  return items
}

function TimelineGrid() {
  return <>
    {Array.from({ length: 25 }, (_, hour) => <div key={hour} className="pointer-events-none absolute inset-x-0 border-t border-gray-300 dark:border-gray-700" style={{ top: hour * HOUR_HEIGHT }} />)}
    {Array.from({ length: 24 }, (_, hour) => <div key={`half-${hour}`} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-100 dark:border-gray-800/70" style={{ top: hour * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />)}
  </>
}

function CurrentTimeLine({ now }: { now: number }) {
  const date = new Date(now)
  return <div className="pointer-events-none absolute inset-x-0 z-20 border-t border-red-500" style={{ top: date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 }}><span className="absolute -left-1 -top-[4px] h-2 w-2 rounded-full bg-red-500" /></div>
}

function ActualTimelineBlock({ item, onClick }: { item: ActualLayoutItem; onClick: () => void }) {
  const { entry } = item
  const color = entry.tag?.color ?? '#64748b'
  const height = Math.max(item.endMinute - item.startMinute, item.point ? 14 : 8)
  const startLabel = minuteText(Math.floor(item.startMinute))
  const endLabel = minuteText(Math.min(DAY_MINUTES, Math.ceil(item.endMinute)))
  const status = entry.dismissed ? '已忽略' : entry.pendingResume ? '待续接' : !entry.endTime ? '进行中' : item.point ? '次数打卡' : '已结束'
  return <button type="button" data-actual-block onClick={(event) => { event.stopPropagation(); onClick() }} title={`${startLabel}${item.point ? '' : `–${endLabel}`} ${entry.tag?.name ?? '打卡'}${entry.note ? ` · ${entry.note}` : ''} · ${status}，点击查看`} aria-label={`${entry.tag?.name ?? '打卡'}，${startLabel}${item.point ? '' : `至 ${endLabel}`}，${status}，点击查看详情`} className={`absolute z-[2] overflow-hidden rounded-r border-l-[3px] px-1 py-0.5 text-left text-[0.75rem] leading-3 hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 sm:px-1.5 ${entry.dismissed ? 'opacity-45' : ''}`} style={{ top: item.startMinute, height, left: `calc(${(item.col / item.cols) * 100}% + 2px)`, width: `calc(${100 / item.cols}% - 4px)`, borderColor: color, backgroundColor: `${color}20`, color }}>
    <div className="truncate font-semibold tabular-nums">{startLabel}{!item.point && `–${endLabel}`}</div>
    {height >= 20 && <div className="truncate font-medium">{entry.tag?.name ?? '打卡'} · {status}</div>}
    {height >= 36 && entry.note && <div className="truncate text-gray-600 dark:text-gray-300">{entry.note}</div>}
  </button>
}

function ActualRecordEditor({ startTime: initialStart, tags, todos, onClose, onSaved }: {
  startTime: string
  tags: Tag[]
  todos: Todo[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const timeTags = tags.filter((tag) => tag.trackType === 'time' && !tag.parentId)
  const [tagId, setTagId] = useState(timeTags[0]?.id ?? '')
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(() => {
    const end = new Date(initialStart)
    end.setHours(end.getHours() + 1)
    return toLocalInputWithSeconds(end.toISOString())
  })
  const [todoId, setTodoId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const start = toIsoSafe(startTime)
    const end = toIsoSafe(endTime)
    if (!tagId) { setError('请选择时长型 Tag'); return }
    if (!start || !end || new Date(end) <= new Date(start)) { setError('结束时间必须晚于有效的开始时间'); return }
    setSaving(true)
    setError('')
    try {
      await api.timer.manual({ tagId, startTime: start, endTime: end, todoId: todoId || undefined, note: note.trim() || undefined })
      await onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '补录记录失败') }
    finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <form onSubmit={save} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl dark:bg-gray-900 sm:rounded-xl">
      <header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">补录实际记录</h2><p className="mt-1 text-xs text-gray-500">按点击时刻预填，可调整起止时间</p></div><button type="button" onClick={onClose} aria-label="关闭" className="relative after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] grid h-8 w-8 place-items-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button></header>
      {timeTags.length ? <>
        <label className="block text-xs text-gray-500">Tag<select value={tagId} onChange={(event) => setTagId(event.target.value)} className="input mt-1 w-full">{timeTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs text-gray-500">开始时间<DateTimeSecondPicker value={startTime} onChange={setStartTime} /></label><label className="text-xs text-gray-500">结束时间<DateTimeSecondPicker value={endTime} onChange={setEndTime} /></label></div>
        <label className="block text-xs text-gray-500">Todo（可选）<select value={todoId} onChange={(event) => setTodoId(event.target.value)} className="input mt-1 w-full"><option value="">不关联 Todo</option>{todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}</select></label>
        <label className="block text-xs text-gray-500">备注<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="input mt-1 w-full" /></label>
      </> : <p className="text-sm text-gray-500">当前没有可用于补录的一级时长型 Tag。</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <footer className="flex justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800"><button type="button" onClick={onClose} className="btn-secondary px-3 py-2 text-sm">取消</button>{timeTags.length > 0 && <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? '保存中…' : '补录'}</button>}</footer>
    </form>
  </div>
}

function ActualEntryDialog({ entry, tags, todos, onClose, onSaved }: {
  entry: TimeEntry
  tags: Tag[]
  todos: Todo[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [tagId, setTagId] = useState(entry.tagId)
  const isCount = (tags.find((tag) => tag.id === tagId)?.trackType ?? entry.tag?.trackType) === 'count'
  const [start, setStart] = useState(toLocalInputWithSeconds(entry.startTime))
  const [end, setEnd] = useState(entry.endTime ? toLocalInputWithSeconds(entry.endTime) : '')
  const [note, setNote] = useState(entry.note ?? '')
  const [todoId, setTodoId] = useState(entry.todoId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(false)

  const save = async () => {
    const startIso = toIsoSafe(start)
    const endIso = end ? toIsoSafe(end) : null
    if (!startIso || (end && !endIso)) { setError('请选择有效的起止时间'); return }
    if (!isCount && endIso && new Date(endIso) <= new Date(startIso)) { setError('结束时间必须晚于开始时间'); return }
    setSaving(true)
    setError('')
    try {
      await api.timer.update(entry.id, { tagId, startTime: startIso, endTime: isCount ? startIso : endIso, note, todoId: todoId || null })
      await onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存记录失败') }
    finally { setSaving(false) }
  }

  const remove = () => {
    setPendingDelete(true)
  }

  const performRemove = async () => {
    setPendingDelete(false)
    setSaving(true)
    try { await api.timer.remove(entry.id); await onSaved() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除记录失败'); setSaving(false) }
  }

  const startDate = new Date(entry.startTime)
  const endDate = entry.endTime ? new Date(entry.endTime) : new Date()
  const duration = Math.max(0, endDate.getTime() - startDate.getTime())
  const availableTodos = entry.todo && entry.todo.status !== 'done' && !todos.some((todo) => todo.id === entry.todo!.id) ? [entry.todo, ...todos] : todos

  return <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="actual-entry-title" className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl dark:bg-gray-900 sm:rounded-xl">
      <header className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 id="actual-entry-title" className="truncate text-lg font-semibold" style={{ color: entry.tag?.color }}>{entry.tag?.name ?? '打卡记录'}</h2><p className="mt-1 text-xs text-gray-500">{entry.dismissed ? '已忽略' : entry.pendingResume ? '待续接' : !entry.endTime ? '进行中' : isCount ? '次数打卡' : '实际记录'}</p></div><button type="button" onClick={onClose} aria-label="关闭" className="relative after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] grid h-8 w-8 shrink-0 place-items-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button></header>
      {editing ? <div className="space-y-3">
        <label className="block text-xs text-gray-500">Tag<select value={tagId} onChange={(event) => setTagId(event.target.value)} className="input mt-1 w-full">{tags.filter((tag) => !tag.parentId).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs text-gray-500">开始时间<DateTimeSecondPicker value={start} onChange={(value) => { setStart(value); if (isCount && end) setEnd(value) }} /></label><label className="text-xs text-gray-500">结束时间（留空表示进行中）<DateTimeSecondPicker value={end} onChange={setEnd} /></label></div>
        <label className="block text-xs text-gray-500">备注<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="input mt-1 w-full" /></label>
        <label className="block text-xs text-gray-500">Todo（可选）<select value={todoId} onChange={(event) => setTodoId(event.target.value)} className="input mt-1 w-full"><option value="">不关联 Todo</option>{availableTodos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}</select></label>
      </div> : <div className="space-y-3 text-sm">
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2"><span className="text-gray-500">开始</span><time>{startDate.toLocaleString('zh-CN', { hour12: false })}</time><span className="text-gray-500">结束</span><time>{entry.endTime ? endDate.toLocaleString('zh-CN', { hour12: false }) : '进行中'}</time><span className="text-gray-500">时长</span><span>{isCount ? '次数记录' : formatDuration(duration)}</span>{entry.todo && <><span className="text-gray-500">Todo</span><span>{entry.todo.title}</span></>}</div>
        {entry.note && <div className="border-t border-gray-100 pt-3 dark:border-gray-800"><div className="mb-1 text-xs text-gray-500">备注</div><p className="whitespace-pre-wrap break-words">{entry.note}</p></div>}
        {(entry.memos?.length ?? 0) > 0 && <div className="border-t border-gray-100 pt-3 dark:border-gray-800"><div className="mb-2 text-xs text-gray-500">关联记事 · {entry.memos!.length}</div><div className="max-h-40 space-y-2 overflow-y-auto">{entry.memos!.map((memo) => <div key={memo.id} className="rounded bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800"><div className="mb-1 text-gray-500">{new Date(memo.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div><p className="whitespace-pre-wrap break-words">{memo.content}</p></div>)}</div></div>}
      </div>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <footer className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800"><div>{!editing && <button type="button" disabled={saving} onClick={() => void remove()} aria-label="删除打卡记录" title="删除记录" className="grid h-9 w-9 place-items-center rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={16} /></button>}</div><div className="flex gap-2"><button type="button" onClick={editing ? () => { setEditing(false); setError('') } : onClose} className="btn-secondary px-3 py-2 text-sm">{editing ? '取消' : '关闭'}</button>{editing ? <button type="button" disabled={saving} onClick={() => void save()} className="btn-primary px-4 py-2 text-sm">{saving ? '保存中…' : '保存修改'}</button> : <button type="button" onClick={() => setEditing(true)} className="btn-primary px-4 py-2 text-sm">编辑</button>}</div></footer>
    </section>
    </div>
    {/* 删除打卡记录确认（替代原生 confirm） */}
    <ConfirmDialog
      open={pendingDelete}
      danger
      title="删除确认"
      message="删除这条打卡记录？"
      confirmLabel="删除"
      onConfirm={() => void performRemove()}
      onCancel={() => setPendingDelete(false)}
    />
  </>
}

function toLocalInputWithSeconds(value: string) {
  const date = new Date(value)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function PlanTimelineBlock({ plan, layout, onClick }: { plan: PlanBlock; layout: PlanLayout; onClick: () => void }) {
  const color = plan.tag?.color ?? '#0f766e'
  const top = plan.startMinute
  const height = plan.endMinute - plan.startMinute
  const showStatus = height >= 24
  const showCoverage = height >= 42
  const coverage = Math.max(0, Math.min(1, plan.coverageRate ?? 0))
  const status = planStatusText(plan)
  return (
    <button type="button" data-plan-block onClick={(event) => { event.stopPropagation(); onClick() }} title={`${minuteText(top)}-${minuteText(top + height)} ${plan.content} · ${formatDuration(plan.actualMs ?? 0)} 实际 / ${Math.round(coverage * 100)}% 覆盖 · ${status}${plan.overlaps ? ' · 并行安排' : ''}`} aria-label={`${minuteText(top)} 到 ${minuteText(top + height)}，${plan.content}${plan.overlaps ? '，并行安排' : ''}`} className={`absolute z-[2] overflow-hidden rounded-r border-l-[3px] px-1.5 py-1 text-left text-gray-800 transition-shadow hover:z-10 hover:shadow-md dark:text-gray-100 sm:px-2 ${plan.disposition === 'skipped' ? 'opacity-55' : ''}`} style={{ top, height: Math.max(height, 12), left: `calc(6px + (100% - 12px) * ${layout.lane} / ${layout.lanes})`, width: `calc((100% - 12px) / ${layout.lanes})`, borderColor: color, backgroundColor: `${color}14` }}>
      <div className="flex h-full min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[0.667rem] font-semibold tabular-nums sm:text-[0.733rem]">{minuteText(top)}{height >= 30 && `–${minuteText(top + height)}`}</span>
          {showStatus && <span className={`truncate text-[0.667rem] font-medium ${plan.executionStatus === 'done' || plan.confirmed ? 'text-green-700 dark:text-green-400' : plan.executionStatus === 'missed' ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{status}</span>}
          {plan.overlaps && <span className="ml-auto shrink-0 text-[0.667rem] font-semibold text-red-700 dark:text-red-400">并行</span>}
        </div>
        <span className="min-h-0 min-w-0 flex-1 whitespace-pre-wrap break-words text-[0.733rem] leading-4 sm:text-xs">{plan.content}</span>
        {showCoverage && <div className="mt-auto flex items-center gap-1.5">
          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"><div className="h-full rounded-full" style={{ width: `${coverage * 100}%`, backgroundColor: color }} /></div>
          <span className="shrink-0 text-[0.667rem] tabular-nums text-gray-500 dark:text-gray-400">{formatDuration(plan.actualMs ?? 0)} · {Math.round(coverage * 100)}%</span>
        </div>}
      </div>
    </button>
  )
}

function planStatusText(plan: PlanBlock) {
  if (plan.disposition === 'skipped') return '已跳过'
  if (plan.disposition === 'deferred') return '已推迟'
  if (plan.todo?.status === 'done') return 'Todo 已完成'
  if (plan.confirmed) return '手动确认'
  switch (plan.executionStatus) {
    case 'active': return '进行中'
    case 'paused': return '待续接'
    case 'done': return '已完成'
    case 'partial': return '部分完成'
    case 'missed': return '未执行'
    default: return '待开始'
  }
}

function PlanNoteEditor({ date, plan, startMinute, tags, categories, todos, onClose, onSaved }: {
  date: string
  plan?: PlanBlock
  startMinute: number
  tags: Tag[]
  categories: Category[]
  todos: Todo[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const startTimer = useStore((state) => state.start)
  const [content, setContent] = useState(plan?.content ?? '')
  const [start, setStart] = useState(minuteText(plan?.startMinute ?? startMinute))
  const [end, setEnd] = useState(minuteText(plan?.endMinute ?? Math.min(startMinute + 60, DAY_MINUTES)))
  const [tagId, setTagId] = useState(plan?.tagId ?? '')
  const [todoId, setTodoId] = useState(plan?.todoId ?? '')
  const [showDefer, setShowDefer] = useState(false)
  const [deferDate, setDeferDate] = useState(shiftDate(date, 1))
  const [deferStart, setDeferStart] = useState(minuteText(plan?.startMinute ?? startMinute))
  const [deferEnd, setDeferEnd] = useState(minuteText(plan?.endMinute ?? Math.min(startMinute + 60, DAY_MINUTES)))
  const [choosingStartTag, setChoosingStartTag] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(false)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const startMinuteValue = minuteValue(start)
    const endMinuteValue = minuteValue(end)
    if (startMinuteValue === null || endMinuteValue === null) { setError('请输入有效时间，结束时间可设为 24:00'); return }
    if (endMinuteValue <= startMinuteValue) { setError('结束时间必须晚于开始时间'); return }
    setSaving(true)
    setError('')
    try {
      const values = { date, startMinute: startMinuteValue, endMinute: endMinuteValue, content: content.trim(), tagId: tagId || null, todoId: todoId || null }
      if (plan) await api.plans.update(plan.id, values)
      else await api.plans.create(values)
      await onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存计划失败')
    } finally { setSaving(false) }
  }

  const remove = () => {
    if (!plan) return
    setPendingDelete(true)
  }

  const performRemove = async () => {
    setPendingDelete(false)
    if (!plan) return
    setSaving(true)
    try { await api.plans.remove(plan.id); await onSaved() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除计划失败') }
    finally { setSaving(false) }
  }

  const setDisposition = async (action: 'skip' | 'unskip' | 'confirm' | 'unconfirm') => {
    if (!plan) return
    setSaving(true)
    try { await api.plans[action](plan.id); await onSaved() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '更新计划状态失败') }
    finally { setSaving(false) }
  }

  const defer = async () => {
    if (!plan) return
    const startMinute = minuteValue(deferStart)
    const endMinute = minuteValue(deferEnd)
    if (!deferDate || startMinute === null || endMinute === null || endMinute <= startMinute) {
      setError('请设置有效日期和时间，结束时间必须晚于开始时间')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.plans.defer(plan.id, { date: deferDate, startMinute, endMinute })
      await onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '推迟计划失败') }
    finally { setSaving(false) }
  }

  const startPlannedTimer = async (selectedTagId = tagId) => {
    if (!plan || !selectedTagId) return
    const tag = tags.find((item) => item.id === selectedTagId)
    if (!tag || tag.trackType !== 'time') { setError('计划只能使用时长型 Tag 开始计时'); return }
    setSaving(true)
    setError('')
    try {
      if (plan.tagId !== selectedTagId) await api.plans.update(plan.id, { tagId: selectedTagId })
      await startTimer({ tagId: selectedTagId, note: plan.content, todoId: plan.todoId ?? undefined, planId: plan.id })
      await onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '开始计时失败') }
    finally { setSaving(false) }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form onSubmit={save} className="w-full max-w-xl space-y-4 rounded-t-xl bg-white p-5 shadow-xl dark:bg-gray-900 sm:rounded-xl">
        <div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">{plan ? '编辑计划笔记' : '写入计划笔记'}</h2><p className="mt-1 text-xs text-gray-500">{date} · 按分钟设置时间</p></div><button type="button" onClick={onClose} aria-label="关闭" className="relative after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] grid h-8 w-8 place-items-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button></div>
        <textarea autoFocus required maxLength={2000} rows={5} value={content} onChange={(event) => setContent(event.target.value)} placeholder="具体要做什么？" className="input min-h-28 w-full resize-y" />
        <div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">开始<input required type="text" inputMode="numeric" placeholder="09:00" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" value={start} onChange={(event) => setStart(event.target.value)} className="input mt-1 w-full tabular-nums" /></label><label className="text-xs text-gray-500">结束<input required type="text" inputMode="numeric" placeholder="10:00 或 24:00" pattern="(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)" value={end} onChange={(event) => setEnd(event.target.value)} className="input mt-1 w-full tabular-nums" /></label></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs text-gray-500">Tag（可选）<select value={tagId} onChange={(event) => setTagId(event.target.value)} className="input mt-1 w-full"><option value="">不挂 Tag</option>{categories.map((category) => { const categoryTags = tags.filter((tag) => tag.categoryId === category.id && !tag.parentId); return categoryTags.length ? <optgroup key={category.id} label={category.name}>{categoryTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</optgroup> : null })}<optgroup label="未分类">{tags.filter((tag) => !tag.categoryId && !tag.parentId).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</optgroup></select></label><label className="text-xs text-gray-500">Todo（可选）<select value={todoId} onChange={(event) => setTodoId(event.target.value)} className="input mt-1 w-full"><option value="">不关联 Todo</option>{todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.title}</option>)}</select></label></div>
        {plan && <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={saving} onClick={() => void setDisposition(plan.disposition === 'skipped' ? 'unskip' : 'skip')} className="btn-secondary px-2.5 py-1.5 text-xs">{plan.disposition === 'skipped' ? '恢复计划' : '跳过'}</button><button type="button" disabled={saving} onClick={() => void setDisposition(plan.confirmed ? 'unconfirm' : 'confirm')} className="btn-secondary px-2.5 py-1.5 text-xs">{plan.confirmed ? '撤销确认' : '手动确认完成'}</button>{plan.disposition !== 'deferred' && <button type="button" disabled={saving} onClick={() => setShowDefer((value) => !value)} className="btn-secondary px-2.5 py-1.5 text-xs">{showDefer ? '取消推迟' : '推迟到…'}</button>}<span className="mr-auto text-xs text-gray-500">实际覆盖 {Math.round((plan.coverageRate ?? 0) * 100)}%</span>{choosingStartTag ? <select autoFocus aria-label="选择时长型 Tag 开始计时" disabled={saving} value="" onChange={(event) => { const selected = event.target.value; if (selected) { setTagId(selected); setChoosingStartTag(false); void startPlannedTimer(selected) } }} className="input !w-auto !py-1.5 text-xs"><option value="" disabled>选择时长型 Tag</option>{tags.filter((tag) => tag.trackType === 'time' && !tag.parentId).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select> : <button type="button" disabled={saving || (tagId ? tags.find((tag) => tag.id === tagId)?.trackType !== 'time' : !tags.some((tag) => tag.trackType === 'time' && !tag.parentId))} onClick={() => tagId && tags.find((tag) => tag.id === tagId)?.trackType === 'time' ? void startPlannedTimer() : setChoosingStartTag(true)} className="btn-primary px-3 py-1.5 text-xs">开始计时</button>}</div>
          {showDefer && <div className="grid grid-cols-1 gap-2 rounded-md bg-gray-50 p-3 dark:bg-gray-800/60 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end"><label className="text-xs text-gray-500">新日期<input required type="date" value={deferDate} onChange={(event) => setDeferDate(event.target.value)} className="input mt-1 w-full" /></label><label className="text-xs text-gray-500">开始<input required type="text" inputMode="numeric" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" value={deferStart} onChange={(event) => setDeferStart(event.target.value)} className="input mt-1 w-full tabular-nums" /></label><label className="text-xs text-gray-500">结束<input required type="text" inputMode="numeric" pattern="(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)" value={deferEnd} onChange={(event) => setDeferEnd(event.target.value)} className="input mt-1 w-full tabular-nums" /></label><button type="button" disabled={saving} onClick={() => void defer()} className="btn-primary px-3 py-2 text-xs">{saving ? '处理中…' : '确认推迟'}</button></div>}
        </div>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between"><div>{plan && <button type="button" disabled={saving} onClick={() => void remove()} title="删除计划" aria-label="删除计划" className="grid h-9 w-9 place-items-center rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={16} /></button>}</div><div className="flex gap-2"><button type="button" onClick={onClose} className="btn-secondary px-3 py-2 text-sm">取消</button><button type="submit" disabled={saving || !content.trim()} className="btn-primary px-4 py-2 text-sm">{saving ? '保存中…' : '保存计划'}</button></div></div>
      </form>
    </div>
    {/* 删除计划笔记确认（替代原生 confirm） */}
    <ConfirmDialog
      open={pendingDelete}
      danger
      title="删除确认"
      message="删除这项计划笔记？"
      confirmLabel="删除"
      onConfirm={() => void performRemove()}
      onCancel={() => setPendingDelete(false)}
    />
    </>
  )
}
