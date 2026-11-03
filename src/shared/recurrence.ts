import type { RepeatRule } from './tasks'

export function formatRepeatRule(rule: RepeatRule): string {
  if (rule.type === 'daily') return '↻ 每日'
  if (rule.type === 'weekly') return `📆 每周${rule.weekdays.map(day => '一二三四五六日'[day - 1]).join('/')}`
  return `🗓 每月${[...rule.days.map(day => `${day}日`), ...(rule.lastDay ? ['最后一天'] : [])].join('/')}`
}
