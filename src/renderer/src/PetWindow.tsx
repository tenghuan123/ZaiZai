import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { DayItem } from '../../shared/tasks'
import { selectPetPlayback } from '../../shared/pet'
import type { PetAction, PetReaction } from '../../shared/pet'
import type { HumorContent, HumorKind } from '../../shared/humor'
import { PET_AREA, PET_BUTTON } from '../../shared/window'
import { useWorkspace } from './features/tasks/use-workspace'
import { PetSprite } from './features/pet/PetSprite'
import { getPetPack } from './features/pet/pet-pack'
import { drawHumorLine } from './features/pet/humor'
import { playReminderBell } from './features/pet/reminder-sound'
import { useWindowDrag } from './use-window-drag'
import { useWindowHitRegions } from './use-window-hit-regions'

const api = window.desktop
const petQuestions = [
  { type: 'offwork', icon: '⏰', label: '离下班还有多久？' },
  { type: 'joke', icon: '😂', label: '讲一个笑话' },
  { type: 'progress', icon: '📊', label: '今日任务进度' }
] as const
type PetQuestion = typeof petQuestions[number]['type']
type PetBubble = { type: 'quick' | 'offwork' | 'progress' } | { type: 'humor'; kind: HumorKind; text: string } | { type: 'feedback'; text: string }

function countdown(time: string | null, now: number): string {
  if (!time) return '点击设置下班时间'
  const [hour, minute] = time.split(':').map(Number)
  const target = new Date(now); target.setHours(hour, minute, 0, 0)
  const difference = target.getTime() - now
  if (difference <= 0) return '已下班，辛苦啦 🎉'
  const seconds = Math.ceil(difference / 1000)
  return `离下班还有 ${[Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':')}`
}
export function PetWindow(): React.JSX.Element {
  const { workspace, error, setError, refresh, command } = useWorkspace(null, false)
  useWindowHitRegions()
  const snapshot = workspace?.snapshot
  const mode = snapshot?.window.mode
  const compact = mode === 'compact'
  const activeReminderId = snapshot?.activeReminderIds[0] ?? null
  const reminder = useRef(activeReminderId)
  reminder.current = activeReminderId
  const petPack = getPetPack(snapshot?.settings.petId)
  const [now, setNow] = useState(Date.now)
  const [petBubble, setPetBubble] = useState<PetBubble | null>(null)
  const [humorContent, setHumorContent] = useState<HumorContent | null>(null)
  const lastHumorLine = useRef<Partial<Record<HumorKind, string>>>({})
  const [petReaction, setPetReaction] = useState<PetReaction | null>(null)
  const [preview, setPreview] = useState<PetAction | null>(null)
  const [completing, setCompleting] = useState(false)
  const completingRef = useRef(false)
  const drag = useWindowDrag(setError, respondToPet, () => setPetBubble(null))
  const cancelClick = drag.cancelClick

  useEffect(() => api.subscribeSound(() => {
    void playReminderBell().catch(() => setError('提醒铃声播放失败，请重试试听。'))
  }), [setError])
  useEffect(() => {
    let active = true
    void api.getHumorContent().then(result => {
      if (!active) return
      if (result.ok) setHumorContent(result.value)
      else setError('笑话资源包暂时无法读取。')
    }).catch(() => { if (active) setError('笑话资源包暂时无法读取。') })
    return () => { active = false }
  }, [setError])
  useEffect(() => api.subscribePet(presentation => {
    if (presentation.kind === 'preview') {
      setPreview(presentation.action)
      if (presentation.action) setPetReaction(null)
    } else if (!reminder.current) {
      setPetBubble({ type: 'feedback', text: presentation.text })
      if (presentation.reaction !== undefined) {
        setPetReaction(presentation.reaction ? { id: crypto.randomUUID(), action: presentation.reaction } : null)
      }
    }
  }), [])
  useEffect(() => {
    cancelClick()
    setPetBubble(null)
  }, [cancelClick, mode])
  useEffect(() => {
    if (!activeReminderId) return
    cancelClick()
    setPetReaction(null)
    setPetBubble(null)
  }, [activeReminderId, cancelClick])
  useEffect(() => {
    if (!petBubble || petBubble.type === 'quick') return
    const duration = petBubble.type === 'humor' ? 7000 : petBubble.type === 'feedback' ? 2800 : 5000
    const timer = setTimeout(() => setPetBubble(current => current === petBubble ? null : current), duration)
    return () => clearTimeout(timer)
  }, [petBubble])
  useEffect(() => {
    function dismiss(): void { setPetBubble(null) }
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [])
  useEffect(() => {
    if (snapshot?.window.animationsPaused || petBubble?.type !== 'offwork') return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [snapshot?.window.animationsPaused, petBubble?.type])

  function respondToPet(): void {
    if (activeReminderId) return
    setPetReaction({ id: crypto.randomUUID(), action: 'react' })
    setPetBubble(bubble => bubble && bubble.type !== 'feedback' ? null : { type: 'quick' })
  }
  function answerPetQuestion(type: PetQuestion): void {
    if (activeReminderId) return
    if (type === 'joke') answerHumor('joke')
    else setPetBubble({ type })
  }
  function answerHumor(kind: HumorKind): void {
    if (activeReminderId || !humorContent) return
    const text = drawHumorLine(humorContent[kind], Math.random(), lastHumorLine.current[kind])
    lastHumorLine.current[kind] = text
    setPetBubble({ type: 'humor', kind, text })
  }
  async function completeReminder(item: DayItem): Promise<void> {
    if (completingRef.current) return
    completingRef.current = true
    setCompleting(true)
    try {
      const result = await command(() => api.tasks.setCompleted(item.ref, true))
      if (result.ok && result.value.changed) {
        setPetBubble({ type: 'feedback', text: result.value.allCompleted ? petPack.quotes.allDone : petPack.quotes.celebrate })
        setPetReaction({ id: crypto.randomUUID(), action: result.value.allCompleted ? 'all_done' : 'celebrate' })
      }
    } finally { completingRef.current = false; setCompleting(false) }
  }

  if (!snapshot) return <main className="loading">{error || '桌面伙伴正在醒来…'}{error && <button data-window-hit onClick={() => { void refresh() }}>重新读取</button>}</main>
  const { horizontal, vertical, room } = snapshot.window.layout
  const active = snapshot.activeReminderIds.map(id => snapshot.reminders.find(item => item.id === id)).filter(item => !!item)
  const current = active[0]
  const currentItem = current && snapshot.today.items.find(item => item.kind === 'saved' && item.occurrence.id === current.id)
  const petPlayback = selectPetPlayback(current ? { id: current.id,
    scene: currentItem?.kind === 'saved' ? currentItem.occurrence.scene : 'generic' } : null,
  petReaction, compact ? null : preview)
  const bubble = activeReminderId ? null : petBubble
  const todayProgress = snapshot.today.progress
  let answer = ''
  if (bubble?.type === 'offwork') answer = countdown(snapshot.settings.offworkTime, now)
  if (bubble?.type === 'progress') answer = `今日任务已完成 ${todayProgress.completed}/${todayProgress.total} 项（${todayProgress.percentage}%）`
  if (bubble?.type === 'humor' || bubble?.type === 'feedback') answer = bubble.text

  return <main className={`widget pet-window ${compact ? 'compact' : ''} ${snapshot.window.animationsPaused ? 'paused' : ''}`}
    data-horizontal={horizontal} data-vertical={vertical}
    style={{ '--pet-area-width': `${PET_AREA.width}px`, '--pet-area-height': `${PET_AREA.height}px`,
      '--pet-button-top': `${PET_BUTTON.top}px`, '--pet-button-height': `${PET_BUTTON.height}px`,
      '--pet-room-x': `${room.width}px`, '--pet-room-y': `${room.height}px` } as CSSProperties}
    onPointerDownCapture={event => {
      if ((event.target as Element).closest('.pet, .bubble, .pet-questions')) return
      cancelClick()
      setPetBubble(null)
    }}
    onKeyDown={event => { if (event.key === 'Escape') { cancelClick(); setPetBubble(null) } }}>
    <section className="pet-scene">
      <button className="pet" data-window-hit aria-label="互动桌宠，双击展开或收起" title="单击打开快捷气泡，拖动移动，双击切换清单"
        aria-expanded={bubble?.type === 'quick'}
        onContextMenu={event => { event.preventDefault(); void command(() => api.showContextMenu()) }}
        {...drag.handlers}
        onDoubleClick={() => { drag.cancelClick(); void command(() => api.setMode(compact ? 'expanded' : 'compact')) }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); respondToPet() } }}>
        <PetSprite pack={petPack} playback={petPlayback} paused={snapshot.window.animationsPaused} onFinished={key => {
          setPetReaction(reaction => reaction && `reaction:${reaction.id}` === key ? null : reaction)
        }} />
      </button>
      {current ? <div className="bubble reminder-bubble" data-window-hit aria-live="polite">
        <button className="bubble-dismiss" aria-label="收起这次提醒" onClick={() => { void command(() => api.acknowledgeReminder(current.id)) }}>×</button>
        <strong>{current.title}</strong>{active.length > 1 && <small>还有 {active.length - 1} 项到点事项</small>}
        {['failed', 'unavailable'].includes(current.dispatchState) && <small className="notification-error">系统通知未提交，可在这里处理</small>}
        <div className="bubble-actions"><button className="primary" disabled={!currentItem || completing} onClick={() => { if (currentItem) void completeReminder(currentItem) }}>完成了</button>
          <button onClick={() => { void command(() => api.openPanel({ kind: 'reminder', reminderId: current.id })) }}>查看清单</button></div>
      </div> : bubble?.type === 'quick' ? <div className="pet-questions" role="group" aria-label="桌宠快捷气泡">
        {petQuestions.map(({ type, icon, label }) => <button key={type} type="button" data-window-hit disabled={type === 'joke' && !humorContent} onClick={() => answerPetQuestion(type)}>
          <span aria-hidden="true">{icon}</span>{label}
        </button>)}
      </div> : bubble && <div className="bubble answer-bubble" data-window-hit aria-live={bubble.type === 'offwork' ? 'off' : 'polite'}>
        <button className="bubble-dismiss" aria-label="收起回答" onClick={() => setPetBubble(null)}>×</button>
        {bubble.type === 'offwork' && !snapshot.settings.offworkTime
          ? <button className="bubble-label" onClick={() => { setPetBubble(null); void command(() => api.openPanel({ kind: 'settings' })) }}>{answer}</button>
          : answer}
        {bubble.type === 'humor' && <div className="bubble-actions">
          <button onClick={() => answerHumor(bubble.kind)}>{bubble.kind === 'joke' ? '再讲一个 ↻' : '再来一碗 ↻'}</button>
          <button onClick={() => answerHumor(bubble.kind === 'joke' ? 'roast' : 'joke')}>{bubble.kind === 'joke' ? '来碗毒鸡汤' : '换个笑话'}</button>
        </div>}
      </div>}
    </section>
    <button className="mini-dock" data-window-hit aria-label="展开清单" aria-hidden={!compact} inert={!compact} onClick={() => { void command(() => api.setMode('expanded')) }}>
      <span className="status-dot" /> 今天 {snapshot.today.progress.completed}/{snapshot.today.progress.total}<span>展开清单 ▾</span>
    </button>
    {error && <div className="error-toast" role="alert">{error}<button data-window-hit aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}
  </main>
}
