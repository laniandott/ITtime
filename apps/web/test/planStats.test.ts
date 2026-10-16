import { test } from 'node:test'
import assert from 'node:assert/strict'
import { derivePlanExecution, planAdherence, planActualMinutes } from '../src/planStats.ts'
import type { PlanBlock, TimeEntry } from '../src/types.ts'

const plan = (overrides: Partial<PlanBlock> = {}): PlanBlock => ({
  id: 'plan-1', date: '2026-10-16', startMinute: 9 * 60, endMinute: 10 * 60,
  content: '写方案', tagId: 'tag-1', todoId: null, skippedAt: null, confirmedAt: null,
  deferredFromId: null, createdAt: '', updatedAt: '', ...overrides,
})

const entry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'entry-1', startTime: '2026-10-16T09:00:00', endTime: '2026-10-16T09:40:00',
  note: null, tagId: 'tag-1', todoId: null, pendingResume: false, dismissed: false,
  dismissReason: null, resumedFromId: null, interruptedFromId: null, ...overrides,
})

test('plan coverage merges timer intervals and clips cross-midnight entries', () => {
  const block = plan()
  const entries = [
    entry({ id: 'first', startTime: '2026-10-16T08:50:00', endTime: '2026-10-16T09:30:00' }),
    entry({ id: 'second', startTime: '2026-10-16T09:20:00', endTime: '2026-10-16T09:50:00' }),
    entry({ id: 'overnight', startTime: '2026-10-15T23:30:00', endTime: '2026-10-16T09:10:00' }),
  ]
  assert.equal(planActualMinutes(block, entries, Date.parse('2026-10-16T12:00:00')), 50)
  assert.equal(derivePlanExecution(block, entries, Date.parse('2026-10-16T12:00:00')).executionStatus, 'partial')
})

test('untagged plans do not auto-match and explicit plan links take precedence', () => {
  const block = plan({ tagId: null })
  const unlinked = entry({ tagId: 'tag-1' })
  assert.equal(planActualMinutes(block, [unlinked]), 0)
  const linked = entry({ planId: block.id, startTime: '2026-10-16T09:10:00', endTime: '2026-10-16T09:30:00' })
  assert.equal(planActualMinutes(block, [linked]), 20)
})

test('adherence separates planned coverage from unplanned time and manual confirmation', () => {
  const block = plan({ confirmedAt: '2026-10-16T11:00:00' })
  const entries = [
    entry({ startTime: '2026-10-16T09:00:00', endTime: '2026-10-16T09:30:00' }),
    entry({ id: 'outside', startTime: '2026-10-16T10:00:00', endTime: '2026-10-16T10:20:00' }),
  ]
  const stats = planAdherence([block], entries, [Date.parse('2026-10-16T00:00:00'), Date.parse('2026-10-17T00:00:00')], Date.parse('2026-10-17T00:00:00'))
  assert.equal(stats.plannedMs, 60 * 60_000)
  assert.equal(stats.actualMs, 30 * 60_000)
  assert.equal(stats.unplannedMs, 20 * 60_000)
  assert.equal(stats.coverageRate, 0.5)
  assert.equal(stats.confirmedCount, 1)
  assert.equal(stats.confirmedRate, 1)
})

test('a planned block alone does not add actual or unplanned time', () => {
  const stats = planAdherence(
    [plan()],
    [],
    [Date.parse('2026-10-16T00:00:00'), Date.parse('2026-10-17T00:00:00')],
    Date.parse('2026-10-17T00:00:00'),
  )
  assert.equal(stats.plannedMs, 60 * 60_000)
  assert.equal(stats.actualMs, 0)
  assert.equal(stats.unplannedMs, 0)
  assert.equal(stats.coverageRate, 0)
})

test('synced overlapping plans do not double count planned or covered intervals', () => {
  const blocks = [plan(), plan({ id: 'plan-2', startMinute: 9 * 60 + 20, endMinute: 10 * 60 + 20 })]
  const entries = [entry({ startTime: '2026-10-16T09:00:00', endTime: '2026-10-16T10:00:00' })]
  const stats = planAdherence(blocks, entries, [Date.parse('2026-10-16T00:00:00'), Date.parse('2026-10-17T00:00:00')], Date.parse('2026-10-17T00:00:00'))
  assert.equal(stats.plannedMs, 80 * 60_000)
  assert.equal(stats.actualMs, 60 * 60_000)
})
