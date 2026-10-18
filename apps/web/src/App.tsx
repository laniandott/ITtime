import React, { lazy, Suspense, useEffect } from 'react'
import { Navigate, Routes, Route, useSearchParams } from 'react-router-dom'
import SectionPage from './components/SectionPage'
import AuthGate from './components/AuthGate'
import { useStore } from './store'
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
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="px-4 py-2 bg-brand text-white text-xs font-medium rounded-xl hover:bg-brand-600 transition-colors"
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

export default function App() {
  const loadAll = useStore((s) => s.loadAll)

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
