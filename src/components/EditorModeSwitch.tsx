import { editorModeOptions, type EditorMode } from '../lib/editorMode'

interface EditorModeSwitchProps {
  mode: EditorMode
  onChange: (mode: EditorMode) => void
  /** Rendered after the two options, for shell-specific wording. */
  children?: React.ReactNode
}

/**
 * The one explicit Guided / Full editor switch.
 *
 * Both shells render it, so the same preference is offered from either side
 * and neither shell has to invent its own wording. The preference is a browser
 * setting owned by the App, not project state, so switching modes never
 * changes the deck.
 */
export function EditorModeSwitch({ mode, onChange, children }: EditorModeSwitchProps) {
  return (
    <div className="editor-mode-switch">
      <span className="editor-mode-switch__label" id="editor-mode-switch-label">Editor</span>
      <div className="editor-mode-switch__options" role="group" aria-labelledby="editor-mode-switch-label">
        {editorModeOptions.map((option) => (
          <button
            key={option.id}
            className={`editor-mode-switch__option${mode === option.id ? ' is-active' : ''}`}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={mode === option.id}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}
