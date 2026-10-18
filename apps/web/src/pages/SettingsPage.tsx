import { useEffect, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
// couchSync（连带 localData→pouchdb-browser）只以类型形式静态引用，运行时一律动态 import，
// 避免 PouchDB 全家桶被拉进任何非按需 chunk。
import type { SyncConfig, SyncMode } from '../couchSync'
import { applyFontSizePreference, FONT_SIZE_KEY, readFontSizePreference, type FontSizePreference } from '../fontSettings'
import { getServerHost } from '../api'
import { getAuthHeaders } from '../auth'
import { PageHeader } from '../components/PageHeader'

const EMPTY_SETTINGS: SyncConfig = { couchUrl: '', couchDatabase: 'ittime', couchUsername: '', couchPassword: '' }
function loadSettings(key: string): SyncConfig { try { return { ...EMPTY_SETTINGS, ...JSON.parse(localStorage.getItem(key) ?? '{}') } } catch { return { ...EMPTY_SETTINGS } } }
export default function SettingsPage() {
  const [page, setPage] = useState('account')
  const [settings, setSettings] = useState<SyncConfig>(EMPTY_SETTINGS)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [migrationMessage, setMigrationMessage] = useState('')
  const [fontSize, setFontSize] = useState<FontSizePreference>(readFontSizePreference)
  // couchSync 模块就绪后再补齐：本地已存配置、当前同步状态、状态订阅。
  // 模块加载失败时同步表单仍可渲染，只是操作会在动态 import 处报错并落入 message。
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    void import('../couchSync')
      .then((sync) => {
        if (cancelled) return
        setSettings(loadSettings(sync.SYNC_SETTINGS_KEY))
        setMessage(sync.getSyncStatus())
        unsubscribe = sync.subscribeSyncStatus(setMessage)
      })
      .catch(() => {})
    return () => { cancelled = true; unsubscribe?.() }
  }, [])
  const update = (field: keyof SyncConfig, value: string) => setSettings(current => ({ ...current, [field]: value }))
  // WAI-ARIA radiogroup 键盘模式：方向键在两项间切换并选中，焦点跟随（与 SectionPage 的 tabs 一致）。
  const onSyncModeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const next: SyncMode = (settings.syncMode ?? 'live') === 'live' ? 'manual' : 'live'
    update('syncMode', next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-sync-mode="${next}"]`)?.focus()
  }
  const updateFontSize = (value: FontSizePreference) => {
    setFontSize(value)
    localStorage.setItem(FONT_SIZE_KEY, value)
    applyFontSizePreference(value)
  }
  const connect = async (test: boolean) => { setBusy(true); try { const { SYNC_SETTINGS_KEY, testConnection, startSync } = await import('../couchSync'); if (test) { setMessage('正在连接…'); const status = await testConnection(settings); setMessage(status.guidance) } else { localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings)); await startSync(settings, setMessage, settings.syncMode ?? 'live') } } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) } }
  const saveSettings = async () => {
    const { SYNC_SETTINGS_KEY, startSync, stopSync } = await import('../couchSync')
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings))
    if ((settings.syncMode ?? 'live') === 'manual') {
      await stopSync()
      setMessage('配置已保存；手动同步模式已启用')
    } else if (settings.couchUrl.trim() && settings.couchDatabase.trim()) {
      setBusy(true)
      try { await startSync(settings, setMessage, 'live') }
      catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
      finally { setBusy(false) }
    } else setMessage('配置已保存到本机；填写服务器信息后即可开启实时同步')
  }
  const migrate = async () => { setBusy(true); setMigrationMessage('正在读取旧服务器数据…'); try { const { importLegacyServerData } = await import('../legacyMigration'); const result = await importLegacyServerData(); setMigrationMessage(`导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条（共 ${result.total} 条）`) } catch (error) { setMigrationMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) } }
  return <div className="workspace-page settings-page space-y-6">
    <PageHeader title="设置" description="账户、安全、数据同步与显示偏好" />
    <div className="settings-layout">
    <nav className="settings-nav flex gap-1 overflow-x-auto md:flex-col md:overflow-visible" role="tablist" aria-label="设置分类">{[['account', '账户'], ['sync', 'CouchDB 同步'], ['migration', '数据迁移'], ['general', '常规']].map(([id, name]) => <button key={id} role="tab" aria-selected={page === id} onClick={() => setPage(id)} className={`shrink-0 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${page === id ? 'bg-teal-50 font-medium text-teal-800 dark:bg-teal-950/50 dark:text-teal-200' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}`}>{name}</button>)}</nav>
    <div className="min-w-0">
    {page === 'account' && <AccountSettings />}
    {page === 'migration' && <section className="page-card max-w-2xl space-y-4 p-4 sm:p-5">
      <h2 className="font-semibold">从服务器导入旧数据</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300">将服务器 SQLite 中的分类、标签、计时记录、待办、目标和随手记导入此浏览器的 PouchDB。原记录 ID 会保留，已有记录不会被覆盖，因此可重复运行。</p>
      <p className="text-sm text-amber-700 dark:text-amber-300">建议先备份服务器数据，并在开始 CouchDB 同步前完成导入。附件文件仍保存在服务器 uploads 目录。</p>
      <button type="button" disabled={busy} onClick={() => void migrate()} className="rounded-md bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? '正在处理…' : '扫描并导入旧数据'}</button>
      {migrationMessage && <p role="status" className="text-sm">{migrationMessage}</p>}
    </section>}
    {page === 'general' && <div className="page-card space-y-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><label htmlFor="font-size" className="text-sm font-medium">界面字体大小</label><p className="mt-1 text-xs text-gray-500">紧凑模式也会适当压缩界面间距，适合小屏幕。</p></div>
        <select id="font-size" className="input w-auto min-w-32" value={fontSize} onChange={event => updateFontSize(event.target.value as FontSizePreference)}>
          <option value="compact">紧凑（14 px）</option>
          <option value="standard">标准（15 px）</option>
          <option value="comfortable">舒适（16 px）</option>
        </select>
      </div>
      <p className="text-sm">设备时区：{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      <Link className="text-brand" to="/time?tab=calendar">前往日历</Link>
    </div>}
    {page === 'sync' && <form onSubmit={event => { event.preventDefault(); void saveSettings() }} className="page-card max-w-2xl space-y-5 p-4 sm:p-5">
      <h2 className="font-semibold">CouchDB 连接</h2>
      <label className="block text-sm">地址<input className="input mt-2" type="url" value={settings.couchUrl} onChange={event => update('couchUrl', event.target.value)} placeholder="https://db.example.com" required /></label>
      <label className="block text-sm">数据库名称<input className="input mt-2" value={settings.couchDatabase} onChange={event => update('couchDatabase', event.target.value)} required /></label>
      <label className="block text-sm">用户名<input className="input mt-2" value={settings.couchUsername} onChange={event => update('couchUsername', event.target.value)} autoComplete="username" /></label>
      <label className="block text-sm">密码<input className="input mt-2" type="password" value={settings.couchPassword} onChange={event => update('couchPassword', event.target.value)} autoComplete="current-password" /></label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">同步方式</legend>
        <div className="inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700" role="radiogroup" aria-label="CouchDB 同步方式" onKeyDown={onSyncModeKeyDown}>
          {([['live', '实时同步'], ['manual', '手动同步']] as [SyncMode, string][]).map(([mode, label]) => (
            <button key={mode} type="button" role="radio" data-sync-mode={mode} aria-checked={(settings.syncMode ?? 'live') === mode} tabIndex={(settings.syncMode ?? 'live') === mode ? 0 : -1} onClick={() => update('syncMode', mode)} className={`rounded-md px-3 py-2 text-sm ${(settings.syncMode ?? 'live') === mode ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">{(settings.syncMode ?? 'live') === 'live' ? '本机与 CouchDB 保持连接，数据变更后自动双向同步。' : '只在点击“立即同步”时双向复制，完成后停止。'}</p>
      </fieldset>
      <div className="flex flex-wrap gap-3"><button className="px-4 py-2 rounded-lg bg-brand text-white text-sm">保存配置</button><button disabled={busy} type="button" onClick={() => void connect(true)} className="text-brand text-sm">测试连接</button><button disabled={busy} type="button" onClick={() => void connect(false)} className="rounded-lg bg-brand px-4 py-2 text-sm text-white">{(settings.syncMode ?? 'live') === 'live' ? '立即连接并开启实时同步' : '立即同步'}</button><button type="button" onClick={() => { void import('../couchSync').then((m) => m.stopSync()).then(() => setMessage('同步已停止')).catch(() => {}) }} className="text-gray-500 text-sm">停止同步</button></div>
      <p role="status" className="text-sm">{message}</p>
      <p className="text-xs text-gray-500">判断方式：仅本机为空、CouchDB 有文档时，用同步从云端恢复本机；两边都有数据时会合并，删除标记也会同步。若要开始一个全新的空数据集，请使用新的数据库，并确保本机也为空。应用内删除不是重置操作，不能靠重新同步恢复已删除记录。</p>
      <p className="text-xs text-gray-500">密码保存在当前浏览器。CouchDB 数据库须预先建立，跨域连接须配置 CORS；生产环境使用 HTTPS。</p>
    </form>}
    </div>
    </div>
  </div>
}

function AccountSettings() {
  const [username, setUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void fetch(`${getServerHost()}/api/auth/session`, { headers: getAuthHeaders() })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || '无法读取账户')
        if (active) setUsername(data.username || '')
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '无法读取账户') })
    return () => { active = false }
  }, [])

  // 移动端没有侧栏，退出登录只能从设置页进。借 AuthGate 已有的 'ittime-auth-expired'
  // 监听回到登录态（清 token + 显示登录页），不在这里重复实现一套登出状态机；
  // 服务端会话照旧作废，与侧栏退出登录保持同等副作用。
  const logout = () => {
    void fetch(`${getServerHost()}/api/auth/logout`, { method: 'POST', headers: getAuthHeaders() }).catch(() => {})
    window.dispatchEvent(new Event('ittime-auth-expired'))
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    if (newPassword && newPassword !== confirmPassword) {
      setBusy(false); setError('两次输入的新密码不一致'); return
    }
    try {
      const response = await fetch(`${getServerHost()}/api/auth/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, username, newPassword }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || '保存账户失败')
      setUsername(data.username)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      window.dispatchEvent(new CustomEvent('ittime-account-updated', { detail: data.username }))
      setMessage('账户信息已更新')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存账户失败') }
    finally { setBusy(false) }
  }

  return <section className="page-card max-w-2xl space-y-4 p-4 sm:p-5">
    <div><h2 className="font-semibold">账户与密码</h2><p className="mt-1 text-xs text-gray-500">修改用户名或密码需要验证当前密码；新密码留空则保持不变。</p></div>
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm">用户名<input required minLength={2} maxLength={40} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="input mt-1 w-full" /></label>
      <label className="block text-sm">当前密码<input required type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="input mt-1 w-full" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">新密码<input type="password" minLength={8} maxLength={200} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="input mt-1 w-full" /></label>
        <label className="block text-sm">确认新密码<input type="password" minLength={8} maxLength={200} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="input mt-1 w-full" /></label>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      <button type="submit" disabled={busy || !username} className="btn-primary px-4 py-2 text-sm">{busy ? '保存中…' : '保存账户信息'}</button>
    </form>
    <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
      <button type="button" onClick={logout} className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">退出登录</button>
      <p className="mt-2 text-xs text-gray-500">退出后需要重新登录才能进入工作区。</p>
    </div>
  </section>
}
