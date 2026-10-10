import { useState } from 'react'
import { Link } from 'react-router-dom'
import TagsPage from './TagsPage'
import { testConnection, startSync, stopSync, type SyncConfig } from '../couchSync'

const key = 'ittime-couchdb-settings'
function load(): SyncConfig { try { return { couchUrl: '', couchDatabase: 'ittime', couchUsername: '', couchPassword: '', ...JSON.parse(localStorage.getItem(key) ?? '{}') } } catch { return { couchUrl: '', couchDatabase: 'ittime', couchUsername: '', couchPassword: '' } } }
export default function SettingsPage() {
  const [page, setPage] = useState('tags')
  const [settings, setSettings] = useState<SyncConfig>(load)
  const [message, setMessage] = useState('同步未启动')
  const [busy, setBusy] = useState(false)
  const update = (field: keyof SyncConfig, value: string) => setSettings(current => ({ ...current, [field]: value }))
  const connect = async (test: boolean) => { setBusy(true); try { setMessage('正在连接…'); if (test) { await testConnection(settings); setMessage('连接测试成功') } else { await startSync(settings, setMessage) } } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) } }
  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">设置</h1>
    <nav className="flex gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">{[['tags', '打卡标签'], ['sync', 'CouchDB 同步'], ['general', '常规']].map(([id, name]) => <button key={id} onClick={() => setPage(id)} className={`px-3 py-2 text-sm rounded-lg ${page === id ? 'bg-brand/10 text-brand' : 'text-gray-500'}`}>{name}</button>)}</nav>
    {page === 'tags' && <TagsPage />}
    {page === 'general' && <div className="space-y-4"><p className="text-sm">设备时区：{Intl.DateTimeFormat().resolvedOptions().timeZone}</p><Link className="text-brand" to="/calendar">日历</Link></div>}
    {page === 'sync' && <form onSubmit={event => { event.preventDefault(); localStorage.setItem(key, JSON.stringify(settings)); setMessage('配置已保存到本机') }} className="space-y-5 max-w-xl">
      <h2 className="font-semibold">CouchDB 连接</h2>
      <label className="block text-sm">地址<input className="input mt-2" type="url" value={settings.couchUrl} onChange={event => update('couchUrl', event.target.value)} placeholder="https://db.example.com" required /></label>
      <label className="block text-sm">数据库名称<input className="input mt-2" value={settings.couchDatabase} onChange={event => update('couchDatabase', event.target.value)} required /></label>
      <label className="block text-sm">用户名<input className="input mt-2" value={settings.couchUsername} onChange={event => update('couchUsername', event.target.value)} autoComplete="username" /></label>
      <label className="block text-sm">密码<input className="input mt-2" type="password" value={settings.couchPassword} onChange={event => update('couchPassword', event.target.value)} autoComplete="current-password" /></label>
      <div className="flex flex-wrap gap-3"><button className="px-4 py-2 rounded-lg bg-brand text-white text-sm">保存配置</button><button disabled={busy} type="button" onClick={() => void connect(true)} className="text-brand text-sm">测试连接</button><button disabled={busy} type="button" onClick={() => void connect(false)} className="text-brand text-sm">开始同步</button><button type="button" onClick={() => void stopSync().then(() => setMessage('同步已停止'))} className="text-gray-500 text-sm">停止同步</button></div>
      <p role="status" className="text-sm">{message}</p>
      <p className="text-xs text-gray-500">密码保存在当前浏览器。CouchDB 数据库须预先建立，跨域连接须配置 CORS；生产环境使用 HTTPS。</p>
    </form>}
  </div>
}
