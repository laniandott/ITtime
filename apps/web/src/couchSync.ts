import PouchDB from 'pouchdb-browser'
import { localDatabase, prepareLocalDatabase, resolveConflicts } from './localData'
export type SyncMode = 'live' | 'manual'
export interface SyncConfig { couchUrl: string; couchDatabase: string; couchUsername: string; couchPassword: string; syncMode?: SyncMode }
export interface SyncDocumentCounts { active: number; deleted: number }
export interface SyncDataStatus { local: SyncDocumentCounts; remote: SyncDocumentCounts; guidance: string }
export const SYNC_SETTINGS_KEY = 'ittime-couchdb-settings'
let handle: ReturnType<ReturnType<typeof localDatabase>['sync']> | null = null
let remote: PouchDB.Database | null = null
let syncStatus = '同步未启动'
let autoStartPromise: Promise<void> | null = null
const statusListeners = new Set<(message: string) => void>()

function reportStatus(message: string, report?: (message: string) => void) {
  syncStatus = message
  for (const listener of statusListeners) listener(message)
  report?.(message)
}

export function getSyncStatus() { return syncStatus }
export function subscribeSyncStatus(listener: (message: string) => void) {
  statusListeners.add(listener)
  return () => { statusListeners.delete(listener) }
}

export function describeSyncState(local: SyncDocumentCounts, remote: SyncDocumentCounts): string {
  const localTotal = local.active + local.deleted
  const remoteTotal = remote.active + remote.deleted
  if (local.active === 0 && remote.active > 0 && local.deleted === 0) return `本机没有有效记录，CouchDB 有 ${remote.active} 条有效记录。开始同步会从 CouchDB 恢复到本机。`
  if (local.active === 0 && remote.active === 0 && local.deleted + remote.deleted > 0) return `两端都没有有效记录；本机有 ${local.deleted} 个删除标记，CouchDB 有 ${remote.deleted} 个。删除标记会保留并继续同步，不代表仍有可见记录。`
  if (local.active === 0 && local.deleted > 0 && remote.active > 0) return `本机没有有效记录但有 ${local.deleted} 个删除标记，CouchDB 有 ${remote.active} 条有效记录。同步会保留删除意图；若要恢复已删记录，请从删除前的备份恢复。`
  if (local.active > 0 && remote.active === 0 && remote.deleted === 0) return `本机有 ${local.active} 条有效记录，CouchDB 为空。开始同步会把本机数据上传到 CouchDB。`
  if (localTotal > 0 && remoteTotal > 0) return `本机：${local.active} 条有效记录、${local.deleted} 个删除标记；CouchDB：${remote.active} 条有效记录、${remote.deleted} 个删除标记。开始同步会双向合并并保留删除标记。`
  return '本机和 CouchDB 都没有记录或删除标记。开始同步会创建一个空的数据集。'
}

export async function countSyncDocuments(db: PouchDB.Database): Promise<SyncDocumentCounts> {
  const counts: SyncDocumentCounts = { active: 0, deleted: 0 }
  const entities = new Set(['categories', 'tags', 'todos', 'timer', 'goals', 'memos'])
  let startkey: string | undefined
  while (true) {
    const result = await db.allDocs({ include_docs: true, limit: 500, ...(startkey ? { startkey, skip: 1 } : {}) })
    for (const row of result.rows) {
      if (!row.doc || !entities.has((row.doc as any).entity)) continue
      if ((row.doc as any).deletedAt) counts.deleted++
      else counts.active++
    }
    if (result.rows.length < 500) break
    startkey = result.rows[result.rows.length - 1].id
  }
  return counts
}

export async function inspectSyncData(config: SyncConfig): Promise<SyncDataStatus> {
  const db = await prepareLocalDatabase()
  const remoteDb = createRemote(config)
  try {
    const [local, remote] = await Promise.all([countSyncDocuments(db), countSyncDocuments(remoteDb)])
    return {
      local,
      remote,
      guidance: describeSyncState(local, remote),
    }
  } finally {
    await remoteDb.close()
  }
}
export function createRemote(config: SyncConfig) {
  const url = new URL(config.couchUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请输入有效的 HTTP(S) CouchDB 地址')
  if (!config.couchDatabase.trim()) throw new Error('请填写数据库名称')
  return new PouchDB(`${url.toString().replace(/\/$/, '')}/${encodeURIComponent(config.couchDatabase.trim())}`, { skip_setup: true, auth: { username: config.couchUsername, password: config.couchPassword } })
}
export async function testConnection(config: SyncConfig) { return inspectSyncData(config) }
export async function stopSync() { handle?.cancel(); handle = null; if (remote) await remote.close(); remote = null }
export async function startSync(config: SyncConfig, report: (message: string) => void, mode: SyncMode = 'live') {
  reportStatus('正在连接 CouchDB…', report)
  await stopSync(); const db = await prepareLocalDatabase(); await resolveConflicts(db); remote = createRemote(config); await remote.info()
  const [local, cloud] = await Promise.all([countSyncDocuments(db), countSyncDocuments(remote)])
  const guidance = describeSyncState(local, cloud)
  reportStatus(mode === 'live' ? `实时同步已启动。${guidance}` : `正在执行一次双向同步。${guidance}`, report)
  handle = db.sync(remote, { live: mode === 'live', retry: mode === 'live' })
  handle.on('active', () => reportStatus(mode === 'live' ? `实时同步运行中；${guidance}` : '正在同步本机与 CouchDB 的变更…', report))
  handle.on('paused', (error: unknown) => reportStatus(error ? (mode === 'live' ? '连接中断，正在自动重试' : '连接中断') : (mode === 'live' ? '实时同步已连接，当前无待同步变更' : '正在完成本次同步…'), report))
  handle.on('error', (error: unknown) => reportStatus(`同步失败：${error instanceof Error ? error.message : String(error)}`, report))
  if (mode === 'manual') {
    handle.on('complete', (result: { status?: string; push?: { docs_written?: number }; pull?: { docs_written?: number } }) => {
      const pushed = result.push?.docs_written ?? 0
      const pulled = result.pull?.docs_written ?? 0
      reportStatus(`本次同步完成：上传 ${pushed} 条，下载 ${pulled} 条。`, report)
      handle = null
      void remote?.close()
      remote = null
    })
  }
  handle.on('change', (info) => {
    window.dispatchEvent(new Event('ittime-data-changed'))
    const ids = info.change.docs.map((doc) => doc._id)
    void resolveConflicts(db, ids).then((count) => {
      if (count) reportStatus(`已自动合并 ${count} 条多设备冲突记录`, report)
    }).catch((error: unknown) => reportStatus(`冲突合并失败：${error instanceof Error ? error.message : String(error)}`, report))
  })
}

export async function autoStartConfiguredSync() {
  if (autoStartPromise) return autoStartPromise
  autoStartPromise = (async () => {
    try {
      const raw = localStorage.getItem(SYNC_SETTINGS_KEY)
      if (!raw) return
      const config = JSON.parse(raw) as SyncConfig
      if ((config.syncMode ?? 'live') !== 'live' || !config.couchUrl?.trim() || !config.couchDatabase?.trim()) return
      await startSync(config, (message) => reportStatus(message), 'live')
    } catch (error) {
      reportStatus(`实时同步启动失败：${error instanceof Error ? error.message : String(error)}`)
      autoStartPromise = null
    }
  })()
  return autoStartPromise
}
