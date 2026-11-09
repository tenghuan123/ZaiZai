import type { RepeatPlan } from '../../../../shared/tasks'
import { formatRepeatRule } from '../../../../shared/recurrence'
import { TaskCategoryBadge } from '../tasks/TaskCategoryBadge'

export function PlanList({ plans, busy, onEdit, onPaused, onEnd, onCreate }: {
  plans: RepeatPlan[]; busy: Set<string>; onEdit: (plan: RepeatPlan) => void
  onPaused: (plan: RepeatPlan) => void; onEnd: (plan: RepeatPlan) => void; onCreate: () => void
}): React.JSX.Element {
  const active = plans.filter(plan => plan.state !== 'ended')
  return <section className="reminder-list plan-list" aria-label="周期计划列表">
    <div className="list-heading"><span>支持 <strong>每日 / 每周 / 每月</strong> 自动生成</span><button onClick={onCreate}>＋ 新建计划</button></div>
    {!active.length && <div className="empty-state"><span>↻</span><p>把常做的小事设为周期计划</p></div>}
    {active.map(plan => {
      const times = plan.slots.filter(slot => slot.active).map(slot => slot.localTime).sort().join(' / ')
      return <article key={plan.id} className={`plan-row ${plan.state === 'paused' ? 'paused-plan' : ''}`} aria-label={plan.title}>
        <header><strong title={plan.title}>{plan.title}</strong><span className={`plan-state ${plan.state}`}>{plan.state === 'paused' ? '已暂停' : '生效中'}</span></header>
        <div className="plan-meta-actions"><div className="task-tags"><TaskCategoryBadge category={plan.category} /><span className={`cycle-tag ${plan.recurrence.type}`} title={formatRepeatRule(plan.recurrence)}>{formatRepeatRule(plan.recurrence)}</span>
          {plan.priority === 'urgent' && <span className="urgent-tag">🔥 紧急</span>}
          <span className="plan-slot-summary" title={times}>🕒 {times}</span></div>
          <footer><button disabled={busy.has(plan.id)} onClick={() => onEdit(plan)}>编辑</button>
            <button disabled={busy.has(plan.id)} onClick={() => onPaused(plan)}>{plan.state === 'paused' ? '恢复' : '暂停'}</button>
            <button className="danger" disabled={busy.has(plan.id)} onClick={() => onEnd(plan)}>结束</button></footer></div>
      </article>
    })}
  </section>
}
