import { useEffect, useRef, useState } from 'react'

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function DateNavigator({ today, selected, historyDates, onSelect, onClose }: {
  today: string; selected: string; historyDates: string[]; onSelect: (date: string) => void
  onClose: () => void
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [month, setMonth] = useState(selected.slice(0, 7))
  const [jumpDate, setJumpDate] = useState(selected)
  const recordedDates = new Set(historyDates)
  const first = `${month}-01`
  const start = new Date(`${first}T12:00:00Z`)
  const offset = (start.getUTCDay() + 6) % 7
  const monthEnd = new Date(start); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1); monthEnd.setUTCDate(0)
  const count = monthEnd.getUTCDate()
  const cells = Math.ceil((offset + count) / 7) * 7

  useEffect(() => {
    const previousFocus = document.activeElement
    const element = dialog.current
    element?.showModal()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus() }
  }, [])
  function changeMonth(delta: number): void {
    const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + delta)
    setMonth(date.toISOString().slice(0, 7))
  }
  function choose(date: string): void { onSelect(date); onClose() }

  return <dialog ref={dialog} className="date-navigator" aria-labelledby="calendar-heading" aria-describedby="calendar-help"
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}>
    <header className="calendar-heading"><h2 id="calendar-heading">按日期查看任务</h2><button aria-label="关闭日期选择" onClick={onClose}>×</button></header>
    <p id="calendar-help">查看历史待办和未来安排，选一天即可切换。</p>
    <div className="date-shortcuts">{[-1, 0, 1].map((delta, index) => {
      const date = shiftDate(today, delta)
      return <button key={delta} className={date === selected ? 'selected' : ''} onClick={() => choose(date)}>{['昨天', '今天', '明天'][index]}</button>
    })}</div>
    <div className="calendar-month"><button aria-label="上个月" disabled={month === '0001-01'} onClick={() => changeMonth(-1)}>‹</button>
      <strong aria-live="polite">{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</strong>
      <button aria-label="下个月" disabled={month === '9999-12'} onClick={() => changeMonth(1)}>›</button></div>
    <div className="calendar-weekdays" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map(label => <span key={label}>{label}</span>)}</div>
    <div className="calendar-grid" role="group" aria-label={`${month}的日期`}>{Array.from({ length: cells }, (_, index) => {
      const number = index - offset + 1
      if (number < 1 || number > count) return <span key={index} />
      const date = `${month}-${String(number).padStart(2, '0')}`
      const recorded = recordedDates.has(date)
      return <button key={index} aria-label={date} aria-pressed={date === selected} aria-current={date === today ? 'date' : undefined}
        aria-describedby={recorded ? 'calendar-record-legend' : undefined} onClick={() => choose(date)}>{number}
        {recorded && <span className="calendar-record-dot" aria-hidden="true" />}</button>
    })}</div>
    <p id="calendar-record-legend" className="calendar-legend"><span className="calendar-record-dot" />有历史记录</p>
    <form className="calendar-jump" onSubmit={event => { event.preventDefault(); if (jumpDate) choose(jumpDate) }}>
      <label>跳到日期<input aria-label="查看日期" type="date" required min="0001-01-01" max="9999-12-31" value={jumpDate} onChange={event => setJumpDate(event.target.value)} /></label>
      <button type="submit">查看</button>
    </form>
  </dialog>
}
