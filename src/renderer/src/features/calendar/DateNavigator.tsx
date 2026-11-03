export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function DateNavigator({ today, selected, historyDates, onSelect }: {
  today: string; selected: string; historyDates: string[]; onSelect: (date: string) => void
}): React.JSX.Element {
  return <section className="date-navigator" aria-label="日期与历史">
    <div className="date-shortcuts">{[-1, 0, 1].map((offset, index) => {
      const date = shiftDate(today, offset)
      return <button key={offset} className={date === selected ? 'selected' : ''} onClick={() => onSelect(date)}>
        {['昨天', '今天', '明天'][index]}
      </button>
    })}<input aria-label="查看日期" type="date" value={selected} onChange={event => { if (event.target.value) onSelect(event.target.value) }} /></div>
    <label className="history-picker">已有记录<select aria-label="已有记录日期" value="" onChange={event => { if (event.target.value) onSelect(event.target.value) }}>
      <option value="">选择历史日期</option>{historyDates.map(date => <option key={date} value={date}>{date}</option>)}
    </select></label>
  </section>
}
