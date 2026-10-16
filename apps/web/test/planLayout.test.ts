import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutPlans } from '../src/planLayout.ts'

const plan = (id: string, startMinute: number, endMinute: number) => ({ id, startMinute, endMinute })

test('sequential plans each use the full timeline width', () => {
  const layout = layoutPlans([plan('first', 60, 120), plan('second', 120, 180), plan('third', 240, 300)])
  assert.deepEqual([...layout.values()], [
    { lane: 0, lanes: 1 },
    { lane: 0, lanes: 1 },
    { lane: 0, lanes: 1 },
  ])
})

test('only a connected overlapping group is divided into lanes', () => {
  const layout = layoutPlans([plan('first', 60, 180), plan('parallel', 90, 150), plan('later', 180, 240)])
  assert.deepEqual(layout.get('first'), { lane: 0, lanes: 2 })
  assert.deepEqual(layout.get('parallel'), { lane: 1, lanes: 2 })
  assert.deepEqual(layout.get('later'), { lane: 0, lanes: 1 })
})

test('lane count is the peak simultaneous count within an overlap group', () => {
  const layout = layoutPlans([plan('first', 60, 150), plan('second', 90, 180), plan('third', 150, 240)])
  assert.deepEqual(layout.get('first'), { lane: 0, lanes: 2 })
  assert.deepEqual(layout.get('second'), { lane: 1, lanes: 2 })
  assert.deepEqual(layout.get('third'), { lane: 0, lanes: 2 })
})
