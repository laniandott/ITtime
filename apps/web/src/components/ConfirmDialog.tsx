import { useEffect, useId, useRef } from 'react'
import { announce } from '../announce'

/**
 * 应用内确认对话框，替代原生 confirm()（Capacitor 打包后样式不可控且阻塞 JS 线程）。
 *
 * 设计要点：
 * - 打开时焦点落在「取消」按钮（安全默认，防止误触确认）；
 * - Esc 与遮罩点击都等价于取消；
 * - role="dialog" + aria-modal + aria-labelledby 指向标题；打开时 announce(title) 一次；
 * - 开合完全由调用方的 open 控制，确认/取消后可以重新打开；
 * - 动画复用全局 overlay-in（index.css 的 [class~="fixed"][class~="z-50"] 选择器）
 *   与 .modal-panel（modal-in），prefers-reduced-motion 降级由 index.css 全局规则统一处理。
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // 打开时焦点移到「取消」：键盘/读屏用户第一下 Enter 不会误触确认
  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  // Esc = 取消（仅在打开时监听）
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  // 打开时播报一次标题，让读屏用户知道弹出了确认
  useEffect(() => {
    if (open) announce(title)
  }, [open, title])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="modal-panel w-full max-w-sm space-y-4 rounded-panel border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn-secondary px-4 py-2 text-sm">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            className={`rounded-ctl px-4 py-2 text-sm font-medium text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
