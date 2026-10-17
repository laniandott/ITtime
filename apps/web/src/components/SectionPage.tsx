import { useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'

export interface SectionTab {
  id: string
  label: string
}

/**
 * 分区页：把几个相关页面收进同一个导航入口（如「时间 = 日历 / 计划 / 日记」）。
 * tab 状态写入 ?tab= 以便深链与刷新；首个 tab 不写入参数，保持 URL 干净。
 * 注意：这里只渲染 tab 条——各子页面保留自己的 PageHeader（含写计划、新建等操作按钮），
 * 分区层如果再包一层头部，就会把子页面的操作入口藏掉。
 */
export default function SectionPage({ tabs, children: render }: {
  tabs: SectionTab[]
  children: (tabId: string) => ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const active = tabs.some((t) => t.id === requested) ? requested! : tabs[0].id
  const switchTo = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === tabs[0].id) next.delete('tab')
    else next.set('tab', id)
    setParams(next)
  }
  return (
    <div className="workspace-page space-y-4">
      <div
        role="tablist"
        aria-label="分区"
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-ctl border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === active}
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
      <div key={active} className="motion-safe:animate-page-in">
        {render(active)}
      </div>
    </div>
  )
}
