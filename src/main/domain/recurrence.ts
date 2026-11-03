import type { PlanSlot, RepeatPlan } from '../../shared/tasks'
import { dueAt } from './time'
import { Temporal } from '@js-temporal/polyfill'

export function candidate(plan: RepeatPlan, slot: PlanSlot, date: string, timeZone: string): number | null {
  if (plan.state !== 'active' || !slot.active || date < plan.startDate || (plan.endDate !== null && date > plan.endDate)) return null
  const day = Temporal.PlainDate.from(date), rule = plan.recurrence
  if (rule.type === 'weekly' && !rule.weekdays.includes(day.dayOfWeek)) return null
  if (rule.type === 'monthly' && !rule.days.includes(day.day) && !(rule.lastDay && day.day === day.daysInMonth)) return null
  const due = dueAt(date, slot.localTime, timeZone)
  return due >= plan.effectiveFromMs ? due : null
}
