import type { CalendarEvent } from './types'
import PouchDB from 'pouchdb-browser'

type CalendarEventSnapshot = {
  from: string
  to: string
  events: CalendarEvent[]
  fetchedAt: string
}
type StoredCalendarEventSnapshot = PouchDB.Core.IdMeta & Partial<PouchDB.Core.GetMeta> & CalendarEventSnapshot

function snapshotId(from: string, to: string) {
  return `calendarEventCache:${encodeURIComponent(from)}:${encodeURIComponent(to)}`
}

const cacheDatabase = new PouchDB<StoredCalendarEventSnapshot>('ittime-calendar-cache-v1')

export async function saveCalendarEventSnapshot(from: string, to: string, events: CalendarEvent[]) {
  const _id = snapshotId(from, to)
  let existing: StoredCalendarEventSnapshot | undefined
  try {
    existing = await cacheDatabase.get(_id)
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error
  }
  const snapshot: CalendarEventSnapshot = { from, to, events, fetchedAt: new Date().toISOString() }
  await cacheDatabase.put({
    _id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    ...snapshot,
  })
}

export async function readCalendarEventSnapshot(from: string, to: string) {
  try {
    return await cacheDatabase.get(snapshotId(from, to))
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}
