import type { PlanBlock, PlanExecutionStatus, TimeEntry } from './types'

export type MinuteInterval = { start: number; end: number }

function mergeIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals.filter(item => item.end > item.start).sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: MinuteInterval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (!last || interval.start > last.end) merged.push({ ...interval })
    else last.end = Math.max(last.end, interval.end)
  }
  return merged
}

export function intervalLength(intervals: MinuteInterval[]): number {
  return mergeIntervals(intervals).reduce((sum, item) => sum + item.end - item.start, 0)
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function entryInterval(entry: TimeEntry, date: string, now = Date.now()): MinuteInterval | null {
  const startDate = new Date(entry.startTime)
  const endMs = entry.endTime ? Date.parse(entry.endTime) : now
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endMs) || endMs <= startDate.getTime()) return null
  const dayStart = new Date(`${date}T00:00:00`).getTime()
  if (!Number.isFinite(dayStart)) return null
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  const dayEnd = nextDay.getTime()
  const clippedStart = Math.max(startDate.getTime(), dayStart)
  const clippedEnd = Math.min(endMs, dayEnd)
  if (clippedEnd <= clippedStart) return null
  return { start: (clippedStart - dayStart) / 60_000, end: (clippedEnd - dayStart) / 60_000 }
}

function overlap(a: MinuteInterval, b: MinuteInterval): MinuteInterval | null {
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  return end > start ? { start, end } : null
}

export function planWindow(block: PlanBlock): MinuteInterval {
  return { start: block.startMinute, end: block.endMinute }
}

export function planEntryCandidates(block: PlanBlock, entries: TimeEntry[], now = Date.now()): TimeEntry[] {
  const window = planWindow(block)
  return entries.filter(entry => {
    if (entry.dismissed) return false
    if (entry.planId === block.id) return true
    if (block.tagId === null || entry.planId) return false
    const interval = entryInterval(entry, block.date, now)
    return Boolean(interval && interval.end > window.start && interval.start < window.end && entry.tagId === block.tagId)
  })
}

export function planActualMinutes(block: PlanBlock, entries: TimeEntry[], now = Date.now()): number {
  const window = planWindow(block)
  const intervals = planEntryCandidates(block, entries, now).flatMap(entry => {
    const interval = entryInterval(entry, block.date, now)
    const clipped = interval && overlap(interval, window)
    return clipped ? [clipped] : []
  })
  return intervalLength(intervals)
}

export function derivePlanExecution(block: PlanBlock, entries: TimeEntry[], now = Date.now()): { executionStatus: PlanExecutionStatus; actualMs: number; plannedMs: number; coverageRate: number } {
  const plannedMinutes = Math.max(0, block.endMinute - block.startMinute)
  const actualMinutes = planActualMinutes(block, entries, now)
  const candidates = planEntryCandidates(block, entries, now)
  const hasRunning = candidates.some(entry => !entry.endTime)
  const hasPending = candidates.some(entry => entry.pendingResume)
  const coverageRate = plannedMinutes > 0 ? Math.min(1, actualMinutes / plannedMinutes) : 0
  const endMs = new Date(`${block.date}T${String(Math.floor(block.endMinute / 60)).padStart(2, '0')}:${String(block.endMinute % 60).padStart(2, '0')}:00`).getTime()
  let executionStatus: PlanExecutionStatus
  if (hasRunning) executionStatus = 'active'
  else if (hasPending) executionStatus = 'paused'
  else if (coverageRate >= 0.9) executionStatus = 'done'
  else if (coverageRate >= 0.3) executionStatus = 'partial'
  else if (now >= endMs) executionStatus = 'missed'
  else executionStatus = 'upcoming'
  return { executionStatus, actualMs: actualMinutes * 60_000, plannedMs: plannedMinutes * 60_000, coverageRate }
}

export interface PlanAdherence {
  plannedMs: number
  actualMs: number
  unplannedMs: number
  coverageRate: number
  onTimeRate: number
  missedCount: number
  confirmedCount: number
  confirmedRate: number
  skippedCount: number
  deferredCount: number
}

export function planAdherence(blocks: PlanBlock[], entries: TimeEntry[], range: [number, number], now = Date.now()): PlanAdherence {
  const visibleBlocks = blocks.filter(block => {
    const day = Date.parse(`${block.date}T00:00:00`)
    return day >= range[0] && day < range[1]
  })
  const plannedByDate = new Map<string, MinuteInterval[]>()
  for (const block of visibleBlocks) plannedByDate.set(block.date, [...(plannedByDate.get(block.date) ?? []), planWindow(block)])
  const plannedMinutes = [...plannedByDate.values()].reduce((sum, intervals) => sum + intervalLength(intervals), 0)
  const actualByDate = new Map<string, MinuteInterval[]>()
  for (const entry of entries.filter(entry => !entry.dismissed)) {
    const originalStart = Date.parse(entry.startTime)
    const originalEnd = entry.endTime ? Date.parse(entry.endTime) : now
    if (!Number.isFinite(originalStart) || !Number.isFinite(originalEnd)) continue
    const clippedStart = Math.max(originalStart, range[0])
    const clippedEnd = Math.min(originalEnd, range[1])
    if (clippedEnd <= clippedStart) continue
    const start = new Date(clippedStart)
    const end = new Date(clippedEnd)
    const first = new Date(start); first.setHours(0, 0, 0, 0)
    const last = new Date(end); last.setHours(0, 0, 0, 0)
    for (const cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
      const date = localDateKey(cursor)
      const interval = entryInterval(entry, date, now)
      if (interval) actualByDate.set(date, [...(actualByDate.get(date) ?? []), interval])
    }
  }
  const coveredByDate = new Map<string, MinuteInterval[]>()
  for (const block of visibleBlocks) for (const entry of planEntryCandidates(block, entries, now)) {
    const interval = entryInterval(entry, block.date, now)
    const clipped = interval && overlap(interval, planWindow(block))
    if (clipped) coveredByDate.set(block.date, [...(coveredByDate.get(block.date) ?? []), clipped])
  }
  const actualMinutes = [...coveredByDate.values()].reduce((sum, intervals) => sum + intervalLength(intervals), 0)
  const totalActualMinutes = [...actualByDate.entries()].reduce((sum, [date, intervals]) => {
    const day = Date.parse(`${date}T00:00:00`)
    const clipped = intervals.flatMap(interval => {
      const start = Math.max(interval.start, (range[0] - day) / 60_000)
      const end = Math.min(interval.end, (range[1] - day) / 60_000)
      return end > start ? [{ start, end }] : []
    })
    return sum + intervalLength(clipped)
  }, 0)
  const states = visibleBlocks.map(block => ({ block, result: derivePlanExecution(block, entries, now) }))
  const eligible = states.filter(({ block }) => !block.skippedAt && !blocks.some(child => child.deferredFromId === block.id))
  const onTime = eligible.filter(({ block }) => {
    const first = planEntryCandidates(block, entries, now).map(entry => new Date(entry.startTime).getTime()).sort((a, b) => a - b)[0]
    if (!Number.isFinite(first)) return false
    const planned = new Date(`${block.date}T00:00:00`).getTime() + block.startMinute * 60_000
    return Math.abs(first - planned) <= 15 * 60_000
  }).length
  const missedCount = eligible.filter(({ result }) => result.executionStatus === 'missed').length
  const confirmedCount = visibleBlocks.filter(block => Boolean(block.confirmedAt)).length
  return {
    plannedMs: plannedMinutes * 60_000,
    actualMs: actualMinutes * 60_000,
    unplannedMs: Math.max(0, totalActualMinutes - actualMinutes) * 60_000,
    coverageRate: plannedMinutes > 0 ? Math.min(1, actualMinutes / plannedMinutes) : 0,
    onTimeRate: eligible.length > 0 ? onTime / eligible.length : 0,
    missedCount,
    confirmedCount,
    confirmedRate: visibleBlocks.length > 0 ? confirmedCount / visibleBlocks.length : 0,
    skippedCount: visibleBlocks.filter(block => Boolean(block.skippedAt)).length,
    deferredCount: visibleBlocks.filter(block => blocks.some(child => child.deferredFromId === block.id)).length,
  }
}
