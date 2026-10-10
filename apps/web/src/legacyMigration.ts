import { getServerHost } from './api'
import { prepareLocalDatabase } from './localData'

type ExportEntity = 'categories' | 'tags' | 'timeEntries' | 'todos' | 'goals' | 'memos'
type ExportPayload = Record<ExportEntity, Record<string, any>[]> & { version: number; exportedAt: string }

const entities: { source: ExportEntity; target: string; relations: string[] }[] = [
  { source: 'categories', target: 'categories', relations: ['_count'] },
  { source: 'tags', target: 'tags', relations: ['category', 'parent', 'children'] },
  { source: 'todos', target: 'todos', relations: ['category', 'tag', '_count'] },
  { source: 'timeEntries', target: 'timer', relations: ['tag', 'todo', 'memos', 'chainLength', 'totalFocusedMs', 'rootId'] },
  { source: 'goals', target: 'goals', relations: ['tag', 'current', 'periodStart', 'percent'] },
  { source: 'memos', target: 'memos', relations: ['tag', 'timeEntry'] },
]

export async function importLegacyServerData() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)
  let payload: ExportPayload
  try {
    const response = await fetch(`${getServerHost()}/api/migration/export`, { signal: controller.signal })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error ?? `服务器导出失败 (${response.status})`)
    }
    payload = await response.json() as ExportPayload
  } finally {
    clearTimeout(timeout)
  }

  if (payload.version !== 1) throw new Error('服务器导出格式版本不支持')
  const db = await prepareLocalDatabase()
  const docs = entities.flatMap(({ source, target, relations }) => (payload[source] ?? []).map((record) => {
    if (!record.id) throw new Error(`导出数据 ${source} 中存在缺少 ID 的记录`)
    const value = { ...record }
    for (const relation of relations) delete value[relation]
    const updatedAt = record.updatedAt ?? record.createdAt ?? payload.exportedAt
    const fieldClock = Object.fromEntries(Object.keys(value).map((field) => [field, updatedAt]))
    return { _id: `${target}:${record.id}`, entity: target, value, updatedAt, fieldClock }
  }))

  const existing = new Set<string>()
  for (let offset = 0; offset < docs.length; offset += 500) {
    const rows = await db.allDocs({ keys: docs.slice(offset, offset + 500).map((doc) => doc._id) })
    for (const row of rows.rows) if ('value' in row && row.value) existing.add(row.key)
  }
  const fresh = docs.filter((doc) => !existing.has(doc._id))
  const results = fresh.length ? await db.bulkDocs(fresh) : []
  const failed = results.filter((result) => 'error' in result)
  if (failed.length) throw new Error(`导入部分失败：${failed.length} 条记录未写入；可重新运行，已成功的数据会自动跳过`)

  return {
    imported: fresh.length,
    skipped: docs.length - fresh.length,
    total: docs.length,
    exportedAt: payload.exportedAt,
  }
}
