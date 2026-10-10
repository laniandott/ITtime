import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Goal, Todo } from '../types'

const periods: Record<string, string> = { workday: '工作日', daily: '每日', weekly: '每周', monthly: '每月', once: '一次性', custom: '自定义周期' }
export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [completed, setCompleted] = useState<Todo[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const load = async () => { try { const [rules, todos] = await Promise.all([api.goals.list(), api.todos.list({ status: 'done' })]); setGoals(rules); setCompleted(todos); setError('') } catch (e) { setError(String(e)) } }
    void load(); window.addEventListener('ittime-data-changed', load)
    return () => window.removeEventListener('ittime-data-changed', load)
  }, [])
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">习惯结果</h1><Link to="/settings" className="text-sm text-brand">管理标签规则</Link></div>
    {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
    <section><h2 className="text-sm font-semibold text-gray-500 mb-3">当前周期</h2>{goals.map(goal => {
      const current = goal.current ?? 0; const unit = goal.kind === 'activity' ? '项' : goal.type === 'count' ? '次' : '分钟'
      const percent = Math.min(100, goal.target ? current / goal.target * 100 : 0)
      return <article key={goal.id} className="habit-result-card py-4 border-b border-gray-200 dark:border-gray-800"><div className="flex justify-between gap-4"><div><strong>{goal.title}</strong><p className="text-xs text-gray-500 mt-1">{goal.tag?.name} · {periods[goal.period]} · {goal.kind === 'activity' ? '活动目标' : '统计目标'}</p></div><span className={current >= goal.target ? 'text-emerald-600 text-sm' : 'text-gray-500 text-sm'}>{current} / {goal.target} {unit}</span></div><progress className="habit-result-progress mt-3" style={{ accentColor: goal.tag?.color ?? '#0f766e' }} value={percent} max="100" aria-label={`${goal.title}完成进度`} /></article>
    })}{goals.length === 0 && <p className="py-8 text-gray-400 text-sm">标签中还没有设置目标。</p>}</section>
    <section><h2 className="text-sm font-semibold text-gray-500 mb-3">已完成活动</h2>{completed.map(todo => <div key={todo.id} className="py-3 border-b border-gray-200 dark:border-gray-800 flex justify-between gap-4"><span>{todo.title}</span><time className="text-xs text-gray-500">{todo.completedAt ? new Date(todo.completedAt).toLocaleDateString('zh-CN') : '已完成'}</time></div>)}{!completed.length && <p className="text-sm text-gray-400 py-6">暂无已完成活动。</p>}</section>
  </div>
}
