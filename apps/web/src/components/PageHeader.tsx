import type { ReactNode } from 'react'

/**
 * 页面头部。布局全部在这里用工具类表达，index.css 只保留字体/边框等外观 token，
 * 不再用 `.page-header > :last-child` 这类结构选择器去反推子元素。
 */
export function PageHeader({ title, description, actions, icon }: { title: string; description?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="page-header relative flex justify-between gap-5 max-md:items-start">
      <div className="page-header-title flex min-w-0 items-start gap-3">
        {icon ? <span className="page-header-icon mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" aria-hidden="true">{icon}</span> : <span className="page-header-mark mt-1.5 hidden h-8 w-1 shrink-0 rounded-full sm:block" aria-hidden="true" />}
        <div className="min-w-0">
          <div className="page-header-kicker">ITTIME / 工作区</div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 sm:text-sm">{description}</p>}
        </div>
      </div>
      <div className="page-header-actions ml-auto flex max-w-full flex-wrap items-center gap-2 max-md:ml-0 max-md:w-full">{actions}</div>
    </header>
  )
}
