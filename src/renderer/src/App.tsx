import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { DayItem, Priority, RepeatPlan } from '../../shared/tasks'
import { useWorkspace } from './features/tasks/use-workspace'
import { itemKey, TaskList } from './features/tasks/TaskList'
import { DateNavigator, shiftDate } from './features/calendar/DateNavigator'
import { PlanList } from './features/plans/PlanList'
import { EndPlanDialog, TaskEditor } from './features/editor/TaskEditor'
import type { EditorTarget } from './features/editor/TaskEditor'
import { selectPetPlayback } from '../../shared/pet'
import type { PetAction, PetReaction } from '../../shared/pet'
import { PetSprite } from './features/pet/PetSprite'
import { PetActions } from './features/pet/PetActions'
import { getPetPack } from './features/pet/pet-pack'
import { useTaskCompletion } from './features/tasks/use-task-completion'
import { CompletionEffects } from './features/tasks/CompletionEffects'
import { MENU_TRANSITION_MS } from '../../shared/motion'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { playReminderBell } from './features/pet/reminder-sound'
import { LARGE_SIZE, STANDARD_SIZE } from '../../shared/window'

const api = window.desktop
function countdown(time: string | null, now: number): string {
  if (!time) return '点击设置下班时间'
  const [hour, minute] = time.split(':').map(Number)
  const target = new Date(now); target.setHours(hour, minute, 0, 0)
  const difference = target.getTime() - now
  if (difference <= 0) return '已下班，辛苦啦 🎉'
  const seconds = Math.ceil(difference / 1000)
  return `离下班还有 ${[Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':')}`
}
function editorKey(target: EditorTarget): string {
  return target.kind === 'new' ? target.requestId : target.kind === 'once'
    ? `${target.occurrence.id}/${target.occurrence.version}` : `${target.plan.id}/${target.plan.version}`
}

export function App(): React.JSX.Element {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const { workspace, day, loading, error, setError, refresh, command } = useWorkspace(selectedDate)
  const [now, setNow] = useState(Date.now)
  const [title, setTitle] = useState('')
  const [quickPriority, setQuickPriority] = useState<Priority>('normal')
  const [tab, setTab] = useState<'todo' | 'done' | 'plans'>('todo')
  const [showCalendar, setShowCalendar] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPet, setShowPet] = useState(false)
  const [petPreview, setPetPreview] = useState<PetAction>('idle')
  const [petReaction, setPetReaction] = useState<PetReaction | null>(null)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [ending, setEnding] = useState<RepeatPlan | null>(null)
  const [busy, setBusy] = useState(new Set<string>())
  const [feedback, setFeedback] = useState('')
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [completionCount, setCompletionCount] = useState(0)
  const completion = useTaskCompletion(complete)
  const quickRequest = useRef(crypto.randomUUID())
  const busyRef = useRef(new Set<string>())
  const lastFocus = useRef<string | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const resizeGesture = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const snapshot = workspace?.snapshot
  const petPack = getPetPack(snapshot?.settings.petId)
  const activeReminderId = snapshot?.activeReminderIds[0] ?? null

  useEffect(() => api.subscribeSound(() => {
    void playReminderBell().catch(() => setError('提醒铃声播放失败，请重试试听。'))
  }), [setError])

  useEffect(() => {
    if (activeReminderId && petReaction) setPetReaction(null)
  }, [activeReminderId, petReaction])

  useEffect(() => {
    if (snapshot?.window.animationsPaused) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [snapshot?.window.animationsPaused])
  useEffect(() => {
    const id = snapshot?.focusedReminderId
    if (id && id !== lastFocus.current) {
      lastFocus.current = id; setFocusedId(id); setSelectedDate(null); setTab('todo'); setShowSettings(false); setShowPet(false); setShowCalendar(false)
    }
  }, [snapshot?.focusedReminderId])
  useEffect(() => {
    if (focusedId && day && tab === 'todo') document.querySelector(`[data-occurrence-id="${CSS.escape(focusedId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [focusedId, day, tab])
  useEffect(() => {
    if ((editor || ending || showCalendar || showSettings) && snapshot?.window.mode === 'compact') void command(() => api.setMode('expanded'))
  }, [editor, ending, showCalendar, showSettings, snapshot?.window.mode, command])
  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    if (clickTimer.current) clearTimeout(clickTimer.current)
  }, [])

  function say(text: string): void {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback(text); feedbackTimer.current = setTimeout(() => setFeedback(''), 2800)
  }
  function respondToPet(): void {
    if (activeReminderId) return
    setPetReaction({ id: crypto.randomUUID(), action: 'react' })
    say(petPack.quotes.react[0])
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
        setPetReaction(null); setPetPreview('idle')
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
        say(result.value.allCompleted ? petPack.quotes.allDone : completed ? petPack.quotes.celebrate : '已恢复到待办清单')
        if (completed) {
          setCompletionCount(count => count + 1)
          setPetReaction({ id: crypto.randomUUID(), action: result.value.allCompleted ? 'all_done' : 'celebrate' })
        } else setPetReaction(null)
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
      if (result.ok) say('已移到今天，原日期会保留 🐾')
    })
  }
  async function togglePriority(item: DayItem): Promise<void> {
    await withBusy(itemKey(item), async () => {
      const value = item.kind === 'saved' ? item.occurrence : item
      await command(() => api.tasks.setPriority(item.ref, value.priority === 'urgent' ? 'normal' : 'urgent'))
    })
  }
  function resizeStart(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    resizeGesture.current = { x: event.clientX, y: event.clientY, moved: false }
  }
  function resizeMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    const start = resizeGesture.current
    if (!start || start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return
    start.moved = true
    void command(() => api.beginResize())
  }
  function resizeEnd(): void {
    const start = resizeGesture.current; resizeGesture.current = null
    if (start?.moved) void command(() => api.endResize())
  }
  function toggleSize(): void {
    if (!snapshot) return
    const size = snapshot.settings.expandedSize
    void command(() => api.settings.update({ expectedVersion: snapshot.settings.version,
      patch: { expandedSize: size.width >= 410 || size.height >= 580 ? STANDARD_SIZE : LARGE_SIZE } }))
  }
  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { x: event.clientX, y: event.clientY, moved: false }
  }
  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    const start = gesture.current
    if (!start || start.moved) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 5) {
      start.moved = true
      if (clickTimer.current) clearTimeout(clickTimer.current)
      void command(() => api.beginDrag())
    }
  }
  function pointerUp(): void {
    const start = gesture.current; gesture.current = null
    if (!start) return
    if (start.moved) { void command(() => api.endDrag()); return }
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(respondToPet, 250)
  }

  if (!workspace || !snapshot) return <main className="loading">{error || '桌面伙伴正在醒来…'}{error && <button onClick={() => { void refresh() }}>重新读取</button>}</main>
  const compact = snapshot.window.mode === 'compact'
  const date = selectedDate ?? snapshot.today.date
  const past = date < snapshot.today.date
  const dateLabel = date === snapshot.today.date ? '待办进度' : `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日 · ${date === shiftDate(snapshot.today.date, 1) ? '明天' : past ? '历史' : '未来'}`
  const active = snapshot.activeReminderIds.map(id => snapshot.reminders.find(item => item.id === id)).filter(item => !!item)
  const current = active[0]
  const currentItem = current && snapshot.today.items.find(item => item.kind === 'saved' && item.occurrence.id === current.id)
  const done = day?.items.filter(item => item.kind === 'saved' && item.occurrence.status === 'completed').length ?? 0
  const total = day?.items.length ?? 0
  const urgentCount = day?.items.filter(item => { const value = item.kind === 'saved' ? item.occurrence : item; return value.priority === 'urgent' && !(item.kind === 'saved' && item.occurrence.status === 'completed') }).length ?? 0
  const petPlayback = selectPetPlayback(current ? { id: current.id,
    scene: currentItem?.kind === 'saved' ? currentItem.occurrence.scene : 'generic' } : null,
  petReaction, showPet && !compact ? petPreview : null)

  return <main className={`widget ${compact ? 'compact' : ''} ${snapshot.window.animationsPaused ? 'paused' : ''}`}
    style={{ '--menu-duration': `${MENU_TRANSITION_MS}ms` } as CSSProperties}>
    <section className="pet-scene">
      <button className="pet" aria-label="互动桌宠，双击展开或收起" title="拖动我移动窗口，双击展开或收起"
        onContextMenu={event => { event.preventDefault(); void command(() => api.showContextMenu()) }}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={() => { gesture.current = null; void command(() => api.endDrag()) }}
        onDoubleClick={() => { if (clickTimer.current) clearTimeout(clickTimer.current); void command(() => api.setMode(compact ? 'expanded' : 'compact')) }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); respondToPet() } }}>
        <PetSprite pack={petPack} playback={petPlayback} paused={snapshot.window.animationsPaused} onFinished={key => {
          setPetReaction(reaction => reaction && `reaction:${reaction.id}` === key ? null : reaction)
        }} />
      </button>
      <div className={`bubble ${current ? 'reminder-bubble' : ''}`} aria-live="polite">{current ? <>
        <button className="bubble-dismiss" aria-label="收起这次提醒" onClick={() => { void command(() => api.acknowledgeReminder(current.id)) }}>×</button>
        <strong>{current.title}</strong>{active.length > 1 && <small>还有 {active.length - 1} 项到点事项</small>}
        {['failed', 'unavailable'].includes(current.dispatchState) && <small className="notification-error">系统通知未提交，可在这里处理</small>}
        <div className="bubble-actions"><button className="primary" disabled={!currentItem || busy.has(current.id)} onClick={() => { if (currentItem) void complete(currentItem, true) }}>完成了</button>
          <button onClick={() => { setSelectedDate(null); setTab('todo'); setShowSettings(false); setFocusedId(current.id); void command(() => api.setMode('expanded')) }}>查看清单</button></div>
      </> : <button className="bubble-label" onClick={() => { setShowSettings(true); setShowPet(false); void command(() => api.setMode('expanded')) }}>{feedback || countdown(snapshot.settings.offworkTime, now)}</button>}</div>
    </section>
    <button className="mini-dock" aria-label="展开清单" aria-hidden={!compact} inert={!compact} onClick={() => { void command(() => api.setMode('expanded')) }}>
      <span className="status-dot" /> 今天 {snapshot.today.progress.completed}/{snapshot.today.progress.total}<span>展开清单 ▾</span>
    </button><section className="card" aria-hidden={compact} inert={compact}>
      <header className="card-header" onPointerDown={event => { if (event.button === 0 && !(event.target as HTMLElement).closest('button, input')) { event.currentTarget.setPointerCapture(event.pointerId); void command(() => api.beginDrag()) } }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) void command(() => api.endDrag()) }} onPointerCancel={() => { void command(() => api.endDrag()) }}><div className="window-controls">
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
        <button className="settings-button" aria-label="组件偏好设置" onClick={() => { setShowSettings(value => !value); setShowPet(false) }}>⚙</button>
      </div><div className="clock"><strong>{new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</strong>
        <span>{new Date(now).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'long' })}</span></div></header>
      {showPet ? <PetActions pack={petPack} selected={petPreview} blocked={!!current} switching={busy.has('pet-selection')}
        onSelectPack={id => { void selectPetPack(id) }} onSelect={action => { setPetReaction(null); setPetPreview(action); if (action === 'remind' && snapshot.settings.reminderSoundEnabled) void command(() => api.previewReminderSound()) }} onClose={() => setShowPet(false)} /> : <>
        <div className="progress-caption" aria-live="polite"><span title={date}>{dateLabel} {day ? `${done}/${total}` : '读取中…'}</span>{urgentCount > 0 && <span className="urgent-tag urgent-count">🔥 {urgentCount}项紧急</span>}
          <span className="progress-tools">{date !== snapshot.today.date && <button aria-label="返回今天" onClick={() => selectDate(snapshot.today.date)}>回今天</button>}{day?.progress.percentage ?? 0}%</span></div>
        <div className="progress-track"><div style={{ width: `${day?.progress.percentage ?? 0}%` }} /></div>
        <nav className="tabs" aria-label="任务清单分类">
          <button className={tab === 'todo' ? 'selected' : ''} onClick={() => setTab('todo')}>待办 ({total - done})</button>
          <button className={tab === 'done' ? 'selected' : ''} onClick={() => setTab('done')}>已完成 <span key={completionCount} className={completionCount ? 'completion-badge' : ''}>({done})</span></button>
          <button className={tab === 'plans' ? 'selected' : ''} onClick={() => { setTab('plans'); setShowCalendar(false) }}>周期计划 ({workspace.plans.filter(plan => plan.state !== 'ended').length})</button>
        </nav>
        {tab === 'plans' ? <PlanList plans={workspace.plans} busy={busy} onCreate={() => openNew('repeat')} onEdit={plan => { setError(''); setEditor({ kind: 'plan', plan }) }}
          onPaused={plan => { void withBusy(plan.id, async () => { const result = await command(() => api.plans.setPaused(plan.id, plan.state !== 'paused')); if (result.ok) say(result.value.state === 'paused' ? '计划已暂停，历史仍保留' : '计划已恢复，从现在继续安排') }) }}
          onEnd={plan => { setError(''); setEnding(plan) }} />
          : day && !loading ? <TaskList day={day} plans={workspace.plans} tab={tab} busy={busy} pending={completion.pending} focusedId={focusedId}
            onComplete={(item, desired, button) => { if (desired) completion.toggle(item, button); else void complete(item, false) }} onEdit={editItem}
            onPriority={item => { void togglePriority(item) }} onRemove={item => { void remove(item) }} onMove={item => { void move(item) }} /> : <div className="empty-state"><p>{loading ? '正在读取这一天…' : '这一天暂时无法读取'}</p><button onClick={() => { void refresh() }}>重新读取</button></div>}
        {past ? <p className="history-note">历史待办可点「移到今天」继续处理</p> : <form className="quick-add" onSubmit={event => { event.preventDefault(); void quickAdd() }}>
          <div><input aria-label="新增待办" maxLength={120} placeholder={date === snapshot.today.date ? '添加新待办…' : '添加这一天的待办…'} value={title} disabled={busy.has('quick')} onChange={event => setTitle(event.target.value)} />
            <button type="button" className={`quick-urgent ${quickPriority === 'urgent' ? 'selected' : ''}`} aria-label="紧急任务" aria-pressed={quickPriority === 'urgent'} onClick={() => setQuickPriority(value => value === 'urgent' ? 'normal' : 'urgent')}>🔥 紧急</button>
            <button type="button" aria-label="定时或重复" onClick={() => openNew(tab === 'plans' ? 'repeat' : 'once')}>◷ 周期</button></div>
          <button type="submit" className="add-button" aria-label="快捷新增任务" disabled={busy.has('quick')}>＋</button>
        </form>}
      </>}
      <button className="resize-handle" aria-label="调整窗口尺寸" title="拖拽调整尺寸，双击切换标准与大尺寸" onPointerDown={resizeStart} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} onDoubleClick={toggleSize}>↘</button>
    </section>
    <CompletionEffects pending={completion.pending} />
    {showSettings && <SettingsDialog snapshot={snapshot} command={command} onClose={() => { setShowSettings(false); setError('') }} />}
    {showCalendar && <DateNavigator today={snapshot.today.date} selected={date} historyDates={workspace.historyDates} onSelect={selectDate} onClose={() => setShowCalendar(false)} />}
    {editor && <TaskEditor key={editorKey(editor)} target={editor} now={now} command={command} onClose={() => { setEditor(null); setError('') }} onReload={reloadEditor}
      onSaved={result => {
        const wasNew = editor.kind === 'new'
        setEditor(null); setTitle(''); setQuickPriority('normal'); setError('')
        if (result.kind === 'once') { selectDate(result.occurrence.scheduledDate); setTab(result.occurrence.status === 'completed' ? 'done' : 'todo'); say('任务安排已保存 ✨') }
        else { if (wasNew) { selectDate(result.plan.startDate > snapshot.today.date ? result.plan.startDate : snapshot.today.date); setTab('todo') } else { setTab('plans'); setShowCalendar(false) } say('重复计划已保存 ✨') }
      }} />}
    {ending && <EndPlanDialog plan={ending} busy={busy.has(ending.id)} error={error} onClose={() => { setEnding(null); setError('') }}
      onConfirm={() => { void withBusy(ending.id, async () => { const result = await command(() => api.plans.end(ending.id)); if (result.ok) { setEnding(null); say('计划已结束，已有历史仍保留') } }) }} />}
    {error && !editor && !ending && !showSettings && <div className="error-toast" role="alert">{error}<button aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}
  </main>
}
