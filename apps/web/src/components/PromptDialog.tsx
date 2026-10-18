import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { announce } from '../announce'
import { useClosing } from './ConfirmDialog'

/**
 * 应用内输入对话框，替代原生 prompt()。
 *
 * 与 ConfirmDialog 同一套遮罩/面板/动效/焦点规范；额外提供：
 * - 每次打开重置为 defaultValue 并聚焦选中输入框，保持原生 prompt 的默认值语义；
 * - 表单提交（Enter 或点「确定」）把原始字符串交给 onConfirm——
 *   空值/校验语义由调用方决定（各调用点原有逻辑不同，不在组件内裁剪）。
 */
export function PromptDialog({
  open,
  title,
  message,
  label,
  inputType = 'text',
  defaultValue = '',
  confirmLabel = '确定',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message?: string
  label?: string
  inputType?: 'text' | 'date' | 'time'
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (value: string) => void | Promise<void>
  onCancel: () => void
}) {
  const titleId = useId()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)
  const { closing, close, request } = useClosing(onCancel)

  // 每次打开重置默认值并聚焦选中
  useEffect(() => {
    if (!open) return
    setValue(defaultValue)
    const input = inputRef.current
    if (input) {
      input.focus()
      input.select()
    }
  }, [open, defaultValue])

  // Esc = 取消（仅在打开时监听）；走两段式关闭先播退场
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // 打开时播报一次标题
  useEffect(() => {
    if (open) announce(title)
  }, [open, title])

  if (!open) return null

  // Portal 到 body（同 ConfirmDialog）：脱离 space-y-* 容器，避免
  // `> * + * { margin-top }` 命中 fixed 遮罩造成顶部缺口；样式全显式类，无继承依赖。
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-closing={closing || undefined} onClick={close}>
      <form
        className="modal-panel w-full max-w-sm space-y-4 rounded-panel border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          // 确认与取消同一套两段式关闭：closing 期间防重入，退场结束后再提交
          request(() => onConfirm(value))
        }}
      >
        <h2 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {message && <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
        <div>
          {label && (
            <label htmlFor={inputId} className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              {label}
            </label>
          )}
          <input
            id={inputId}
            ref={inputRef}
            type={inputType}
            value={value}
            aria-label={label ?? title}
            onChange={(event) => setValue(event.target.value)}
            className="input"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} className="btn-secondary px-4 py-2 text-sm">
            {cancelLabel}
          </button>
          <button
            type="submit"
            className="rounded-ctl bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
