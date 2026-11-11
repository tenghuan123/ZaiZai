import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { DayItem, Priority, RepeatPlan } from '../../shared/tasks'
import { useWorkspace } from './features/tasks/use-workspace'
import { itemKey, TaskList } from './features/tasks/TaskList'
import { DailyReportDialog } from './features/tasks/DailyReportDialog'
import { DateNavigator, shiftDate } from './features/calendar/DateNavigator'
import { PlanList } from './features/plans/PlanList'
import { EndPlanDialog, TaskEditor } from './features/editor/TaskEditor'
import type { EditorTarget } from './features/editor/TaskEditor'
import type { PetAction } from '../../shared/pet'
import { PetActions } from './features/pet/PetActions'
import { getPetPack } from './features/pet/pet-pack'
import { useTaskCompletion } from './features/tasks/use-task-completion'
import { CompletionEffects } from './features/tasks/CompletionEffects'
import { MENU_TRANSITION_MS } from '../../shared/motion'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { LARGE_SIZE, PANEL_FRAME_INSET, STANDARD_SIZE } from '../../shared/window'
import { useUpdates } from './features/updates/use-updates'
import { WhatsNewDialog } from './features/updates/UpdatePanel'
import { useWindowDrag } from './use-window-drag'
import { useWindowHitRegions } from './use-window-hit-regions'

const api = window.desktop
function editorKey(target: EditorTarget): string {
  return target.kind === 'new' ? target.requestId : target.kind === 'once'
    ? `${target.occurrence.id}/${target.occurrence.version}` : `${target.plan.id}/${target.plan.version}`
}

export function App(): React.JSX.Element {
  const updates = useUpdates()
  useWindowHitRegions()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const { workspace, day, loading, error, setError, refresh, command } = useWorkspace(selectedDate)
  const [now, setNow] = useState(Date.now)
  const [title, setTitle] = useState('')
  const [quickPriority, setQuickPriority] = useState<Priority>('normal')
  const [tab, setTab] = useState<'todo' | 'done' | 'plans'>('todo')
  const [showCalendar, setShowCalendar] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [reviewWhatsNew, setReviewWhatsNew] = useState(false)
  const [showPet, setShowPet] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [petPreview, setPetPreview] = useState<PetAction>('idle')
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [ending, setEnding] = useState<RepeatPlan | null>(null)
  const [busy, setBusy] = useState(new Set<string>())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [completionCount, setCompletionCount] = useState(0)
  const quickRequest = useRef(crypto.randomUUID())
  const busyRef = useRef(new Set<string>())
  const lastPanelRequest = useRef(0)
  const resizePointer = useRef<number | null>(null)
  const snapshot = workspace?.snapshot
  const petPack = getPetPack(snapshot?.settings.petId)
  const activeReminderId = snapshot?.activeReminderIds[0] ?? null
  const compact = snapshot?.window.mode === 'compact'
  const sessionId = snapshot?.sessionId
  const completion = useTaskCompletion(complete, snapshot?.window.petAnchor)
  const drag = useWindowDrag(setError)

  useEffect(() => {
    if (!sessionId) return
    void api.presentPet({ kind: 'preview', action: showPet && !compact ? petPreview : null })
      .catch(() => {})
  }, [showPet, compact, petPreview, sessionId])

  useEffect(() => {
    if (snapshot?.window.animationsPaused) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [snapshot?.window.animationsPaused])
  useEffect(() => {
    const request = snapshot?.window.panelRequest
    if (!request || request.sequence === lastPanelRequest.current) return
    lastPanelRequest.current = request.sequence
    setShowPet(false)
    setShowCalendar(false)
    setShowReport(false)
    setShowSettings(request.target.kind === 'settings')
    if (request.target.kind === 'reminder') {
      setFocusedId(request.target.reminderId)
      setSelectedDate(null)
      setTab('todo')
    }
  }, [snapshot?.window.panelRequest])
  useEffect(() => {
    if (focusedId && day && tab === 'todo') document.querySelector(`[data-occurrence-id="${CSS.escape(focusedId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [focusedId, day, tab])
  function say(text: string, reaction?: 'celebrate' | 'all_done' | null): void {
    void api.presentPet({ kind: 'feedback', text, reaction }).catch(() => {})
  }
  async function withBusy(key: string, action: () => Promise<void>): Promise<void> {
    if (busyRef.current.has(key)) return
    busyRef.current.add(key); setBusy(new Set(busyRef.current))
    try { await action() } finally { busyRef.current.delete(key); setBusy(new Set(busyRef.current)) }
  }
  async function selectPetPack(id: string): Promise<void> {
    if (!snapshot || id === petPack.id) return
    await withBusy('pet-selection', async () => {
      const result = await command(() => api.settings.update({ expectedVersion: snapshot.settings.version, patch: { petId: id } }))
      if (result.ok) {
        setPetPreview('idle')
        say(`已切换为${getPetPack(id).name}`)
      }
    })
  }
  function selectDate(date: string): void {
    setSelectedDate(date === snapshot?.today.date ? null : date); setShowSettings(false); setShowPet(false)
    if (tab === 'plans') setTab('todo')
  }
  function openNew(type: 'once' | 'repeat' = 'once'): void {
    if (!snapshot) return
    setError(''); setShowCalendar(false)
    setEditor({ kind: 'new', requestId: crypto.randomUUID(), title, type,
      date: selectedDate && selectedDate > snapshot.today.date ? selectedDate : snapshot.today.date,
      reminderEnabled: snapshot.settings.defaultReminderEnabled, priority: quickPriority })
  }
  function editItem(item: DayItem): void {
    setError('')
    if (item.kind === 'saved' && item.occurrence.planId === null) setEditor({ kind: 'once', occurrence: item.occurrence })
    else {
      const planId = item.kind === 'preview' ? item.ref.planId : item.occurrence.planId
      const plan = workspace?.plans.find(value => value.id === planId)
      if (plan) setEditor({ kind: 'plan', plan })
      else { setError('所属计划暂时无法读取，请重试。'); void refresh() }
    }
  }
  async function reloadEditor(): Promise<string | undefined> {
    try {
      if (editor?.kind === 'plan') {
        const result = await api.plans.list()
        if (!result.ok) return result.error.message
        const plan = result.value.find(value => value.id === editor.plan.id)
        if (plan) { setEditor({ kind: 'plan', plan }); setError(''); return }
      } else if (editor?.kind === 'once') {
        const result = await api.tasks.getDay(editor.occurrence.scheduledDate)
        if (!result.ok) return result.error.message
        const item = result.value.items.find(item => item.kind === 'saved' && item.occurrence.id === editor.occurrence.id)
        if (item?.kind === 'saved') { setEditor({ kind: 'once', occurrence: item.occurrence }); setError(''); return }
      }
      return '原日期中已没有这条记录，可能已删除或移动。草稿仍保留，可关闭后重新查看。'
    } catch { return '最新记录读取失败，草稿仍保留，请重试。' }
  }
  async function quickAdd(): Promise<void> {
    if (!title.trim()) { openNew(); return }
    if (!snapshot) return
    const date = selectedDate ?? snapshot.today.date
    if (date < snapshot.today.date) return
    await withBusy('quick', async () => {
      const result = await command(() => api.tasks.createOnce({ requestId: quickRequest.current, title,
        scheduledDate: date, scheduledTime: null, reminderEnabled: snapshot.settings.defaultReminderEnabled, priority: quickPriority }))
      if (result.ok) {
        quickRequest.current = crypto.randomUUID(); setTitle(''); setQuickPriority('normal'); setTab('todo'); say(`${date === snapshot.today.date ? '今日' : date.slice(5).replace('-', '月') + '日'}待办已保存 🐾`)
      }
    })
  }
  async function complete(item: DayItem, completed: boolean): Promise<boolean> {
    let saved = false
    await withBusy(itemKey(item), async () => {
      const result = await command(() => api.tasks.setCompleted(item.ref, completed))
      saved = result.ok
      if (result.ok && result.value.changed) {
        const restoredToToday = item.kind === 'saved' && item.occurrence.scheduledDate !== result.value.occurrence.scheduledDate
        const feedback = restoredToToday ? '已恢复到今天的遗留待办' : '已恢复到待办清单'
        say(result.value.allCompleted ? petPack.quotes.allDone : completed ? petPack.quotes.celebrate : feedback,
          completed ? (result.value.allCompleted ? 'all_done' : 'celebrate') : null)
        if (completed) setCompletionCount(count => count + 1)
      }
    })
    return saved
  }
  async function remove(item: DayItem): Promise<void> {
    await withBusy(itemKey(item), async () => {
      const result = await command(() => api.tasks.removeOccurrence(item.ref))
      if (result.ok) say('已删除这一次安排')
    })
  }
  async function move(item: DayItem): Promise<void> {
    await withBusy(itemKey(item), async () => {
      const result = await command(() => api.tasks.moveToToday(item.ref))
      if (result.ok) say('已把这次安排移到今天 🐾')
    })
  }
  async function togglePriority(item: DayItem): Promise<void> {
    await withBusy(itemKey(item), async () => {
      const value = item.kind === 'saved' ? item.occurrence : item
      await command(() => api.tasks.setPriority(item.ref, value.priority === 'urgent' ? 'normal' : 'urgent'))
    })
  }
  function resizeStart(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0 || !event.isPrimary) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    resizePointer.current = event.pointerId
    void command(() => api.beginResize())
  }
  function resizeEnd(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (resizePointer.current !== event.pointerId) return
    resizePointer.current = null
    void command(() => api.endResize())
  }
  function toggleSize(): void {
    if (!snapshot) return
    const size = snapshot.settings.expandedSize
    void command(() => api.settings.update({ expectedVersion: snapshot.settings.version,
      patch: { expandedSize: size.width >= 410 || size.height >= 580 ? STANDARD_SIZE : LARGE_SIZE } }))
  }
  if (!workspace || !snapshot) return <main className="loading">{error || '桌面伙伴正在醒来…'}{error && <button data-window-hit onClick={() => { void refresh() }}>重新读取</button>}</main>
  const updateStatus = updates.state?.status
  const hasUpdate = updateStatus?.phase === 'downloading' || updateStatus?.phase === 'ready' || updateStatus?.phase === 'installing'
  const whatsNew = updates.state?.whatsNew
  const openWhatsNew = whatsNew?.pending && snapshot.window.visible && !compact
  const { horizontal, vertical } = snapshot.window.panel.direction
  const date = selectedDate ?? snapshot.today.date
  const past = date < snapshot.today.date
  const dateLabel = date === snapshot.today.date ? '待办进度' : `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日 · ${date === shiftDate(snapshot.today.date, 1) ? '明天' : past ? '历史' : '未来'}`
  const done = day?.items.filter(item => item.kind === 'saved' && item.occurrence.status === 'completed').length ?? 0
  const total = day?.items.length ?? 0
  const urgentCount = day?.items.filter(item => { const value = item.kind === 'saved' ? item.occurrence : item; return value.priority === 'urgent' && !(item.kind === 'saved' && item.occurrence.status === 'completed') }).length ?? 0
  return <main className={`widget panel-window ${compact ? 'compact' : ''}`}
    data-horizontal={horizontal} data-vertical={vertical}
    style={{ '--menu-duration': `${MENU_TRANSITION_MS}ms`, '--panel-inset': `${PANEL_FRAME_INSET}px` } as CSSProperties}>
    <section className="card" data-window-hit aria-hidden={compact} inert={compact}>
      <header className="card-header" {...drag.handlers}
        onPointerDown={event => { if (!(event.target as Element).closest('button, input')) drag.handlers.onPointerDown(event) }}>
        <div className="window-controls">
        <button className="round blue" aria-label="仅显示桌宠" onClick={() => { void command(() => api.setMode('compact')) }}>
          <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false"><path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        </button>
        <button className="round coral" aria-label="关闭桌面伙伴" onClick={() => { void command(() => api.requestClose()) }}>
          <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false"><path d="m3 3 6 6m0-6L3 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        </button>
        <button className={`settings-button calendar-button ${showCalendar ? 'active' : ''}`} aria-label="日期与历史" title="查看历史待办和未来安排"
          aria-haspopup="dialog" aria-expanded={showCalendar} onClick={event => { event.currentTarget.focus(); setShowCalendar(true); setShowSettings(false); setShowPet(false) }}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3.5" width="12" height="10.5" rx="2" /><path d="M5 2v3M11 2v3M2 7h12M5 10h2" /></svg></button>
        <button className={`layer-button ${snapshot.window.alwaysOnTop ? '' : 'desktop-layer'}`} aria-label="切换桌面层级" title={snapshot.window.alwaysOnTop ? '当前：始终置顶，点击切换为仅在桌面' : '当前：仅在桌面，点击恢复始终置顶'} onClick={() => { void command(() => api.settings.update({ expectedVersion: snapshot.settings.version, patch: { alwaysOnTop: !snapshot.settings.alwaysOnTop } })) }}>{snapshot.window.alwaysOnTop ? '📌 置顶' : '🖥 桌面'}</button>
        <button className={`settings-button ${showPet ? 'active' : ''}`} aria-label="桌宠动作" onClick={() => { setShowPet(value => !value); setShowSettings(false); setShowCalendar(false) }}>🐾</button>
        <button className="settings-button" aria-label="组件偏好设置" aria-description={hasUpdate ? '有新版本可用' : undefined}
          title={hasUpdate ? `发现新版本 v${updateStatus.version}` : '组件偏好设置'}
          onClick={() => { setShowSettings(value => !value); setShowPet(false) }}>⚙
          {hasUpdate && <span className="settings-update-dot" aria-hidden="true" />}
        </button>
      </div><div className="clock"><strong>{new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</strong>
        <span>{new Date(now).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'long' })}</span></div></header>
      {showPet ? <PetActions pack={petPack} selected={petPreview} blocked={!!activeReminderId} switching={busy.has('pet-selection')}
        onSelectPack={id => { void selectPetPack(id) }} onSelect={action => { setPetPreview(action); if (action === 'remind' && snapshot.settings.reminderSoundEnabled) void command(() => api.previewReminderSound()) }} onClose={() => setShowPet(false)} /> : <>
        <div className="progress-caption" aria-live="polite"><span title={date}>{dateLabel} {day ? `${done}/${total}` : '读取中…'}</span>{urgentCount > 0 && <span className="urgent-tag urgent-count">🔥 {urgentCount}项紧急</span>}
          <span className="progress-tools">{date !== snapshot.today.date && <button aria-label="返回今天" onClick={() => selectDate(snapshot.today.date)}>回今天</button>}{day?.progress.percentage ?? 0}%</span></div>
        <div className="progress-track"><div style={{ width: `${day?.progress.percentage ?? 0}%` }} /></div>
        <nav className="tabs" aria-label="任务清单分类">
          <button className={tab === 'todo' ? 'selected' : ''} onClick={() => setTab('todo')}>待办 ({total - done})</button>
          <button className={tab === 'done' ? 'selected' : ''} onClick={() => setTab('done')}>已完成 <span key={completionCount} className={completionCount ? 'completion-badge' : ''}>({done})</span></button>
          <button className={tab === 'plans' ? 'selected' : ''} onClick={() => { setTab('plans'); setShowCalendar(false) }}>周期计划 ({workspace.plans.filter(plan => plan.state !== 'ended').length})</button>
        </nav>
        {tab === 'done' && date === snapshot.today.date && <div className="list-heading">
          <span>整理今天完成的事项</span>
          <button type="button" aria-haspopup="dialog" onClick={() => setShowReport(true)}>生成今日日报</button>
        </div>}
        {tab === 'plans' ? <PlanList plans={workspace.plans} busy={busy} onCreate={() => openNew('repeat')} onEdit={plan => { setError(''); setEditor({ kind: 'plan', plan }) }}
          onPaused={plan => { void withBusy(plan.id, async () => { const result = await command(() => api.plans.setPaused(plan.id, plan.state !== 'paused')); if (result.ok) say(result.value.state === 'paused' ? '计划已暂停，历史仍保留' : '计划已恢复，从现在继续安排') }) }}
          onEnd={plan => { setError(''); setEnding(plan) }} />
          : day && !loading ? <TaskList day={day} plans={workspace.plans} tab={tab} busy={busy} pending={completion.pending} focusedId={focusedId}
            onComplete={(item, desired, button) => { if (desired) completion.toggle(item, button); else void complete(item, false) }} onEdit={editItem}
            onPriority={item => { void togglePriority(item) }} onRemove={item => { void remove(item) }} onMove={item => { void move(item) }} /> : <div className="empty-state"><p>{loading ? '正在读取这一天…' : '这一天暂时无法读取'}</p><button onClick={() => { void refresh() }}>重新读取</button></div>}
        {!past && <form className="quick-add" onSubmit={event => { event.preventDefault(); void quickAdd() }}>
          <div><input aria-label="新增待办" maxLength={120} placeholder={date === snapshot.today.date ? '添加新待办…' : '添加这一天的待办…'} value={title} disabled={busy.has('quick')} onChange={event => setTitle(event.target.value)} />
            <button type="button" className={`quick-urgent ${quickPriority === 'urgent' ? 'selected' : ''}`} aria-label="紧急任务" aria-pressed={quickPriority === 'urgent'} onClick={() => setQuickPriority(value => value === 'urgent' ? 'normal' : 'urgent')}>🔥 紧急</button>
            <button type="button" aria-label="定时或重复" onClick={() => openNew(tab === 'plans' ? 'repeat' : 'once')}>◷ 周期</button></div>
          <button type="submit" className="add-button" aria-label="快捷新增任务" disabled={busy.has('quick')}>＋</button>
        </form>}
      </>}
      <button className="resize-handle" aria-label="调整窗口尺寸"
        title={`向${horizontal === 'left' ? '左' : '右'}${vertical === 'up' ? '上' : '下'}拖大清单，双击切换标准与大尺寸`}
        onPointerDown={resizeStart} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} onLostPointerCapture={resizeEnd} onDoubleClick={toggleSize}>
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
          <line x1="10" y1="4" x2="4" y2="10" />
          <line x1="10" y1="8" x2="8" y2="10" />
        </svg>
      </button>
    </section>
    <CompletionEffects pending={completion.pending} />
    {showSettings && <SettingsDialog snapshot={snapshot} command={command} updates={updates} onWhatsNew={() => setReviewWhatsNew(true)}
      onClose={() => { setShowSettings(false); setError('') }} />}
    {showCalendar && <DateNavigator today={snapshot.today.date} selected={date} historyDates={workspace.historyDates} onSelect={selectDate} onClose={() => setShowCalendar(false)} />}
    {showReport && <DailyReportDialog onClose={() => setShowReport(false)} />}
    {editor && <TaskEditor key={editorKey(editor)} target={editor} now={now} today={snapshot.today.date} command={command} onClose={() => { setEditor(null); setError('') }} onReload={reloadEditor}
      onSaved={result => {
        const wasNew = editor.kind === 'new'
        setEditor(null); setTitle(''); setQuickPriority('normal'); setError('')
        if (result.kind === 'once') { selectDate(result.occurrence.scheduledDate); setTab(result.occurrence.status === 'completed' ? 'done' : 'todo'); say('任务安排已保存 ✨') }
        else { if (wasNew) { selectDate(result.plan.startDate > snapshot.today.date ? result.plan.startDate : snapshot.today.date); setTab('todo') } else { setTab('plans'); setShowCalendar(false) } say('重复计划已保存 ✨') }
      }} />}
    {ending && <EndPlanDialog plan={ending} busy={busy.has(ending.id)} error={error} onClose={() => { setEnding(null); setError('') }}
      onConfirm={() => { void withBusy(ending.id, async () => { const result = await command(() => api.plans.end(ending.id)); if (result.ok) { setEnding(null); say('计划已结束，已有历史仍保留') } }) }} />}
    {updates.state && whatsNew && (openWhatsNew || reviewWhatsNew) && <WhatsNewDialog version={updates.state.currentVersion} notes={whatsNew.notes}
      automatic={!!openWhatsNew} error={openWhatsNew ? updates.error : ''}
      onClose={openWhatsNew ? updates.acknowledgeWhatsNew : () => setReviewWhatsNew(false)} />}
    {error && !editor && !ending && !showSettings && <div className="error-toast" role="alert">{error}<button data-window-hit aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}
  </main>
}
