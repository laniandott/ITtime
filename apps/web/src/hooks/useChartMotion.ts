import { useReducedMotion } from './useReducedMotion'

/**
 * Recharts 动画参数（MOTION_SPEC §6.4）。
 *
 * 注意：Recharts 的 animationEasing 只接受
 * 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'，
 * **不接受 cubic-bezier 字符串**——这是 Recharts 的类型限制，不是疏漏。
 * 因此图表动画的缓动固定用 'ease-out'，与 --ease-enter 观感接近但不等价；
 * CSS 动画（animate-* 工具类）才用完整曲线。
 */
export function useChartMotion(seriesIndex = 0) {
  const reduced = useReducedMotion()
  return {
    isAnimationActive: !reduced,
    animationDuration: 700,
    animationEasing: 'ease-out' as const,
    // 多序列错峰 60ms/条，最多 6 条（与 L2 错峰上限对齐）
    animationBegin: Math.min(seriesIndex, 5) * 60,
  }
}
