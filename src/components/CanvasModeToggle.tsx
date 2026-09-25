import type { CanvasMode } from '../types'

interface CanvasModeToggleProps {
  mode: CanvasMode
  onChange: (mode: CanvasMode) => void
  className?: string
}

export function CanvasModeToggle({ mode, onChange, className = '' }: CanvasModeToggleProps) {
  return (
    <div className={`canvas-mode-toggle ${className}`.trim()} role="group" aria-label="Canvas mode">
      <button
        className={mode === 'connected' ? 'is-active' : ''}
        type="button"
        onClick={() => onChange('connected')}
        aria-pressed={mode === 'connected'}
        title="Show all slides in a connected strip"
      >
        Connected
      </button>
      <button
        className={mode === 'isolated' ? 'is-active' : ''}
        type="button"
        onClick={() => onChange('isolated')}
        aria-pressed={mode === 'isolated'}
        title="Show one slide at a time"
      >
        Isolated
      </button>
    </div>
  )
}
