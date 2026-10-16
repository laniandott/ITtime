import { useEffect, useState } from 'react'
import { getServerHost } from '../api'
import { clearAuthToken, getAuthHeaders, getAuthToken, setAuthToken } from '../auth'
import Layout from './Layout'

type AuthMode = 'checking' | 'login' | 'setup' | 'offline' | 'app'

async function authRequest(path: string, body?: unknown, auth = false) {
  const response = await fetch(`${getServerHost()}/api/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(auth ? getAuthHeaders() : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || '请求失败')
  return data
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AuthMode>('checking')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { configured } = await authRequest('status')
        if (!active) return
        if (!configured) { setMode('setup'); return }
        if (getAuthToken()) {
          try { const session = await authRequest('session', undefined, true); if (active) { setUsername(session.username || ''); setMode('app') }; return }
          catch { clearAuthToken() }
        }
        setMode('login')
      } catch {
        if (active) setMode('offline')
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const expire = () => { clearAuthToken(); setUsername(''); setMode('login') }
    window.addEventListener('ittime-auth-expired', expire)
    return () => window.removeEventListener('ittime-auth-expired', expire)
  }, [])

  useEffect(() => {
    const updateUsername = (event: Event) => setUsername((event as CustomEvent<string>).detail || '')
    window.addEventListener('ittime-account-updated', updateUsername)
    return () => window.removeEventListener('ittime-account-updated', updateUsername)
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true); setError('')
    try {
      const session = mode === 'setup'
        ? await authRequest('setup', { username, password })
        : await authRequest('login', { username, password, remember })
      setAuthToken(session.token, mode === 'setup' || remember)
      setPassword(''); setMode('app')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '登录失败') }
    finally { setSubmitting(false) }
  }

  const logout = () => {
    void authRequest('logout', {}, true).catch(() => {})
    clearAuthToken(); setUsername(''); setMode('login')
  }

  if (mode === 'offline') return <Layout>{children}</Layout>
  if (mode === 'checking') return <div className="grid min-h-screen place-items-center text-sm text-gray-500">正在检查登录状态…</div>
  if (mode === 'app' && getAuthToken()) return <Layout username={username} onLogout={logout}>{children}</Layout>

  return (
    <main className="grid min-h-screen place-items-center bg-gray-50 px-4 dark:bg-gray-950">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div><h1 className="text-xl font-semibold">{mode === 'setup' ? '设置 ITtime 登录' : '登录 ITtime'}</h1><p className="mt-1 text-sm text-gray-500">{mode === 'setup' ? '创建本机账户以保护数据' : '登录后继续使用'}</p></div>
        <label className="block text-sm text-gray-600 dark:text-gray-300">用户名<input autoComplete="username" required minLength={2} maxLength={40} value={username} onChange={(event) => setUsername(event.target.value)} className="input mt-1 w-full" /></label>
        <label className="block text-sm text-gray-600 dark:text-gray-300">密码<input autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} type="password" required minLength={mode === 'setup' ? 8 : 1} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} className="input mt-1 w-full" /></label>
        {mode === 'login' && <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />记住登录状态</label>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={submitting} className="btn-primary w-full px-4 py-2.5 text-sm">{submitting ? '处理中…' : mode === 'setup' ? '创建账户并登录' : '登录'}</button>
      </form>
    </main>
  )
}
