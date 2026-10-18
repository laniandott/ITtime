import { useId, useRef, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'

export interface SectionTab {
  id: string
  label: string
}

/**
 * 分区页：把几个相关页面收进同一个导航入口（如「时间 = 日历 / 计划 / 日记」）。
 * tab 状态写入 ?tab= 以便深链与刷新；首个 tab 不写入参数，保持 URL 干净。
 * label 作为 tablist 的地标名：同一应用可能挂多个分区（时间/事项），
 * 读屏地标列表里需要能区分，默认值仅为兜底。
 * 注意：这里只渲染 tab 条——各子页面保留自己的 PageHeader（含写计划、新建等操作按钮），
 * 分区层如果再包一层头部，就会把子页面的操作入口藏掉。
 */
export default function SectionPage({ tabs, children: render, label = '分区' }: {
  tabs: SectionTab[]
  children: (tabId: string) => ReactNode
  label?: string
}) {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const active = tabs.some((t) => t.id === requested) ? requested! : tabs[0].id
  const tablistRef = useRef<HTMLDivElement>(null)
  // tab 与面板的 id 加前缀，避免同一页面挂载多个分区时 id 冲突。
  const uid = useId()
  const switchTo = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === tabs[0].id) next.delete('tab')
    else next.set('tab', id)
    setParams(next)
  }
  // WAI-ARIA tabs 键盘模式：←→ 循环切换，Home/End 跳首/末，焦点跟随选中项。
  // 焦点直接移即可——tab 按钮是常驻节点，React 重渲染不会卸载它。
  const onTablistKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active)
    let nextIndex: number | null = null
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const nextId = tabs[nextIndex].id
    switchTo(nextId)
    tablistRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${nextId}"]`)?.focus()
  }
  return (
    <div className="workspace-page space-y-4">
      <div
        ref={tablistRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onTablistKeyDown}
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-ctl border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-id={tab.id}
            id={`${uid}-tab-${tab.id}`}
            aria-selected={tab.id === active}
            aria-controls={`${uid}-panel-${tab.id}`}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => switchTo(tab.id)}
            className={`whitespace-nowrap rounded-ctl px-4 py-1.5 text-sm font-medium transition-all ${
              tab.id === active
                ? 'bg-brand-50 text-brand-800 dark:bg-gradient-to-br dark:from-teal-500/20 dark:to-sky-500/10 dark:text-teal-100 dark:shadow-[inset_0_0_12px_rgba(20,184,166,.14)]'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* 所有 tab 的内容常驻渲染，仅用 display:none 切换显隐：切 tab 不再销毁重建子页面，
          筛选/草稿/日期视图等状态得以保留，也不会反复触发数据请求与加载闪烁。
          display:none 同时把非激活内容移出可访问性树与 Tab 顺序（比 visibility:hidden 更彻底）。
          tabIndex=-1 的 roving 焦点管理配合键盘方向键，符合 WAI-ARIA tabs 模式。 */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${uid}-panel-${tab.id}`}
          aria-labelledby={`${uid}-tab-${tab.id}`}
          aria-hidden={tab.id !== active}
          style={{ display: tab.id === active ? undefined : 'none' }}
        >
          {render(tab.id)}
        </div>
      ))}
    </div>
  )
}
