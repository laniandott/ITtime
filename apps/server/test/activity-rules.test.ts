import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activityDueDate } from '../src/activity-rules.js'

test('weekly activity deadline falls on Sunday and repeats one week later', () => {
  const anchor = new Date(2026, 9, 7, 12, 0, 0)
  const rule = { period: 'weekly', deadlineTime: '18:30', deadlineDay: null }
  const first = activityDueDate(rule, anchor)
  const next = activityDueDate(rule, first!, 1)

  assert.ok(first)
  assert.equal(first.getDay(), 0)
  assert.equal(first.getHours(), 18)
  assert.equal(first.getMinutes(), 30)
  assert.equal(next?.getDay(), 0)
  assert.equal(next?.getTime() - first.getTime(), 7 * 24 * 60 * 60 * 1000)
})

test('weekly activity deadline follows the selected weekday', () => {
  const anchor = new Date(2026, 9, 7, 12, 0, 0)
  const rule = { period: 'weekly', deadlineTime: '18:30', deadlineDay: null, weekDay: 3 }
  const first = activityDueDate(rule, anchor)
  const next = activityDueDate(rule, first!, 1)

  assert.ok(first)
  assert.equal(first.getDay(), 3)
  assert.equal(first.getHours(), 18)
  assert.equal(next?.getDay(), 3)
  assert.equal(next?.getTime() - first.getTime(), 7 * 24 * 60 * 60 * 1000)
})

test('workday activity skips weekends and resumes on Monday', () => {
  const friday = new Date(2026, 9, 9, 12, 0, 0)
  const rule = { period: 'workday', deadlineTime: '18:30', deadlineDay: null }
  const next = activityDueDate(rule, friday, 1)
  assert.ok(next)
  assert.equal(next.getDay(), 1)
  assert.equal(next.getHours(), 18)
  assert.equal(activityDueDate(rule, new Date(2026, 9, 10, 12, 0, 0)), null)
})
