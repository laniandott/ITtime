import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  Images,
  ListTodo,
  NotebookPen,
  Repeat,
  Settings,
  Tags,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { useClosing } from './ConfirmDialog'

interface CommandItem {
  label: string
  group: '日常' | '回顾与整理'
  to: string
  icon: LucideIcon
}

/**
 * ⌘/Ctrl+K 命令面板（Wave2）。
 *
 * - 自管理打开状态与全局快捷键，Layout 只负责挂载（Portal 到 body）；
 * - 跳转清单与侧栏导航一致（/time /tasks 带 tab query 深链）；
 * - 进场 animate-cmdk-in（tailwind.config 已有令牌，此前零使用，此处落地）；
 *   注意刻意不挂 .modal-panel 类——它的 modal-in 动画在样式表中位于
 *   Tailwind utilities 之后，同特异性下会静默盖掉 animate-cmdk-in；
 * - 退场复用 [data-closing] 机制（useClosing：180ms overlay-out + 190ms 卸载，
 *   reduce 下同步关闭），面板随容器一起淡出；
 * - 高亮态与导航激活态同款（bg-brand-50 dark:bg-brand-900/30），选项 ≥44px 触达。
 */

const COMMANDS: CommandItem[] = [
  { label: '工作台', group: '日常', to: '/', icon: Timer },
  { label: '时间', group: '日常', to: '/time?tab=calendar', icon: CalendarDays },
  { label: '计划', group: '日常', to: '/time?tab=plans', icon: CalendarCheck },
  { label: '日记', group: '日常', to: '/time?tab=diary', icon: NotebookPen },
  { label: '图库', group: '日常', to: '/time?tab=gallery', icon: Images },
  { label: '待办', group: '日常', to: '/tasks?tab=todos', icon: ListTodo },
  { label: '习惯', group: '日常', to: '/tasks?tab=habits', icon: Repeat },
  { label: '洞察', group: '回顾与整理', to: '/insights', icon: ChartColumn },
  { label: '标签', group: '回顾与整理', to: '/tags', icon: Tags },
  { label: '设置', group: '回顾与整理', to: '/settings', icon: Settings },
]

const GROUP_ORDER: CommandItem['group'][] = ['日常', '回顾与整理']

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  // 两段式关闭：先播退场，190ms 后卸载并还原焦点；reduce 下同步关闭
  const { closing, close } = useClosing(() => {
    setOpen(false)
    restoreRef.current?.focus()
    restoreRef.current = null
  })

  // 全局快捷键：Cmd/Ctrl+K。keydown 从输入框冒泡到 window，故输入框内也响应；
  // preventDefault 拦掉浏览器侧默认行为。面板已开时忽略（关闭走 Esc/遮罩/跳转）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (open) return
        restoreRef.current = document.activeElement as HTMLElement | null
        setQuery('')
        setActive(0)
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Esc 关闭（window 级监听，焦点在输入框/列表项都生效）
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // 打开时聚焦输入框
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // 打开期间锁滚动，关闭还原
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // 输入过滤：label includes 匹配（不分词、不做拼音），大小写不敏感
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? COMMANDS.filter((item) => item.label.toLowerCase().includes(q)) : COMMANDS
  }, [query])

  // 查询变化时高亮回到首项；结果集缩小时钳制高亮索引（-1 = 无结果）
  useEffect(() => {
    setActive(0)
  }, [query])
  const activeIndex = filtered.length === 0 ? -1 : Math.min(active, filtered.length - 1)

  // 高亮项滚入可视区（↑↓ 循环时列表可能超出 60vh）
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const runCommand = (item: CommandItem) => {
    close()
    navigate(item.to)
  }

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (filtered.length) setActive((activeIndex + 1) % filtered.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (filtered.length) setActive((activeIndex - 1 + filtered.length) % filtered.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = filtered[activeIndex]
      if (item) runCommand(item)
    }
  }

  if (!open) return null

  // 分组渲染：组序按 GROUP_ORDER，组内保持 COMMANDS 声明序
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: filtered.filter((item) => item.group === group),
  })).filter((g) => g.items.length > 0)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      data-closing={closing || undefined}
      onClick={close}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-panel border border-gray-200 bg-white shadow-xl motion-safe:animate-cmdk-in dark:border-gray-800 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 p-2 dark:border-gray-800">
          <input
            ref={inputRef}
            type="text"
            value={query}
            aria-label="搜索要跳转的页面"
            placeholder="搜索页面…"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            className="input"
          />
        </div>
        <div ref={listRef} role="listbox" aria-label="跳转目标" className="max-h-[60vh] overflow-y-auto p-2">
          {groups.map(({ group, items }) => (
            <div key={group} role="group" aria-label={group}>
              <div className="px-3 pb-1 pt-2 text-[0.75rem] font-medium text-gray-500 dark:text-gray-400">{group}</div>
              {items.map((item) => {
                const index = filtered.indexOf(item)
                const isActive = index === activeIndex
                return (
                  <button
                    key={item.to}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => runCommand(item)}
                    onMouseMove={() => setActive(index)}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-ctl px-3 text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/30 dark:text-brand-100'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/5'
                    }`}
                  >
                    <item.icon aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-brand-700 dark:text-brand-300' : 'text-gray-400'}`} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">没有匹配的页面</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
