import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'

Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true })
const [{ importLegacyServerData }, { localDatabase, localRequest }] = await Promise.all([
  import('../src/legacyMigration.ts'),
  import('../src/localData.ts'),
])

test('legacy import preserves IDs and skips records when repeated', async () => {
  const originalFetch = globalThis.fetch
  const exportedAt = new Date().toISOString()
  globalThis.fetch = async () => new Response(JSON.stringify({
    version: 1,
    exportedAt,
    categories: [{ id: 'legacy-category', name: '旧分类', color: '#123456', icon: null, sortOrder: 0, _count: { tags: 1 } }],
    tags: [{ id: 'legacy-tag', name: '旧标签', categoryId: 'legacy-category', parentId: null, color: '#123456', icon: null, trackType: 'time', mode: 'chaos', sortOrder: 0, category: { id: 'legacy-category' }, parent: null }],
    todos: [],
    timeEntries: [],
    goals: [],
    memos: [],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  try {
    assert.deepEqual(await importLegacyServerData(), { imported: 2, skipped: 0, total: 2, exportedAt })
    assert.deepEqual(await importLegacyServerData(), { imported: 0, skipped: 2, total: 2, exportedAt })
    const categories = await localRequest<any[]>('/categories')
    assert.equal(categories.find((item) => item.id === 'legacy-category')?.name, '旧分类')
    assert.equal((await localDatabase().get('tags:legacy-tag')).value.name, '旧标签')
  } finally {
    globalThis.fetch = originalFetch
    await localDatabase().destroy()
  }
})
