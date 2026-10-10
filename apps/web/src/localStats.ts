import type { TimeEntry } from './types'
export function periodBounds(period: string, days = 7, anchor = new Date()): [number, number] {
  const start = new Date(anchor); start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  if (period === 'workday') {
    // A workday target is active only Monday through Friday. Weekend has no active cycle.
    const day = start.getDay()
    if (day === 0 || day === 6) return [start.getTime(), start.getTime()]
    end.setDate(end.getDate() + 1)
  }
  else if (period === 'weekly') { start.setDate(start.getDate() - (start.getDay() + 6) % 7); end.setTime(start.getTime()); end.setDate(end.getDate() + 7) }
  else if (period === 'monthly') { start.setDate(1); end.setTime(start.getTime()); end.setMonth(end.getMonth() + 1) }
  else if (period === 'custom') { end.setDate(end.getDate() + 1); start.setDate(start.getDate() - days + 1) }
  else end.setDate(end.getDate() + 1)
  return [start.getTime(), end.getTime()]
}
export function elapsed(entries: TimeEntry[], start: number, end: number): number {
  return entries.reduce((sum, entry) => sum + (entry.endTime ? Math.max(0, Math.min(end, Date.parse(entry.endTime)) - Math.max(start, Date.parse(entry.startTime))) : 0), 0)
}
