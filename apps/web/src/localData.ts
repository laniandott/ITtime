import PouchDB from 'pouchdb-browser'
import { periodBounds, elapsed } from './localStats'
import { derivePlanExecution } from './planStats'

export type LocalDoc = PouchDB.Core.IdMeta & Partial<PouchDB.Core.GetMeta> & { entity: string; value: Record<string, any>; updatedAt: string; deletedAt?: string; fieldClock?: Record<string, string> }
let database: PouchDB.Database<LocalDoc> | undefined
let migration: Promise<void> | undefined
export function localDatabase() {
  database ??= new PouchDB<LocalDoc>('ittime-v1')
  migration ??= (async () => {
    const legacy = new PouchDB<LocalDoc>('ittime-tagtime-v1')
    const { doc_count } = await legacy.info()
    if (doc_count) await PouchDB.replicate(legacy, database!)
  })()
  return database
}
async function readyDatabase() { const db = localDatabase(); await migration; return db }
export async function prepareLocalDatabase() { return readyDatabase() }
async function list(entity: string) {
  const result = await (await readyDatabase()).allDocs({ include_docs: true, startkey: `${entity}:`, endkey: `${entity}:\uffff` })
  const values = result.rows.flatMap(row => row.doc && !row.doc.deletedAt ? [row.doc.value] : [])
  if (entity === 'categories' || entity === 'tags' || entity === 'goals') {
    return values.sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || String(a.name ?? '').localeCompare(String(b.name ?? '')))
  }
  if (entity === 'plans') return values.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || Number(a.startMinute ?? 0) - Number(b.startMinute ?? 0) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
  return values
}
async function get(entity: string, id: string) {
  const doc = await (await readyDatabase()).get(`${entity}:${id}`)
  if (doc.deletedAt) throw Object.assign(new Error('记录不存在'), { status: 404 })
  return doc.value
}
async function write(entity: string, value: Record<string, any>) {
  const db = await readyDatabase()
  const _id = `${entity}:${value.id}`
  let existing: LocalDoc | undefined
  try { existing = await db.get(_id) } catch (error) { if ((error as { status?: number }).status !== 404) throw error }
  // Persist only source fields; relations are joined when reading.
  const { tag, category, parent, todo, memos, _count, disposition, executionStatus, confirmed, actualMs, plannedMs, coverageRate, overlaps, linkedEntries, ...source } = value
  const updatedAt = new Date().toISOString()
  const fieldClock = { ...(existing?.fieldClock ?? {}) }
  const fields = new Set([...Object.keys(existing?.value ?? {}), ...Object.keys(source)])
  for (const field of fields) {
    if (!existing || JSON.stringify(existing.value[field]) !== JSON.stringify(source[field])) fieldClock[field] = updatedAt
  }
  await db.put({ _id, ...(existing?._rev ? { _rev: existing._rev } : {}), entity, value: source, updatedAt, fieldClock })
  return source
}

const conflictQueues = new WeakMap<object, Promise<void>>()

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

export async function resolveConflicts(db: PouchDB.Database<LocalDoc>, ids?: string[]): Promise<number> {
  const previous = conflictQueues.get(db as object) ?? Promise.resolve()
  let release!: () => void
  const queued = new Promise<void>((resolve) => { release = resolve })
  conflictQueues.set(db as object, previous.then(() => queued))
  await previous
  try {
    return await resolveConflictsNow(db, ids)
  } finally {
    release()
  }
}

async function resolveConflictsNow(db: PouchDB.Database<LocalDoc>, ids?: string[]): Promise<number> {
  const rows = ids
    ? await db.allDocs({ keys: [...new Set(ids)], include_docs: true, conflicts: true })
    : await db.allDocs({ include_docs: true, conflicts: true })
  let resolved = 0
  for (const row of rows.rows) {
    if (!('doc' in row) || !row.doc?._conflicts?.length) continue
    const id = row.id
    const revisions = [row.doc._rev, ...row.doc._conflicts].filter((rev): rev is string => Boolean(rev))
    const branches = await Promise.all(revisions.map((rev) => db.get(id, { rev })))
    const latestTime = (doc: LocalDoc) => doc.updatedAt ?? ''
    const ordered = [...branches].sort((a, b) => latestTime(a).localeCompare(latestTime(b)))
    const mergedValue: Record<string, any> = {}
    const mergedClock: Record<string, string> = {}
    const fields = new Set(ordered.flatMap((doc) => [...Object.keys(doc.value), ...Object.keys(doc.fieldClock ?? {})]))
    for (const field of fields) {
      const candidates = ordered.map((doc) => ({
        doc,
        present: Object.prototype.hasOwnProperty.call(doc.value, field),
        clock: doc.fieldClock?.[field] ?? latestTime(doc),
      })).sort((a, b) => a.clock.localeCompare(b.clock)
        || latestTime(a.doc).localeCompare(latestTime(b.doc))
        || stableJson([!a.present, a.doc.value[field]]).localeCompare(stableJson([!b.present, b.doc.value[field]])))
      const chosen = candidates[candidates.length - 1]
      mergedClock[field] = chosen.clock
      if (chosen.present) mergedValue[field] = chosen.doc.value[field]
    }
    const winner = branches.find((doc) => doc._rev === row.doc!._rev)!
    const { _conflicts: _ignoredConflicts, ...winnerBody } = winner
    const latestDeletedAt = branches.map((doc) => doc.deletedAt ?? '').sort().at(-1) ?? ''
    const mergedBody: LocalDoc = {
      ...winnerBody,
      _rev: winner._rev,
      value: mergedValue,
      fieldClock: mergedClock,
      updatedAt: branches.map(latestTime).sort().at(-1) ?? new Date().toISOString(),
    }
    if (latestDeletedAt) mergedBody.deletedAt = latestDeletedAt
    else delete mergedBody.deletedAt
    const merged = await db.put(mergedBody)
    for (const rev of row.doc._conflicts) await db.remove(id, rev)
    if (merged.ok) resolved++
  }
  return resolved
}
async function joined(entity: string, value: Record<string, any>): Promise<any> {
  const lookup = async (kind: string, id: string | null) => id ? get(kind, id).catch(() => null) : null
  if (entity === 'categories') return { ...value, _count: { tags: (await list('tags')).filter(tag => tag.categoryId === value.id).length } }
  if (entity === 'tags') return { ...value, category: await lookup('categories', value.categoryId), parent: await lookup('tags', value.parentId) }
  if (entity === 'timer') { const tag = await lookup('tags', value.tagId); return { ...value, tag: tag ? await joined('tags', tag) : null, todo: await lookup('todos', value.todoId), memos: (await list('memos')).filter(memo => memo.timeEntryId === value.id) } }
  if (entity === 'goals') {
    const [start, end] = periodBounds(value.period, value.periodDays ?? 7, new Date(), value.weekDay ?? 1)
    const entries = (await list('timer')).filter(entry => entry.tagId === value.tagId && !entry.dismissed)
    const current = value.kind === 'activity'
      ? (await list('todos')).filter(todo => todo.goalId === value.id && todo.status === 'done' && (value.period === 'once' || (Date.parse(todo.completedAt) >= start && Date.parse(todo.completedAt) < end))).length
      : value.type === 'count'
        ? entries.filter(entry => Date.parse(entry.startTime) >= start && Date.parse(entry.startTime) < end).length
        : Math.floor(elapsed(entries as any, start, end) / 60000)
    return { ...value, current, tag: await lookup('tags', value.tagId) }
  }
  if (entity === 'plans') {
    const [allPlans, entries] = await Promise.all([list('plans'), list('timer')])
    const execution = derivePlanExecution(value as any, entries as any)
    const successors = allPlans.filter(plan => plan.deferredFromId === value.id)
    const sameDayOverlap = allPlans.some(plan => plan.id !== value.id && plan.date === value.date && plan.startMinute < value.endMinute && value.startMinute < plan.endMinute)
    return {
      ...value,
      tag: await lookup('tags', value.tagId),
      todo: await lookup('todos', value.todoId),
      disposition: value.skippedAt ? 'skipped' : successors.length > 0 ? 'deferred' : 'planned',
      confirmed: Boolean(value.confirmedAt),
      overlaps: sameDayOverlap,
      ...execution,
    }
  }
  return { ...value, tag: await lookup('tags', value.tagId), category: await lookup('categories', value.categoryId) }
}
const defaults: Record<string, Record<string, any>> = {
  categories: { color: '#0f766e', icon: null, sortOrder: 0 },
  tags: { color: '#0f766e', icon: null, categoryId: null, parentId: null, trackType: 'time', mode: 'chaos', sortOrder: 0 },
  todos: { description: null, status: 'pending', priority: 0, dueDate: null, categoryId: null, tagId: null, goalId: null, repeatType: 'none', completedAt: null, lateReason: null, restoreReason: null },
  goals: { kind: 'tracking', type: 'time', period: 'daily', active: true, periodDays: null, weekDay: null, sortOrder: 0, deadlineTime: null, deadlineDay: null, deadlineAt: null },
  memos: { type: 'point', timeEntryId: null, tagId: null, attachments: [] },
  plans: { content: '', tagId: null, todoId: null, skippedAt: null, confirmedAt: null, deferredFromId: null },
}
export function isLocalPath(path: string) { return /^\/(categories|tags|todos|timer|goals|memos|plans)(\/|\?|$)/.test(path) }

function validatePlanInput(value: Record<string, any>, existing?: Record<string, any>) {
  const content = value.content ?? existing?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('计划内容不能为空')
  if (content.length > 2_000) throw new Error('计划内容不能超过 2000 个字符')
  const date = value.date ?? existing?.date
  const parsedDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : null
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}` !== date) throw new Error('计划日期无效')
  const startMinute = value.startMinute ?? existing?.startMinute
  const endMinute = value.endMinute ?? existing?.endMinute
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) throw new Error('计划开始分钟无效')
  if (!Number.isInteger(endMinute) || endMinute <= startMinute || endMinute > 1440) throw new Error('计划结束分钟无效')
}

export async function localRequest<T>(path: string, options?: RequestInit): Promise<T> {
  await readyDatabase()
  const url = new URL(path, 'http://local'); const [entity, key, action] = url.pathname.split('/').slice(1)
  const method = options?.method ?? 'GET'; const body = typeof options?.body === 'string' ? JSON.parse(options.body) : {}
  const now = new Date().toISOString()
  const execute = async (): Promise<any> => {
    if (entity === 'todos' && method === 'GET' && !key) {
      for (const goal of (await list('goals')).filter(goal => goal.kind === 'activity' && goal.active)) {
        const [start, end] = periodBounds(goal.period, goal.periodDays ?? 7, new Date(), goal.weekDay ?? 0)
        if (goal.period === 'workday' && start === end) continue
        const activityId = `${goal.id}:${goal.period === 'once' ? 'once' : start}`
        try { await get('todos', activityId) } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error
          const deadline = new Date(goal.period === 'daily' || goal.period === 'workday' ? start : end - 60000)
          if (goal.period === 'daily' || goal.period === 'workday') deadline.setHours(23, 59, 0, 0)
          if (goal.period === 'weekly') {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const selectedWeekDay = goal.weekDay ?? 0
            deadline.setTime(today.getTime())
            deadline.setDate(deadline.getDate() + (selectedWeekDay - today.getDay() + 7) % 7)
          }
          if (goal.period === 'monthly' && goal.deadlineDay) { deadline.setDate(Math.min(goal.deadlineDay, deadline.getDate())) }
          if (goal.deadlineTime) { const [hour, minute] = goal.deadlineTime.split(':').map(Number); deadline.setHours(hour, minute, 0, 0) }
          const due = goal.period === 'once' ? goal.deadlineAt : deadline.toISOString()
          await write('todos', { ...defaults.todos, id: activityId, title: goal.title, tagId: goal.tagId, categoryId: (await get('tags', goal.tagId)).categoryId, goalId: goal.id, repeatType: goal.period === 'once' ? 'none' : goal.period, dueDate: due, createdAt: now, updatedAt: now })
        }
      }
    }
    if (entity === 'timer') {
      const entries = await list(entity)
      if (method === 'GET' && key === 'current') return { running: await Promise.all(entries.filter(entry => !entry.endTime).map(entry => joined(entity, entry))), serverTime: now }
      if (method === 'GET' && key === 'pending') return { pending: await Promise.all(entries.filter(entry => entry.pendingResume).map(entry => joined(entity, entry))), serverTime: now }
      if (method === 'POST' && ['start', 'quick', 'manual'].includes(key)) {
        await get('tags', body.tagId)
        if (body.todoId !== undefined && body.todoId !== null) await get('todos', body.todoId)
        if (body.planId !== undefined && body.planId !== null) {
          const plan = await get('plans', body.planId)
          if (plan.tagId && plan.tagId !== body.tagId) throw new Error('计时标签必须与计划标签一致')
          const planTag = await get('tags', body.tagId)
          if (planTag.trackType === 'count') throw new Error('计划只能关联时长型标签')
        }
        if (key === 'manual') {
          if (typeof body.startTime !== 'string' || typeof body.endTime !== 'string' || !body.startTime.trim() || !body.endTime.trim()) throw new Error('tagId、startTime、endTime 为必填')
          const startMs = Date.parse(body.startTime)
          const endMs = Date.parse(body.endTime)
          if (!Number.isFinite(startMs)) throw new Error('startTime 不是有效时间')
          if (!Number.isFinite(endMs)) throw new Error('endTime 不是有效时间')
          if (endMs <= startMs) throw new Error('结束时间必须晚于开始时间')
        }
        let inheritedPlanId = body.planId ?? null
        let inheritedTodoId = body.todoId ?? null
        if (body.resumedFromId) {
          const previous = await get(entity, body.resumedFromId)
          if (!previous.pendingResume) throw new Error('原记录不在待续状态')
          if (previous.tagId !== body.tagId) throw new Error('续接的 tagId 必须与原记录一致')
          inheritedPlanId = body.planId ?? previous.planId ?? null
          inheritedTodoId = body.todoId ?? previous.todoId ?? null
          await write(entity, { ...previous, pendingResume: false })
        }
        if (body.interruptedFromId) {
          await get(entity, body.interruptedFromId)
        }
        const entry = { id: crypto.randomUUID(), tagId: body.tagId, todoId: inheritedTodoId, planId: inheritedPlanId, note: body.note ?? null, startTime: body.startTime ?? now, endTime: key === 'quick' ? now : key === 'manual' ? body.endTime : null, pendingResume: false, dismissed: false, dismissReason: null, resumedFromId: body.resumedFromId ?? null, interruptedFromId: body.interruptedFromId ?? null }
        await write(entity, entry); return { ...await joined(entity, entry), serverTime: now }
      }
      if (method === 'POST' && key === 'stop') {
        const selected = action ? entries.filter(entry => entry.id === action) : entries.filter(entry => !entry.endTime)
        for (const entry of selected) {
          const tag = await get('tags', entry.tagId)
          const pendingResume = tag.mode === 'ordered' && body.pendingResume === true
          if (pendingResume && (typeof body.note !== 'string' || !body.note.trim())) throw new Error('有序标签暂停时必须填写"接下来怎么续"备注')
          await write(entity, { ...entry, endTime: entry.endTime ?? now, note: body.note ?? entry.note, pendingResume })
        }
        return action ? joined(entity, await get(entity, action)) : { count: selected.length }
      }
      if (method === 'POST' && ['dismiss-pending', 'finish-pending'].includes(action)) { const entry = await get(entity, key); await write(entity, { ...entry, pendingResume: false, ...(action === 'dismiss-pending' ? { dismissed: true, dismissReason: body.reason } : {}) }); return joined(entity, await get(entity, key)) }
      if (method === 'POST' && action === 'terminate-chain') {
        if (typeof body.reason !== 'string' || !body.reason.trim()) throw new Error('必须填写终止本次链路的具体原因')
        const reason = body.reason.trim()
        if (reason.length > 1_000) throw new Error('原因不能超过 1000 字符')
        const chain: Record<string, any>[] = []
        const visited = new Set<string>()
        let currentId: string | null = key
        while (currentId && !visited.has(currentId)) {
          visited.add(currentId)
          let entry: Record<string, any>
          try { entry = await get(entity, currentId) } catch (error) {
            if ((error as { status?: number }).status === 404) break
            throw error
          }
          chain.push(entry)
          currentId = entry.interruptedFromId ?? null
        }
        if (!chain.length) throw new Error('活动记录不存在')
        for (const entry of chain) await write(entity, { ...entry, endTime: entry.endTime ?? now, pendingResume: false, dismissed: true, dismissReason: reason })
        return { count: chain.length }
      }
      if (method === 'POST' && action) throw new Error('此活动链操作尚未迁移到本地存储')
    }
    if (entity === 'plans') {
      const plans = await list('plans')
      if (method === 'POST' && key && ['skip', 'unskip', 'confirm', 'unconfirm'].includes(action ?? '')) {
        const existing = await get('plans', key)
        const value = action === 'skip'
          ? { ...existing, skippedAt: now, updatedAt: now }
          : action === 'unskip'
            ? { ...existing, skippedAt: null, updatedAt: now }
            : action === 'confirm'
              ? { ...existing, confirmedAt: now, updatedAt: now }
              : { ...existing, confirmedAt: null, updatedAt: now }
        await write('plans', value)
        return joined('plans', value)
      }
      if (method === 'POST' && key && action === 'defer') {
        const source = await get('plans', key)
        validatePlanInput({ ...source, ...body })
        const candidate = { ...source, ...body, deferredFromId: source.id, skippedAt: null, confirmedAt: null }
        const stableId = `deferred-${source.id}-${candidate.date}-${candidate.startMinute}-${candidate.endMinute}`
        try { return joined('plans', await get('plans', stableId)) } catch (error) { if ((error as { status?: number }).status !== 404) throw error }
        if (plans.some(plan => plan.deferredFromId === source.id)) throw new Error('这项计划已经推迟过；可推迟后继计划继续调整')
        const value = { ...defaults.plans, ...candidate, id: stableId, createdAt: now, updatedAt: now }
        await write('plans', value)
        return joined('plans', value)
      }
      if (method === 'POST' && !key) {
        validatePlanInput(body)
      }
    }
    if (method === 'GET' && !key) {
      let values = await list(entity)
      for (const field of ['status', 'categoryId', 'tagId', 'repeatType', 'timeEntryId', 'type', 'date', 'deferredFromId']) if (url.searchParams.get(field)) values = values.filter(value => value[field] === url.searchParams.get(field))
      if (entity === 'plans') return Promise.all(values.map(value => joined(entity, value)))
      if (entity === 'timer') values = values.filter(value => (!url.searchParams.get('from') || !value.endTime || value.endTime >= url.searchParams.get('from')!) && (!url.searchParams.get('to') || value.startTime <= url.searchParams.get('to')!)).sort((a, b) => b.startTime.localeCompare(a.startTime))
      return Promise.all(values.map(value => joined(entity, value)))
    }
    if (method === 'GET') return joined(entity, await get(entity, key))
    if (method === 'DELETE') {
      if (entity === 'plans') {
        const source = await get('plans', key)
        const allPlans = await list('plans')
        if (source.deferredFromId || allPlans.some(plan => plan.deferredFromId === key)) {
          throw new Error('已有推迟链路的计划不能直接删除')
        }
      }
      const db = await readyDatabase(); const doc = await db.get(`${entity}:${key}`)
      if (doc.deletedAt) return { ok: true }
      const deletedAt = now
      await db.put({ ...doc, deletedAt, updatedAt: deletedAt, fieldClock: { ...(doc.fieldClock ?? {}), _deleted: deletedAt } })
      return { ok: true }
    }
    if (method === 'POST' && !key) { const value = { ...defaults[entity], ...body, id: crypto.randomUUID(), createdAt: now, updatedAt: now }; await write(entity, value); return joined(entity, value) }
    const existing = await get(entity, key)
    if (entity === 'timer' && method === 'PUT') {
      if (body.tagId !== undefined) await get('tags', body.tagId)
      if (body.todoId !== undefined && body.todoId !== null) await get('todos', body.todoId)
      if (body.startTime !== undefined && (typeof body.startTime !== 'string' || !body.startTime.trim() || !Number.isFinite(Date.parse(body.startTime)))) throw new Error('startTime 不是有效时间')
      if (body.endTime !== undefined && body.endTime !== null && (typeof body.endTime !== 'string' || !body.endTime.trim() || !Number.isFinite(Date.parse(body.endTime)))) throw new Error('endTime 不是有效时间')
      const nextStart = body.startTime !== undefined ? Date.parse(body.startTime) : Date.parse(existing.startTime)
      const nextEnd = body.endTime === null ? null : body.endTime !== undefined ? Date.parse(body.endTime) : existing.endTime ? Date.parse(existing.endTime) : null
      if (nextEnd !== null && nextEnd < nextStart) throw new Error('结束时间不能早于开始时间')
    }
    if (entity === 'plans' && method === 'PUT') {
      validatePlanInput({ ...existing, ...body }, existing)
      const value = { ...existing, ...body, id: existing.id, updatedAt: now }
      await write(entity, value)
      return joined(entity, value)
    }
    const value = action === 'toggle' ? { ...existing, status: existing.status === 'done' ? 'pending' : 'done', completedAt: existing.status === 'done' ? null : now, updatedAt: now } : { ...existing, ...body, id: existing.id, updatedAt: now }
    await write(entity, value); return joined(entity, value)
  }
  // Serialize compound mutations across tabs; concurrent activities have separate IDs.
  return (method === 'GET' ? await execute() : navigator.locks ? await navigator.locks.request('ittime-local-write', execute) : await execute()) as T
}
