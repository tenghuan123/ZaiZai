import { PET_ACTIONS } from '../../../../shared/pet'
import type { PetAction } from '../../../../shared/pet'
import { petActionLabels, petPack } from './pet-pack'

export function PetActions({ selected, blocked, onSelect, onClose }: {
  selected: PetAction; blocked: boolean; onSelect: (action: PetAction) => void; onClose: () => void
}): React.JSX.Element {
  return <section className="pet-actions-panel" aria-label="桌宠动作预览">
    <div className="panel-title"><h2>桌宠动作</h2><button onClick={onClose}>返回清单</button></div>
    <p className="pet-pack-name">{petPack.name}<span>V3 · 内置角色</span></p>
    <div className="pet-action-grid">{PET_ACTIONS.map(action => <button key={action} disabled={blocked}
      aria-pressed={selected === action} onClick={() => onSelect(action)}>{petActionLabels[action]}</button>)}</div>
    <p className="scope-note">{blocked ? '先处理上方的到点提醒，再预览动作。' : '点击动作连续预览，返回清单后恢复正常互动。'}</p>
  </section>
}
