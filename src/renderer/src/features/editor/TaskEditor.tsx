import { useEffect, useRef, useState } from 'react'
import type { AppResult } from '../../../../shared/contracts'
import type { Occurrence, Priority, RepeatPlan, RepeatRule, Scene } from '../../../../shared/tasks'

export type EditorTarget =
  | { kind: 'new'; requestId: string; title: string; date: string; reminderEnabled: boolean; type: 'once' | 'repeat'; priority: Priority }
  | { kind: 'once'; occurrence: Occurrence }
  | { kind: 'plan'; plan: RepeatPlan }
type SavedEditor = { kind: 'once'; occurrence: Occurrence } | { kind: 'plan'; plan: RepeatPlan }
interface DraftSlot { key: string; id?: string; localTime: string }

export function TaskEditor({ target, now, command, onSaved, onClose, onReload }: {
  target: EditorTarget; now: number
  command: <T>(action: () => Promise<AppResult<T>>) => Promise<AppResult<T>>
  onSaved: (result: SavedEditor) => void; onClose: () => void; onReload: () => Promise<string | undefined>
}): React.JSX.Element {
  const once = target.kind === 'once' ? target.occurrence : null
  const plan = target.kind === 'plan' ? target.plan : null
  const [type, setType] = useState<'once' | 'repeat'>(plan ? 'repeat' : target.kind === 'new' ? target.type : 'once')
  const [title, setTitle] = useState(once?.title ?? plan?.title ?? (target.kind === 'new' ? target.title : ''))
  const [date, setDate] = useState(once?.scheduledDate ?? (target.kind === 'new' ? target.date : ''))
  const [time, setTime] = useState(once?.scheduledTime ?? '')
  const [startDate, setStartDate] = useState(plan?.startDate ?? (target.kind === 'new' ? target.date : ''))
  const [endDate, setEndDate] = useState(plan?.endDate ?? '')
  const [reminderEnabled, setReminderEnabled] = useState(once?.reminderEnabled ?? plan?.reminderEnabled ?? (target.kind === 'new' && target.reminderEnabled))
  const [scene, setScene] = useState<Scene>(once?.scene ?? plan?.scene ?? 'generic')
  const [priority, setPriority] = useState<Priority>(once?.priority ?? plan?.priority ?? (target.kind === 'new' ? target.priority : 'normal'))
  const [cycle, setCycle] = useState<RepeatRule['type']>(plan?.recurrence.type ?? 'daily')
  const [weekdays, setWeekdays] = useState(plan?.recurrence.type === 'weekly' ? plan.recurrence.weekdays : [1, 5])
  const [monthDays, setMonthDays] = useState(plan?.recurrence.type === 'monthly' ? plan.recurrence.days : [1])
  const [lastDay, setLastDay] = useState(plan?.recurrence.type === 'monthly' && plan.recurrence.lastDay)
  const [customDay, setCustomDay] = useState('')
  const [slots, setSlots] = useState<DraftSlot[]>(() => plan ? plan.slots.filter(slot => slot.active)
    .sort((a, b) => a.localTime.localeCompare(b.localTime)).map(slot => ({ key: slot.id, id: slot.id, localTime: slot.localTime }))
    : ['10:00', '15:00'].map(localTime => ({ key: crypto.randomUUID(), localTime })))
  const [newTime, setNewTime] = useState('18:00')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const timingLocked = !!once && (once.status === 'completed' || (once.dueAtMs !== null && once.dueAtMs <= now))
  const ended = plan?.state === 'ended'

  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  function close(): void { if (!inFlight.current) onClose() }
  function addSlot(): void {
    if (!newTime) { setError('请先选择执行时间。'); return }
    if (slots.some(slot => slot.localTime === newTime)) { setError('这个执行时间已经存在。'); return }
    setSlots(current => [...current, { key: crypto.randomUUID(), localTime: newTime }]); setError('')
  }
  async function save(): Promise<void> {
    if (inFlight.current || ended) return
    setError(''); setConflict(false)
    if (!title.trim() || [...title.trim()].length > 60) { setError('请输入 1 至 60 字的任务名称。'); return }
    if (type === 'repeat' && (!slots.length || slots.some(slot => !slot.localTime))) { setError('至少设置一个执行时间。'); return }
    if (type === 'repeat' && cycle === 'weekly' && !weekdays.length) { setError('至少选择一个星期。'); return }
    if (type === 'repeat' && cycle === 'monthly' && !monthDays.length && !lastDay) { setError('至少选择一个日期或每月最后一天。'); return }
    if (type === 'repeat' && new Set(slots.map(slot => slot.localTime)).size !== slots.length) { setError('同一计划内的时间不能重复。'); return }
    if (type === 'repeat' && endDate && startDate > endDate) { setError('结束日期不能早于开始日期。'); return }
    inFlight.current = true; setSaving(true)
    try {
      if (type === 'once') {
        const fields = { title, scheduledDate: date, scheduledTime: time || null, reminderEnabled, scene, priority }
        const result = await command(() => once
          ? window.desktop.tasks.updateOnce({ ...fields, id: once.id, expectedVersion: once.version })
          : window.desktop.tasks.createOnce({ ...fields, requestId: target.kind === 'new' ? target.requestId : '' }))
        if (result.ok) onSaved({ kind: 'once', occurrence: result.value })
        else { setError(result.error.message); setConflict(result.error.code === 'CONFLICT') }
      } else {
        const recurrence: RepeatRule = cycle === 'daily' ? { type: cycle } : cycle === 'weekly'
          ? { type: cycle, weekdays } : { type: cycle, days: monthDays, lastDay }
        const fields = { title, startDate, endDate: endDate || null, reminderEnabled, scene, priority, recurrence }
        const ordered = [...slots].sort((a, b) => a.localTime.localeCompare(b.localTime))
        const result = await command(() => plan
          ? window.desktop.plans.update({ ...fields, id: plan.id, expectedVersion: plan.version,
            slots: ordered.map(slot => ({ id: slot.id, localTime: slot.localTime })) })
          : window.desktop.plans.create({ ...fields, requestId: target.kind === 'new' ? target.requestId : '', times: ordered.map(slot => slot.localTime) }))
        if (result.ok) onSaved({ kind: 'plan', plan: result.value })
        else { setError(result.error.message); setConflict(result.error.code === 'CONFLICT') }
      }
    } finally { inFlight.current = false; setSaving(false) }
  }
  return <dialog ref={dialog} className="task-editor" aria-labelledby="editor-heading" onCancel={event => { event.preventDefault(); close() }}>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <header className="editor-heading"><h2 id="editor-heading">{target.kind === 'new' ? '新增任务与周期计划' : once ? '编辑一次性任务' : ended ? '已结束的周期计划' : '编辑周期重复计划'}</h2>
        <button type="button" aria-label="关闭编辑器" disabled={saving} onClick={close}>×</button></header>
      <fieldset disabled={saving || ended} className="editor-fields">
        <div className="editor-types"><button type="button" disabled={target.kind !== 'new'} className={type === 'once' ? 'selected' : ''} onClick={() => setType('once')}>一次性任务</button>
          <button type="button" disabled={target.kind !== 'new'} className={type === 'repeat' ? 'selected' : ''} onClick={() => setType('repeat')}>周期重复计划</button></div>
        <label className="field-label">任务名称<input aria-label="任务名称" autoFocus required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：起身运动 / 饭后吃药" /></label>
        <div className="field-label">任务优先级（紧急任务自动排在待办最前面）<div className="priority-options">
          <button type="button" aria-pressed={priority === 'normal'} onClick={() => setPriority('normal')}>📋 普通日常任务</button>
          <button type="button" className="urgent" aria-pressed={priority === 'urgent'} onClick={() => setPriority('urgent')}>🔥 紧急任务（置顶）</button></div></div>
        {type === 'once' ? <>
          <div className="editor-grid"><label className="field-label">执行日期<input aria-label="执行日期" type="date" required value={date} disabled={timingLocked} onChange={event => setDate(event.target.value)} /></label>
            <label className="field-label">提醒时间（可选）<input aria-label="提醒时间" type="time" value={time} disabled={timingLocked} onChange={event => setTime(event.target.value)} /></label></div>
          {timingLocked ? <p className="editor-note">已到点或已完成的任务保留原时间，仍可修改名称与提醒开关。</p>
            : <p className="editor-note">时间留空就是无时间待办。</p>}
        </> : <>
          <div className="field-label">重复周期类型<div className="editor-types cycle-options">{(['daily', 'weekly', 'monthly'] as const).map((value, index) => <button key={value} type="button" className={cycle === value ? 'selected' : ''} onClick={() => setCycle(value)}>{['↻ 每天', '📆 每周计划', '🗓 每月计划'][index]}</button>)}</div></div>
          {cycle === 'weekly' && <div className="cycle-picker weekly-picker"><strong>选择每周几执行（可多选）</strong><div className="weekday-pills">{[1, 2, 3, 4, 5, 6, 7].map(day => <button key={day} type="button" aria-pressed={weekdays.includes(day)} onClick={() => setWeekdays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort((a, b) => a - b))}>周{'一二三四五六日'[day - 1]}</button>)}</div></div>}
          {cycle === 'monthly' && <div className="cycle-picker monthly-picker"><strong>选择每月几号执行（可多选）</strong><div className="monthday-pills">{[...new Set([1, 2, 5, 10, 15, 20, 25, 28, ...monthDays])].sort((a, b) => a - b).map(day => <button key={day} type="button" aria-pressed={monthDays.includes(day)} onClick={() => setMonthDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort((a, b) => a - b))}>{day}号</button>)}</div>
            <div className="add-slot"><input aria-label="每月自定义日期" type="number" min="1" max="31" placeholder="输入 1～31 号" value={customDay} onChange={event => setCustomDay(event.target.value)} />
              <button type="button" onClick={() => { const day = Number(customDay); if (!Number.isInteger(day) || day < 1 || day > 31) { setError('请输入 1 至 31 号。'); return } setMonthDays(current => [...new Set([...current, day])].sort((a, b) => a - b)); setCustomDay(''); setError('') }}>＋ 添加日期</button></div>
            <label className="editor-reminder">每月最后一天<input type="checkbox" aria-label="每月最后一天" checked={lastDay} onChange={event => setLastDay(event.target.checked)} /></label>
            <p className="editor-note">当月没有所选日期时跳过；月底事项可选择「每月最后一天」。</p></div>}
          <div className="field-label">执行时间槽（独立完成）<div className="slot-list">{slots.map(slot => <span key={slot.key} className="slot-input">
            <input type="time" aria-label={`时间槽 ${slot.localTime}`} required value={slot.localTime} onChange={event => setSlots(current => current.map(entry => entry.key === slot.key ? { ...entry, localTime: event.target.value } : entry))} />
            <button type="button" aria-label={`移除时间 ${slot.localTime}`} onClick={() => setSlots(current => current.filter(entry => entry.key !== slot.key))}>×</button>
          </span>)}</div></div>
          <div className="add-slot"><input aria-label="新增执行时间" type="time" value={newTime} onChange={event => setNewTime(event.target.value)} />
            <button type="button" onClick={addSlot}>＋ 添加时间</button></div>
          <div className="editor-grid"><label className="field-label">开始日期<input aria-label="开始日期" type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
            <label className="field-label">结束日期（可选）<input aria-label="结束日期" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label></div>
          <p className="editor-note">每个时间独立完成，结束日期包含当天。修改计划会保留已到点和已完成的记录。</p>
        </>}
        <label className="editor-reminder">到点提醒<input aria-label="到点提醒" type="checkbox" checked={reminderEnabled} onChange={event => setReminderEnabled(event.target.checked)} /></label>
        <label className="field-label">提醒动作<select aria-label="提醒动作" value={scene} onChange={event => setScene(event.target.value as Scene)}>
          <option value="generic">摇铃提醒</option><option value="water">喝水提醒</option><option value="stretch">拉伸提醒</option>
        </select></label>
      </fieldset>
      {ended && <p className="editor-note">该计划已结束，历史记录仍然保留。需要再次安排时请新建计划。</p>}
      {error && <div className="editor-error" role="alert">{error}{conflict && target.kind !== 'new' && <button type="button" disabled={saving} onClick={() => { void onReload().then(message => { if (message) setError(message) }) }}>重新载入最新记录</button>}</div>}
      <footer className="editor-actions"><button type="button" className="secondary" disabled={saving} onClick={close}>{ended ? '关闭' : '取消'}</button>
        {!ended && <button type="submit" className="primary" disabled={saving}>{saving ? '保存中…' : '保存安排'}</button>}</footer>
    </form>
  </dialog>
}

export function EndPlanDialog({ plan, busy, error, onConfirm, onClose }: {
  plan: RepeatPlan; busy: boolean; error: string; onConfirm: () => void; onClose: () => void
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  return <dialog ref={dialog} className="task-editor confirm-dialog" aria-labelledby="end-heading" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <h2 id="end-heading">结束重复计划？</h2><p className="confirm-plan-title">{plan.title}</p>
    <p>取消尚未到点的安排，保留已到点、已完成及手动移到今天的记录。结束后不能恢复。</p>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <footer className="editor-actions"><button className="secondary" disabled={busy} onClick={onClose}>取消</button>
      <button className="danger-button" disabled={busy} onClick={onConfirm}>{busy ? '处理中…' : '确认结束'}</button></footer>
  </dialog>
}
