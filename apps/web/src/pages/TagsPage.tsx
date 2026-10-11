import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import type { Category, Tag, Goal } from '../types'
import { GripVertical } from 'lucide-react'

const COLORS = ['#6d5efc', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b']

export default function TagsPage() {
  const { categories, tags, loadAll } = useStore()
  const [showCatForm, setShowCatForm] = useState(false)
  const [showTagForm, setShowTagForm] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [editingGoal, setEditingGoal] = useState<{ goal: Goal | null; tag: Tag } | null>(null)
  const [error, setError] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const orderedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const orderedTags = [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const persistOrder = async <T extends { id: string }>(items: T[], update: (id: string, sortOrder: number) => Promise<unknown>) => {
    try {
      await Promise.all(items.map((item, order) => update(item.id, order * 10)))
      await loadAll()
    } catch (e) { setError(e instanceof Error ? e.message : '调整顺序失败') }
  }

  const dropInOrder = <T extends { id: string }>(items: T[], sourceId: string, targetId: string, update: (id: string, sortOrder: number) => Promise<unknown>) => {
    if (!sourceId || sourceId === targetId) return
    const from = items.findIndex((item) => item.id === sourceId)
    const to = items.findIndex((item) => item.id === targetId)
    if (from < 0 || to < 0) return
    const reordered = [...items]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setDraggedId(null)
    void persistOrder(reordered, update)
  }

  const loadGoals = async () => {
    try {
      setGoals(await api.goals.list())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载目标失败')
    }
  }
  useEffect(() => { loadGoals() }, [tags])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">标签与分类</h1>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      {/* 分类管理 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">分类</h2>
          <button
            onClick={() => { setEditingCat(null); setShowCatForm(true) }}
            className="text-sm text-brand hover:underline"
          >
            + 新建分类
          </button>
        </div>
        <div className="space-y-2">
          {categories.length === 0 && (
            <div className="text-sm text-gray-400 py-2">还没有分类，创建一个（如：日常、工作、宝宝）</div>
          )}
          {orderedCategories.map((cat) => (
            <div
              key={cat.id}
              draggable
              onDragStart={(event) => { event.dataTransfer.setData('text/plain', cat.id); event.dataTransfer.effectAllowed = 'move'; setDraggedId(cat.id) }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); dropInOrder(orderedCategories, event.dataTransfer.getData('text/plain'), cat.id, (id, sortOrder) => api.categories.update(id, { sortOrder })) }}
              onDragEnd={() => setDraggedId(null)}
              className={`flex items-center justify-between rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-4 py-2.5 ${draggedId === cat.id ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 cursor-grab text-gray-400 active:cursor-grabbing" aria-label="拖动排序" />
                <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                <span className="font-medium">{cat.name}</span>
                <span className="text-xs text-gray-400">{cat._count?.tags ?? 0} 个标签</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditingCat(cat); setShowCatForm(true) }}
                  className="text-sm text-gray-400 hover:text-brand"
                >
                  编辑
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`删除分类「${cat.name}」？标签不会被删除，只是变为未分类。`)) return
                    try {
                      await api.categories.remove(cat.id)
                      await loadAll()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : '删除分类失败')
                    }
                  }}
                  className="text-sm text-gray-400 hover:text-red-500"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 标签管理 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">标签</h2>
          <button
            onClick={() => { setEditingTag(null); setShowTagForm(true) }}
            className="text-sm text-brand hover:underline"
          >
            + 新建标签
          </button>
        </div>
        <div className="space-y-2">
          {orderedTags.map((tag) => {
            return (
            <div
              key={tag.id}
              draggable
              onDragStart={(event) => { event.dataTransfer.setData('text/plain', tag.id); event.dataTransfer.effectAllowed = 'move'; setDraggedId(tag.id) }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); dropInOrder(orderedTags, event.dataTransfer.getData('text/plain'), tag.id, (id, sortOrder) => api.tags.update(id, { sortOrder })) }}
              onDragEnd={() => setDraggedId(null)}
              className={`flex items-center justify-between rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-4 py-2.5 ${draggedId === tag.id ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 cursor-grab text-gray-400 active:cursor-grabbing" aria-label="拖动排序" />
                <span className="w-3 h-3 rounded-full" style={{ background: tag.color }} />
                <span className="font-medium">
                  {tag.parentId ? '↳ ' : ''}{tag.icon ? `${tag.icon} ` : ''}{tag.name}
                </span>
                {tag.parentId && (
                  <span className="text-xs text-gray-400">
                    上级：{tags.find((parent) => parent.id === tag.parentId)?.name ?? '未知'}
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: tag.category?.color ?? '#e5e7eb', color: tag.category ? '#fff' : '#6b7280' }}
                >
                  {tag.category?.name ?? '未分类'}
                </span>
                {tag.trackType === 'count' && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                    次数
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {goals.filter((g) => g.tagId === tag.id).length === 0 && (
                  <button
                    onClick={() => setEditingGoal({ goal: null, tag })}
                    className="text-sm text-gray-400 hover:text-green-500"
                  >
                    + 目标
                  </button>
                )}
                <button
                  onClick={() => { setEditingTag(tag); setShowTagForm(true) }}
                  className="text-sm text-gray-400 hover:text-brand"
                >
                  编辑
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`删除标签「${tag.name}」？`)) return
                    try {
                      await api.tags.remove(tag.id)
                      loadAll()
                    } catch (e) {
                      alert((e as Error).message)
                    }
                  }}
                  className="text-sm text-gray-400 hover:text-red-500"
                >
                  删除
                </button>
              </div>
            </div>
            )
          })}
        </div>
      </section>

      {/* 目标管理 */}
      {goals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">目标 / 习惯</h2>
          </div>
          <div className="space-y-2">
            {goals.map((goal) => {
              const tag = tags.find((t) => t.id === goal.tagId)
              return (
                <div key={goal.id} className="flex items-center justify-between rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag?.color ?? '#999' }} />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{goal.title}</div>
                      <div className="text-xs text-gray-400">
                        {goal.kind === 'activity'
                          ? goal.period === 'once'
                            ? `一次性活动 · ${goal.deadlineAt ? formatGoalDeadline(goal.deadlineAt) : '未设置截止时间'}`
                            : `${goal.period === 'workday' ? '工作日' : goal.period === 'daily' ? '每日' : goal.period === 'weekly' ? '每周' : '每月'}活动 · ${goal.period === 'workday' ? `工作日 ${goal.deadlineTime} 前` : goal.period === 'daily' ? `每天 ${goal.deadlineTime} 前` : goal.period === 'weekly' ? `每周日 ${goal.deadlineTime} 前` : `每月 ${goal.deadlineDay} 日 ${goal.deadlineTime} 前`}`
                          : `${goal.type === 'count' ? '次数' : '时长(分)'} · ${goal.period === 'workday' ? '每工作日' : goal.period === 'daily' ? '每日' : goal.period === 'weekly' ? '每周' : goal.period === 'monthly' ? '每月' : `每${goal.periodDays}天`} · 目标 ${goal.target}${goal.type === 'count' ? '次' : '分钟'}`}
                        {goal.current !== undefined && (
                          <span className={goal.current >= goal.target ? ' text-green-500 ml-1' : ' ml-1'}>
                            {' · '}已完成 {goal.current}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => tag && setEditingGoal({ goal, tag })}
                      className="text-sm text-gray-400 hover:text-brand"
                    >
                      编辑
                    </button>
                    <button
                  onClick={async () => {
                    if (!confirm(`删除目标「${goal.title}」？`)) return
                        try {
                          await api.goals.remove(goal.id)
                          await loadGoals()
                        } catch (e) {
                          setError(e instanceof Error ? e.message : '删除目标失败')
                        }
                      }}
                      className="text-sm text-gray-400 hover:text-red-500"
                    >
                      删除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}


      {/* 分类表单弹层 */}
      {showCatForm && (
        <CategoryForm
          category={editingCat}
          onClose={() => setShowCatForm(false)}
          onSaved={() => { setShowCatForm(false); loadAll() }}
        />
      )}
      {/* 标签表单弹层 */}
      {showTagForm && (
        <TagForm
          tag={editingTag}
          categories={categories}
          tags={tags}
          onClose={() => setShowTagForm(false)}
          onSaved={() => { setShowTagForm(false); loadAll() }}
        />
      )}
      {/* 目标编辑弹窗 */}
      {editingGoal && (
        <GoalForm
          goal={editingGoal.goal}
          tag={editingGoal.tag}
          onClose={() => setEditingGoal(null)}
          onSaved={() => { setEditingGoal(null); loadGoals() }}
        />
      )}
    </div>
  )
}

function CategoryForm({ category, onClose, onSaved }: {
  category: Category | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? COLORS[0])
  const [icon, setIcon] = useState(category?.icon ?? '')
  const [error, setError] = useState('')

  const save = async () => {
    if (!name.trim()) {
      setError('名称不能为空')
      return
    }
    setError('')
    try {
      if (category) {
        await api.categories.update(category.id, { name: name.trim(), color, icon: icon || null })
      } else {
        await api.categories.create({ name: name.trim(), color, icon: icon || null })
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存分类失败')
    }
  }

  return (
    <Modal onClose={onClose} title={category ? '编辑分类' : '新建分类'}>
      <div className="space-y-4">
        <Field label="名称">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：日常、工作、宝宝"
            className="input" autoFocus />
        </Field>
        <Field label="图标（可选）">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="emoji 如：🏠"
            className="input" />
        </Field>
        <Field label="颜色">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
      {error && <div className="mt-4 text-sm text-red-500">{error}</div>}
      <FormActions onCancel={onClose} onSave={save} />
    </Modal>
  )
}

function TagForm({ tag, categories, tags, onClose, onSaved }: {
  tag: Tag | null
  categories: Category[]
  tags: Tag[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState(tag?.color ?? COLORS[0])
  const [icon, setIcon] = useState(tag?.icon ?? '')
  const [categoryId, setCategoryId] = useState(tag?.categoryId ?? categories[0]?.id ?? '')
  const [parentId, setParentId] = useState(tag?.parentId ?? '')
  const [trackType, setTrackType] = useState<'time' | 'count'>(tag?.trackType ?? 'time')
  const [mode, setMode] = useState<'chaos' | 'ordered'>(tag?.mode ?? 'chaos')
  const [error, setError] = useState('')

  const save = async () => {
    if (!name.trim()) {
      setError('名称不能为空')
      return
    }
    setError('')
    try {
      if (tag) {
        await api.tags.update(tag.id, { name: name.trim(), color, icon: icon || null, categoryId: categoryId || null, parentId: parentId || null, trackType, mode })
      } else {
        await api.tags.create({ name: name.trim(), color, icon: icon || null, categoryId: categoryId || null, parentId: parentId || null, trackType, mode })
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存标签失败')
    }
  }

  return (
    <Modal onClose={onClose} title={tag ? '编辑标签' : '新建标签'}>
      <div className="space-y-4">
        <Field label="名称">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：吃饭、编码、陪玩"
            className="input" autoFocus />
        </Field>
        <Field label="所属分类">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
            <option value="">未分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="上级标签">
          <select
            value={parentId}
            onChange={(e) => {
              const nextParentId = e.target.value
              setParentId(nextParentId)
              const parent = tags.find((item) => item.id === nextParentId)
              if (parent?.categoryId) setCategoryId(parent.categoryId)
            }}
            className="input"
          >
            <option value="">无上级（一级标签）</option>
            {tags
              .filter((item) => !item.parentId && item.id !== tag?.id)
              .map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
          </select>
        </Field>
        <Field label="记录方式">
          <div className="flex gap-2">
            <button
              onClick={() => setTrackType('time')}
              className={`px-4 py-2 rounded-lg text-sm border ${trackType === 'time' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
            >
              ⏱ 时长计时
            </button>
            <button
              onClick={() => setTrackType('count')}
              className={`px-4 py-2 rounded-lg text-sm border ${trackType === 'count' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
            >
              🔢 次数打卡
            </button>
          </div>
        </Field>
        {trackType === 'time' && (
          <Field label="专注模式">
            <div className="flex gap-2">
              <button
                onClick={() => setMode('chaos')}
                className={`px-4 py-2 rounded-lg text-sm border ${mode === 'chaos' ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
              >
                🌀 混沌
              </button>
              <button
                onClick={() => setMode('ordered')}
                className={`px-4 py-2 rounded-lg text-sm border ${mode === 'ordered' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
              >
                📝 有序
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {mode === 'chaos' ? '混沌：停止后无法续接，适合随性活动' : '有序：可暂存后续接，适合深度工作'}
            </div>
          </Field>
        )}
        <Field label="图标（可选）">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="emoji" className="input" />
        </Field>
        <Field label="颜色">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
      {error && <div className="mt-4 text-sm text-red-500">{error}</div>}
      <FormActions onCancel={onClose} onSave={save} />
    </Modal>
  )
}

// 取色组件：原生取色板 + hex 输入 + 预设快捷色
const PRESET_COLORS = ['#6d5efc', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b']

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* 原生取色板 */}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-700 cursor-pointer bg-transparent p-0"
        />
        {/* 当前色块预览 + hex 输入 */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input !w-32 font-mono text-sm"
          placeholder="#6d5efc"
        />
      </div>
      {/* 预设快捷色 */}
      <div className="flex gap-1.5 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${value.toLowerCase() === c ? 'ring-2 ring-offset-1 ring-gray-400 border-transparent' : 'border-gray-200 dark:border-gray-700'}`}
            style={{ background: c }}
            title={c}
          />
        ))}
      </div>
    </div>
  )
}

// 通用组件
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function FormActions({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2 mt-6">
      <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
        取消
      </button>
      <button onClick={onSave} className="px-4 py-2 rounded-lg text-sm bg-brand text-white hover:bg-brand-600">
        保存
      </button>
    </div>
  )
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatGoalDeadline(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 目标编辑弹窗
function GoalForm({ goal, tag, onClose, onSaved }: {
  goal: Goal | null
  tag: Tag
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(goal?.title ?? `每日${tag.name}`)
  const [type, setType] = useState<'count' | 'time'>(goal?.type ?? (tag.trackType === 'count' ? 'count' : 'time'))
  const [target, setTarget] = useState(goal?.target ?? 1)
  const [period, setPeriod] = useState<'once' | 'workday' | 'daily' | 'weekly' | 'monthly' | 'custom'>(goal?.period ?? 'daily')
  const [periodDays, setPeriodDays] = useState(goal?.periodDays ?? 7)
  const [kind, setKind] = useState<'tracking' | 'activity'>(goal?.kind ?? (tag.parentId ? 'activity' : 'tracking'))
  const [deadlineTime, setDeadlineTime] = useState(goal?.deadlineTime ?? (tag.parentId ? '08:00' : ''))
  const [deadlineDay, setDeadlineDay] = useState(goal?.deadlineDay ?? 15)
  const [deadlineAt, setDeadlineAt] = useState(goal?.deadlineAt ? toDateTimeLocal(goal.deadlineAt) : '')
  const [error, setError] = useState('')

  const save = async () => {
    if (!title.trim()) {
      setError('目标名称不能为空')
      return
    }
    if (kind === 'tracking' && (!Number.isInteger(target) || target < 1)) {
      setError('目标值必须是大于 0 的整数')
      return
    }
    if (kind === 'tracking' && period === 'custom' && (!Number.isInteger(periodDays) || periodDays < 1)) {
      setError('自定义周期天数必须是大于 0 的整数')
      return
    }
    if (kind === 'activity') {
      if (period !== 'once' && period !== 'workday' && period !== 'daily' && period !== 'weekly' && period !== 'monthly') {
        setError('活动目标只支持一次性、每日、每周或每月')
        return
      }
      if (period === 'once' && !deadlineAt) {
        setError('请设置截止日期和时间')
        return
      }
      if (period !== 'once' && !deadlineTime) {
        setError('请设置截止时间')
        return
      }
      if (period === 'monthly' && (!Number.isInteger(deadlineDay) || deadlineDay < 1 || deadlineDay > 31)) {
        setError('每月截止日必须是 1 到 31')
        return
      }
    }
    const data = {
      title: title.trim(),
      kind,
      type: kind === 'activity' ? 'count' : type,
      target: kind === 'activity' ? 1 : target,
      period,
      periodDays: kind === 'tracking' && period === 'custom' ? periodDays : null,
      deadlineTime: kind === 'activity' && period !== 'once' ? deadlineTime : null,
      deadlineDay: kind === 'activity' && period === 'monthly' ? deadlineDay : null,
      deadlineAt: kind === 'activity' && period === 'once' ? new Date(deadlineAt).toISOString() : null,
    }
    setError('')
    try {
      if (goal) {
        await api.goals.update(goal.id, data)
      } else {
        await api.goals.create({ tagId: tag.id, ...data })
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存目标失败')
    }
  }

  return (
    <Modal onClose={onClose} title={goal ? '编辑目标' : `为目标标签：${tag.name}`}>
      <div className="space-y-4">
        <Field label="目标名称">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：每天喝水8杯"
            className="input" autoFocus />
        </Field>
        <Field label="目标用途">
          <div className="flex gap-2">
            <button
              onClick={() => setKind('tracking')}
              className={`px-4 py-2 rounded-lg text-sm border ${kind === 'tracking' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
            >
              统计目标
            </button>
            <button
              onClick={() => { setKind('activity'); setType('count'); setTarget(1) }}
              className={`px-4 py-2 rounded-lg text-sm border ${kind === 'activity' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
            >
              活动目标
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">统计目标按打卡记录累计；活动目标会在待办中生成可勾选的任务。</p>
        </Field>
        {kind === 'tracking' && <Field label="目标类型">
          <div className="flex gap-2">
            <button
              onClick={() => setType('count')}
              className={`px-4 py-2 rounded-lg text-sm border ${type === 'count' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
            >
              🔢 次数
            </button>
            <button
              onClick={() => setType('time')}
              className={`px-4 py-2 rounded-lg text-sm border ${type === 'time' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
            >
              ⏱ 时长(分钟)
            </button>
          </div>
        </Field>}
        {kind === 'tracking' && <Field label={`目标${type === 'count' ? '次数' : '分钟数'}`}>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="input"
          />
        </Field>}
        <Field label={kind === 'activity' ? '重复周期' : '统计周期'}>
          <select value={period} onChange={(e) => setPeriod(e.target.value as 'once' | 'workday' | 'daily' | 'weekly' | 'monthly' | 'custom')} className="input">
            {kind === 'activity' && <option value="once">一次性</option>}
            <option value="workday">工作日</option>
            <option value="daily">每日</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
            {kind === 'tracking' && <option value="custom">自定义天数</option>}
          </select>
        </Field>
        {kind === 'activity' && (
          <div className="flex gap-4">
            {period === 'once' ? (
              <Field label="截止日期和时间">
                <input type="datetime-local" value={deadlineAt} onChange={(e) => setDeadlineAt(e.target.value)} className="input" />
              </Field>
            ) : period === 'monthly' ? (
              <Field label="每月截止日">
                <input type="number" min={1} max={31} value={deadlineDay} onChange={(e) => setDeadlineDay(Number(e.target.value))} className="input" />
              </Field>
            ) : null}
            {period !== 'once' && (
              <Field label="截止时间">
                <input type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} className="input" />
                {period === 'weekly' && <p className="mt-1 text-xs text-gray-400">每周日截止</p>}
              </Field>
            )}
          </div>
        )}
        {kind === 'tracking' && period === 'custom' && (
          <Field label="周期天数">
            <input
              type="number"
              min={1}
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="input"
            />
          </Field>
        )}
      </div>
      {error && <div className="mt-4 text-sm text-red-500">{error}</div>}
      <FormActions onCancel={onClose} onSave={save} />
    </Modal>
  )
}
