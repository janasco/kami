import { useEffect, useRef } from 'react'

interface OnboardingGuideProps {
  onClose: () => void
  onStartBlank: () => void
  onStartTemplate: () => void
  onImportScreenshots: () => void
  onLoadDemo: () => void
  onOpenProject: () => void
}

const workflowSteps = [
  {
    number: '01',
    title: 'Choose your starting point',
    description: 'Explore the finished demo, begin with a template, or continue with one clean slide.',
  },
  {
    number: '02',
    title: 'Bring in your screenshots',
    description: 'Import one capture or guide a PNG, JPG, or WebP sequence into slides in order.',
  },
  {
    number: '03',
    title: 'Shape the story',
    description: 'Choose a layout and theme, write your copy, and fine-tune every layer.',
  },
  {
    number: '04',
    title: 'Check and export',
    description: 'Use preflight to catch issues, select a store profile, and export a ZIP.',
  },
]

export function OnboardingGuide({
  onClose,
  onStartBlank,
  onStartTemplate,
  onImportScreenshots,
  onLoadDemo,
  onOpenProject,
}: OnboardingGuideProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialogRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.requestAnimationFrame(() => previouslyFocusedRef.current?.focus())
    }
  }, [])

  return (
    <div
      className="onboarding-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="onboarding-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-introduction"
        tabIndex={-1}
      >
        <a
          className="onboarding-dialog__skip-link"
          href="#onboarding-actions"
          onClick={(event) => {
            event.preventDefault()
            actionsRef.current?.focus()
          }}
        >
          Skip to getting started actions
        </a>

        <div className="onboarding-dialog__hero">
          <div className="onboarding-dialog__hero-copy">
            <span className="onboarding-kicker">Welcome to Kami</span>
            <h2 id="onboarding-title">Turn your screenshots into a story.</h2>
            <p id="onboarding-intro">
              A focused four-step workflow takes you from raw app captures to a polished,
              preflight-ready screenshot set.
            </p>
          </div>
          <div className="onboarding-dialog__art" aria-hidden="true">
            <div className="onboarding-art__slide onboarding-art__slide--back">
              <span />
              <strong />
              <i />
            </div>
            <div className="onboarding-art__slide onboarding-art__slide--front">
              <span />
              <strong />
              <i />
            </div>
            <b className="onboarding-art__spark onboarding-art__spark--one">✦</b>
            <b className="onboarding-art__spark onboarding-art__spark--two">✦</b>
          </div>
          <button
            className="icon-button onboarding-dialog__close"
            type="button"
            onClick={onClose}
            aria-label="Close welcome guide and continue to the editor"
          >
            ×
          </button>
        </div>

        <div className="onboarding-dialog__body">
          <section className="onboarding-workflow" aria-labelledby="onboarding-workflow-title">
            <div className="onboarding-section-heading">
              <span>THE KAMI WORKFLOW</span>
              <h3 id="onboarding-workflow-title">From first capture to final export</h3>
            </div>
            <ol>
              {workflowSteps.map((step) => (
                <li key={step.number}>
                  <span>{step.number}</span>
                  <div>
                    <h4>{step.title}</h4>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section
            className="onboarding-actions"
            ref={actionsRef}
            tabIndex={-1}
            aria-labelledby="onboarding-actions-title"
          >
            <span className="onboarding-kicker">Your first move</span>
            <h3 id="onboarding-actions-title">How would you like to begin?</h3>
            <p>You can change any of this later. Your work autosaves in this browser.</p>
            <div className="onboarding-actions__buttons">
              <button className="button button--primary" type="button" onClick={onLoadDemo}>
                <span aria-hidden="true">✦</span> Load 3-slide demo
              </button>
              <button className="button button--outline" type="button" onClick={onImportScreenshots}>
                <span aria-hidden="true">＋</span> Import screenshots
              </button>
              <button className="button button--outline" type="button" onClick={onStartTemplate}>
                <span aria-hidden="true">◇</span> Start from a template
              </button>
              <button className="button button--quiet" type="button" onClick={onStartBlank}>
                <span aria-hidden="true">＋</span> Start with a blank slide
              </button>
              <button className="button button--quiet" type="button" onClick={onOpenProject}>
                <span aria-hidden="true">↥</span> Open project
              </button>
            </div>
            <div className="onboarding-actions__reassurance">
              <span aria-hidden="true">↻</span>
              <p><strong>Safe to explore.</strong> Demo, open, and import actions autosave and can be undone.</p>
            </div>
          </section>
        </div>

        <footer className="onboarding-dialog__footer">
          <p>Prefer to explore on your own?</p>
          <button className="text-button onboarding-dialog__skip" type="button" onClick={onClose}>
            Skip for now and continue
          </button>
        </footer>
      </div>
    </div>
  )
}
