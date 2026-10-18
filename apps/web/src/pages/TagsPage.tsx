import { useState, useEffect, useId } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { PageHeader } from '../components/PageHeader'
import { api } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { announceUrgent } from '../announce'
import type { Category, Tag, Goal } from '../types'
import { ChevronDown, ChevronRight, GripVertical, Settings } from 'lucide-react'

const COLORS = ['#0f766e', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b']
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function defaultGoalTitle(tagName: string, kind: 'tracking' | 'activity', period: string, weekDay: number, periodDays: number): string {
  if (kind === 'activity') {
    const prefix = period === 'once' ? '一次性' : period === 'workday' ? '工作日' : period === 'weekly' ? `每${WEEKDAYS[weekDay]}` : period === 'monthly' ? '每月' : '每日'
    return `${prefix}${tagName}`
  }
  const prefix = period === 'workday' ? '工作日' : period === 'weekly' ? `每${WEEKDAYS[weekDay]}` : period === 'monthly' ? '每月' : period === 'custom' ? `每${periodDays}天` : '每日'
  return `${prefix}${tagName}`
}

export default function TagsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { categories, tags, loadAll } = useStore()
  const [showCatForm, setShowCatForm] = useState(false)
  const [showTagForm, setShowTagForm] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [editingGoal, setEditingGoal] = useState<{ goal: Goal | null; tag: Tag } | null>(null)
  const [error, setError] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [draggedGoalId, setDraggedGoalId] = useState<string | null>(null)
  const [collapsedTagIds, setCollapsedTagIds] = useState<Set<string>>(() => new Set())
  const [pendingRemoveCategory, setPendingRemoveCategory] = useState<Category | null>(null)
  const [pendingRemoveTag, setPendingRemoveTag] = useState<Tag | null>(null)
  const [pendingRemoveGoal, setPendingRemoveGoal] = useState<Goal | null>(null)

  const orderedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const orderedTags = [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const childrenByParent = new Map<string, Tag[]>()
  for (const tag of orderedTags) {
    if (!tag.parentId) continue
    const children = childrenByParent.get(tag.parentId) ?? []
    children.push(tag)
    childrenByParent.set(tag.parentId, children)
  }
  const rootTags = orderedTags.filter((tag) => !tag.parentId || !tags.some((parent) => parent.id === tag.parentId))
  const visibleTags = rootTags.flatMap((tag) => [tag, ...(collapsedTagIds.has(tag.id) ? [] : (childrenByParent.get(tag.id) ?? []))])
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

  const dropGoalInOrder = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return
    const from = goals.findIndex((goal) => goal.id === sourceId)
    const to = goals.findIndex((goal) => goal.id === targetId)
    if (from < 0 || to < 0) return
    const reordered = [...goals]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setGoals(reordered)
    setDraggedGoalId(null)
    void Promise.all(reordered.map((goal, index) => api.goals.update(goal.id, { sortOrder: index * 10 })))
      .then(loadGoals)
      .catch((e) => { setError(e instanceof Error ? e.message : '调整目标顺序失败'); void loadGoals() })
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

  const performRemoveCategory = async (cat: Category) => {
    setPendingRemoveCategory(null)
    try {
      await api.categories.remove(cat.id)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除分类失败')
    }
  }

  const performRemoveTag = async (tag: Tag) => {
    setPendingRemoveTag(null)
    try {
      await api.tags.remove(tag.id)
      loadAll()
    } catch (e) {
      const message = (e as Error).message
      setError(message)
      announceUrgent(message)
    }
  }

  const performRemoveGoal = async (goal: Goal) => {
    setPendingRemoveGoal(null)
    try {
      await api.goals.remove(goal.id)
      await loadGoals()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除目标失败')
    }
  }

  return (
    <div className="workspace-page tags-page space-y-6">
      {/* 移动端底栏不放设置，这里是移动端唯一设置入口；桌面端侧栏底部也有同一个链接。
          触达区至少 44px 高：纯文字链在触屏上约 20px，密集点击时容易误触。 */}
      {!embedded && <PageHeader title="标签与分类" description="管理标签体系、颜色与分类归属" actions={<Link to="/settings" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"><Settings className="h-4 w-4" aria-hidden="true" />设置</Link>} />}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(260px,.72fr)_minmax(0,1.28fr)]">
      {/* 分类管理 */}
      <section className="page-card min-w-0 space-y-3 bg-slate-50 p-4 sm:p-5 xl:sticky xl:top-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">分类</h2>
          <button
            onClick={() => { setEditingCat(null); setShowCatForm(true) }}
            className="text-sm text-brand hover:underline"
          >
            + 新建分类
          </button>
        </div>
        <div className="max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto pr-1">
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
              className={`flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-4 py-2.5 ${draggedId === cat.id ? 'opacity-40' : ''}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400 active:cursor-grabbing" aria-label="拖动排序" />
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cat.color }} />
                <span className="shrink-0 whitespace-nowrap font-medium">{cat.name}</span>
                <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">{cat._count?.tags ?? 0} 个标签</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                <button
                  onClick={() => { setEditingCat(cat); setShowCatForm(true) }}
                  className="text-sm text-gray-400 hover:text-brand"
                >
                  编辑
                </button>
                <button
                  onClick={() => setPendingRemoveCategory(cat)}
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
      <section className="page-card min-w-0 space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">标签</h2>
          <button
            onClick={() => { setEditingTag(null); setShowTagForm(true) }}
            className="text-sm text-brand hover:underline"
          >
            + 新建标签
          </button>
        </div>
        <div className="tag-rows">
          {visibleTags.map((tag) => {
            const childTags = childrenByParent.get(tag.id) ?? []
            const isChild = Boolean(tag.parentId)
            const parent = tag.parentId ? tags.find((item) => item.id === tag.parentId) : null
            return (
            <div
              key={tag.id}
              draggable
              onDragStart={(event) => { event.dataTransfer.setData('text/plain', tag.id); event.dataTransfer.effectAllowed = 'move'; setDraggedId(tag.id) }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); dropInOrder(orderedTags, event.dataTransfer.getData('text/plain'), tag.id, (id, sortOrder) => api.tags.update(id, { sortOrder })) }}
              onDragEnd={() => setDraggedId(null)}
              className={`flex min-w-0 items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900 ${isChild ? 'ml-8 border-l-2 border-l-gray-300 dark:border-l-gray-700' : ''} ${draggedId === tag.id ? 'opacity-40' : ''}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {!isChild && childTags.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCollapsedTagIds((current) => {
                      const next = new Set(current)
                      if (next.has(tag.id)) next.delete(tag.id)
                      else next.add(tag.id)
                      return next
                    })}
                    className="relative after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] grid h-6 w-6 shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    aria-label={collapsedTagIds.has(tag.id) ? `展开${tag.name}的子标签` : `收起${tag.name}的子标签`}
                    title={collapsedTagIds.has(tag.id) ? '展开子标签' : '收起子标签'}
                  >
                    {collapsedTagIds.has(tag.id) ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                  </button>
                ) : isChild ? <span className="w-6 shrink-0" aria-hidden="true" /> : <span className="w-6 shrink-0" aria-hidden="true" />}
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400 active:cursor-grabbing" aria-label="拖动排序" />
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tag.color }} />
                <span
                  className="shrink-0 whitespace-nowrap font-medium"
                  title={parent ? `上级：${parent.name}` : undefined}
                >
                  {tag.icon ? `${tag.icon} ` : ''}{tag.name}
                </span>
                {!isChild && childTags.length > 0 && <span className="shrink-0 text-xs text-gray-400">{childTags.length} 个子标签</span>}
                <span className="shrink-0 whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {tag.category?.name ?? '未分类'}
                </span>
                {tag.trackType === 'count' && (
                  <span className="shrink-0 whitespace-nowrap text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                    次数
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
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
                  onClick={() => setPendingRemoveTag(tag)}
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
      </div>

      {/* 目标管理 */}
      {goals.length > 0 && (
        <section className="space-y-3 border-t border-[rgb(226_232_240_/_0.9)] pt-5 dark:border-[rgb(51_65_85_/_0.9)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">目标 / 习惯</h2>
          </div>
          <div className="space-y-2">
            {goals.map((goal) => {
              const tag = tags.find((t) => t.id === goal.tagId)
              const displayTitle = goal.kind === 'activity' && tag && goal.title === `每日${tag.name}`
                ? defaultGoalTitle(tag.name, 'activity', goal.period, goal.weekDay ?? 0, goal.periodDays ?? 7)
                : goal.title
              return (
                <div
                  key={goal.id}
                  draggable
                  onDragStart={(event) => { event.dataTransfer.setData('text/plain', goal.id); event.dataTransfer.effectAllowed = 'move'; setDraggedGoalId(goal.id) }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); dropGoalInOrder(event.dataTransfer.getData('text/plain'), goal.id) }}
                  onDragEnd={() => setDraggedGoalId(null)}
                  className={`flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900 ${draggedGoalId === goal.id ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400 active:cursor-grabbing" aria-label="拖动目标排序" />
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag?.color ?? '#999' }} />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{displayTitle}</div>
                      <div className="text-xs text-gray-400">
                        {goal.kind === 'activity'
                          ? goal.period === 'once'
                            ? `一次性活动 · ${goal.deadlineAt ? formatGoalDeadline(goal.deadlineAt) : '未设置截止时间'}`
                            : `${goal.period === 'workday' ? '工作日' : goal.period === 'daily' ? '每日' : goal.period === 'weekly' ? `每${WEEKDAYS[goal.weekDay ?? 0]}截止` : '每月'}活动 · ${goal.period === 'workday' ? `工作日 ${goal.deadlineTime} 前` : goal.period === 'daily' ? `每天 ${goal.deadlineTime} 前` : goal.period === 'weekly' ? `${WEEKDAYS[goal.weekDay ?? 0]} ${goal.deadlineTime} 前` : `每月 ${goal.deadlineDay} 日 ${goal.deadlineTime} 前`}`
                          : `${goal.type === 'count' ? '只计次数' : '时长(分)'} · ${goal.period === 'workday' ? '每工作日' : goal.period === 'daily' ? '每日' : goal.period === 'weekly' ? `每周从${WEEKDAYS[goal.weekDay ?? 1]}开始` : goal.period === 'monthly' ? '每月' : `每${goal.periodDays}天`} · 目标 ${goal.target}${goal.type === 'count' ? '次，不记时长' : '分钟'}`}
                        {goal.current !== undefined && (
                          <span className={goal.current >= goal.target ? ' text-green-500 ml-1' : ' ml-1'}>
                            {' · '}已完成 {goal.current}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                    <button
                      onClick={() => tag && setEditingGoal({ goal, tag })}
                      className="text-sm text-gray-400 hover:text-brand"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => setPendingRemoveGoal(goal)}
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

      {/* 删除分类确认（替代原生 confirm） */}
      <ConfirmDialog
        open={!!pendingRemoveCategory}
        danger
        title="删除确认"
        message={`删除分类「${pendingRemoveCategory?.name ?? ''}」？标签不会被删除，只是变为未分类。`}
        onConfirm={() => { const cat = pendingRemoveCategory; if (cat) void performRemoveCategory(cat) }}
        onCancel={() => setPendingRemoveCategory(null)}
      />

      {/* 删除标签确认（替代原生 confirm） */}
      <ConfirmDialog
        open={!!pendingRemoveTag}
        danger
        title="删除确认"
        message={`删除标签「${pendingRemoveTag?.name ?? ''}」？`}
        onConfirm={() => { const tag = pendingRemoveTag; if (tag) void performRemoveTag(tag) }}
        onCancel={() => setPendingRemoveTag(null)}
      />

      {/* 删除目标确认（替代原生 confirm） */}
      <ConfirmDialog
        open={!!pendingRemoveGoal}
        danger
        title="删除确认"
        message={`删除目标「${pendingRemoveGoal?.title ?? ''}」？`}
        onConfirm={() => { const goal = pendingRemoveGoal; if (goal) void performRemoveGoal(goal) }}
        onCancel={() => setPendingRemoveGoal(null)}
      />
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
    <Modal onClose={onClose} title={tag ? '编辑标签' : '新建标签'} size="wide">
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
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
        </div>
        <div className="space-y-4">
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
      </div>
      {error && <div className="mt-4 text-sm text-red-500">{error}</div>}
      <FormActions onCancel={onClose} onSave={save} />
    </Modal>
  )
}

// 取色组件：原生取色板 + hex 输入 + 预设快捷色
const PRESET_COLORS = ['#0f766e', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b']

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
          placeholder="#0f766e"
        />
      </div>
      {/* 预设快捷色 */}
      <div className="flex gap-1.5 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`relative after:absolute after:-inset-[3px] after:content-[''] w-6 h-6 rounded-full border transition-transform hover:scale-110 ${value.toLowerCase() === c ? 'ring-2 ring-offset-1 ring-gray-400 border-transparent' : 'border-gray-200 dark:border-gray-700'}`}
            style={{ background: c }}
            title={c}
          />
        ))}
      </div>
    </div>
  )
}

// 通用组件
function Modal({ title, children, onClose, size = 'default' }: { title: string; children: React.ReactNode; onClose: () => void; size?: 'default' | 'wide' }) {
  const titleId = useId()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-2" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal-panel my-auto flex w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 ${size === 'wide' ? 'modal-panel-wide max-w-3xl' : 'max-h-[calc(100vh-2rem)] max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <header className="shrink-0 border-b border-gray-200 px-5 py-4 dark:border-gray-700 sm:px-6">
          <h3 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
          {children}
        </div>
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
    <div className="sticky bottom-0 -mx-1 mt-5 flex justify-end gap-2 border-t border-gray-100 bg-white/95 px-1 pt-3 pb-1 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
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
  const initialKind = goal?.kind ?? (tag.parentId ? 'activity' : 'tracking')
  const initialPeriod = goal?.period ?? 'daily'
  const initialWeekDay = goal?.weekDay ?? (initialKind === 'activity' ? 0 : 1)
  const [kind, setKind] = useState<'tracking' | 'activity'>(initialKind)
  const [period, setPeriod] = useState<'once' | 'workday' | 'daily' | 'weekly' | 'monthly' | 'custom'>(initialPeriod)
  const [weekDay, setWeekDay] = useState(initialWeekDay)
  const legacyGeneratedTitle = Boolean(goal && goal.kind === 'activity' && goal.title === `每日${tag.name}`)
  const [title, setTitle] = useState(goal && !legacyGeneratedTitle ? goal.title : defaultGoalTitle(tag.name, initialKind, initialPeriod, initialWeekDay, goal?.periodDays ?? 7))
  const [customTitle, setCustomTitle] = useState(Boolean(goal && !legacyGeneratedTitle))
  const [type, setType] = useState<'count' | 'time'>(goal?.type ?? (tag.trackType === 'count' ? 'count' : 'time'))
  const [target, setTarget] = useState(goal?.target ?? 1)
  const [periodDays, setPeriodDays] = useState(goal?.periodDays ?? 7)
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
      weekDay: period === 'weekly' ? weekDay : null,
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
          <input value={title} onChange={(e) => { setCustomTitle(true); setTitle(e.target.value) }} placeholder="根据用途和周期自动生成"
            className="input" autoFocus />
        </Field>
        <Field label="目标用途">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setKind('tracking')
                const nextWeekDay = period === 'weekly' ? 1 : weekDay
                if (period === 'weekly') setWeekDay(nextWeekDay)
                if (!customTitle) setTitle(defaultGoalTitle(tag.name, 'tracking', period, nextWeekDay, periodDays))
              }}
              className={`px-4 py-2 rounded-lg text-sm border ${kind === 'tracking' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
            >
              统计目标
            </button>
            <button
              onClick={() => {
                setKind('activity'); setType('count'); setTarget(1)
                const nextWeekDay = period === 'weekly' ? 0 : weekDay
                if (period === 'weekly') setWeekDay(nextWeekDay)
                if (!customTitle) setTitle(defaultGoalTitle(tag.name, 'activity', period, nextWeekDay, periodDays))
              }}
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
              🔢 只计次数
            </button>
            <button
              onClick={() => setType('time')}
              className={`px-4 py-2 rounded-lg text-sm border ${type === 'time' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border-current font-medium' : 'text-gray-400 border-gray-300 dark:border-gray-700'}`}
            >
              ⏱ 时长(分钟)
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">只统计完成了几次，不累计或显示专注时长。</p>
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
          <select value={period} onChange={(e) => {
            const next = e.target.value as 'once' | 'workday' | 'daily' | 'weekly' | 'monthly' | 'custom'
            setPeriod(next)
            if (!customTitle) setTitle(defaultGoalTitle(tag.name, kind, next, weekDay, periodDays))
          }} className="input">
            {kind === 'activity' && <option value="once">一次性</option>}
            <option value="workday">工作日</option>
            <option value="daily">每日</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
            {kind === 'tracking' && <option value="custom">自定义天数</option>}
          </select>
        </Field>
        {period === 'weekly' && (
          <Field label={kind === 'activity' ? '每周截止星期' : '每周周期起始日'}>
            <select value={weekDay} onChange={(event) => {
              const next = Number(event.target.value)
              setWeekDay(next)
              if (!customTitle) setTitle(defaultGoalTitle(tag.name, kind, period, next, periodDays))
            }} className="input">
              {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </Field>
        )}
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
