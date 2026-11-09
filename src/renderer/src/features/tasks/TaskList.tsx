import type { DayItem, DayView, RepeatPlan } from '../../../../shared/tasks'
import { formatRepeatRule } from '../../../../shared/recurrence'
import type { TaskCompletion } from './use-task-completion'
import { TaskCategoryBadge } from './TaskCategoryBadge'

export function itemKey(item: DayItem): string {
  return item.kind === 'saved' ? item.occurrence.id : `${item.ref.planId}/${item.ref.sourceDate}/${item.ref.slotId}`
}
export function TaskList({ day, plans, tab, busy, pending, focusedId, onComplete, onEdit, onRemove, onMove, onPriority }: {
  day: DayView; tab: 'todo' | 'done'; busy: Set<string>; focusedId: string | null
  plans: RepeatPlan[]; onPriority: (item: DayItem) => void
  pending: ReadonlyMap<string, TaskCompletion>
  onComplete: (item: DayItem, completed: boolean, button: HTMLButtonElement) => void; onEdit: (item: DayItem) => void
  onRemove: (item: DayItem) => void; onMove: (item: DayItem) => void
}): React.JSX.Element {
  const displayedPending = new Map(pending)
  const order = new Map(day.items.map((item, index) => [itemKey(item), index]))
  // A future preview acquires an occurrence ID when saved. Keep its exiting row in the same slot.
  for (const [key, job] of pending) if (job.item.kind === 'preview') {
    const ref = job.item.ref
    const index = day.items.findIndex(item => item.kind === 'saved' && item.occurrence.planId === ref.planId &&
      item.occurrence.sourceDate === ref.sourceDate && item.occurrence.slotId === ref.slotId)
    if (index >= 0) { order.set(key, index); displayedPending.set(itemKey(day.items[index]), job) }
  }
  const rows = day.items.filter(item => (item.kind === 'saved' && item.occurrence.status === 'completed') === (tab === 'done') &&
    !(tab === 'todo' && displayedPending.has(itemKey(item))))
  if (tab === 'todo') for (const job of pending.values()) {
    const value = job.item.kind === 'saved' ? job.item.occurrence : job.item
    if (value.scheduledDate === day.date) rows.push(job.item)
  }
  if (tab === 'todo') rows.sort((a, b) => (order.get(itemKey(a)) ?? 0) - (order.get(itemKey(b)) ?? 0))
  if (tab === 'done') rows.sort((a, b) => (b.kind === 'saved' ? b.occurrence.completedAtMs ?? 0 : 0) - (a.kind === 'saved' ? a.occurrence.completedAtMs ?? 0 : 0))
  return <div className="reminder-list" aria-label={tab === 'done' ? '已完成任务' : '待办任务'}>
    {!rows.length && <div className="empty-state"><span>{tab === 'todo' ? '☁' : '✧'}</span><p>
      {day.kind === 'past' && !day.activated && !day.items.length ? '没有生成记录' : tab === 'done' ? '还没有已完成的任务'
        : day.kind === 'today' ? '今天没有待办任务' : day.kind === 'future' && !day.items.length ? '这天还没有安排' : '这天没有待办任务'}
    </p>{day.kind === 'past' && !day.activated && !day.items.length && <small>未运行的日期不会补造任务</small>}</div>}
    {rows.map(item => {
      const key = itemKey(item), value = item.kind === 'saved' ? item.occurrence : item
      const completion = displayedPending.get(key)
      const animating = completion && completion.phase !== 'saving' && tab === 'todo'
      const locked = busy.has(key) || !!completion
      const completed = item.kind === 'saved' && item.occurrence.status === 'completed'
      const recurring = item.kind === 'preview' || item.occurrence.planId !== null
      const planId = item.kind === 'preview' ? item.ref.planId : item.occurrence.planId
      const plan = plans.find(plan => plan.id === planId)
      const sameRule = plan && (item.kind === 'preview' || item.occurrence.planVersion === plan.version)
      const cycleLabel = sameRule ? formatRepeatRule(plan.recurrence) : '↻ 周期'
      const urgent = value.priority === 'urgent'
      const sourceDate = item.kind === 'saved' ? item.occurrence.sourceDate : value.scheduledDate
      return <div key={key} className={`task-row-shell ${completion?.phase === 'leaving' && tab === 'todo' ? 'leaving' : ''}`}>
        <div className="task-row-clip"><article data-occurrence-id={item.kind === 'saved' ? item.occurrence.id : undefined}
        data-completion-phase={completion?.phase}
        className={`reminder-row ${urgent && !completed ? 'urgent-row' : ''} ${completed ? 'completed-row' : ''} ${animating ? 'completing' : ''} ${focusedId === key ? 'focused' : ''} ${item.kind === 'preview' ? 'preview-row' : ''}`} aria-label={value.title}>
        <button className={`check ${completed || animating ? 'checked' : ''}`} disabled={busy.has(key) || (!!completion && (completed || completion.phase !== 'checking'))}
          aria-label={`${completion?.phase === 'checking' && !completed ? '取消完成' : completed ? '撤销' : '完成'}：${value.title}`}
          onClick={event => onComplete(item, !completed, event.currentTarget)}>{(completed || animating) &&
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3.5 3.5L13 4.5" pathLength="1" /></svg>}</button>
        <div className="reminder-content" onDoubleClick={() => { if (!locked) onEdit(item) }}>
          <strong className={completed ? 'struck' : 'task-title'} title={value.title}><span>{value.title}</span></strong>
          <div className="task-tags"><TaskCategoryBadge category={value.category} />{urgent && <span className="urgent-tag">🔥 紧急</span>}{!completed && value.scheduledTime && <span>{value.scheduledTime}</span>}{recurring && !completed && <span className={`cycle-tag ${sameRule ? plan.recurrence.type : 'daily'}`} title={cycleLabel}>{cycleLabel}</span>}
            {item.kind === 'preview' && <span>计划预览</span>}
            {!completed && sourceDate !== value.scheduledDate && <span>原 {sourceDate.slice(5)}</span>}
            {!completed && !value.reminderEnabled && value.scheduledTime && <span>提醒关闭</span>}
            {completed && item.kind === 'saved' && <span>{new Date(item.occurrence.completedAtMs!).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 完成</span>}
          </div>
          {day.kind === 'past' && !completed && <button className="move-task" disabled={locked} onClick={() => onMove(item)}>移到今天</button>}
        </div>
        {animating ? <span className="completion-stamp" aria-hidden="true">🐾 完成!</span> :
        <div className="row-actions">{completed ? <button className="undo-link" aria-label={`撤销完成：${value.title}`} disabled={locked} onClick={event => onComplete(item, false, event.currentTarget)}>撤销</button> : <>
          {day.kind !== 'past' && <button className={`priority-toggle ${urgent ? 'selected' : ''}`} aria-label={`${urgent ? '改为普通' : '标为紧急'}：${value.title}`} title={urgent ? '改为普通日常任务' : '标为紧急任务并排到最前'} disabled={locked} onClick={() => onPriority(item)}>★</button>}
          <button aria-label={`编辑：${value.title}`} disabled={locked} title={recurring ? '编辑所属重复计划' : '编辑任务'} onClick={() => onEdit(item)}>✎</button></>}
          {!completed && <button aria-label={`删除本次：${value.title}`} disabled={locked} onClick={() => onRemove(item)}>×</button>}</div>}
      </article></div></div>
    })}
  </div>
}
