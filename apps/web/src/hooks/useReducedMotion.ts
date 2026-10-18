import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * 读取并订阅 prefers-reduced-motion。
 *
 * CSS 侧的全局降级规则（index.css §9.2）覆盖不到 JS 驱动的动画——
 * Recharts 的入场生长、requestAnimationFrame 数字滚动都是 JS 时序，
 * 必须在这里读同一个媒体查询来关停。P5 原则：降级是「跳到终态」，
 * 不是「加速」，所以返回 true 时调用方应直接渲染终值，不要跑中间态。
 *
 * SSR / 首帧安全：初始值取当前匹配状态，不默认 false。
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    // 订阅前同步一次，覆盖「hook 挂载时系统设置已变更」的情况
    setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
