import { randomUUID } from 'node:crypto'
import type { CreatePlanInput, CreateOnceInput, DayView, Occurrence } from '../src/shared/tasks'
import { Connection } from '../src/main/database/connection'
import { clockSnapshot, dueAt } from '../src/main/domain/time'
import { TaskRepository } from '../src/main/tasks/repository'
import { TaskService } from '../src/main/tasks/service'
import { ReminderRepository } from '../src/main/reminders/repository'
import { SettingsRepository } from '../src/main/settings/repository'

export function fixture(path = ':memory:') {
  const connection = new Connection(path, 'Asia/Shanghai')
  let time = dueAt('2026-11-02', '12:00', 'Asia/Shanghai'), zone = 'Asia/Shanghai'
  const clock = () => clockSnapshot(time, zone)
  const repository = new TaskRepository(connection.db)
  const records = new ReminderRepository(connection.db)
  const settings = new SettingsRepository(connection.db)
  const tasks = new TaskService(repository, records, clock)
  function once(patch: Partial<CreateOnceInput> = {}) {
    return tasks.createOnce({ requestId: randomUUID(), title: '一次性任务', scheduledDate: clock().today,
      scheduledTime: null, reminderEnabled: true, scene: 'generic', ...patch })
  }
  function plan(patch: Partial<CreatePlanInput> = {}) {
    return tasks.createPlan({ requestId: randomUUID(), title: '每天喝水', startDate: clock().today,
      endDate: null, reminderEnabled: true, scene: 'water', times: ['10:00', '15:00'], ...patch })
  }
  return { connection, repository, records, settings, tasks, clock, once, plan,
    setTime(date: string, localTime = '12:00') { time = dueAt(date, localTime, zone) },
    setZone(next: string) { zone = next }, close() { connection.close() } }
}
export function saved(day: DayView): Occurrence[] {
  return day.items.flatMap(item => item.kind === 'saved' ? [item.occurrence] : [])
}
