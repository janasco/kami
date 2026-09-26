import { useCallback, useMemo, useState } from 'react'
import { EditorModeSwitch } from './EditorModeSwitch'
import type { FlowboardProps } from './Flowboard'
import { GuidedDownloadStep } from './guided/GuidedDownloadStep'
import { GuidedLookStep } from './guided/GuidedLookStep'
import { GuidedScreenshotsStep } from './guided/GuidedScreenshotsStep'
import { GuidedWordsStep } from './guided/GuidedWordsStep'
import type { FlowboardStageId } from '../lib/flowboardStages'
import { useFlowboardStagePanels } from './flowboard/useFlowboardStagePanels'
import {
  deriveGuidedStep,
  getGuidedStepDefinition,
  guidedPrimaryAction,
  guidedStageStep,
  guidedStepStatus,
  guidedStepIds,
  guidedStepStage,
  nextGuidedStep,
  previousGuidedStep,
  type GuidedStepId,
} from '../lib/guidedSteps'
import type { BulkSlideAction } from '../lib/flowboardBulkEdit'
import './guided/guided.css'

/**
 * Guided mode takes the same props and the same handlers as the Full Editor.
 *
 * Nothing here creates project state, a renderer, an import path, an export
 * path, or an autosave path: the App owns all of that and passes it down
 * unchanged. Guided mode only decides which question to ask next.
 */
export type GuidedShellProps = FlowboardProps

/** Steps where the advanced Refine panel is offered as a link. */
const refineLinkSteps: GuidedStepId[] = ['look', 'words']

/**
 * The beginner shell: four steps, one primary action each, and a sticky
 * footer.
 *
 * The complex control set is never removed, only moved behind a More options
 * disclosure that renders the existing Flowboard stage in place. That is why
 * there is no second stage renderer here: the panels come from the same hook
 * the Full Editor uses, so guided mode cannot drift from it.
 */
export function GuidedShell(props: GuidedShellProps) {
  const { slides, selectedSlide, selectedIndex, activeLocale, preflight, profile } = props
  /**
   * The step the author asked for, which wins over the derived step until the
   * deck or the author moves it on. Holding it here keeps the guided flow
   * predictable when someone goes back to fix a screenshot.
   */
  const [requestedStep, setRequestedStep] = useState<GuidedStepId | null>(null)
  /**
   * The advanced panel, keyed by the step it was opened from. Rendering the
   * panel only while the keys match is what keeps a closed step free of the
   * full control set, and what lets a step change close it on its own.
   */
  const [moreOptions, setMoreOptions] = useState<{ step: GuidedStepId; stage: FlowboardStageId } | null>(null)
  const [lookNotice, setLookNotice] = useState<string | null>(null)

  const derived = useMemo(
    () => deriveGuidedStep({ slides, activeLocale, preflight }),
    [activeLocale, preflight, slides],
  )
  const step = requestedStep ?? derived.step
  const definition = getGuidedStepDefinition(step)
  const primary = guidedPrimaryAction({ ...derived, step })
  const stepIndex = guidedStepIds.indexOf(step)
  const openStage = moreOptions && moreOptions.step === step ? moreOptions.stage : null

  const goToStep = useCallback((next: GuidedStepId) => {
    setRequestedStep(next)
  }, [])

  const revealPanel = useCallback((stage: FlowboardStageId) => {
    setMoreOptions({ step, stage })
  }, [step])

  /** A stage asking for a different stage maps back onto a guided step. */
  const handleGoToStage = useCallback((stage: FlowboardStageId) => {
    if (stage === 'refine') {
      setMoreOptions({ step, stage: 'refine' })
      return
    }
    goToStep(guidedStageStep[stage])
  }, [goToStep, step])

  const { exportGate, getStagePanel } = useFlowboardStagePanels(props, () => {
    setMoreOptions({ step, stage: 'refine' })
  })

  const applyToAllSlides = useCallback((action: BulkSlideAction) => {
    setLookNotice(props.onApplyBulkSlideAction(slides.map((slide) => slide.id), action))
  }, [props, slides])

  const runPrimary = () => {
    if (primary.kind === 'add-screenshots') {
      props.onOpenScreenshotImport()
      return
    }
    if (primary.kind === 'download') {
      props.onExport()
      return
    }
    goToStep(nextGuidedStep(step))
  }

  const stepPanel = (() => {
    if (step === 'screenshots') {
      return (
        <GuidedScreenshotsStep
          slides={slides}
          captureCount={derived.captureCount}
          slidesWithoutCapture={derived.slidesWithoutCapture}
          selectedSlideId={selectedSlide.id}
          onSelect={props.onSelect}
          onReplaceScreenshot={props.onImportScreenshot}
        />
      )
    }

    if (step === 'look') {
      return (
        <GuidedLookStep
          slides={slides}
          notice={lookNotice}
          onApplyToAllSlides={applyToAllSlides}
        />
      )
    }

    if (step === 'words') {
      return (
        <GuidedWordsStep
          slides={slides}
          selectedSlide={selectedSlide}
          selectedIndex={selectedIndex}
          activeLocale={activeLocale}
          slidesWithoutHeadline={derived.slidesWithoutHeadline}
          onSelect={props.onSelect}
          onAddSlide={props.onAddSlide}
          onTextUpdate={props.onTextUpdate}
        />
      )
    }

    return (
      <GuidedDownloadStep
        projectName={props.projectName}
        slides={slides}
        selectedSlide={selectedSlide}
        captureCount={derived.captureCount}
        profile={profile}
        onProfileChange={props.onProfileChange}
        preflight={preflight}
        exportGate={exportGate}
        exportDetail={props.exportDetail}
        onSaveProject={props.onSaveProject}
        onShowChecks={() => revealPanel('ship')}
      />
    )
  })()

  return (
    <div className="guided-shell" data-guided-step={step}>
      <header className="guided-topbar">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="Back to Kami landing page"
          title="Back to Kami landing page"
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Kami</span>
        </a>

        <div className="guided-topbar__project">
          <label className="guided-topbar__label" htmlFor="guided-project-name">Project name</label>
          <input
            id="guided-project-name"
            value={props.projectName}
            spellCheck={false}
            onChange={(event) => props.onProjectNameChange(event.target.value)}
          />
        </div>

        <EditorModeSwitch mode="guided" onChange={props.onEditorModeChange} />
      </header>

      <div className="guided-body">
        <main className="guided-main">
          <nav className="guided-progress" aria-label="Guided steps">
            <p className="guided-progress__count">Step {stepIndex + 1} of {derived.stepCount}</p>
            <ol role="list">
              {derived.steps.map((entry, index) => {
                const current = entry.id === step
                return (
                  <li key={entry.id} className={current ? 'is-current' : undefined}>
                    <button
                      className="guided-progress__step"
                      type="button"
                      onClick={() => goToStep(entry.id)}
                      aria-current={current ? 'step' : undefined}
                    >
                      <span className="guided-progress__mark" aria-hidden="true">
                        {entry.done ? '✓' : index + 1}
                      </span>
                      {entry.title}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>

          <h1 className="guided-title">{definition.title}</h1>
          <p className="guided-summary">{definition.summary}</p>
          <p className="guided-status" role="status" aria-live="polite">{guidedStepStatus(derived, step)}</p>

          {stepPanel}

          <section className="guided-more">
            <button
              className="button button--outline"
              type="button"
              onClick={() => setMoreOptions(openStage ? null : { step, stage: guidedStepStage[step] })}
              aria-expanded={openStage !== null}
              aria-controls="guided-more-options"
            >
              {openStage ? 'Hide more options' : 'More options'}
            </button>
            <p className="guided-hint">
              Everything the full editor can do with this step, including templates, languages, and
              per-slide controls.
            </p>
            {openStage && (
              <div className="guided-more__panel" id="guided-more-options">
                {getStagePanel(openStage, handleGoToStage)}
              </div>
            )}
          </section>

          {refineLinkSteps.includes(step) && (
            <p className="guided-advanced">
              <button
                className="text-button"
                type="button"
                onClick={() => revealPanel('refine')}
                aria-expanded={openStage === 'refine'}
                aria-controls="guided-more-options"
              >
                Adjust layers and positions (advanced)
              </button>
            </p>
          )}
        </main>
      </div>

      <footer className="guided-footer">
        <button
          className="button button--quiet"
          type="button"
          onClick={() => goToStep(previousGuidedStep(step))}
          disabled={stepIndex === 0}
        >
          <span aria-hidden="true">←</span> {definition.backLabel ?? 'Back'}
        </button>
        <button
          className="button button--quiet"
          type="button"
          onClick={() => goToStep(nextGuidedStep(step))}
          disabled={stepIndex === guidedStepIds.length - 1}
        >
          Skip this step
        </button>
        <button
          className="button button--primary guided-footer__primary"
          type="button"
          onClick={runPrimary}
          disabled={primary.kind === 'download' && !exportGate.enabled}
          aria-busy={exportGate.exporting}
          aria-describedby="guided-primary-hint"
        >
          {primary.label} <span aria-hidden="true">→</span>
        </button>
        <p className="guided-footer__hint" id="guided-primary-hint">
          {primary.kind === 'download' && exportGate.blocked
            ? exportGate.message
            : 'You can go back or skip at any time. Nothing is lost.'}
        </p>
      </footer>
    </div>
  )
}
