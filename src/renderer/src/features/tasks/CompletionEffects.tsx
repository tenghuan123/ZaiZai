import type { CSSProperties } from 'react'
import type { TaskCompletion } from './use-task-completion'

export function CompletionEffects({ pending }: { pending: ReadonlyMap<string, TaskCompletion> }): React.JSX.Element {
  return <div className="completion-effects" aria-hidden="true">
    {[...pending].filter(([, job]) => job.phase !== 'saving').map(([key, job]) => <div key={key} className="completion-origin" style={{ left: job.origin.x, top: job.origin.y }}>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = index * Math.PI / 4
        return <span key={index} className={`check-particle particle-${index % 3}`} style={{
          '--burst-x': `${Math.cos(angle) * 32}px`, '--burst-y': `${Math.sin(angle) * 32}px`
        } as CSSProperties}>{index % 2 ? '♥' : '✦'}</span>
      })}
      <span className="completion-flight" style={{ '--flight-x': `${job.target.x - job.origin.x}px`,
        '--flight-y': `${job.target.y - job.origin.y}px` } as CSSProperties}>✨</span>
    </div>)}
  </div>
}
