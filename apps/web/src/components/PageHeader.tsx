import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions, icon }: { title: string; description?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="page-header flex justify-between gap-5">
      <div className="page-header-title flex min-w-0 items-start gap-3">
        {icon ? <span className="page-header-icon mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" aria-hidden="true">{icon}</span> : <span className="page-header-mark mt-1.5 hidden h-8 w-1 shrink-0 rounded-full sm:block" aria-hidden="true" />}
        <div className="min-w-0">
          <div className="page-header-kicker">ITTIME / 工作区</div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 sm:text-sm">{description}</p>}
        </div>
      </div>
      {actions && <div className="page-header-actions flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
