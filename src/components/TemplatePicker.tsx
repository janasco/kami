import { useEffect, useRef, useState } from 'react'
import { getLayout, getTheme } from '../data'
import { projectTemplates, type ProjectTemplate } from '../lib/projectTemplates'
import type { ProjectTemplateSlide } from '../lib/projectTemplates'

export type TemplateApplyMode = 'new-deck' | 'replace-project'

interface TemplatePickerProps {
  onClose: () => void
  onApply: (template: ProjectTemplate, mode: TemplateApplyMode) => void
  onLoadDemo: () => void
}

function TemplatePreview({ template }: { template: ProjectTemplate }) {
  const [featured, ...remaining] = template.slides
  const theme = getTheme(featured.theme)
  const accentStyle = featured.accentShapeStyle ?? { type: 'circle' as const, color: theme.colors[1] }

  return (
    <div className="template-preview">
      <div
        className={`template-preview__canvas template-preview__canvas--${featured.layout}`}
        style={{
          background: `linear-gradient(145deg, ${theme.colors[0]}, ${theme.colors[1]})`,
          color: theme.text ?? '#ffffff',
          ['--preview-accent' as string]: theme.accent ?? theme.colors[1],
        }}
      >
        <div className="template-preview__noise" />
        <div
          className={`template-preview__shape template-preview__shape--${accentStyle.type}`}
          style={{ background: accentStyle.color }}
        />
        <div className="template-preview__kicker">YOUR PRODUCT</div>
        <div className="template-preview__headline">
          {featured.title.split('\n').map((line) => <span key={line}>{line}</span>)}
        </div>
        <div className="template-preview__subtitle">{featured.subtitle}</div>
        <div className={`template-preview__device template-preview__device--${featured.deviceFrameId}`}>
          <div className="template-preview__screen"><span /></div>
        </div>
        <div className="template-preview__footer"><span>●</span><span>•••</span></div>
      </div>
      <div className="template-preview__strip" aria-label="Template slide sequence">
        {remaining.map((slide) => {
          const slideTheme = getTheme(slide.theme)
          return (
            <div
              className={`template-preview__thumb template-preview__thumb--${slide.layout}`}
              key={`${slide.title}-${slide.theme}`}
              style={{ background: `linear-gradient(145deg, ${slideTheme.colors[0]}, ${slideTheme.colors[1]})` }}
            >
              <strong>{slide.title.split('\n')[0]}</strong>
              <span />
            </div>
          )
        })}
        <div className="template-preview__count">{template.slides.length} slides</div>
      </div>
    </div>
  )
}

function TemplateSequence({ template }: { template: ProjectTemplate }) {
  return (
    <div className="template-sequence">
      {template.slides.map((slide: ProjectTemplateSlide, index) => {
        const theme = getTheme(slide.theme)
        return (
          <div className="template-sequence__item" key={`${slide.title}-${index}`}>
            <span
              className="template-sequence__swatch"
              style={{ background: `linear-gradient(145deg, ${theme.colors[0]}, ${theme.colors[1]})` }}
            />
            <div>
              <strong>{slide.title.replace('\n', ' ')}</strong>
              <small>{getLayout(slide.layout).name} · {theme.name}</small>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TemplatePicker({ onClose, onApply, onLoadDemo }: TemplatePickerProps) {
  const [selectedId, setSelectedId] = useState(projectTemplates[0].id)
  const [mode, setMode] = useState<TemplateApplyMode>('new-deck')
  const [confirming, setConfirming] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const selected = projectTemplates.find((template) => template.id === selectedId) ?? projectTemplates[0]

  useEffect(() => {
    dialogRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="template-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="template-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
        tabIndex={-1}
      >
        {!confirming ? (
          <>
            <header className="template-dialog__header">
              <div>
                <span className="eyebrow">Project starters</span>
                <h2 id="template-dialog-title">Start from a useful story</h2>
                <p>Choose a deck, preview its direction, then confirm how you want to start.</p>
              </div>
              <div className="template-dialog__header-actions">
                <button className="button button--outline button--small" type="button" onClick={onLoadDemo}>
                  <span aria-hidden="true">✦</span> Load finished demo
                </button>
                <button className="icon-button" type="button" onClick={onClose} aria-label="Close template picker">×</button>
              </div>
            </header>

            <div className="template-dialog__body">
              <div className="template-catalog" role="list" aria-label="Project templates">
                {projectTemplates.map((template) => (
                  <button
                    className={`template-card ${selected.id === template.id ? 'is-selected' : ''}`}
                    type="button"
                    key={template.id}
                    onClick={() => setSelectedId(template.id)}
                    aria-pressed={selected.id === template.id}
                  >
                    <span className="template-card__topline">
                      <span className="template-card__category">{template.category}</span>
                      <span>{template.slides.length} slides</span>
                    </span>
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                    <span className="template-card__layouts">
                      {Array.from(new Set(template.slides.map((slide) => getLayout(slide.layout).name))).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>

              <section className="template-details" aria-label={`${selected.name} preview`}>
                <div className="template-details__intro">
                  <div>
                    <span className="eyebrow">Template preview</span>
                    <h3>{selected.name}</h3>
                    <p>{selected.description}</p>
                  </div>
                  <div className="template-details__meta">
                    <span>{selected.slides.length} slides</span>
                    <span>No imported assets</span>
                  </div>
                </div>
                <div className="template-details__content">
                  <TemplatePreview template={selected} />
                  <TemplateSequence template={selected} />
                </div>
              </section>
            </div>

            <footer className="template-dialog__footer">
              <fieldset className="template-mode">
                <legend>How should this template be applied?</legend>
                <label className={mode === 'new-deck' ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    name="template-mode"
                    value="new-deck"
                    checked={mode === 'new-deck'}
                    onChange={() => setMode('new-deck')}
                  />
                  <span><strong>Create a new deck</strong><small>Reset editor workspace preferences</small></span>
                </label>
                <label className={mode === 'replace-project' ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    name="template-mode"
                    value="replace-project"
                    checked={mode === 'replace-project'}
                    onChange={() => setMode('replace-project')}
                  />
                  <span><strong>Replace current project</strong><small>Keep locale, canvas mode, and export profile</small></span>
                </label>
              </fieldset>
              <div className="template-dialog__footer-actions">
                <button className="button button--quiet" type="button" onClick={onClose}>Cancel</button>
                <button className="button button--primary" type="button" onClick={() => setConfirming(true)}>
                  Review template <span aria-hidden="true">→</span>
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="template-confirmation">
            <button className="template-confirmation__back" type="button" onClick={() => setConfirming(false)}>
              <span aria-hidden="true">←</span> Back to templates
            </button>
            <div className="template-confirmation__icon" aria-hidden="true">✦</div>
            <span className="eyebrow">Confirm starter</span>
            <h2 id="template-dialog-title">
              {mode === 'new-deck' ? 'Create a new deck' : 'Replace the current project'}?
            </h2>
            <p>
              <strong>{selected.name}</strong> will replace the {mode === 'new-deck' ? 'deck currently open in the editor' : 'current project name and slides'}.
              {mode === 'new-deck' ? ' Locale, connected mode, and export profile will return to their editor defaults.' : ' Your current workspace preferences will be kept.'}
            </p>
            <div className="template-confirmation__note">
              <span aria-hidden="true">↶</span>
              This action is added to undo history, and the existing local autosave flow remains active.
            </div>
            <div className="template-confirmation__actions">
              <button className="button button--quiet" type="button" onClick={onClose}>Cancel</button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => onApply(selected, mode)}
              >
                {mode === 'new-deck' ? 'Create new deck' : 'Replace project'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
