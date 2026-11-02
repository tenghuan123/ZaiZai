import type { PlanSlot, RepeatPlan } from '../../shared/tasks'
import { dueAt } from './time'

export function candidate(plan: RepeatPlan, slot: PlanSlot, date: string, timeZone: string): number | null {
  if (plan.state !== 'active' || !slot.active || date < plan.startDate || (plan.endDate !== null && date > plan.endDate)) return null
  const due = dueAt(date, slot.localTime, timeZone)
  return due >= plan.effectiveFromMs ? due : null
}
