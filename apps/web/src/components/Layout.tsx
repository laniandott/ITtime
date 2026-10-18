import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Timer, ListTodo, ChartColumn, Settings, CalendarDays, LogOut, Wifi, Tags } from 'lucide-react'
import { type DomainKey } from '../domainTheme'

const navItems = [
  { to: '/', label: '工作台', icon: Timer, domain: 'work' },
  { to: '/time', label: '时间', icon: CalendarDays, domain: 'time' },
  { to: '/tasks', label: '事项', icon: ListTodo, domain: 'tasks' },
  { to: '/insights', label: '洞察', icon: ChartColumn, domain: 'insights' },
  { to: '/tags', label: '标签', icon: Tags, domain: 'system' },
] as const

/**
 * 路径 → 功能域。/tags 与 /settings 同归 system 域（标签与设置是「体系」的两个一级入口）；
 * /system 旧重定向路由只存在过渡帧，也归 system；未命中的路径回落 work（品牌默认域）。
 */
const domainOf = (pathname: string): DomainKey => {
  if (pathname === '/') return 'work'
  if (pathname.startsWith('/settings') || pathname.startsWith('/system')) return 'system'
  return navItems.find((item) => item.to !== '/' && pathname.startsWith(item.to))?.domain ?? 'work'
}

export default function Layout({ children, username, onLogout }: { children: React.ReactNode; username?: string; onLogout?: () => void }) {
  const location = useLocation()
  const domain = domainOf(location.pathname)

  useEffect(() => {
    // 域指针双挂载（TOKENS_PLAN §1.5）：
    // .app-shell 服务常规子树（fixed 侧栏/底栏是 DOM 子节点，经继承拿到 --d-*）；
    // <html> 镜像是必须的——--aurora-grad / --d-ring 等角色变量在 <html> 上求值，
    // 不镜像则全站回落 work 青；同时让将来 Portal 到 body 的浮层也能拿到域色。
    document.documentElement.dataset.domain = domain
    // 卸载（退出登录）时摘除：登录页在 .app-shell 之外，应保持品牌青
    return () => { delete document.documentElement.dataset.domain }
  }, [domain])

  return (
    <div className="app-shell min-h-screen pb-24 lg:pl-64 lg:pb-0" data-domain={domain}>
      <aside className="desktop-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r px-3 py-4 lg:flex">
        <div className="flex items-center gap-3 px-3 pb-7">
          <div aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-teal-500 to-sky-400 text-[0.867rem] font-extrabold text-[#04121a] shadow-[0_0_22px_rgba(20,184,166,.45)]">IT</div>
          <div className="min-w-0"><div className="font-semibold text-gray-900 dark:text-gray-100">ITtime</div><div className="text-[0.667rem] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Aurora workspace</div></div>
        </div>
        <nav aria-label="主导航" className="space-y-5">
          {[
            { label: '日常', items: navItems.filter((item) => ['/', '/time', '/tasks'].includes(item.to)) },
            { label: '回顾与整理', items: navItems.filter((item) => ['/insights', '/tags'].includes(item.to)) },
          ].map((group) => <section key={group.label} className="space-y-1">
            <h2 className="px-3 pb-1 text-[0.733rem] font-medium text-gray-400">{group.label}</h2>
            {group.items.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-transparent ${isActive ? 'bg-brand-50 font-medium text-brand-800 before:bg-brand-700 dark:bg-gradient-to-br dark:from-brand-500/15 dark:to-brand-400/10 dark:text-brand-200 dark:before:bg-brand-300 dark:shadow-[inset_0_0_18px_rgb(var(--d-400-rgb)/.10)]' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100'}`}>
              {({ isActive }) => <><item.icon aria-hidden="true" className={`h-[18px] w-[18px] ${isActive ? 'text-brand-700 dark:text-brand-300' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200'}`} strokeWidth={1.8} /><span>{item.label}</span></>}
            </NavLink>)}
          </section>)}
        </nav>
        <div className="mt-auto space-y-3 border-t border-gray-200 pt-3 dark:border-gray-800">
          <NavLink to="/settings" className={({ isActive }) => `group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-transparent ${isActive ? 'bg-brand-50 font-medium text-brand-800 before:bg-brand-700 dark:bg-gradient-to-br dark:from-brand-500/15 dark:to-brand-400/10 dark:text-brand-200 dark:before:bg-brand-300 dark:shadow-[inset_0_0_18px_rgb(var(--d-400-rgb)/.10)]' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100'}`}>
            {({ isActive }) => <><Settings aria-hidden="true" className={`h-[18px] w-[18px] ${isActive ? 'text-brand-700 dark:text-brand-300' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200'}`} strokeWidth={1.8} /><span>设置</span></>}
          </NavLink>
          <div className="rounded-xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 to-sky-500/5 px-3 py-2.5 text-xs text-teal-200 backdrop-blur-sm"><div className="flex items-center gap-2 font-medium"><Wifi className="h-3.5 w-3.5" />本机即时保存</div><div className="mt-1 text-[0.733rem] text-teal-300/70">数据优先保留在当前设备</div></div>
          {username && <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs text-gray-500 dark:text-gray-400"><span className="min-w-0 truncate">{username}</span>{onLogout && <button type="button" onClick={onLogout} className="rounded-lg p-1.5 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100" title="退出登录" aria-label="退出登录"><LogOut className="h-4 w-4" /></button>}</div>}
        </div>
      </aside>
      <div className="min-h-screen">
      <main key={location.pathname} className="app-main mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 motion-safe:animate-page-in sm:py-8 lg:px-8">{children}</main>
      <nav aria-label="底部导航" className="mobile-nav fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid h-[4.35rem] max-w-3xl grid-cols-5 px-1 sm:px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `relative mx-1 my-1 flex flex-col items-center justify-center gap-1 rounded-lg text-[0.733rem] transition-colors ${isActive ? 'bg-gradient-to-br from-brand-500/20 to-brand-400/10 font-medium text-brand-700 dark:text-brand-200 shadow-[inset_0_0_14px_rgb(var(--d-400-rgb)/.12)]' : 'text-gray-500 hover:bg-black/5 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200'}`}
            >
              {({ isActive }) => <>
                <item.icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                <span>{item.label}</span>
                {isActive && <span className="absolute -top-1 h-0.5 w-5 rounded-full bg-gradient-to-r from-brand-400 to-brand-300" />}
              </>}
            </NavLink>
          ))}
        </div>
      </nav>
      </div>
    </div>
  )
}
