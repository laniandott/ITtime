import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'

Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true })
const [{ default: PouchDB }, { resolveConflicts }, { describeSyncState, countSyncDocuments }] = await Promise.all([
  import('pouchdb-browser'),
  import('../src/localData.ts'),
  import('../src/couchSync.ts'),
])

test('sync setup distinguishes cloud recovery, upload, merge and empty reset cases', () => {
  assert.match(describeSyncState({ active: 0, deleted: 0 }, { active: 3, deleted: 0 }), /从 CouchDB 恢复到本机/)
  assert.match(describeSyncState({ active: 2, deleted: 0 }, { active: 0, deleted: 0 }), /把本机数据上传到 CouchDB/)
  assert.match(describeSyncState({ active: 2, deleted: 0 }, { active: 3, deleted: 0 }), /双向合并/)
  assert.match(describeSyncState({ active: 0, deleted: 3 }, { active: 0, deleted: 3 }), /都没有有效记录/)
  assert.match(describeSyncState({ active: 0, deleted: 1 }, { active: 3, deleted: 0 }), /删除前的备份恢复/)
  assert.match(describeSyncState({ active: 0, deleted: 0 }, { active: 0, deleted: 0 }), /空的数据集/)
})

test('sync status counts logical deletions separately from active records', async () => {
  const db = new PouchDB<any>('ittime-sync-counts')
  try {
    await db.bulkDocs([
      { _id: 'tags:active', entity: 'tags', value: { id: 'active' }, updatedAt: '2026-01-01' },
      { _id: 'tags:deleted-a', entity: 'tags', value: { id: 'deleted-a' }, updatedAt: '2026-01-01', deletedAt: '2026-01-02' },
      { _id: 'tags:deleted-b', entity: 'tags', value: { id: 'deleted-b' }, updatedAt: '2026-01-01', deletedAt: '2026-01-03' },
      { _id: '_design/test', value: {}, updatedAt: '2026-01-01' },
    ])
    assert.deepEqual(await countSyncDocuments(db), { active: 1, deleted: 2 })
  } finally {
    await db.destroy()
  }
})

test('replicated field conflicts merge independent edits and remove losing branches', async () => {
  const deviceA = new PouchDB<any>('ittime-sync-device-a')
  const deviceB = new PouchDB<any>('ittime-sync-device-b')
  const id = 'tags:shared'
  const baseTime = '2026-01-01T00:00:00.000Z'
  try {
    await deviceA.put({
      _id: id,
      entity: 'tags',
      value: { id: 'shared', name: 'Base', note: 'Base note', color: '#111111' },
      updatedAt: baseTime,
      fieldClock: { id: baseTime, name: baseTime, note: baseTime, color: baseTime },
    })
    await PouchDB.replicate(deviceA, deviceB)

    const a = await deviceA.get(id)
    await deviceA.put({
      ...a,
      value: { ...a.value, name: 'Device A' },
      updatedAt: '2026-01-01T00:00:02.000Z',
      fieldClock: { ...a.fieldClock, name: '2026-01-01T00:00:02.000Z' },
    })
    const b = await deviceB.get(id)
    await deviceB.put({
      ...b,
      value: { ...b.value, note: 'Device B note', color: '#222222' },
      updatedAt: '2026-01-01T00:00:03.000Z',
      fieldClock: { ...b.fieldClock, note: '2026-01-01T00:00:03.000Z', color: '2026-01-01T00:00:03.000Z' },
    })

    await PouchDB.sync(deviceA, deviceB)
    const before = await deviceA.get(id, { conflicts: true } as any)
    assert.ok(before._conflicts?.length)
    assert.equal(await resolveConflicts(deviceA, [id]), 1)
    const after = await deviceA.get(id, { conflicts: true } as any)
    assert.equal(after._conflicts, undefined)
    assert.deepEqual(after.value, { id: 'shared', name: 'Device A', note: 'Device B note', color: '#222222' })

    await PouchDB.replicate(deviceA, deviceB)
    assert.deepEqual((await deviceB.get(id)).value, after.value)

    const deleteId = 'tags:deleted-field'
    const tieTime = '2026-01-01T00:00:05.000Z'
    await deviceA.put({
      _id: deleteId,
      entity: 'tags',
      value: { id: 'deleted-field', name: 'Base', note: 'remove me' },
      updatedAt: baseTime,
      fieldClock: { id: baseTime, name: baseTime, note: baseTime },
    })
    await PouchDB.replicate(deviceA, deviceB)
    const deleteBranch = await deviceA.get(deleteId)
    await deviceA.put({ ...deleteBranch, value: { id: 'deleted-field', name: 'Base' }, updatedAt: tieTime, fieldClock: { ...deleteBranch.fieldClock, note: tieTime } })
    const editBranch = await deviceB.get(deleteId)
    await deviceB.put({ ...editBranch, value: { ...editBranch.value, note: 'concurrent edit' }, updatedAt: tieTime, fieldClock: { ...editBranch.fieldClock, note: tieTime } })
    await PouchDB.sync(deviceA, deviceB)
    const resolutions = await Promise.all([
      resolveConflicts(deviceA, [deleteId]),
      resolveConflicts(deviceA, [deleteId]),
    ])
    assert.equal(resolutions.reduce((sum, count) => sum + count, 0), 1)
    const deleted = await deviceA.get(deleteId, { conflicts: true } as any)
    assert.equal(deleted._conflicts, undefined)
    assert.equal(Object.hasOwn(deleted.value, 'note'), false)
    await PouchDB.replicate(deviceA, deviceB)
    assert.equal(Object.hasOwn((await deviceB.get(deleteId)).value, 'note'), false)

    const tombstoneId = 'tags:logical-delete'
    await deviceA.put({
      _id: tombstoneId,
      entity: 'tags',
      value: { id: 'logical-delete', name: 'Keep deletion' },
      updatedAt: baseTime,
      fieldClock: { id: baseTime, name: baseTime },
    })
    await PouchDB.replicate(deviceA, deviceB)
    const tombstoneTime = '2026-01-01T00:00:10.000Z'
    const deletedBranch = await deviceA.get(tombstoneId)
    await deviceA.put({ ...deletedBranch, deletedAt: tombstoneTime, updatedAt: tombstoneTime, fieldClock: { ...deletedBranch.fieldClock, _deleted: tombstoneTime } })
    const offlineEdit = await deviceB.get(tombstoneId)
    await deviceB.put({ ...offlineEdit, value: { ...offlineEdit.value, name: 'Offline edit' }, updatedAt: '2026-01-01T00:00:11.000Z', fieldClock: { ...offlineEdit.fieldClock, name: '2026-01-01T00:00:11.000Z' } })
    await PouchDB.sync(deviceA, deviceB)
    assert.ok((await deviceA.get(tombstoneId, { conflicts: true } as any))._conflicts?.length)
    assert.equal(await resolveConflicts(deviceA, [tombstoneId]), 1)
    const tombstoned = await deviceA.get(tombstoneId)
    assert.equal(tombstoned.deletedAt, tombstoneTime)
    await PouchDB.replicate(deviceA, deviceB)
    assert.equal((await deviceB.get(tombstoneId)).deletedAt, tombstoneTime)
  } finally {
    await deviceA.destroy()
    await deviceB.destroy()
  }
})
