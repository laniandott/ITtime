import { useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { PageHeader } from './PageHeader'

export interface SectionTab {
  id: string
  label: string
  description?: string
}

/**
 * 分区页：把几个相关页面收进同一个导航入口（如「时间 = 日历 / 计划 / 日记」）。
 * tab 状态写入 ?tab= 以便深链与刷新；首个 tab 不写入参数，保持 URL 干净。
 */
export default function SectionPage({ title, description, tabs, children: render }: {
  title: string
  description: string
  tabs: SectionTab[]
  children: (tabId: string) => ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const active = tabs.some((t) => t.id === requested) ? requested! : tabs[0].id
  const current = tabs.find((t) => t.id === active)!
  const switchTo = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === tabs[0].id) next.delete('tab')
    else next.set('tab', id)
    setParams(next)
  }
  return (
    <div className="workspace-page space-y-5">
      <PageHeader title={title} description={current.description ?? description} />
      <div
        role="tablist"
        aria-label={`${title}分区`}
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
