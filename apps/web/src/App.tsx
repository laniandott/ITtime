import React, { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Routes, Route, useSearchParams, useLocation } from 'react-router-dom'
import SectionPage from './components/SectionPage'
import AuthGate from './components/AuthGate'
import { useStore } from './store'
import { announce, registerLiveRegions } from './announce'
import { syncNativeStatusBarTheme } from './nativeStatusBar'
import { autoStartConfiguredSync } from './couchSync'
import { applyFontSizePreference } from './fontSettings'

const TimerPage = lazy(() => import('./pages/TimerPage'))
const TodosPage = lazy(() => import('./pages/TodosPage'))
const DiaryPage = lazy(() => import('./pages/DiaryPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const TagsPage = lazy(() => import('./pages/TagsPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const PlansPage = lazy(() => import('./pages/PlansPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HabitsPage = lazy(() => import('./pages/GoalsPage'))

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error }
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Uncaught React Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4 text-center">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="text-3xl">⚠️</div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">页面渲染遇到了一个异常</h2>
            <div className="text-xs text-red-500 font-mono bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-left break-all max-h-32 overflow-y-auto">
              {String(this.state.error?.message || this.state.error)}
            </div>
            {/* 刷新按钮固定在品牌青：ErrorBoundary 在 .app-shell 之外，但 Layout 会把
                当前域镜像到 <html>，bg-brand 会跟随域色（TOKENS_PLAN §2.3 的
                「壳外天然回落」假设因此不成立），故按 §5.2 验收目标显式钉住。
                teal-600 即旧 brand-600（#0d9488），视觉零变化。 */}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="px-4 py-2 bg-teal-600 text-white text-xs font-medium rounded-xl hover:bg-teal-700 transition-colors"
            >
              🔄 刷新页面重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function PageFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center" role="status" aria-label="页面加载中">
      <div className="h-7 w-7 rounded-full border-2 border-gray-200 border-t-brand animate-spin" />
    </div>
  )
}

/**
 * 旧「体系」分区（/system）已拆成两个一级入口。
 * 查询参数不参与路由匹配，/system?tab=settings 只会命中精确路由 /system，
 * 所以必须在这里读 tab 参数分流：默认回标签页，tab=settings 的旧书签回设置页。
 */
function SystemRedirect() {
  const [params] = useSearchParams()
  return <Navigate to={params.get('tab') === 'settings' ? '/settings' : '/tags'} replace />
}

/** 分区页各 tab 的播报标题：子页面 embedded 时不渲染 h1，只能静态映射（与上方路由表同源）。 */
const SECTION_TAB_TITLES: Record<string, Record<string, string>> = {
  '/time': { calendar: '日历', plans: '计划', diary: '日记' },
  '/tasks': { todos: '待办', habits: '习惯' },
}

export default function App() {
  const loadAll = useStore((s) => s.loadAll)

  // ── 无障碍播报：注册两个永久 live region（polite 非紧急 / assertive 紧急）──
  // region 由下方 JSX 常驻挂载；卸载时清注册，避免热更新后往已销毁节点写文本。
  const politeLiveRef = useRef<HTMLDivElement>(null)
  const assertiveLiveRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    registerLiveRegions(politeLiveRef.current, assertiveLiveRef.current)
    return () => registerLiveRegions(null, null)
  }, [])

  // 路由切换播报「已进入某页」。
  // 分区页（/time、/tasks）的子页面 embedded 时不渲染 h1，且各 tab 面板常驻 DOM，
  // querySelector 只会拿到第一个 tab 的标题——分区页一律用静态映射；
  // 一级页面优先读懒加载完成后的 h1 文本（Suspense fallback 期间没有 h1，用 MutationObserver 等待）。
  // ?view= 等筛选参数变化既不重挂页面也不改 tab，不会触发播报，避免与页面内筛选播报重复。
  const location = useLocation()
  const tabParam = new URLSearchParams(location.search).get('tab')
  const routeKey = `${location.pathname}|${tabParam ?? ''}`
  const lastRouteKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (lastRouteKeyRef.current === routeKey) return
    const isFirstNavigation = lastRouteKeyRef.current === null
    lastRouteKeyRef.current = routeKey
    // 首次进入不播报：读屏器本身会朗读页面标题，避免重复
    if (isFirstNavigation) return
    const sectionTabs = SECTION_TAB_TITLES[location.pathname]
    const fallbackTitle = sectionTabs
      ? sectionTabs[tabParam ?? ''] ?? sectionTabs[Object.keys(sectionTabs)[0]]
      : ''
    let observer: MutationObserver | null = null
    let timer: number | undefined
    const stop = () => {
      observer?.disconnect()
      if (timer !== undefined) window.clearTimeout(timer)
    }
    const speak = () => {
      // 分区页不用 h1（面板常驻 DOM 会拿错标题），只信静态映射
      const heading = sectionTabs ? null : document.querySelector('h1')
      const title = heading?.textContent?.trim() || fallbackTitle
      if (!title) return false
      announce(`已进入${title}`)
      stop()
      return true
    }
    if (!speak()) {
      observer = new MutationObserver(speak)
      observer.observe(document.body, { childList: true, subtree: true })
      // 懒加载页面 5s 内没出现标题就放弃，避免 observer 长期空转
      timer = window.setTimeout(stop, 5000)
    }
    return stop
  }, [routeKey, location.pathname, tabParam])

  useEffect(() => {
    applyFontSizePreference()
    // Aurora 双主题：亮色=晨雾玻璃，暗色=深空玻璃，跟随系统偏好。
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const isDark = media.matches
      document.documentElement.classList.toggle('dark', isDark)
      document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
      void syncNativeStatusBarTheme(isDark)
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    void autoStartConfiguredSync()
  }, [])

  return (
    <ErrorBoundary>
      {/* 无障碍：两个永久存在、永不卸载的 live region。
          条件渲染的 role="status" 会被读屏器漏播（节点新建时不在可访问性树里），
          所以由 App 根节点常驻，页面只通过 announce() / announceUrgent() 写入文本。 */}
      <div ref={politeLiveRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
      <div ref={assertiveLiveRef} role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" />
      <AuthGate>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* ── 一级入口：标签与设置从旧 /system 分区提出来，直接挂载 ── */}
            <Route path="/" element={<TimerPage />} />
            <Route
              path="/time"
              element={
                <SectionPage
                  tabs={[
                    { id: 'calendar', label: '日历' },
                    { id: 'plans', label: '计划' },
                    { id: 'diary', label: '日记' },
                  ]}
                >
                  {(tab) => tab === 'calendar' ? <CalendarPage /> : tab === 'plans' ? <PlansPage /> : <DiaryPage />}
                </SectionPage>
              }
            />
            <Route
              path="/tasks"
              element={
                <SectionPage
                  tabs={[
                    { id: 'todos', label: '待办' },
                    { id: 'habits', label: '习惯' },
                  ]}
                >
                  {(tab) => tab === 'todos' ? <TodosPage /> : <HabitsPage />}
                </SectionPage>
              }
            />
            <Route path="/insights" element={<StatsPage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/settings" element={<SettingsPage />} />

            {/* ── 旧路径重定向：书签不落空 ── */}
            <Route path="/todos" element={<Navigate to="/tasks?tab=todos" replace />} />
            <Route path="/habits" element={<Navigate to="/tasks?tab=habits" replace />} />
            <Route path="/calendar" element={<Navigate to="/time?tab=calendar" replace />} />
            <Route path="/plans" element={<Navigate to="/time?tab=plans" replace />} />
            <Route path="/diary" element={<Navigate to="/time?tab=diary" replace />} />
            <Route path="/stats" element={<Navigate to="/insights" replace />} />
            <Route path="/system" element={<SystemRedirect />} />
            {/* /system 下的其他历史子路径没有对应页面，兜底去设置页。 */}
            <Route path="/system/*" element={<Navigate to="/settings" replace />} />
            {/* 旧版笔记链接平滑回到计时页，避免历史书签落到空白页。 */}
            <Route path="/notes/*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthGate>
    </ErrorBoundary>
  )
}
