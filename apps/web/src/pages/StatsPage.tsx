import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { api } from '../api'
import { formatDuration } from '../store'
import { elapsed, periodBounds } from '../localStats'
import { planAdherence } from '../planStats'
import { PageHeader } from '../components/PageHeader'
import type { TimeEntry, PlanBlock } from '../types'

export default function StatsPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [plans, setPlans] = useState<PlanBlock[]>([])
  const [range, setRange] = useState('weekly')
  const [error, setError] = useState('')
  useEffect(() => {
    const load = () => {
      Promise.all([api.timer.list(), api.plans.list()])
        .then(([nextEntries, nextPlans]) => { setEntries(nextEntries); setPlans(nextPlans); setError('') })
        .catch(e => setError(String(e)))
    }
    void load()
    window.addEventListener('ittime-data-changed', load)
    return () => window.removeEventListener('ittime-data-changed', load)
  }, [])
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
  return (
    <div className="workspace-page stats-page space-y-5">
      <PageHeader title="投入统计" description="时间投入与计划遵循情况" actions={<select aria-label="统计周期" className="input !w-auto" value={range} onChange={event => setRange(event.target.value)}><option value="daily">今日</option><option value="weekly">本周</option><option value="monthly">本月</option></select>} />
      {error && <p role="alert" className="text-red-500">{error}</p>}
      <div className="stats-layout items-stretch">
        <div className="stats-primary min-w-0 space-y-4">
          <div className="stats-overview"><span>已保存的项目时长</span><strong>{formatDuration(total)}</strong><small>同时进行的项目分别累计</small></div>
          <section className="page-card p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">近 14 天趋势</h2>
              <span className="text-xs text-gray-400">每日实际投入</span>
            </div>
            {hasTrend ? (
              <div className="-ml-2 h-[168px] w-[calc(100%+1rem)]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={2} />
                    <Tooltip
                      cursor={{ fill: 'rgba(13, 148, 136, 0.08)' }}
                      formatter={(value) => [formatDuration(Number(value)), '投入']}
                      labelStyle={{ color: '#374151', fontWeight: 600 }}
                      contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 6px 20px rgba(16,24,40,.08)', fontSize: 12, padding: '6px 10px' }}
                    />
                    <Bar dataKey="ms" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[120px] flex-col items-center justify-center gap-1 rounded-lg bg-gray-50 text-center dark:bg-gray-800/40">
                <p className="text-sm text-gray-400">还没有计时记录</p>
                <p className="text-xs text-gray-400">去「打卡」页开始第一条记录吧</p>
              </div>
            )}
          </section>
          <section className="page-card p-5">
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
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="h-full rounded-full bg-brand-600 dark:bg-brand-500" style={{ width: `${topMs ? row.ms / topMs * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {!ranking.length && <p className="text-sm text-gray-400 py-8">此周期暂无已保存的计时记录。</p>}
          </section>
        </div>
        <section className="page-card p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-sm">计划遵循</h2><span className="text-xs text-gray-400">计划不计入投入时长</span></div>
          {adherence.plannedMs === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-sm text-gray-400">当前周期还没有安排计划</p>
              <a href="/plans" className="text-sm text-brand-700 hover:underline dark:text-brand-300">去计划页安排 →</a>
            </div>
          ) : (
          <>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
            <div><div className="text-xs text-gray-400">计划时长</div><div className="mt-1 font-semibold">{formatDuration(adherence.plannedMs)}</div></div>
            <div><div className="text-xs text-gray-400">计划内实际</div><div className="mt-1 font-semibold">{formatDuration(adherence.actualMs)}</div></div>
            <div><div className="text-xs text-gray-400">覆盖率</div><div className="mt-1 font-semibold">{Math.round(adherence.coverageRate * 100)}%</div></div>
            <div><div className="text-xs text-gray-400">未安排投入</div><div className="mt-1 font-semibold">{formatDuration(adherence.unplannedMs)}</div></div>
          </div>
          <div className="mt-5 border-t border-gray-200 pt-4 text-xs text-gray-500 dark:border-gray-800">
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
  )
}
