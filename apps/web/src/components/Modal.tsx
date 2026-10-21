import { createContext, useContext, useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { announce } from '../announce'
import { useClosing } from './ConfirmDialog'

/**
 * 弹窗内容若想让自己的「取消/关闭」按钮也播放退场动画（而不是直接卸载），
 * 用此 hook 拿到软关闭函数；不在 Modal 内时回退 undefined。
 */
export const ModalCloseContext = createContext<(() => void) | null>(null)
export function useModalClose(): (() => void) | null {
  return useContext(ModalCloseContext)
}

/**
 * 全站统一弹窗外壳。
 *
 * 整合此前散落在各页面的弹窗模式，一次补齐：
 * - Portal 到 body（避免父容器 space-y 外边距命中遮罩、祖先 transform 致 fixed 错位）
 * - role="dialog" + aria-modal + aria-labelledby；打开时 announce(title)
 * - Esc 关闭、遮罩点击关闭；关闭走两段式退场（useClosing，180ms 后才调 onClose 卸载）
 * - 打开时焦点进入弹窗（initialFocusRef 优先，否则面板自身），关闭后焦点还原
 * - 打开期间锁定 body 滚动；面板内滚动不向背后页面链式传递（index.css [role=dialog]）
 * - 视觉统一为 .modal-panel（modal-in 进场 / data-closing 退场），亮暗玻璃主题自适应
 *
 * 用法（挂载式，父组件条件渲染即可）：
 *   {show && <Modal title="补录" onClose={() => setShow(false)}>...</Modal>}
 */
export type ModalWidth = 'sm' | 'md' | 'lg' | 'xl'

const WIDTH_CLASS: Record<ModalWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-3xl',
}

export function Modal({
  title,
  children,
  onClose,
  width = 'md',
  padded = true,
  bare = false,
  showHeader = true,
  showClose = true,
  scrollable = true,
  initialFocusRef,
  className = '',
  backdropClassName = 'bg-black/40 backdrop-blur-sm',
  labelledBy,
  ariaLabel,
}: {
  /** 标题文本；bare 结构下也用于打开播报。无标题时用 ariaLabel 提供可访问名称 */
  title?: ReactNode
  children: ReactNode
  /** 退场动画结束后调用（父组件在此真正卸载弹窗） */
  onClose: () => void
  width?: ModalWidth
  padded?: boolean
  /** 透底变体：无卡片底色/边框/阴影，用于图片/视频 lightbox */
  bare?: boolean
  /** 自定义头部：设为 false 后可在 children 内放自绘 header（标题语义由你负责） */
  showHeader?: boolean
  showClose?: boolean
  /** 面板自身是否整体滚动。false 时改由 children 内部区域滚动（flex-col 布局） */
  scrollable?: boolean
  initialFocusRef?: RefObject<HTMLElement>
  /** 追加到面板的类（max-h / flex 列布局等特殊结构） */
  className?: string
  backdropClassName?: string
  /** 自定义标题节点 id；默认内部生成（内置标题时无需传） */
  labelledBy?: string
  /** 无可见标题时的弹窗名称（与 title 二选一） */
  ariaLabel?: string
}) {
  const autoTitleId = useId()
  const titleId = labelledBy ?? (title ? autoTitleId : undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const { closing, close } = useClosing(onClose)

  // 打开：记录将被还原的焦点、锁滚动、播报标题；卸载：还原焦点、解锁
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // 优先 initialFocusRef；否则若子树已有 autoFocus 抢到焦点则不夺回，
    // 都没有才把焦点落到面板本身（让键盘/读屏起点进入弹窗）
    if (initialFocusRef?.current) initialFocusRef.current.focus()
    else if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus()
    if (title) announce(typeof title === 'string' ? title : ariaLabel ?? '对话框')
    else if (ariaLabel) announce(ariaLabel)
    return () => {
      document.body.style.overflow = prevOverflow
      restoreRef.current?.focus?.()
    }
    // 仅在挂载时执行一次；initialFocusRef 指向的节点随内容挂载后才存在，
    // 但 effect 在子树 commit 后运行，ref 已就绪
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc 关闭 + Tab 焦点循环（与 ConfirmDialog / CommandPalette 一致，window 级监听）。
  // 嵌套弹窗（本弹窗内再 Portal 一个 ConfirmDialog）时，DOM 中最后一个 [role=dialog]
  // 就是最上层：只有它响应 Esc/Tab，避免一次 Esc 关掉两层。
  // 注意不能用「焦点是否在面板内」判断——点击非可聚焦区域后 activeElement 会回落 body。
  useEffect(() => {
    const isTopmost = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
      return dialogs[dialogs.length - 1] === panelRef.current
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      // 焦点陷阱：Tab/Shift+Tab 在弹窗内循环，不跑到背后页面
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0)
      if (!focusables.length) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      // 面板自身（tabIndex=-1）也算「未进入内容」：它位于 DOM 末尾，
      // 默认 Tab 会直接绕回文档首个可聚焦元素，必须显式送进面板内的第一个控件
      const inside = active !== panelRef.current && panelRef.current.contains(active)
      if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault()
        last.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  const closeButton = showClose ? (
    <button
      type="button"
      onClick={close}
      aria-label="关闭对话框"
      className={
        bare
          ? 'absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white/90 transition-colors hover:bg-black/70'
          : "relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] dark:hover:bg-gray-800 dark:hover:text-gray-200"
      }
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  ) : null

  const dialogProps = {
    ref: panelRef,
    tabIndex: -1,
    role: 'dialog',
    'aria-modal': true as const,
    ...(titleId ? { 'aria-labelledby': titleId } : { 'aria-label': ariaLabel ?? '对话框' }),
    onClick: (event: MouseEvent) => event.stopPropagation(),
  }

  if (bare) {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4"
        data-closing={closing || undefined}
        onClick={close}
      >
        <div
          {...dialogProps}
          className={`relative max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] outline-none ${className}`}
        >
          <ModalCloseContext.Provider value={close}>
            {closeButton}
            {children}
          </ModalCloseContext.Provider>
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${backdropClassName}`}
      data-closing={closing || undefined}
      onClick={close}
    >
      <div
        {...dialogProps}
        className={`modal-panel relative max-h-[calc(100dvh-2rem)] w-full rounded-panel border border-gray-200 bg-white shadow-xl outline-none dark:border-gray-800 dark:bg-gray-900 ${scrollable ? 'overflow-y-auto' : 'overflow-hidden'} ${WIDTH_CLASS[width]} ${padded ? 'p-5 sm:p-6' : ''} ${className}`}
      >
        {showHeader && (title || showClose) && (
          <div className="mb-4 flex items-center justify-between gap-3">
            {title && (
              <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                {title}
              </h2>
            )}
            {closeButton}
          </div>
        )}
        {/* 自绘 header 时关闭按钮浮到右上角，不占据内容流的首行 */}
        {!showHeader && showClose && <div className="absolute right-3 top-3 z-10">{closeButton}</div>}
        <ModalCloseContext.Provider value={close}>
          {children}
        </ModalCloseContext.Provider>
      </div>
    </div>,
    document.body,
  )
}
