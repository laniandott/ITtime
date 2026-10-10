import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'

Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true })
const { localRequest, localDatabase } = await import('../src/localData.ts')
const { default: PouchDB } = await import('pouchdb-browser')
test('two activities persist independently and stopping one retains the other', async () => {
  const post = (path: string, body: unknown = {}) => localRequest<any>(path, { method: 'POST', body: JSON.stringify(body) })
  const legacy = new PouchDB<any>('ittime-tagtime-v1')
  await legacy.put({ _id: 'categories:legacy', entity: 'categories', value: { id: 'legacy', name: '旧分类' }, updatedAt: new Date().toISOString() })
  try {
    assert.equal((await localRequest<any[]>('/categories')).some(category => category.id === 'legacy'), true)
    const firstTag = await post('/tags', { name: '项目一' })
    const secondTag = await post('/tags', { name: '项目二' })
    const first = await post('/timer/start', { tagId: firstTag.id })
    const second = await post('/timer/start', { tagId: secondTag.id })
    assert.equal((await localRequest<any>('/timer/current')).running.length, 2)
    const stopped = await post(`/timer/stop/${first.id}`)
    assert.ok(stopped.endTime)
    const current = await localRequest<any>('/timer/current')
    assert.deepEqual(current.running.map((entry: any) => entry.id), [second.id])
    const records = await localRequest<any[]>('/timer')
    assert.equal(records.length, 2)
    assert.equal(records.find(entry => entry.id === first.id)?.tag.name, '项目一')
    const goal = await post('/goals', { tagId: firstTag.id, title: '每日项目一', kind: 'activity', period: 'daily' })
    const weeklyGoal = await post('/goals', { tagId: secondTag.id, title: '每周项目二', kind: 'activity', period: 'weekly', deadlineTime: '18:30' })
    const generated = await localRequest<any[]>('/todos')
    assert.equal(generated.filter(todo => todo.goalId === goal.id).length, 1)
    const weekly = generated.find(todo => todo.goalId === weeklyGoal.id)
    assert.ok(weekly)
    assert.equal(weekly.repeatType, 'weekly')
    const weeklyDeadline = new Date(weekly.dueDate)
    assert.equal(weeklyDeadline.getDay(), 0)
    assert.equal(weeklyDeadline.getHours(), 18)
    assert.equal(weeklyDeadline.getMinutes(), 30)
    assert.equal((await localRequest<any[]>('/todos')).length, generated.length)
    const activity = generated.find(todo => todo.goalId === goal.id)!
    await localRequest(`/todos/${activity.id}/toggle`, { method: 'PATCH', body: '{}' })
    assert.equal((await localRequest<any[]>('/todos?status=pending')).filter(todo => todo.goalId === goal.id).length, 0)
    assert.equal((await localRequest<any[]>('/goals')).find(rule => rule.id === goal.id)?.current, 1)
    const onceGoal = await post('/goals', { tagId: firstTag.id, title: '一次性项目', kind: 'activity', period: 'once', deadlineAt: new Date().toISOString() })
    const onceTodo = (await localRequest<any[]>('/todos')).find(todo => todo.goalId === onceGoal.id)!
    const onceDoc = await localDatabase().get(`todos:${onceTodo.id}`)
    await localDatabase().put({ ...onceDoc, value: { ...onceDoc.value, status: 'done', completedAt: new Date(Date.now() - 86_400_000).toISOString() } })
    assert.equal((await localRequest<any[]>('/goals')).find(rule => rule.id === onceGoal.id)?.current, 1)
    await assert.rejects(post(`/timer/${second.id}/terminate-chain`, { reason: '测试' }), /尚未迁移/)
  } finally { await localDatabase().destroy(); await legacy.destroy() }
})
