import { PET_ACTIONS } from '../../../../shared/pet'
import type { PetAction } from '../../../../shared/pet'
import { petActionLabels, petPacks } from './pet-pack'
import type { PetPack } from './pet-pack'

export function PetActions({ pack, selected, blocked, switching, onSelect, onSelectPack, onClose }: {
  pack: PetPack; selected: PetAction; blocked: boolean; switching: boolean
  onSelect: (action: PetAction) => void; onSelectPack: (id: string) => void; onClose: () => void
}): React.JSX.Element {
  return <section className="pet-actions-panel" aria-label="桌宠动作预览">
    <div className="panel-title"><h2>桌宠动作</h2><button onClick={onClose}>返回清单</button></div>
    <label className="pet-pack-selector">桌宠角色<select aria-label="桌宠角色" value={pack.id} disabled={switching}
      onChange={event => onSelectPack(event.target.value)}>
      {petPacks.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select></label>
    <p className="pet-pack-description">v{pack.version} · 内置角色{switching ? ' · 正在保存…' : ''}</p>
    <div className="pet-action-grid">{PET_ACTIONS.map(action => <button key={action} disabled={blocked}
      aria-pressed={selected === action} onClick={() => onSelect(action)}>{petActionLabels[action]}</button>)}</div>
    <p className="scope-note">{blocked ? '先处理上方的到点提醒，再预览动作。' : '点击动作连续预览，返回清单后恢复正常互动。'}</p>
  </section>
}
