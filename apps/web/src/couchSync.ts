import PouchDB from 'pouchdb-browser'
import { localDatabase, prepareLocalDatabase, resolveConflicts } from './localData'
export interface SyncConfig { couchUrl: string; couchDatabase: string; couchUsername: string; couchPassword: string }
export interface SyncDocumentCounts { active: number; deleted: number }
export interface SyncDataStatus { local: SyncDocumentCounts; remote: SyncDocumentCounts; guidance: string }
let handle: ReturnType<ReturnType<typeof localDatabase>['sync']> | null = null
let remote: PouchDB.Database | null = null

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
export async function startSync(config: SyncConfig, report: (message: string) => void) {
  await stopSync(); const db = await prepareLocalDatabase(); await resolveConflicts(db); remote = createRemote(config); await remote.info()
  const [local, cloud] = await Promise.all([countSyncDocuments(db), countSyncDocuments(remote)])
  const guidance = describeSyncState(local, cloud)
  report(guidance)
  handle = db.sync(remote, { live: true, retry: true })
  handle.on('active', () => report(`正在同步；${guidance}`))
  handle.on('paused', (error: unknown) => report(error ? '连接中断，等待重试' : '同步完成'))
  handle.on('error', (error: unknown) => report(`同步失败：${error instanceof Error ? error.message : String(error)}`))
  handle.on('change', (info) => {
    window.dispatchEvent(new Event('ittime-data-changed'))
    const ids = info.change.docs.map((doc) => doc._id)
    void resolveConflicts(db, ids).then((count) => {
      if (count) report(`已自动合并 ${count} 条多设备冲突记录`)
    }).catch((error: unknown) => report(`冲突合并失败：${error instanceof Error ? error.message : String(error)}`))
  })
}
