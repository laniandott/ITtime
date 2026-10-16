import { NavLink, useLocation } from 'react-router-dom'
import { Timer, ListTodo, Sprout, ChartColumn, Settings, CalendarDays, CalendarClock, LogOut, Wifi, ChevronRight } from 'lucide-react'

const navItems = [
  { to: '/', label: '打卡', icon: Timer },
  { to: '/todos', label: '待办', icon: ListTodo },
  { to: '/habits', label: '习惯', icon: Sprout },
  { to: '/stats', label: '统计', icon: ChartColumn },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/plans', label: '计划', icon: CalendarClock },
  { to: '/settings', label: '设置', icon: Settings },
] as const

export default function Layout({ children, username, onLogout }: { children: React.ReactNode; username?: string; onLogout?: () => void }) {
  const location = useLocation()
  return (
    <div className="app-shell min-h-screen pb-24 lg:pl-64 lg:pb-0">
      <aside className="desktop-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-gray-200/80 bg-white/95 px-3 py-4 backdrop-blur-xl dark:border-gray-800/80 dark:bg-gray-950/95 lg:flex">
        <div className="flex items-center gap-3 px-3 pb-7">
          <img src="/favicon.png" alt="" className="h-9 w-9 rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10" />
          <div className="min-w-0"><div className="font-semibold tracking-tight text-gray-900 dark:text-gray-100">ITtime</div><div className="text-[10px] uppercase tracking-[0.18em] text-gray-400">Focus workspace</div></div>
        </div>
        <nav aria-label="主导航" className="space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">工作区</div>
          {navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-all ${isActive ? 'bg-teal-50 font-semibold text-brand-700 shadow-sm dark:bg-teal-950/60 dark:text-teal-300' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100'}`}>
            {({ isActive }) => <><item.icon aria-hidden="true" className={`h-[18px] w-[18px] ${isActive ? 'text-brand' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200'}`} strokeWidth={1.8} /><span className="flex-1">{item.label}</span>{isActive && <ChevronRight aria-hidden="true" className="h-4 w-4 text-brand/60" />}</>}
          </NavLink>)}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-3 py-2.5 text-xs text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-200"><div className="flex items-center gap-2 font-medium"><Wifi className="h-3.5 w-3.5" />本机即时保存</div><div className="mt-1 text-[11px] text-teal-700/70 dark:text-teal-300/70">数据优先保留在当前设备</div></div>
          {username && <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs text-gray-500 dark:text-gray-400"><span className="min-w-0 truncate">{username}</span>{onLogout && <button type="button" onClick={onLogout} className="rounded-lg p-1.5 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100" title="退出登录" aria-label="退出登录"><LogOut className="h-4 w-4" /></button>}</div>}
        </div>
      </aside>
      <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 backdrop-blur-xl dark:border-gray-800/80 dark:bg-gray-950/90">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5 font-semibold text-gray-800 dark:text-gray-100 lg:hidden">
            <img src="/favicon.png" alt="" className="h-8 w-8 rounded-lg shadow-sm" />
            <span>ITtime</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {onLogout && <button type="button" onClick={onLogout} className="rounded-lg px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white lg:hidden" title={username ? `当前账户：${username}` : '退出登录'}>退出登录</button>}
            <span className="flex items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/60 dark:text-teal-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />离线优先</span>
          </div>
        </div>
      </header>

      <main key={location.pathname} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 motion-safe:animate-[fade-in_.25s_ease-out] sm:py-8 lg:px-8">{children}</main>
      <nav aria-label="主导航" className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95 lg:hidden">
        <div className="mx-auto grid h-[4.35rem] max-w-3xl grid-cols-7 px-1 sm:px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `relative mx-1 my-1 flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors ${isActive ? 'bg-teal-50 font-semibold text-brand-700 shadow-sm dark:bg-teal-950/60 dark:text-teal-300' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200'}`}
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
    </div>
  )
}
