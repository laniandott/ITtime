import React, { lazy, Suspense, useEffect } from 'react'
import { Navigate, Routes, Route } from 'react-router-dom'
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

export default function App() {
  const loadAll = useStore((s) => s.loadAll)

  useEffect(() => {
    applyFontSizePreference()
    // Aurora Glass 深空形态为默认；亮色适配后再恢复 matchMedia 跟随系统。
    const isDark = true
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
    void syncNativeStatusBarTheme(isDark)
    return () => {}
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
            {/* ── 5 个一级入口 ── */}
            <Route path="/" element={<TimerPage />} />
            <Route
              path="/time"
              element={
                <SectionPage
                  title="时间"
                  description="日历、计划与日记 · 都在看你的一天"
                  tabs={[
                    { id: 'calendar', label: '日历', description: '按月 / 周查看投入与安排' },
                    { id: 'plans', label: '计划', description: '当日计划与实际记录并列复盘' },
                    { id: 'diary', label: '日记', description: '随手记与日记流' },
                  ]}
                >
                  {(tab) => tab === 'calendar' ? <CalendarPage /> : tab === 'plans' ? <PlansPage embedded /> : <DiaryPage embedded />}
                </SectionPage>
              }
            />
            <Route
              path="/tasks"
              element={
                <SectionPage
                  title="事项"
                  description="待办与周期目标 · 要做的事都在这里"
                  tabs={[
                    { id: 'todos', label: '待办', description: '一次性与周期活动' },
                    { id: 'habits', label: '习惯', description: '周期目标的完成结果' },
                  ]}
                >
                  {(tab) => tab === 'todos' ? <TodosPage embedded /> : <HabitsPage embedded />}
                </SectionPage>
              }
            />
            <Route path="/insights" element={<StatsPage />} />
            <Route
              path="/system"
              element={
                <SectionPage
                  title="体系"
                  description="标签体系与偏好设置"
                  tabs={[
                    { id: 'tags', label: '标签与分类', description: '管理标签体系、颜色与分类归属' },
                    { id: 'settings', label: '设置', description: '账户、安全、数据同步与显示偏好' },
                  ]}
                >
                  {(tab) => tab === 'tags' ? <TagsPage embedded /> : <SettingsPage embedded />}
                </SectionPage>
              }
            />

            {/* ── 旧路径重定向：书签不落空 ── */}
            <Route path="/todos" element={<Navigate to="/tasks?tab=todos" replace />} />
            <Route path="/habits" element={<Navigate to="/tasks?tab=habits" replace />} />
            <Route path="/calendar" element={<Navigate to="/time?tab=calendar" replace />} />
            <Route path="/plans" element={<Navigate to="/time?tab=plans" replace />} />
            <Route path="/diary" element={<Navigate to="/time?tab=diary" replace />} />
            <Route path="/stats" element={<Navigate to="/insights" replace />} />
            <Route path="/tags" element={<Navigate to="/system?tab=tags" replace />} />
            <Route path="/settings" element={<Navigate to="/system?tab=settings" replace />} />
            {/* 旧版笔记链接平滑回到计时页，避免历史书签落到空白页。 */}
            <Route path="/notes/*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthGate>
    </ErrorBoundary>
  )
}
