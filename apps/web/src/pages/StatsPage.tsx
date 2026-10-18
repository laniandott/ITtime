import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { api } from '../api'
import { formatDuration } from '../store'
import { elapsed, periodBounds } from '../localStats'
import { planAdherence } from '../planStats'
import { PageHeader } from '../components/PageHeader'
import { ErrorBlockCard, RefreshErrorBanner } from '../components/StateViews'
import { announceUrgent } from '../announce'
import { useChartMotion } from '../hooks/useChartMotion'
import type { TimeEntry, PlanBlock } from '../types'

// 四态状态机（EMPTY_LOADING_ERROR.md §2.1）：loading 与 empty 绝不能用 data.length===0 混推——
// 首屏先把「0s / 暂无记录」闪给用户，会让人以为数据丢了，这是本页最要命的数据可信度问题。
// refreshing 保留旧数据不清空（切周期/后台刷新不闪骨架）；error 尽量带上一次成功的数据，
// 页面照常可读，只在顶部加非阻塞提示条。
type StatsData = { entries: TimeEntry[]; plans: PlanBlock[] }
// data 为 null = 从来没有成功加载过（整页 E-Block）；非 null = 有旧数据可展示（顶部 E-Banner）
type StatsState =
  | { kind: 'loading' }
  | { kind: 'refreshing'; data: StatsData }
  | { kind: 'ready'; data: StatsData }
  | { kind: 'error'; error: string; data: StatsData | null }

const RANGE_LABELS: Record<string, string> = { daily: '今日', weekly: '本周', monthly: '本月' }

/** 首屏加载骨架：宽高贴近真实内容（概览 3 行 / 趋势 168px / 排行 5 行 / 遵循整块），
 *  数据到达时布局不跳动（CLS）。MOTION_SPEC §5.2 三件套：role="status" + aria-busy + aria-label，
 *  加载播报由骨架自身承担，完成播报走全局永久 live region。骨架元素压在 ≤12 个（视觉规范上限），
 *  .skeleton 语义类在 reduce 下自动退化为静态灰块，无需任何前缀。 */
function StatsSkeleton() {
  return (
    <div className="stats-layout items-stretch" role="status" aria-busy="true" aria-label="正在加载投入统计">
      <div className="stats-primary min-w-0 space-y-4" aria-hidden="true">
        <div className="stats-overview">
          <span className="skeleton h-3 w-20 rounded" />
          <strong className="skeleton h-7 w-32 rounded" />
          <small className="skeleton h-3 w-44 rounded" />
        </div>
        <section className="page-card p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">近 14 天趋势</h2>
            <span className="text-xs text-gray-400">每日实际投入</span>
          </div>
          <div className="skeleton h-[168px] w-full rounded-lg" />
        </section>
        <section className="page-card p-5">
          <h2 className="mb-4 text-sm font-semibold">标签投入排行</h2>
          {/* 一行一根、宽度递减：既暗示「排行」的形状，又把骨架元素数压在上限内 */}
          <div className="space-y-6">
            {['w-full', 'w-11/12', 'w-4/5', 'w-2/3', 'w-1/2'].map(width => (
              <div key={width} className={`skeleton h-3 ${width} rounded`} />
            ))}
          </div>
        </section>
      </div>
      <section className="page-card p-5" aria-hidden="true">
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-sm">计划遵循</h2><span className="text-xs text-gray-400">计划不计入投入时长</span></div>
        <div className="skeleton mt-4 h-32 w-full rounded-lg" />
      </section>
    </div>
  )
}

export default function StatsPage() {
  const [state, setState] = useState<StatsState>({ kind: 'loading' })
  const [range, setRange] = useState('weekly')
  // 顶部提示条允许用户关闭；下次加载尝试时重置，保证新错误不会被旧 dismissal 吞掉
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // 重试计数：变化即重跑加载 effect（同时换 seq 号，作废上一轮在途请求，防竞态）
  const [reloadTick, setReloadTick] = useState(0)
  const seqRef = useRef(0)
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  // 图表入场动画（MOTION_SPEC §6.4）：reduce 下 isAnimationActive=false，
  // 直接呈现终态——CSS 全局降级够不到 Recharts 的 JS 时序动画。
  const chartMotion = useChartMotion()

  useEffect(() => {
    const seq = ++seqRef.current
    const load = () => {
      // 有旧数据 → refreshing（内容不消失，只在标题旁转小圈）；无数据 → loading（骨架）
      setState(prev => {
        if (prev.kind === 'loading') return { kind: 'loading' }
        return prev.data ? { kind: 'refreshing', data: prev.data } : { kind: 'loading' }
      })
      setBannerDismissed(false)
      Promise.all([api.timer.list(), api.plans.list()])
        .then(([nextEntries, nextPlans]) => {
          if (seq !== seqRef.current) return
          setState({ kind: 'ready', data: { entries: nextEntries, plans: nextPlans } })
        })
        .catch(e => {
          if (seq !== seqRef.current) return
          const message = String(e)
          // 失败必须 assertive 播报（分级表 §2.2）：后台刷新失败时数据还在，但用户有权知道
          announceUrgent(`加载失败：${message}`)
          setState(prev => ({ kind: 'error', error: message, data: prev.kind === 'loading' ? null : prev.data }))
        })
    }
    void load()
    window.addEventListener('ittime-data-changed', load)
    return () => window.removeEventListener('ittime-data-changed', load)
  }, [reloadTick])

  // 整页错误时把焦点移到「重新加载」：读屏用户播报完后直接落在可操作的出口上
  useEffect(() => {
    if (state.kind === 'error' && state.data === null) retryButtonRef.current?.focus()
  }, [state])

  const retry = () => setReloadTick(tick => tick + 1)
  const data: StatsData | null = state.kind === 'loading' ? null : state.data
  const entries = data?.entries ?? []
  const plans = data?.plans ?? []
  const [start, end] = periodBounds(range)
  const groups = new Map<string, TimeEntry[]>()
  entries.forEach(entry => groups.set(entry.tagId, [...(groups.get(entry.tagId) ?? []), entry]))
  const ranking = [...groups.values()].map(records => ({ name: records[0].tag?.name ?? '已删除标签', color: records[0].tag?.color ?? '#64748b', ms: elapsed(records, start, end) })).filter(row => row.ms > 0).sort((a, b) => b.ms - a.ms)
  const total = elapsed(entries, start, end)
  // 排行条按「榜首」归一化，否则所有条都只占一小截，读不出相对差距
  const topMs = ranking.length ? ranking[0].ms : 0
  const adherence = planAdherence(plans, entries, [start, end])
  // 近 14 天每日投入趋势：与右上角的周期选择无关，固定按自然日回看
  const trend = useMemo(() => {
    const days: { label: string; ms: number }[] = []
    const anchor = new Date()
    for (let offset = 13; offset >= 0; offset--) {
      const day = new Date(anchor); day.setDate(day.getDate() - offset)
      const from = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
      const ms = elapsed(entries, from, from + 86_400_000)
      days.push({ label: `${day.getMonth() + 1}/${day.getDate()}`, ms })
    }
    return days
  }, [entries])
  const hasTrend = trend.some(day => day.ms > 0)
  // E2：本周期为空、但别的周期有数据时，给「查看更大周期」的按钮，而不是一句干巴巴的「暂无」
  const altRange = (['daily', 'weekly', 'monthly'] as const).find(candidate => {
    if (candidate === range) return false
    const [from, to] = periodBounds(candidate)
    return elapsed(entries, from, to) > 0
  })

  return (
    <div className="workspace-page stats-page space-y-5">
      <PageHeader
        title="投入统计"
        description="时间投入与计划遵循情况"
        actions={<>
          {/* refreshing 指示：标题旁 12px 小圈，内容保持可读，不遮罩不重绘骨架 */}
          {state.kind === 'refreshing' && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-brand dark:border-gray-600 dark:border-t-brand-400" aria-hidden="true" />}
          <select aria-label="统计周期" className="input !w-auto" value={range} onChange={event => setRange(event.target.value)}><option value="daily">今日</option><option value="weekly">本周</option><option value="monthly">本月</option></select>
        </>}
      />
      {state.kind === 'loading' ? (
        <StatsSkeleton />
      ) : state.kind === 'error' && state.data === null ? (
        <ErrorBlockCard
          title="没能加载投入统计"
          hint="可能是网络或本地数据库的问题，请稍后重试。"
          error={state.error}
          onRetry={retry}
          buttonRef={retryButtonRef}
        />
      ) : (
        <div className="space-y-4">
          {/* E-Banner：有旧数据时的刷新失败。错误类不自动消失，直到用户关闭或下次成功 */}
          {state.kind === 'error' && !bannerDismissed && (
            <RefreshErrorBanner error={state.error} onRetry={retry} onDismiss={() => setBannerDismissed(true)} />
          )}
          <div className="stats-layout items-stretch" aria-busy={state.kind === 'refreshing' ? 'true' : undefined}>
            <div className="stats-primary min-w-0 space-y-4">
              <div className="stats-overview"><span>已保存的项目时长</span><strong>{formatDuration(total)}</strong><small>同时进行的项目分别累计</small></div>
              <section className="page-card p-5" aria-label="近 14 天投入趋势">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold">近 14 天趋势</h2>
                  <span className="text-xs text-gray-400">每日实际投入</span>
                </div>
                {hasTrend ? (
                  /* text-brand：SVG presentation attribute 不解析 var()，
                     用 currentColor 关键字让 fill 继承 CSS color，拿到域感知色 */
                  <div className="-ml-2 h-[168px] w-[calc(100%+1rem)] text-brand">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trend} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={2} />
                        <Tooltip
                          cursor={{ fill: 'rgba(13, 148, 136, 0.08)' }}
                          formatter={(value) => [formatDuration(Number(value)), '投入']}
                          labelStyle={{ color: '#374151', fontWeight: 600 }}
                          contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 6px 20px rgba(16,24,40,.08)', fontSize: 12, padding: '6px 10px' }}
                        />
                        <Bar dataKey="ms" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={20} {...chartMotion} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  /* E1 首次使用：图标 + 价值说明 + 直达工作台的 CTA（「打卡」是旧导航名，已改「工作台」） */
                  <div className="flex h-[120px] flex-col items-center justify-center gap-1.5 rounded-lg bg-gray-50 text-center dark:bg-gray-800/40">
                    <Clock className="h-9 w-9 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">还没有计时记录</p>
                    <p className="max-w-[32ch] text-xs text-gray-400">去「工作台」开始第一条记录，之后就能在这里看到投入分布</p>
                    <Link to="/" className="mt-1 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">开始第一条记录 →</Link>
                  </div>
                )}
              </section>
              <section className="page-card p-5" aria-label="标签投入排行">
                <h2 className="mb-3 text-sm font-semibold">标签投入排行</h2>
                {ranking.map(row => (
                  <div key={row.name} className="border-b border-gray-200 py-3 last:border-0 dark:border-gray-800">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
                        <span className="truncate text-gray-700 dark:text-gray-200">{row.name}</span>
                      </span>
                      <strong className="shrink-0 font-medium tabular-nums">{formatDuration(row.ms)}</strong>
                    </div>
                    {/* 进度条改用标签色：原先固定 brand-600，与左侧色点对不上，色弱用户无法把条和标签关联起来 */}
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className="h-full rounded-full" style={{ width: `${topMs ? row.ms / topMs * 100 : 0}%`, backgroundColor: row.color }} />
                    </div>
                  </div>
                ))}
                {!ranking.length && (altRange ? (
                  <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                    <p className="text-sm text-gray-400">{RANGE_LABELS[range]}暂无记录</p>
                    <button type="button" onClick={() => setRange(altRange)} className="rounded px-2 py-1 text-sm text-brand-700 hover:underline dark:text-brand-300">查看{RANGE_LABELS[altRange]} →</button>
                  </div>
                ) : (
                  <p className="py-8 text-sm text-gray-400">此周期暂无已保存的计时记录。</p>
                ))}
              </section>
            </div>
            <section className="page-card p-5" aria-label="计划遵循情况">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-sm">计划遵循</h2><span className="text-xs text-gray-400">计划不计入投入时长</span></div>
              {adherence.plannedMs === 0 ? (
                /* E4 依赖项缺失：计划还没写，给直达计划页的 CTA */
                <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
                  <p className="text-sm text-gray-400">这个周期还没有计划</p>
                  <Link to="/time?tab=plans" className="text-sm text-brand-700 hover:underline dark:text-brand-300">写一条计划 →</Link>
                </div>
              ) : (
              <>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
                <div><div className="text-xs text-gray-400">计划时长</div><div className="mt-1 font-semibold tabular-nums">{formatDuration(adherence.plannedMs)}</div></div>
                <div><div className="text-xs text-gray-400">计划内实际</div><div className="mt-1 font-semibold tabular-nums">{formatDuration(adherence.actualMs)}</div></div>
                {/* 0% 与「无计划」必须可区分：有计划但 0% 时写明「未开始」，不甩一个光秃秃的 0% */}
                <div><div className="text-xs text-gray-400">覆盖率</div><div className="mt-1 font-semibold tabular-nums">{adherence.coverageRate > 0 ? `${Math.round(adherence.coverageRate * 100)}%` : '0%（未开始）'}</div></div>
                <div><div className="text-xs text-gray-400">未安排投入</div><div className="mt-1 font-semibold tabular-nums">{formatDuration(adherence.unplannedMs)}</div></div>
              </div>
              <div className="mt-5 border-t border-gray-200 pt-4 text-xs text-gray-500 tabular-nums dark:border-gray-800">
                <div className="flex justify-between py-1"><span>按时开始</span><span>{Math.round(adherence.onTimeRate * 100)}%</span></div>
                <div className="flex justify-between py-1"><span>漏执行</span><span>{adherence.missedCount}</span></div>
                <div className="flex justify-between py-1"><span>已确认</span><span>{adherence.confirmedCount}</span></div>
                <div className="flex justify-between py-1"><span>已跳过 / 已推迟</span><span>{adherence.skippedCount} / {adherence.deferredCount}</span></div>
              </div>
              </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
