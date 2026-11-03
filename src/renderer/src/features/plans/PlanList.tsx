import type { RepeatPlan } from '../../../../shared/tasks'

export function PlanList({ plans, busy, onEdit, onPaused, onEnd, onCreate }: {
  plans: RepeatPlan[]; busy: Set<string>; onEdit: (plan: RepeatPlan) => void
  onPaused: (plan: RepeatPlan) => void; onEnd: (plan: RepeatPlan) => void; onCreate: () => void
}): React.JSX.Element {
  const active = plans.filter(plan => plan.state !== 'ended')
  return <section className="reminder-list plan-list" aria-label="重复计划列表">
    <div className="plan-heading"><span>每天的安排</span><button onClick={onCreate}>＋ 新增计划</button></div>
    {!active.length && <div className="empty-state"><span>↻</span><p>把常做的小事设为每日计划</p></div>}
    {active.map(plan => <article key={plan.id} className="plan-row" aria-label={plan.title}>
      <header><strong title={plan.title}>{plan.title}</strong><span className={`plan-state ${plan.state}`}>{plan.state === 'paused' ? '已暂停' : '生效中'}</span></header>
      <div className="plan-times">{plan.slots.filter(slot => slot.active).sort((a, b) => a.localTime.localeCompare(b.localTime)).map(slot => <span key={slot.id}>{slot.localTime}</span>)}</div>
      <small>{plan.startDate} 起{plan.endDate ? ` · 至 ${plan.endDate}（含当天）` : ' · 长期'}{!plan.reminderEnabled && ' · 提醒关闭'}</small>
      <footer><button disabled={busy.has(plan.id)} onClick={() => onEdit(plan)}>编辑</button>
        <button disabled={busy.has(plan.id)} onClick={() => onPaused(plan)}>{plan.state === 'paused' ? '恢复' : '暂停'}</button>
        <button className="danger" disabled={busy.has(plan.id)} onClick={() => onEnd(plan)}>结束</button></footer>
    </article>)}
  </section>
}
