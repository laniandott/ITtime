import { NavLink } from 'react-router-dom'
import { Timer, ListTodo, Sprout, ChartColumn, Settings, CalendarDays } from 'lucide-react'

const navItems = [
  { to: '/', label: '打卡', icon: Timer },
  { to: '/todos', label: '待办', icon: ListTodo },
  { to: '/habits', label: '习惯', icon: Sprout },
  { to: '/stats', label: '统计', icon: ChartColumn },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/settings', label: '设置', icon: Settings },
] as const

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col pb-24">
      <header className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/90 backdrop-blur-xl dark:border-gray-800/80 dark:bg-gray-950/90">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4">
          <div className="flex shrink-0 items-center gap-2.5 font-semibold text-gray-800 dark:text-gray-100">
            <img src="/favicon.png" alt="" className="h-8 w-8 rounded-lg shadow-sm" />
            <span>ITtime</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />离线优先
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:py-8">{children}</main>
      <nav aria-label="主导航" className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto grid h-[4.35rem] max-w-2xl grid-cols-6 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `relative mx-1 my-1 flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] transition-colors ${isActive ? 'bg-teal-50 font-semibold text-brand-700 dark:bg-teal-950/60 dark:text-teal-300' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200'}`}
            >
              {({ isActive }) => <>
                <item.icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                <span>{item.label}</span>
                {isActive && <span className="absolute -top-1 h-1 w-5 rounded-full bg-brand" />}
              </>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
