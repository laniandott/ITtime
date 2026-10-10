import PouchDB from 'pouchdb-browser'
import { periodBounds, elapsed } from './localStats'

type Doc = PouchDB.Core.IdMeta & Partial<PouchDB.Core.GetMeta> & { entity: string; value: Record<string, any>; updatedAt: string }
let database: PouchDB.Database<Doc> | undefined
export function localDatabase() { return database ??= new PouchDB<Doc>('ittime-tagtime-v1') }
async function list(entity: string) { const result = await localDatabase().allDocs({ include_docs: true, startkey: `${entity}:`, endkey: `${entity}:\uffff` }); return result.rows.flatMap(row => row.doc ? [row.doc.value] : []) }
async function get(entity: string, id: string) { return (await localDatabase().get(`${entity}:${id}`)).value }
async function write(entity: string, value: Record<string, any>) {
  const _id = `${entity}:${value.id}`
  let _rev: string | undefined
  try { _rev = (await localDatabase().get(_id))._rev } catch (error) { if ((error as { status?: number }).status !== 404) throw error }
  // Persist only source fields; relations are joined when reading.
  const { tag, category, parent, todo, memos, _count, ...source } = value
  await localDatabase().put({ _id, ...(_rev ? { _rev } : {}), entity, value: source, updatedAt: new Date().toISOString() })
  return source
}
async function joined(entity: string, value: Record<string, any>): Promise<any> {
  const lookup = async (kind: string, id: string | null) => id ? get(kind, id).catch(() => null) : null
  if (entity === 'categories') return { ...value, _count: { tags: (await list('tags')).filter(tag => tag.categoryId === value.id).length } }
  if (entity === 'tags') return { ...value, category: await lookup('categories', value.categoryId), parent: await lookup('tags', value.parentId) }
  if (entity === 'timer') { const tag = await lookup('tags', value.tagId); return { ...value, tag: tag ? await joined('tags', tag) : null, todo: await lookup('todos', value.todoId), memos: (await list('memos')).filter(memo => memo.timeEntryId === value.id) } }
  if (entity === 'goals') {
    const [start, end] = periodBounds(value.period, value.periodDays ?? 7)
    const entries = (await list('timer')).filter(entry => entry.tagId === value.tagId && entry.endTime)
    const current = value.kind === 'activity'
      ? (await list('todos')).filter(todo => todo.goalId === value.id && todo.status === 'done' && (value.period === 'once' || (Date.parse(todo.completedAt) >= start && Date.parse(todo.completedAt) < end))).length
      : value.type === 'count'
        ? entries.filter(entry => Date.parse(entry.startTime) >= start && Date.parse(entry.startTime) < end).length
        : Math.floor(elapsed(entries as any, start, end) / 60000)
    return { ...value, current, tag: await lookup('tags', value.tagId) }
  }
  return { ...value, tag: await lookup('tags', value.tagId), category: await lookup('categories', value.categoryId) }
}
const defaults: Record<string, Record<string, any>> = {
  categories: { color: '#6d5efc', icon: null, sortOrder: 0 },
  tags: { color: '#6d5efc', icon: null, categoryId: null, parentId: null, trackType: 'time', mode: 'chaos', sortOrder: 0 },
  todos: { description: null, status: 'pending', priority: 0, dueDate: null, categoryId: null, tagId: null, goalId: null, repeatType: 'none', completedAt: null, lateReason: null, restoreReason: null },
  goals: { kind: 'tracking', type: 'time', period: 'daily', active: true, periodDays: null, deadlineTime: null, deadlineDay: null, deadlineAt: null },
  memos: { type: 'point', timeEntryId: null, tagId: null, attachments: [] },
}
export function isLocalPath(path: string) { return /^\/(categories|tags|todos|timer|goals|memos)(\/|\?|$)/.test(path) }
export async function localRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const url = new URL(path, 'http://local'); const [entity, key, action] = url.pathname.split('/').slice(1)
  const method = options?.method ?? 'GET'; const body = typeof options?.body === 'string' ? JSON.parse(options.body) : {}
  const now = new Date().toISOString()
  const execute = async (): Promise<any> => {
    if (entity === 'todos' && method === 'GET' && !key) {
      for (const goal of (await list('goals')).filter(goal => goal.kind === 'activity' && goal.active)) {
        const [start, end] = periodBounds(goal.period)
        if (goal.period === 'workday' && start === end) continue
        const activityId = `${goal.id}:${goal.period === 'once' ? 'once' : start}`
        try { await get('todos', activityId) } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error
          const deadline = new Date(goal.period === 'daily' || goal.period === 'workday' ? start : end - 60000)
          if (goal.period === 'daily' || goal.period === 'workday') deadline.setHours(23, 59, 0, 0)
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
        const entry = { id: crypto.randomUUID(), tagId: body.tagId, todoId: body.todoId ?? null, note: body.note ?? null, startTime: body.startTime ?? now, endTime: key === 'quick' ? now : key === 'manual' ? body.endTime : null, pendingResume: false, dismissed: false, dismissReason: null, resumedFromId: body.resumedFromId ?? null, interruptedFromId: body.interruptedFromId ?? null }
        if (body.resumedFromId) { const previous = await get(entity, body.resumedFromId); if (!previous.pendingResume) throw new Error('原记录不在待续状态'); await write(entity, { ...previous, pendingResume: false }) }
        await write(entity, entry); return { ...await joined(entity, entry), serverTime: now }
      }
      if (method === 'POST' && key === 'stop') {
        const selected = action ? entries.filter(entry => entry.id === action) : entries.filter(entry => !entry.endTime)
        for (const entry of selected) await write(entity, { ...entry, endTime: entry.endTime ?? now, note: body.note ?? entry.note, pendingResume: Boolean(body.pendingResume) })
        return action ? joined(entity, await get(entity, action)) : { count: selected.length }
      }
      if (method === 'POST' && ['dismiss-pending', 'finish-pending'].includes(action)) { const entry = await get(entity, key); await write(entity, { ...entry, pendingResume: false, ...(action === 'dismiss-pending' ? { dismissed: true, dismissReason: body.reason } : {}) }); return joined(entity, await get(entity, key)) }
      if (method === 'POST' && action) throw new Error('此活动链操作尚未迁移到本地存储')
    }
    if (method === 'GET' && !key) {
      let values = await list(entity)
      for (const field of ['status', 'categoryId', 'tagId', 'repeatType', 'timeEntryId', 'type']) if (url.searchParams.get(field)) values = values.filter(value => value[field] === url.searchParams.get(field))
      if (entity === 'timer') values = values.filter(value => (!url.searchParams.get('from') || !value.endTime || value.endTime >= url.searchParams.get('from')!) && (!url.searchParams.get('to') || value.startTime <= url.searchParams.get('to')!)).sort((a, b) => b.startTime.localeCompare(a.startTime))
      return Promise.all(values.map(value => joined(entity, value)))
    }
    if (method === 'GET') return joined(entity, await get(entity, key))
    if (method === 'DELETE') { const doc = await localDatabase().get(`${entity}:${key}`); await localDatabase().remove(doc); return { ok: true } }
    if (method === 'POST' && !key) { const value = { ...defaults[entity], ...body, id: crypto.randomUUID(), createdAt: now, updatedAt: now }; await write(entity, value); return joined(entity, value) }
    const existing = await get(entity, key)
    const value = action === 'toggle' ? { ...existing, status: existing.status === 'done' ? 'pending' : 'done', completedAt: existing.status === 'done' ? null : now, updatedAt: now } : { ...existing, ...body, id: existing.id, updatedAt: now }
    await write(entity, value); return joined(entity, value)
  }
  // Serialize compound mutations across tabs; concurrent activities have separate IDs.
  return (method === 'GET' ? await execute() : navigator.locks ? await navigator.locks.request('ittime-local-write', execute) : await execute()) as T
}
