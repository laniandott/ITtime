import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GripVertical } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../components/PageHeader'
import type { Goal, Todo } from '../types'

const periods: Record<string, string> = { workday: '工作日', daily: '每日', weekly: '每周', monthly: '每月', once: '一次性', custom: '自定义周期' }
const weekDayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export default function GoalsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [completed, setCompleted] = useState<Todo[]>([])
  const [error, setError] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const [rules, todos] = await Promise.all([api.goals.list(), api.todos.list({ status: 'done' })])
      setGoals(rules)
      setCompleted(todos)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void load()
    window.addEventListener('ittime-data-changed', load)
    return () => window.removeEventListener('ittime-data-changed', load)
  }, [load])

  const dropGoal = async (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return
    const from = goals.findIndex((goal) => goal.id === sourceId)
    const to = goals.findIndex((goal) => goal.id === targetId)
    if (from < 0 || to < 0) return
    const reordered = [...goals]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setGoals(reordered)
    setDraggedId(null)
    try {
      await Promise.all(reordered.map((goal, index) => api.goals.update(goal.id, { sortOrder: index * 10 })))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存习惯顺序失败')
      await load()
    }
  }

  return <div className="workspace-page habits-page space-y-5">
    {!embedded && <PageHeader title="习惯结果" description="周期性目标与完成记录" actions={<Link to="/tasks?tab=habits" className="text-sm text-brand">管理标签规则</Link>} />}
    {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
    <div className="habits-layout items-stretch">
    <section className="page-card p-4 sm:p-5"><h2 className="text-sm font-semibold text-gray-500 mb-3">当前周期</h2>{goals.map(goal => {
      const current = goal.current ?? 0; const unit = goal.kind === 'activity' ? '项' : goal.type === 'count' ? '次' : '分钟'
      const percent = Math.min(100, goal.target ? current / goal.target * 100 : 0)
      const legacyDefaultTitle = goal.kind === 'activity' && goal.tag && goal.title === `每日${goal.tag.name}`
      const displayTitle = legacyDefaultTitle
        ? `${goal.period === 'once' ? '一次性' : goal.period === 'workday' ? '工作日' : goal.period === 'weekly' ? `每${weekDayNames[goal.weekDay ?? 0]}` : goal.period === 'monthly' ? '每月' : '每日'}${goal.tag?.name ?? ''}`
        : goal.title
      return <article
        key={goal.id}
        draggable
        onDragStart={(event) => { event.dataTransfer.setData('text/plain', goal.id); event.dataTransfer.effectAllowed = 'move'; setDraggedId(goal.id) }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); void dropGoal(event.dataTransfer.getData('text/plain'), goal.id) }}
        onDragEnd={() => setDraggedId(null)}
        className={`habit-result-card flex gap-3 border-b border-gray-200 py-4 transition-opacity dark:border-gray-800 ${draggedId === goal.id ? 'opacity-40' : ''}`}
      >
        <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-gray-400 active:cursor-grabbing" aria-label="拖动排序" />
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-4">
            <div className="min-w-0"><strong>{displayTitle}</strong><p className="mt-1 text-xs text-gray-500">{goal.tag?.name} · {periods[goal.period]}{goal.period === 'weekly' && goal.weekDay !== null ? `（${weekDayNames[goal.weekDay]}）` : ''} · {goal.kind === 'activity' ? '活动目标' : goal.type === 'count' ? '计次目标，不累计时长' : '时长目标'}</p></div>
            <span className={`shrink-0 text-sm ${current >= goal.target ? 'text-emerald-600' : 'text-gray-500'}`}>{current} / {goal.target} {unit}</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.title}完成进度`}>
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300 dark:bg-brand-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </article>
    })}{goals.length === 0 && <p className="py-8 text-gray-400 text-sm">标签中还没有设置目标。</p>}</section>
    <section className="habits-history page-card min-w-0 max-h-[calc(100vh-10rem)] overflow-y-auto p-4 sm:p-5"><h2 className="text-sm font-semibold text-gray-500 mb-3">已完成活动</h2>{completed.map(todo => <div key={todo.id} className="py-3 border-b border-gray-200 last:border-0 dark:border-gray-800 flex justify-between gap-4"><span className="min-w-0">{todo.title}</span><time className="shrink-0 text-xs text-gray-500">{todo.completedAt ? new Date(todo.completedAt).toLocaleDateString('zh-CN') : '已完成'}</time></div>)}{!completed.length && <p className="text-sm text-gray-400 py-6">暂无已完成活动。</p>}</section>
    </div>
  </div>
}
