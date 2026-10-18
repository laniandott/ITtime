import type {
  Category,
  Tag,
  TimeEntry,
  Todo,
  Summary,
  DailyStat,
  TagStat,
  FragmentationStat,
  Goal,
  Memo,
  CalendarSubscription,
  CalendarEvent,
  PlanBlock,
} from './types'
import { getAuthHeaders, getAuthToken } from './auth'

export function getServerHost(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const custom = localStorage.getItem('ittime_server_url') ?? localStorage.getItem('tagtime_server_url')
      if (custom && !localStorage.getItem('ittime_server_url')) {
        localStorage.setItem('ittime_server_url', custom)
        localStorage.removeItem('tagtime_server_url')
      }
      const normalized = normalizeServerHost(custom)
      if (normalized) return normalized
    } catch {
      // 某些隐私模式/受限 WebView 会让 localStorage 读取抛异常，
      // 此时回退到构建配置或当前页面地址，不应让整个 API 层白屏。
    }
  }
  const configured = import.meta.env?.VITE_API_URL
  const normalizedConfigured = normalizeServerHost(configured)
  if (normalizedConfigured) return normalizedConfigured
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol

    const isNative = Boolean(
      (window as any).Capacitor?.isNativePlatform?.() ||
      protocol === 'capacitor:' ||
      protocol === 'file:'
    )
    if (isNative) {
      return ''
    }
  }
  return ''
}

/**
 * 服务器地址只接受 HTTP(S) origin/base URL。
 * 这样可以避免错误配置把请求或附件地址拼成 javascript:、file: 等危险协议，
 * 同时把旧配置中的尾部斜杠统一掉。
 */
export function normalizeServerHost(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function resolveUploadUrl(path?: string | null): string {
  if (!path) return ''
  const token = getAuthToken()
  const withToken = (value: string) => {
    if (!token) return value
    try {
      const url = new URL(value, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
      url.searchParams.set('access_token', token)
      return /^[a-z][a-z\d+.-]*:/i.test(value) ? url.toString() : `${url.pathname}${url.search}${url.hash}`
    } catch { return value }
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const parsed = new URL(path)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? withToken(parsed.toString()) : ''
    } catch {
      return ''
    }
  }
  if (/^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);/i.test(path)) {
    return path
  }
  if (path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path)) return ''
  const host = getServerHost()
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return withToken(`${host}${cleanPath}`)
}

export function setServerHost(url: string): boolean {
  const normalized = normalizeServerHost(url)
  if (url.trim() && !normalized) return false
  if (typeof localStorage !== 'undefined') {
    try {
      if (normalized) {
        localStorage.setItem('ittime_server_url', normalized)
        localStorage.removeItem('tagtime_server_url')
      } else {
        localStorage.removeItem('ittime_server_url')
        localStorage.removeItem('tagtime_server_url')
      }
    } catch {
      // 受限 WebView 下无法持久化配置，但不应阻断当前会话。
    }
  }
  return true
}

export class ApiError extends Error {
  status: number
  data: any
  constructor(message: string, status: number, data?: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

type RequestOptions = RequestInit & {
  timeout?: number
  retryDelayMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_RETRY_DELAY_MS = 1_000

function configuredTimeout(): number {
  const value = Number(import.meta.env?.VITE_API_TIMEOUT_MS)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_REQUEST_TIMEOUT_MS
}

function isRetryableError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false
  if (error instanceof ApiError) {
    return error.status === 408 || error.status === 429 || (error.status >= 500 && error.status < 600)
  }
  if (error instanceof DOMException) return error.name === 'AbortError' || error.name === 'NetworkError'
  if (error instanceof Error) return error.name === 'AbortError' || /network|fetch/i.test(error.message)
  return false
}

async function requestOnce<T>(path: string, opts?: RequestOptions): Promise<T> {
  const host = getServerHost()
  const { timeout = configuredTimeout(), retryDelayMs: _retryDelayMs, ...fetchOptions } = opts ?? {}
  const headers = new Headers(fetchOptions.headers)
  new Headers(getAuthHeaders()).forEach((value, key) => { if (!headers.has(key)) headers.set(key, value) })
  if (typeof fetchOptions.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const url = `${host}/api${path}`

  const controller = new AbortController()
  const originalSignal = fetchOptions.signal
  const onAbort = () => controller.abort(originalSignal?.reason)
  if (originalSignal) {
    if (originalSignal.aborted) controller.abort(originalSignal.reason)
    else originalSignal.addEventListener('abort', onAbort, { once: true })
  }

  const timeoutId = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      if (res.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') window.dispatchEvent(new Event('ittime-auth-expired'))
      throw new ApiError(err.error ?? '请求失败', res.status, err)
    }
    const text = await res.text()
    return (text ? JSON.parse(text) : null) as T
  } finally {
    clearTimeout(timeoutId)
    originalSignal?.removeEventListener('abort', onAbort)
  }
}

export async function reqWithRetry<T>(path: string, opts?: RequestOptions): Promise<T> {
  const method = (opts?.method ?? 'GET').toUpperCase()
  const maxRetries = method === 'GET' ? 2 : 0
  const retryDelayMs = opts?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestOnce<T>(path, opts)
    } catch (error) {
      const isLastAttempt = attempt === maxRetries
      if (isLastAttempt || !isRetryableError(error, opts?.signal ?? undefined)) throw error
      await new Promise<void>((resolve, reject) => {
        const signal = opts?.signal
        let timer: ReturnType<typeof setTimeout> | undefined
        const onAbort = () => {
          if (timer !== undefined) clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          reject(signal?.reason ?? new DOMException('请求已取消', 'AbortError'))
        }
        const onDelayDone = () => {
          if (timer !== undefined) clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }
        timer = setTimeout(onDelayDone, retryDelayMs * 2 ** attempt)
        if (signal) {
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        }
      })
    }
  }
  throw new Error('请求重试失败')
}

// 保持现有 API 方法调用兼容，同时让所有请求经过超时与安全重试逻辑。
export async function req<T>(path: string, opts?: RequestOptions): Promise<T> {
  if (typeof indexedDB !== 'undefined') {
    const { isLocalPath, localRequest } = await import('./localData')
    if (isLocalPath(path)) return localRequest<T>(path, opts)
  }
  return reqWithRetry<T>(path, opts)
}

// 分类
export const api = {
  categories: {
    list: () => req<Category[]>('/categories'),
    create: (data: Partial<Category>) =>
      req<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Category>) =>
      req<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => req(`/categories/${id}`, { method: 'DELETE' }),
  },
  tags: {
    list: () => req<Tag[]>('/tags'),
    create: (data: Partial<Tag> & { name: string }) =>
      req<Tag>('/tags', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Tag>) =>
      req<Tag>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => req(`/tags/${id}`, { method: 'DELETE' }),
  },
  timer: {
    current: () => req<{ running: TimeEntry[]; serverTime: string }>('/timer/current'),
    start: (data: { tagId: string; note?: string; todoId?: string; planId?: string; resumedFromId?: string; interruptedFromId?: string }) =>
      req<TimeEntry & { serverTime: string }>('/timer/start', { method: 'POST', body: JSON.stringify(data) }),
    stop: (id: string, note?: string, pendingResume?: boolean) =>
      req<TimeEntry>(`/timer/stop/${id}`, { method: 'POST', body: JSON.stringify({ note, pendingResume }) }),
    stopAll: () => req<{ count: number }>('/timer/stop', { method: 'POST' }),
    quick: (data: { tagId: string; note?: string; todoId?: string; planId?: string }) =>
      req<TimeEntry & { serverTime: string }>('/timer/quick', { method: 'POST', body: JSON.stringify(data) }),
    list: (params?: { from?: string; to?: string; tagId?: string }) => {
      const q = new URLSearchParams()
      if (params?.from) q.set('from', params.from)
      if (params?.to) q.set('to', params.to)
      if (params?.tagId) q.set('tagId', params.tagId)
      return req<TimeEntry[]>(`/timer?${q}`)
    },
    pending: () => req<{ serverTime: string; pending: TimeEntry[] }>('/timer/pending'),
    dismissPending: (id: string, reason: string) =>
      req<TimeEntry>(`/timer/${id}/dismiss-pending`, { method: 'POST', body: JSON.stringify({ reason }) }),
    finishPending: (id: string) =>
      req<TimeEntry>(`/timer/${id}/finish-pending`, { method: 'POST' }),
    terminateChain: (id: string, reason: string) =>
      req<{ count: number }>(`/timer/${id}/terminate-chain`, { method: 'POST', body: JSON.stringify({ reason }) }),
    remove: (id: string) => req(`/timer/${id}`, { method: 'DELETE' }),
    manual: (data: { tagId: string; startTime: string; endTime: string; note?: string; todoId?: string }) =>
      req<TimeEntry>('/timer/manual', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { startTime?: string; endTime?: string | null; note?: string; tagId?: string; todoId?: string | null }) =>
      req<TimeEntry>(`/timer/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  todos: {
    list: (params?: { status?: string; categoryId?: string; tagId?: string; repeatType?: string }) => {
      const q = new URLSearchParams()
      if (params?.status) q.set('status', params.status)
      if (params?.categoryId) q.set('categoryId', params.categoryId)
      if (params?.tagId) q.set('tagId', params.tagId)
      if (params?.repeatType) q.set('repeatType', params.repeatType)
      return req<Todo[]>(`/todos?${q}`)
    },
    create: (data: Partial<Todo> & { title: string }) =>
      req<Todo>('/todos', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Todo>) =>
      req<Todo>(`/todos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    toggle: (id: string, lateReason?: string, restoreReason?: string) =>
      req<Todo>(`/todos/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ lateReason, restoreReason }) }),
    remove: (id: string) => req(`/todos/${id}`, { method: 'DELETE' }),
  },
  plans: {
    list: (params?: { date?: string; tagId?: string; deferredFromId?: string }) => {
      const q = new URLSearchParams()
      if (params?.date) q.set('date', params.date)
      if (params?.tagId) q.set('tagId', params.tagId)
      if (params?.deferredFromId) q.set('deferredFromId', params.deferredFromId)
      return req<PlanBlock[]>(`/plans?${q}`)
    },
    create: (data: { date: string; startMinute: number; endMinute: number; content: string; tagId?: string | null; todoId?: string | null }) =>
      req<PlanBlock>('/plans', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<PlanBlock>) =>
      req<PlanBlock>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => req(`/plans/${id}`, { method: 'DELETE' }),
    skip: (id: string) => req<PlanBlock>(`/plans/${id}/skip`, { method: 'POST' }),
    unskip: (id: string) => req<PlanBlock>(`/plans/${id}/unskip`, { method: 'POST' }),
    confirm: (id: string) => req<PlanBlock>(`/plans/${id}/confirm`, { method: 'POST' }),
    unconfirm: (id: string) => req<PlanBlock>(`/plans/${id}/unconfirm`, { method: 'POST' }),
    defer: (id: string, data: { date: string; startMinute: number; endMinute: number }) =>
      req<PlanBlock>(`/plans/${id}/defer`, { method: 'POST', body: JSON.stringify(data) }),
  },
  stats: {
    summary: (categoryId?: string) => {
      const qs = categoryId ? `?${new URLSearchParams({ categoryId }).toString()}` : ''
      return req<Summary>(`/stats/summary${qs}`)
    },
    daily: (params: { days?: number; from?: string; to?: string; categoryId?: string } = {}) => {
      const q = new URLSearchParams()
      if (params.days) q.set('days', String(params.days))
      if (params.from) q.set('from', params.from)
      if (params.to) q.set('to', params.to)
      if (params.categoryId) q.set('categoryId', params.categoryId)
      return req<DailyStat[]>(`/stats/daily?${q}`)
    },
    byTag: (from?: string, to?: string, categoryId?: string) => {
      const q = new URLSearchParams()
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      if (categoryId) q.set('categoryId', categoryId)
      const qs = q.toString()
      return req<TagStat[]>(`/stats/by-tag${qs ? `?${qs}` : ''}`)
    },
    fragmentation: (from?: string, to?: string) => {
      const q = new URLSearchParams()
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      const qs = q.toString()
      return req<{ tags: FragmentationStat[] }>(`/stats/fragmentation${qs ? `?${qs}` : ''}`)
    },
  },
  goals: {
    list: () => req<Goal[]>('/goals'),
    create: (data: { tagId: string; title: string; kind?: string; type?: string; target?: number; period?: string; periodDays?: number | null; weekDay?: number | null; sortOrder?: number; deadlineTime?: string | null; deadlineDay?: number | null; deadlineAt?: string | null }) =>
      req<Goal>('/goals', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Goal>) =>
      req<Goal>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => req(`/goals/${id}`, { method: 'DELETE' }),
  },
  memos: {
    list: (params?: { timeEntryId?: string; tagId?: string; days?: number; from?: string; to?: string; standaloneOnly?: boolean | string; type?: string }) => {
      const q = new URLSearchParams()
      if (params?.timeEntryId) q.set('timeEntryId', params.timeEntryId)
      if (params?.tagId) q.set('tagId', params.tagId)
      if (params?.days) q.set('days', String(params.days))
      if (params?.from) q.set('from', params.from)
      if (params?.to) q.set('to', params.to)
      if (params?.standaloneOnly) q.set('standaloneOnly', String(params.standaloneOnly))
      if (params?.type) q.set('type', params.type)
      return req<Memo[]>(`/memos?${q}`)
    },
    create: (data: {
      content: string
      type?: 'point' | 'diary'
      timeEntryId?: string
      tagId?: string
      createdAt?: string
      attachments?: { filename: string; path: string; mimeType: string; size: number }[]
    }) => req<Memo>('/memos', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: {
      content?: string
      createdAt?: string
      attachments?: { filename: string; path: string; mimeType: string; size: number }[]
    }) => req<Memo>(`/memos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    upload: async (file: File) => {
      const host = getServerHost()
      const form = new FormData()
      form.append('file', file, file.name || 'upload.bin')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), Math.max(10 * 60_000, Math.ceil(file.size / (1024 * 1024) * 2_000)))
      const request = (url: string) => fetch(url, {
        method: 'POST',
        body: form,
        signal: controller.signal,
        headers: getAuthHeaders(),
      })
      let res: Response
      try {
        res = await request(`${host}/api/memos/upload`)
      } catch (firstError) {
        // HTTPS pages cannot call a stale HTTP server URL; retry through same origin.
        if (!controller.signal.aborted && typeof window !== 'undefined' && window.location.protocol === 'https:' && host) {
          res = await request('/api/memos/upload')
        } else {
          throw firstError
        }
      } finally {
        clearTimeout(timeoutId)
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }))
        if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('ittime-auth-expired'))
        throw new Error(err.error ?? `上传文件失败 (${res.status})`)
      }
      return res.json() as Promise<{ filename: string; path: string; mimeType: string; size: number }>
    },
    remove: (id: string) => req(`/memos/${id}`, { method: 'DELETE' }),
  },
  calendars: {
    subscriptions: {
      list: () => req<CalendarSubscription[]>('/calendars/subscriptions'),
      create: (data: { name: string; url: string; color?: string }) =>
        req<CalendarSubscription>('/calendars/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Partial<CalendarSubscription>) =>
        req<CalendarSubscription>(`/calendars/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (id: string) => req(`/calendars/subscriptions/${id}`, { method: 'DELETE' }),
      sync: (id: string) =>
        req<{ ok: boolean; count: number }>(`/calendars/subscriptions/${id}/sync`, { method: 'POST' }),
    },
    events: (params?: { from?: string; to?: string }) => {
      const q = new URLSearchParams()
      if (params?.from) q.set('from', params.from)
      if (params?.to) q.set('to', params.to)
      const qs = q.toString()
      return req<CalendarEvent[]>(`/calendars/external-events${qs ? `?${qs}` : ''}`)
    },
  },
}
