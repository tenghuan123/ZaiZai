import type { TaskCategory } from '../../../../shared/tasks'

export const taskCategories = [
  { value: 'work', label: '工作' },
  { value: 'life', label: '生活' },
  { value: null, label: '未分类' }
] as const

export function TaskCategoryBadge({ category }: { category: TaskCategory }): React.JSX.Element {
  return <span className={`category-badge ${category ?? 'uncategorized'}`}>{taskCategories.find(option => option.value === category)?.label}</span>
}
