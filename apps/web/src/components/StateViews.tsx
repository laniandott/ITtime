import type { RefObject } from 'react'

/**
 * 空/加载/错误三态的共享视觉件（EMPTY_LOADING_ERROR.md §2.2 / §3）。
 * 统计、习惯、待办三页的错误形态必须一致：琥珀色 E-Block + 原始错误折叠区 + 重试；
 * 有旧数据时用非阻塞 E-Banner。错误类提示不自动消失，直到用户关闭或下次成功。
 *
 * 注意：这两个件都不带 role="alert"——屏幕阅读器播报由全局 announceUrgent() 负责
 * （永久 live region，比条件插入的 role="alert" 可靠）。若两边都播，用户会听到两遍。
 */

/** E-Block：整页/整段无数据可用时的错误卡。琥珀色不用红色——红色会和「删除/危险」混淆；
 *  技术原文进次要的 mono 行，主文案只告诉用户「该做什么」。 */
export function ErrorBlockCard({ title, hint, error, onRetry, retryLabel = '重新加载', buttonRef }: {
  title: string
  hint?: string
  error: string
  onRetry: () => void
  retryLabel?: string
  buttonRef?: RefObject<HTMLButtonElement>
}) {
  return (
    <section className="page-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="text-3xl text-amber-500" aria-hidden="true">⚠</span>
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      {hint && <p className="text-sm text-gray-500 dark:text-gray-400">{hint}</p>}
      <p className="max-h-24 w-full overflow-y-auto break-all rounded-lg bg-gray-50 p-3 text-left font-mono text-xs text-gray-500 dark:bg-gray-800/40 dark:text-gray-400">{error}</p>
      <button ref={buttonRef} type="button" onClick={onRetry} className="btn-primary mt-1 inline-flex items-center gap-2">
        {retryLabel}
      </button>
    </section>
  )
}

/** E-Banner：有旧数据时的刷新失败提示。重试/关闭两个小按钮用伪元素把触达热区扩到 44px
 *  （视觉尺寸不变），gap-x-3 的 12px 间距保证两条 44px 热区恰好相接、不相叠。 */
export function RefreshErrorBanner({ error, onRetry, onDismiss }: { error: string; onRetry: () => void; onDismiss: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-lg border-l-[3px] border-amber-500 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <span aria-hidden="true">⚠</span>
      <span className="min-w-0 flex-1">刷新失败：{error}（当前显示的是上次成功加载的数据）</span>
      <button type="button" onClick={onRetry} className="relative shrink-0 rounded px-3 py-2 text-xs font-medium after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-amber-100 dark:hover:bg-amber-900/40">重试</button>
      <button type="button" onClick={onDismiss} aria-label="关闭错误提示" className="relative shrink-0 rounded p-2 after:absolute after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-amber-100 dark:hover:bg-amber-900/40">✕</button>
    </div>
  )
}
