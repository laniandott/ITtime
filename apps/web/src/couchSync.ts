import PouchDB from 'pouchdb-browser'
import { localDatabase } from './localData'
export interface SyncConfig { couchUrl: string; couchDatabase: string; couchUsername: string; couchPassword: string }
let handle: ReturnType<ReturnType<typeof localDatabase>['sync']> | null = null
let remote: PouchDB.Database | null = null
export function createRemote(config: SyncConfig) {
  const url = new URL(config.couchUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请输入有效的 HTTP(S) CouchDB 地址')
  if (!config.couchDatabase.trim()) throw new Error('请填写数据库名称')
  return new PouchDB(`${url.toString().replace(/\/$/, '')}/${encodeURIComponent(config.couchDatabase.trim())}`, { skip_setup: true, auth: { username: config.couchUsername, password: config.couchPassword } })
}
export async function testConnection(config: SyncConfig) { const db = createRemote(config); try { await db.info() } finally { await db.close() } }
export async function stopSync() { handle?.cancel(); handle = null; if (remote) await remote.close(); remote = null }
export async function startSync(config: SyncConfig, report: (message: string) => void) {
  await stopSync(); remote = createRemote(config); await remote.info()
  handle = localDatabase().sync(remote, { live: true, retry: true })
  handle.on('active', () => report('正在同步'))
  handle.on('paused', (error: unknown) => report(error ? '连接中断，等待重试' : '同步完成'))
  handle.on('error', (error: unknown) => report(`同步失败：${error instanceof Error ? error.message : String(error)}`))
  handle.on('change', () => window.dispatchEvent(new Event('ittime-data-changed')))
}
