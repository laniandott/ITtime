import { useEffect, useState } from 'react'
import { api } from '../api'
import { formatDuration } from '../store'
import { elapsed, periodBounds } from '../localStats'
import { planAdherence } from '../planStats'
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
  const adherence = planAdherence(plans, entries, [start, end])
  return <div className="space-y-6"><div className="flex justify-between items-center gap-4"><h1 className="text-2xl font-semibold">投入统计</h1><select aria-label="统计周期" className="input !w-auto" value={range} onChange={event => setRange(event.target.value)}><option value="daily">今日</option><option value="weekly">本周</option><option value="monthly">本月</option></select></div>{error && <p role="alert" className="text-red-500">{error}</p>}<div className="stats-overview"><span>已保存的项目时长</span><strong>{formatDuration(total)}</strong><small>同时进行的项目分别累计</small></div><section className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-sm">计划遵循</h2><span className="text-xs text-gray-400">计划不计入投入时长</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><div className="text-xs text-gray-400">计划时长</div><div className="mt-1 font-semibold">{formatDuration(adherence.plannedMs)}</div></div><div><div className="text-xs text-gray-400">计划内实际</div><div className="mt-1 font-semibold">{formatDuration(adherence.actualMs)}</div></div><div><div className="text-xs text-gray-400">覆盖率</div><div className="mt-1 font-semibold">{Math.round(adherence.coverageRate * 100)}%</div></div><div><div className="text-xs text-gray-400">未安排投入</div><div className="mt-1 font-semibold">{formatDuration(adherence.unplannedMs)}</div></div></div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500"><span>按时开始 {Math.round(adherence.onTimeRate * 100)}%</span><span>漏执行 {adherence.missedCount}</span><span>已确认 {adherence.confirmedCount}</span><span>已跳过 {adherence.skippedCount}</span><span>已推迟 {adherence.deferredCount}</span></div></section><section><h2 className="font-semibold text-sm mb-4">标签投入排行</h2>{ranking.map(row => <div key={row.name} className="py-4 border-b border-gray-200 dark:border-gray-800"><div className="flex justify-between text-sm"><span>{row.name}</span><strong>{formatDuration(row.ms)}</strong></div><div className="stats-track mt-3"><div style={{ width: `${total ? row.ms / total * 100 : 0}%`, backgroundColor: row.color }} /></div></div>)}{!ranking.length && <p className="text-sm text-gray-400 py-8">此周期暂无已保存的计时记录。</p>}</section></div>
}
