export interface PlanInterval {
  id: string
  startMinute: number
  endMinute: number
}

export interface PlanLayout {
  lane: number
  lanes: number
}

export function layoutPlans<T extends PlanInterval>(plans: T[]): Map<string, PlanLayout> {
  const sorted = [...plans].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.id.localeCompare(b.id))
  const result = new Map<string, PlanLayout>()
  let group: T[] = []
  let groupEnd = -1

  const finishGroup = () => {
    if (!group.length) return
    const laneEnds: number[] = []
    for (const plan of group) {
      let lane = laneEnds.findIndex(end => end <= plan.startMinute)
      if (lane < 0) lane = laneEnds.length
      laneEnds[lane] = plan.endMinute
      result.set(plan.id, { lane, lanes: 1 })
    }
    for (const plan of group) {
      result.set(plan.id, { ...result.get(plan.id)!, lanes: laneEnds.length })
    }
    group = []
    groupEnd = -1
  }

  for (const plan of sorted) {
    if (group.length && plan.startMinute >= groupEnd) finishGroup()
    group.push(plan)
    groupEnd = Math.max(groupEnd, plan.endMinute)
  }
  finishGroup()
  return result
}
