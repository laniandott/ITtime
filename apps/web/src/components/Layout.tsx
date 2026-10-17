import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Timer, ListTodo, Sprout, ChartColumn, Settings, CalendarDays, CalendarClock, LogOut, Wifi, MoreHorizontal, Tags } from 'lucide-react'

const navItems = [
  { to: '/', label: '打卡', icon: Timer },
  { to: '/todos', label: '待办', icon: ListTodo },
  { to: '/habits', label: '习惯', icon: Sprout },
  { to: '/stats', label: '统计', icon: ChartColumn },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/plans', label: '计划', icon: CalendarClock },
  { to: '/tags', label: '标签', icon: Tags },
  { to: '/settings', label: '设置', icon: Settings },
] as const
const mobilePrimary = navItems.filter((item) => ['/', '/todos', '/plans', '/calendar'].includes(item.to))
const mobileMore = navItems.filter((item) => ['/habits', '/stats', '/tags', '/settings'].includes(item.to))

export default function Layout({ children, username, onLogout }: { children: React.ReactNode; username?: string; onLogout?: () => void }) {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = mobileMore.some((item) => location.pathname === item.to)
  return (
    <div className="app-shell min-h-screen pb-24 lg:pl-64 lg:pb-0">
      <aside className="desktop-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-gray-200/80 bg-white px-3 py-4 dark:border-gray-800 dark:bg-gray-950 lg:flex">
        <div className="flex items-center gap-3 px-3 pb-7">
          <img src="/favicon.png" alt="" className="h-9 w-9 rounded-lg ring-1 ring-gray-200 dark:ring-gray-700" />
          <div className="min-w-0"><div className="font-semibold text-gray-900 dark:text-gray-100">ITtime</div><div className="text-[10px] uppercase text-gray-400">Focus workspace</div></div>
        </div>
        <nav aria-label="主导航" className="space-y-5">
          {[
            { label: '记录', items: navItems.filter((item) => ['/', '/todos'].includes(item.to)) },
            { label: '安排与回顾', items: navItems.filter((item) => ['/plans', '/calendar', '/habits', '/stats'].includes(item.to)) },
            { label: '整理', items: navItems.filter((item) => ['/tags'].includes(item.to)) },
          ].map((group) => <section key={group.label} className="space-y-1">
            <h2 className="px-3 pb-1 text-[11px] font-medium text-gray-400">{group.label}</h2>
            {group.items.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-transparent ${isActive ? 'bg-teal-50 font-medium text-teal-800 before:bg-teal-700 dark:bg-teal-950/50 dark:text-teal-200 dark:before:bg-teal-300' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100'}`}>
              {({ isActive }) => <><item.icon aria-hidden="true" className={`h-[18px] w-[18px] ${isActive ? 'text-teal-700 dark:text-teal-300' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200'}`} strokeWidth={1.8} /><span>{item.label}</span></>}
            </NavLink>)}
          </section>)}
        </nav>
        <div className="mt-auto space-y-3 border-t border-gray-200 pt-3 dark:border-gray-800">
          <NavLink to="/settings" className={({ isActive }) => `group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-transparent ${isActive ? 'bg-teal-50 font-medium text-teal-800 before:bg-teal-700 dark:bg-teal-950/50 dark:text-teal-200 dark:before:bg-teal-300' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100'}`}>
            {({ isActive }) => <><Settings aria-hidden="true" className={`h-[18px] w-[18px] ${isActive ? 'text-teal-700 dark:text-teal-300' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200'}`} strokeWidth={1.8} /><span>设置</span></>}
          </NavLink>
          <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-3 py-2.5 text-xs text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-200"><div className="flex items-center gap-2 font-medium"><Wifi className="h-3.5 w-3.5" />本机即时保存</div><div className="mt-1 text-[11px] text-teal-700/70 dark:text-teal-300/70">数据优先保留在当前设备</div></div>
          {username && <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs text-gray-500 dark:text-gray-400"><span className="min-w-0 truncate">{username}</span>{onLogout && <button type="button" onClick={onLogout} className="rounded-lg p-1.5 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100" title="退出登录" aria-label="退出登录"><LogOut className="h-4 w-4" /></button>}</div>}
        </div>
      </aside>
      <div className="min-h-screen">
      <main key={location.pathname} className="app-main mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 motion-safe:animate-page-in sm:py-8 lg:px-8">{children}</main>
      <nav aria-label="主导航" className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95 lg:hidden">
        {moreOpen && <div className="absolute inset-x-3 bottom-full mb-2 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900" role="menu" aria-label="更多页面">
          {mobileMore.map((item) => <NavLink key={item.to} to={item.to} role="menuitem" onClick={() => setMoreOpen(false)} className={({ isActive }) => `flex h-11 items-center gap-3 rounded-md px-3 text-sm ${isActive ? 'bg-teal-50 font-medium text-teal-800 dark:bg-teal-950/50 dark:text-teal-200' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}><item.icon className="h-4 w-4" aria-hidden="true" /><span>{item.label}</span></NavLink>)}
        </div>}
        <div className="mx-auto grid h-[4.35rem] max-w-3xl grid-cols-5 px-1 sm:px-2">
          {mobilePrimary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) => `relative mx-1 my-1 flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] transition-colors ${isActive ? 'bg-teal-50 font-medium text-teal-800 dark:bg-teal-950/50 dark:text-teal-200' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200'}`}
            >
              {({ isActive }) => <>
                <item.icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                <span>{item.label}</span>
                {isActive && <span className="absolute -top-1 h-0.5 w-5 rounded-full bg-teal-700 dark:bg-teal-300" />}
              </>}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-haspopup="menu" className={`relative mx-1 my-1 flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] ${moreActive || moreOpen ? 'bg-teal-50 font-medium text-teal-800 dark:bg-teal-950/50 dark:text-teal-200' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'}`}>
            <MoreHorizontal aria-hidden="true" className="h-5 w-5" /><span>更多</span>
            {moreActive && <span className="absolute -top-1 h-0.5 w-5 rounded-full bg-teal-700 dark:bg-teal-300" />}
          </button>
        </div>
      </nav>
      </div>
    </div>
  )
}
