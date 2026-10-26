import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { announce } from '../announce'

/**
 * 两段式关闭（MOTION_SPEC：退场必须比进场短，进场从容、退场利落）。
 * 先置 closing 播 180ms 退场动画（index.css 的 [data-closing="true"]），
 * 190ms（180ms 动画 + 10ms 余量）后再调 onDone 真正卸载；
 * prefers-reduced-motion 下同步关闭，不播退场。
 * 导出供 PromptDialog 复用（同一套遮罩/动效规范）。
 *
 * 所有关闭路径（取消/Esc/遮罩/确认）共用同一个 closing 状态：
 * 退场播放中任何路径再触发都会被拦截（防重入）。
 * request(done) 供非取消路径（如确认）走同一套退场——
 * 延迟结束后才复位 closing 并调用 done，父组件随后的同步 setXxx(null) 卸载时退场已完成。
 * close 内部走 request(onCancel)，无参、可直接作事件处理器。
 *
 * 复位是关键：弹窗在 open=false 后只是返回 null，组件实例与 hooks 状态仍存活。
 * closing 若不复位，下一次打开会直接带着 data-closing 渲染——退场动画一闪而过，
 * 遮罩停在 opacity:0 却仍 fixed inset-0 拦截全部点击，页面看起来「闪一下后全部按钮失效」。
 * 防重入改用 ref：它只在 190ms 退场窗口内为 true，不受状态复位时序影响。
 */
export function useClosing(onDone: () => void) {
  const [closing, setClosing] = useState(false)
  const busyRef = useRef(false)
  const request = useCallback((done: () => void) => {
    if (busyRef.current) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { done(); return }
    busyRef.current = true
    setClosing(true)
    window.setTimeout(() => {
      busyRef.current = false
      setClosing(false)
      done()
    }, 190)
  }, [])
  const close = useCallback(() => request(onDone), [request, onDone])
  return { closing, close, request }
}

/**
 * 应用内确认对话框，替代原生 confirm()（Capacitor 打包后样式不可控且阻塞 JS 线程）。
 *
 * 设计要点：
 * - 打开时焦点落在「取消」按钮（安全默认，防止误触确认）；
 * - Esc 与遮罩点击都等价于取消；
 * - 确认也走两段式关闭：先播 180ms 退场，结束后再调 onConfirm
 *   （父组件在 onConfirm 里同步 setXxx(null) 卸载时退场已完成），
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
  const { closing, close, request } = useClosing(onCancel)

  // 打开时焦点移到「取消」：键盘/读屏用户第一下 Enter 不会误触确认
  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  // Esc = 取消（仅在打开时监听）；走两段式关闭先播退场
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // 打开时播报一次标题，让读屏用户知道弹出了确认
  useEffect(() => {
    if (open) announce(title)
  }, [open, title])

  if (!open) return null

  // Portal 到 body：组件若内联渲染在 space-y-* 容器里，Tailwind 的
  // `> * + * { margin-top }` 会命中 fixed 遮罩（实测顶部 15px 无遮罩）；
  // Portal 脱离页面容器后该选择器不再生效。颜色/文字均为显式工具类，
  // 不依赖页面容器的继承样式，Portal 化无视觉副作用。
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-closing={closing || undefined} onClick={close}>
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
          <button ref={cancelRef} type="button" onClick={close} className="btn-secondary px-4 py-2 text-sm">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => request(onConfirm)}
            className={`rounded-ctl px-4 py-2 text-sm font-medium text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
