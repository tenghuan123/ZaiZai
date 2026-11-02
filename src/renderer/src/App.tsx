import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AppResult, Reminder, Snapshot } from '../../shared/contracts'
import type { Occurrence } from '../../shared/tasks'
import petImage from './assets/pet.svg'

const api = window.desktop
const dispatchLabels: Record<Reminder['dispatchState'], string> = {
  pending: '等待提醒', claimed: '正在提交通知', submitted: '通知已提交', failed: '通知未提交',
  unavailable: '系统通知不可用', uncertain: '上次提交结果不明'
}

function countdown(time: string | null, now: number): string {
  if (!time) return '点击设置下班时间'
  const [hour, minute] = time.split(':').map(Number)
  const target = new Date(now); target.setHours(hour, minute, 0, 0)
  const difference = target.getTime() - now
  if (difference <= 0) return '已下班，辛苦啦 🎉'
  const seconds = Math.ceil(difference / 1000)
  return `离下班还有 ${[Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':')}`
}

export function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  const [title, setTitle] = useState('起来活动一下')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'todo' | 'done'>('todo')
  const [showSettings, setShowSettings] = useState(false)
  const [feedback, setFeedback] = useState('')
  const request = useRef(0)
  const creationKey = useRef(crypto.randomUUID())
  const completing = useRef(new Set<string>())
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  const refresh = useCallback(async () => {
    const version = ++request.current
    try {
      const result = await api.bootstrap()
      if (version !== request.current) return
      if (result.ok) setSnapshot(previous => previous?.sessionId === result.sessionId && previous.revision > result.revision ? previous : result.value)
      else setError(result.error.message)
    } catch { setError('与桌面主进程的连接中断，请重新打开窗口。') }
  }, [])

  useEffect(() => {
    const unsubscribe = api.subscribe(() => { void refresh() })
    void refresh()
    return () => { unsubscribe(); request.current++ }
  }, [refresh])

  useEffect(() => {
    if (snapshot?.window.animationsPaused) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [snapshot?.window.animationsPaused])

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    if (clickTimer.current) clearTimeout(clickTimer.current)
  }, [])

  const run = useCallback(async (action: () => Promise<AppResult<unknown>>): Promise<boolean> => {
    setError('')
    try {
      const result = await action()
      if (!result.ok) {
        setError(result.error.message)
        if (result.error.code === 'CONFLICT') await refresh()
        return false
      }
      await refresh()
      return true
    } catch { setError('操作未确认，请重新读取清单后检查。'); return false }
  }, [refresh])

  function say(text: string): void {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback(text)
    feedbackTimer.current = setTimeout(() => setFeedback(''), 2800)
  }

  async function schedule(hideAfterScheduling: boolean): Promise<void> {
    if (saving || !title.trim()) return
    setSaving(true)
    try {
      if (!snapshot) return
      const saved = await run(() => api.tasks.createOnce({ requestId: creationKey.current, title,
        scheduledDate: date || snapshot.today.date, scheduledTime: time || null,
        reminderEnabled: snapshot.settings.defaultReminderEnabled, scene: 'generic' }))
      if (saved) {
        creationKey.current = crypto.randomUUID()
        say(time ? '安排好了，到时间提醒你 🐾' : '已保存到任务清单 🐾')
        if (hideAfterScheduling) await run(() => api.hide())
      }
    } finally { setSaving(false) }
  }

  async function complete(id: string, completed: boolean): Promise<void> {
    if (completing.current.has(id)) return
    completing.current.add(id)
    try {
      if (await run(() => api.tasks.setCompleted({ id }, completed))) say(completed ? '完成一项啦，真棒 ✨' : '已恢复到待办清单')
    } finally { completing.current.delete(id) }
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
      void run(() => api.beginDrag())
    }
  }
  function pointerUp(): void {
    const start = gesture.current
    gesture.current = null
    if (!start) return
    if (start.moved) { void run(() => api.endDrag()); return }
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => say('今天也要好好照顾自己呀 🐾'), 250)
  }

  if (!snapshot) return <main className="loading">{error || '桌面伙伴正在醒来…'}</main>
  const compact = snapshot.window.mode === 'compact'
  const items = snapshot.today.items.filter(item => item.kind === 'saved').map(item => item.occurrence)
  const done = items.filter(item => item.status === 'completed')
  const todo = items.filter(item => item.status === 'pending')
  const active = snapshot.activeReminderIds.map(id => snapshot.reminders.find(item => item.id === id)).filter((item): item is Reminder => !!item)
  const current = active[0]
  const percentage = snapshot.today.progress.percentage
  const label = (item: Occurrence): string => {
    if (item.status === 'completed') return '已完成'
    if (!item.reminderEnabled) return '提醒已关闭'
    const reminder = snapshot.reminders.find(value => value.id === item.id)
    return reminder ? dispatchLabels[reminder.dispatchState] : '无时间待办'
  }
  const rows = tab === 'todo' ? todo : done
  const emotion = current ? 'alert' : feedback ? 'happy' : 'idle'

  return <main className={`widget ${compact ? 'compact' : ''} ${snapshot.window.animationsPaused ? 'paused' : ''}`}>
    <section className="pet-scene">
      <button className={`pet pet-${emotion}`} aria-label="互动桌宠，双击展开或收起" title="拖动我移动窗口，双击展开或收起"
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={() => { gesture.current = null; void run(() => api.endDrag()) }}
        onDoubleClick={() => {
          if (clickTimer.current) clearTimeout(clickTimer.current)
          void run(() => api.setMode(compact ? 'expanded' : 'compact'))
        }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); say('今天也要加油呀 🐾') } }}>
        <img src={petImage} alt="蓝耳白猫桌宠" draggable={false} />
      </button>
      <div className={`bubble ${current ? 'reminder-bubble' : ''}`} aria-live="polite">
        {current ? <>
          <button className="bubble-dismiss" aria-label="收起这次提醒" onClick={() => { void run(() => api.acknowledgeReminder(current.id)) }}>×</button>
          <strong>{current.title}</strong>
          {active.length > 1 && <small>还有 {active.length - 1} 项到点事项</small>}
          {current.dispatchState === 'failed' && <small className="notification-error">系统通知未提交，可在这里处理</small>}
          <div className="bubble-actions">
            <button className="primary" onClick={() => { void complete(current.id, true) }}>完成了</button>
            <button onClick={() => { void run(() => api.setMode('expanded')); setTab('todo') }}>查看清单</button>
          </div>
        </> : <button className="bubble-label" onClick={() => { setShowSettings(true); void run(() => api.setMode('expanded')) }}>
          {feedback || countdown(snapshot.settings.offworkTime, now)}
        </button>}
      </div>
    </section>

    {compact ? <button className="mini-dock" aria-label="展开清单" onClick={() => { void run(() => api.setMode('expanded')) }}>
      <span className="status-dot" /> 已完成 {done.length}/{items.length}<span>展开清单 ▾</span>
    </button> : <section className="card">
      <header className="card-header">
        <div className="window-controls">
          <button className="round blue" aria-label="仅显示桌宠" onClick={() => { void run(() => api.setMode('compact')) }}>−</button>
          <button className="round coral" aria-label="关闭桌面伙伴" onClick={() => { void run(() => api.requestClose()) }}>×</button>
          <button className="settings-button" aria-label="设置与验证状态" onClick={() => setShowSettings(!showSettings)}>⚙</button>
        </div>
        <div className="clock"><strong>{new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</strong>
          <span>{new Date(now).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'long' })}</span></div>
      </header>

      {showSettings ? <section className="settings-panel">
        <div className="panel-title"><h2>设置与验证状态</h2><button aria-label="返回提醒清单" onClick={() => setShowSettings(false)}>返回</button></div>
        <label className="setting-row">固定下班时间<input aria-label="固定下班时间" type="time" value={snapshot.settings.offworkTime || ''}
          onChange={event => { void run(() => api.settings.update({ expectedVersion: snapshot.settings.version, patch: { offworkTime: event.target.value || null } })) }} /></label>
        <label className="setting-row">窗口始终置顶<input type="checkbox" checked={snapshot.window.alwaysOnTop}
          onChange={event => { void run(() => api.settings.update({ expectedVersion: snapshot.settings.version, patch: { alwaysOnTop: event.target.checked } })) }} /></label>
        <label className="setting-row">新任务默认提醒<input type="checkbox" checked={snapshot.settings.defaultReminderEnabled}
          onChange={event => { void run(() => api.settings.update({ expectedVersion: snapshot.settings.version, patch: { defaultReminderEnabled: event.target.checked } })) }} /></label>
        <div className="verification-status">
          <span>菜单栏 / 托盘<strong>{snapshot.diagnostics.trayReady ? '已创建' : '不可用'}</strong></span>
          <span>系统通知能力<strong>{snapshot.diagnostics.notificationSupported ? '系统支持' : '系统不支持'}</strong></span>
          <span>原生窗口<strong>{snapshot.window.bounds.width} × {snapshot.window.bounds.height}</strong></span>
          <span>Electron<strong>{snapshot.diagnostics.versions.electron}</strong></span>
        </div>
        <details><summary>本地数据位置</summary><p className="data-path">{snapshot.diagnostics.databasePath}</p></details>
        <p className="scope-note">任务与设置保存在本机。每日计划和日期管理界面将在 M2 接入。</p>
        <button className="secondary wide" onClick={() => { void run(() => api.hide()) }}>隐藏到托盘 / 菜单栏</button>
        <button className="text-button wide" onClick={() => { void run(() => api.quit()) }}>退出软件</button>
      </section> : <>
        <div className="progress-caption"><span>今日进度 {done.length}/{items.length}</span><span>{percentage}%</span></div>
        <div className="progress-track"><div style={{ width: `${percentage}%` }} /></div>
        <nav className="tabs" aria-label="提醒清单分类">
          <button className={tab === 'todo' ? 'selected' : ''} onClick={() => setTab('todo')}>待办 ({todo.length})</button>
          <button className={tab === 'done' ? 'selected' : ''} onClick={() => setTab('done')}>已完成 ({done.length})</button>
        </nav>
        <div className="reminder-list">
          {rows.length === 0 && <div className="empty-state"><span>{tab === 'todo' ? '☁' : '✧'}</span>
            <p>{tab === 'todo' ? '给自己安排一个小提醒吧' : '完成的小事都会留在这里'}</p></div>}
          {rows.map(item => <article key={item.id} className={`reminder-row ${snapshot.focusedReminderId === item.id ? 'focused' : ''}`} data-reminder-id={item.id}>
            <button className={`check ${item.status === 'completed' ? 'checked' : ''}`} aria-label={`${item.status === 'completed' ? '撤销' : '完成'}：${item.title}`}
              onClick={() => { void complete(item.id, item.status !== 'completed') }}>{item.status === 'completed' ? '✓' : ''}</button>
            <div className="reminder-content"><strong className={item.status === 'completed' ? 'struck' : ''} title={item.title}>{item.title}</strong>
              <small>
                {item.scheduledTime || '无时间'} · {label(item)}
              </small></div>
          </article>)}
        </div>
        <form className="reminder-form" onSubmit={event => { event.preventDefault(); void schedule(false) }}>
          <input aria-label="任务内容" value={title} maxLength={120} placeholder="想安排什么？" onChange={event => setTitle(event.target.value)} />
          <div className="schedule-controls"><label>日期 <input aria-label="任务日期" type="date" value={date || snapshot.today.date} onChange={event => setDate(event.target.value)} /></label>
            <label>时间 <input aria-label="任务时间" type="time" value={time} onChange={event => setTime(event.target.value)} /></label></div>
          <div className="schedule-controls">
            <button className="primary" type="submit" disabled={saving || !title.trim()}>添加任务</button>
            <button className="secondary" type="button" disabled={saving || !title.trim()} onClick={() => { void schedule(true) }}>添加并隐藏</button></div>
        </form>
        <footer className="card-footer"><span>今日任务</span><span>数据保存在本机</span></footer>
      </>}
    </section>}
    {error && <div className="error-toast" role="alert">{error}<button aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}
  </main>
}
