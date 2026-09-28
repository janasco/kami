import { useEffect, useRef, useState } from 'react'
import {
  layouts,
  sanitizeLayerOpacity,
  slideLayerIds,
  slideLayerLabels,
  themes,
} from '../../data'
import { getSlideText } from '../../lib/localization'
import { isRefineIssue } from '../../lib/flowboardStages'
import type { ExportPreflightResult } from '../../lib/exportPreflight'
import type { ArrangeScope } from '../../lib/layerArrange'
import type { LayoutId, OutputVariant, ThemeId } from '../../types'
import type { CopyEditorRequest } from './useFlowboardStagePanels'
import { Inspector, type InspectorProps } from '../Inspector'
import { BackgroundFillControls } from '../BackgroundFillControls'
import { LayerArrangeControls } from '../LayerArrangeControls'
import { LayerTransformControls, LayerTransformResetButton } from '../LayerTransformControls'
import { RefineVariantPreview } from '../RefineVariantPreview'
import { SlideCanvas, type SlideCanvasProps } from '../SlideCanvas'

interface RefineStageProps {
  canvas: SlideCanvasProps
  inspector: InspectorProps
  preflight: ExportPreflightResult
  onGoToSlide: (slideId: string) => void
  /**
   * The deck's variants, for the merged preview picker. A deck with one default
   * variant always has exactly one, so the picker is never empty once a deck
   * exists. Optional because a caller with nothing to preview — Guided mode
   * before a deck is loaded, a test rendering the canvas on its own — gets the
   * stage it had before this surface existed: no picker, no preview, the same
   * editable canvas.
   */
  variants?: OutputVariant[]
  /**
   * The variant the Refine canvas is previewing, or `''` for the editable deck.
   * Held by the shell rather than by this stage so a choice made here survives
   * moving to another stage and back.
   */
  variantPreviewId?: string
  onVariantPreviewIdChange?: (variantId: string) => void
  /**
   * Which slide of the variant the merged preview holds, or `''` to follow the
   * deck's own selection.
   *
   * Held by the shell for the same reason, and for one more: the Ship stage's
   * export manifest names a variant *and* a deck slide, and this is the only
   * state the preview reads to decide which. While it lived here, a row that
   * asked for slide 7 would have been overruled by whatever this stage last had
   * in it — the two ways of choosing a slide could not both be right. The
   * stepper below and every manifest row now write this one value.
   */
  variantPreviewSlideId?: string
  onVariantPreviewSlideIdChange?: (slideId: string) => void
  /**
   * Set when another stage, such as the Story translation matrix, asked for the
   * copy editor. The requested field is focused once the slide and locale match.
   */
  copyEditorRequest?: CopyEditorRequest | null
}

const copyFieldDomId = (field: 'title' | 'subtitle') =>
  field === 'title' ? 'flowboard-headline' : 'flowboard-supporting'

const preflightStatusLabel = {
  ready: 'Ready',
  warnings: 'Warnings',
  blocked: 'Blocked',
} as const

const issueSlideLabel = (slideNumbers: number[]) => {
  if (slideNumbers.length === 0) return 'Project'
  if (slideNumbers.length === 1) return `Slide ${slideNumbers[0]}`
  return `Slides ${slideNumbers.join(', ')}`
}

/**
 * Stage 4. The large shared canvas plus a compact contextual property tray.
 * The full Inspector stays available as a drawer so nothing from the classic
 * editor is lost, and preflight issues are always one click away.
 */
export function RefineStage({
  canvas,
  inspector,
  preflight,
  onGoToSlide,
  variants = [],
  variantPreviewId = '',
  onVariantPreviewIdChange = () => undefined,
  variantPreviewSlideId = '',
  onVariantPreviewSlideIdChange = () => undefined,
  copyEditorRequest,
}: RefineStageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  /**
   * Canvas guides and the arrange scope are UI-only choices. Neither is
   * serialized, so turning a guide on cannot change the project, and the scope
   * only decides which transform an action writes.
   */
  const [guidesVisible, setGuidesVisible] = useState(true)
  const [arrangeScope, setArrangeScope] = useState<ArrangeScope>('layer')
  const slide = inspector.slide
  const text = getSlideText(slide, inspector.activeLocale)
  const selectedSettings = slide.layerSettings[inspector.selectedLayerId]
  const layerLabel = slideLayerLabels[inspector.selectedLayerId]
  const layerIssues = preflight.issues.filter(isRefineIssue)
  const slideIdToIndex = (slideNumber: number) => canvas.slides[slideNumber - 1]?.id
  const handledCopyRequestRef = useRef(0)
  /*
   * Whether the merged preview is on. Decided by whether the chosen id is a
   * variant this deck actually has, so a stale id from a removed variant falls
   * back to the editable canvas rather than rendering nothing.
   */
  const previewing = variants.some((variant) => variant.id === variantPreviewId)

  /**
   * Focuses the tray copy editor when another stage asked for it. The request
   * only applies once the requested slide and locale are the ones on screen, so
   * a locale switch that lands a tick later still focuses the right field.
   */
  useEffect(() => {
    if (!copyEditorRequest) return
    if (copyEditorRequest.slideId !== slide.id) return
    if (copyEditorRequest.locale !== inspector.activeLocale) return
    if (handledCopyRequestRef.current === copyEditorRequest.token) return
    const field = document.getElementById(copyFieldDomId(copyEditorRequest.field)) as HTMLTextAreaElement | null
    if (!field) return
    handledCopyRequestRef.current = copyEditorRequest.token
    field.focus()
    field.select()
  }, [copyEditorRequest, inspector.activeLocale, slide.id])

  return (
    <div className={`flowboard-stage-body flowboard-refine${drawerOpen ? ' has-drawer' : ''}`}>
      <section className="flowboard-panel flowboard-panel--wide flowboard-refine__canvas" aria-labelledby="refine-canvas-title">
        <div className="flowboard-panel__heading flowboard-panel__heading--row">
          <div>
            <span className="eyebrow">Direct manipulation</span>
            <h3 id="refine-canvas-title">Slide {canvas.selectedIndex + 1} of {canvas.slides.length}</h3>
          </div>
          <div className="flowboard-panel__heading-actions">
            <span className="flowboard-badge">Editing: {layerLabel}</span>
            <label className="layer-visibility-toggle flowboard-guides-toggle" htmlFor="flowboard-canvas-guides">
              <span>Guides</span>
              <input
                id="flowboard-canvas-guides"
                type="checkbox"
                checked={guidesVisible}
                onChange={(event) => setGuidesVisible(event.target.checked)}
                aria-label="Show canvas guides"
              />
              <span className="switch" aria-hidden="true" />
            </label>
            <button
              className="button button--outline button--small"
              type="button"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-expanded={drawerOpen}
              aria-controls="flowboard-inspector-drawer"
            >
              {drawerOpen ? 'Hide full inspector' : 'Open full inspector'}
            </button>
          </div>
        </div>
        <p className="flowboard-hint">
          {previewing
            /*
             * Accurate about the tray, because it is genuinely still live: the
             * tray edits the deck's own slide, and the preview follows from it
             * except where the variant pins that layer's placement for its own
             * device. Saying so beats a hint that implies the tray is disabled.
             */
            ? 'The canvas is showing a variant’s export, read-only. Pick Deck to carry on editing. The property tray still edits the deck’s own slide, which is what the preview is built from.'
            : 'Click any layer on the canvas to select it, then drag to reposition. Arrow keys nudge the selected layer, Shift for a bigger step and Alt for a finer one.'}
        </p>
        <div className="flowboard-refine__stage">
          {/*
            The picker is mounted in both states, so which surface is on screen is
            one control rather than a mode an author has to discover. The two
            branches are the only difference: with a variant chosen the canvas is
            the read-only merged render, and with Deck chosen it is the editable
            canvas exactly as it has always been, with the same props and the
            same guides. With no variants to preview the picker is not rendered at
            all, and this stage is byte-for-byte the stage it was.
          */}
          {variants.length > 0 && (
            <RefineVariantPreview
              slides={canvas.slides}
              selectedSlideId={canvas.selectedId}
              variants={variants}
              value={previewing ? variantPreviewId : ''}
              onChange={onVariantPreviewIdChange}
              previewSlideId={variantPreviewSlideId}
              onPreviewSlideChange={onVariantPreviewSlideIdChange}
              profile={canvas.profile}
              locale={canvas.locale}
            />
          )}
          {!previewing && <SlideCanvas {...canvas} showGuides={guidesVisible} />}
        </div>
      </section>

      <section className="flowboard-panel flowboard-tray" aria-labelledby="refine-tray-title">
        <div className="flowboard-panel__heading">
          <span className="eyebrow">Property tray</span>
          <h3 id="refine-tray-title">{layerLabel}</h3>
        </div>

        <div className="layer-picker" role="group" aria-label="Canvas layer">
          {slideLayerIds.map((layerId) => (
            <button
              key={layerId}
              className={`layer-option ${inspector.selectedLayerId === layerId ? 'is-active' : ''}${slide.layerSettings[layerId].visible ? '' : ' is-hidden'}`}
              type="button"
              onClick={() => inspector.onLayerSelect(layerId)}
              aria-label={`${slideLayerLabels[layerId]}${slide.layerSettings[layerId].visible ? '' : ', hidden'}`}
              aria-pressed={inspector.selectedLayerId === layerId}
            >
              <span className={`layer-option__icon layer-option__icon--${layerId}`} aria-hidden="true" />
              <span>{slideLayerLabels[layerId]}</span>
            </button>
          ))}
        </div>

        <div className="flowboard-tray__row">
          <label className="layer-visibility-toggle" htmlFor="flowboard-layer-visible">
            <span>Visible</span>
            <input
              id="flowboard-layer-visible"
              type="checkbox"
              checked={selectedSettings.visible}
              onChange={(event) => inspector.onUpdate({
                layerSettings: {
                  ...slide.layerSettings,
                  [inspector.selectedLayerId]: { ...selectedSettings, visible: event.target.checked },
                },
              }, `layer-settings:${slide.id}:${inspector.selectedLayerId}:visible`)}
            />
            <span className="switch" aria-hidden="true" />
          </label>
          <div className="layer-opacity-control">
            <div className="layer-opacity-control__label">
              <label className="field-label" htmlFor="flowboard-layer-opacity">Opacity</label>
              <output htmlFor="flowboard-layer-opacity">{Math.round(selectedSettings.opacity * 100)}%</output>
            </div>
            <input
              id="flowboard-layer-opacity"
              className="layer-opacity-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={sanitizeLayerOpacity(selectedSettings.opacity, selectedSettings.opacity)}
              aria-label={`${layerLabel} opacity`}
              aria-valuetext={`${Math.round(selectedSettings.opacity * 100)} percent`}
              onChange={(event) => inspector.onUpdate({
                layerSettings: {
                  ...slide.layerSettings,
                  [inspector.selectedLayerId]: {
                    ...selectedSettings,
                    opacity: sanitizeLayerOpacity(Number(event.target.value), selectedSettings.opacity),
                  },
                },
              }, `layer-opacity:${slide.id}:${inspector.selectedLayerId}`)}
            />
          </div>
        </div>

        <LayerArrangeControls
          slide={slide}
          selectedLayerId={inspector.selectedLayerId}
          layerBounds={inspector.layerBounds}
          profile={inspector.profile}
          onArrange={inspector.onArrange}
          idPrefix="flowboard-arrange"
          scope={arrangeScope}
          onScopeChange={setArrangeScope}
        />

        <LayerTransformControls
          slide={slide}
          layerId={inspector.selectedLayerId}
          idPrefix="flowboard-transform"
          onUpdate={inspector.onUpdate}
          actions={(
            <LayerTransformResetButton
              slide={slide}
              layerId={inspector.selectedLayerId}
              onUpdate={inspector.onUpdate}
            />
          )}
        />

        <section className="flowboard-tray__group" aria-labelledby="refine-background-title">
          <span className="eyebrow" id="refine-background-title">Background</span>
          <BackgroundFillControls
            slide={slide}
            idPrefix="flowboard-background"
            onUpdate={inspector.onUpdate}
          />
        </section>

        <label className="field-label" htmlFor="flowboard-headline">Headline</label>
        <textarea
          id="flowboard-headline"
          rows={2}
          value={text.title}
          onChange={(event) => inspector.onTextUpdate('title', event.target.value)}
        />
        <label className="field-label" htmlFor="flowboard-supporting">Supporting text</label>
        <textarea
          id="flowboard-supporting"
          rows={2}
          value={text.subtitle}
          onChange={(event) => inspector.onTextUpdate('subtitle', event.target.value)}
        />

        <div className="flowboard-tray__pair">
          <div>
            <label className="field-label" htmlFor="flowboard-layout">Layout</label>
            <select
              id="flowboard-layout"
              className="profile-select"
              value={slide.layout}
              onChange={(event) => inspector.onUpdate({ layout: event.target.value as LayoutId })}
            >
              {layouts.map((layout) => (
                <option key={layout.id} value={layout.id}>{layout.name} · {layout.description}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="flowboard-theme">Theme</label>
            <select
              id="flowboard-theme"
              className="profile-select"
              value={slide.theme}
              onChange={(event) => inspector.onUpdate({ theme: event.target.value as ThemeId })}
            >
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>{theme.name}</option>
              ))}
            </select>
          </div>
        </div>

        <section className={`preflight-panel preflight-panel--${preflight.status}`} aria-labelledby="refine-preflight-title">
          <div className="section-label">
            <span id="refine-preflight-title">Preflight</span>
            <span className={`preflight-status preflight-status--${preflight.status}`}>
              <i aria-hidden="true" /> {preflightStatusLabel[preflight.status]}
            </span>
          </div>
          {layerIssues.length === 0 ? (
            <p className="preflight-ready">No layer issues. Hidden, transparent, and out-of-bounds layers appear here.</p>
          ) : (
            <ul className="preflight-issues" aria-live="polite">
              {layerIssues.map((issue, index) => {
                const targetId = issue.slideNumbers.map(slideIdToIndex).find((id): id is string => Boolean(id))
                return (
                  <li key={`${issue.code}-${issue.layerId ?? 'project'}-${index}`}>
                    <span>{issue.message}</span>
                    <small>{issueSlideLabel(issue.slideNumbers)}</small>
                    {targetId && targetId !== slide.id && (
                      <button className="text-button text-button--compact" type="button" onClick={() => onGoToSlide(targetId)}>
                        Go to slide
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </section>

      {drawerOpen && (
        <div className="flowboard-drawer" id="flowboard-inspector-drawer">
          <div className="flowboard-drawer__head">
            <span className="eyebrow">Full inspector</span>
            <button
              className="icon-button"
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close the full inspector"
              title="Close the full inspector"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="flowboard-drawer__panel">
            <Inspector {...inspector} />
          </div>
        </div>
      )}
    </div>
  )
}
