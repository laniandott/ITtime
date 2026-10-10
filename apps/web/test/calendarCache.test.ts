import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'

Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true })
const { readCalendarEventSnapshot, saveCalendarEventSnapshot } = await import('../src/calendarCache.ts')

test('external calendar snapshots are stored per visible range and can be refreshed', async () => {
  const from = `2026-10-01T00:00:00.000Z-${crypto.randomUUID()}`
  const to = '2026-11-01T00:00:00.000Z'
  const event = {
    id: 'cache-test-event', subscriptionId: 'subscription-1', uid: 'uid-1', summary: 'Review',
    description: null, location: null, dtstart: '2026-10-10T10:00:00.000Z', dtend: '2026-10-10T11:00:00.000Z',
    allday: false, rrule: null,
  }

  assert.equal(await readCalendarEventSnapshot(from, to), null)
  await saveCalendarEventSnapshot(from, to, [event])
  const first = await readCalendarEventSnapshot(from, to)
  assert.deepEqual(first?.events, [event])
  assert.ok(first?.fetchedAt)

  await saveCalendarEventSnapshot(from, to, [])
  const refreshed = await readCalendarEventSnapshot(from, to)
  assert.deepEqual(refreshed?.events, [])
  assert.ok(refreshed?.fetchedAt)
})
