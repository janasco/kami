// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ShipStage, type ShipStageProps } from './ShipStage'
import { useFlowboardStagePanels } from './useFlowboardStagePanels'
import { createDefaultOutputVariant } from '../../lib/deviceVariants'
import { planExportEntries } from '../../lib/exportPlan'
import { buildExportManifest } from '../../lib/exportManifest'
import { runExportPreflight } from '../../lib/exportPreflight'
import { resolveFlowboardExportGate } from '../../lib/flowboardExportState'
import type { FlowboardStageId } from '../../lib/flowboardStages'
import { exportProfiles } from '../../data'
import { makeFlowboardProps } from '../../test/flowboardProps'
import { createTestSlide } from '../../test/projectFixtures'
import type { OutputVariant, Slide } from '../../types'
import type { FlowboardProps } from '../Flowboard'

/**
 * Every row of the export manifest must be a way to *see* the file it names.
 *
 * The manifest is the only N×M view of a deck: one row per planned export entry,
 * carrying the file, the variant, the deck slide, the size, and the locale. It
 * used to be text with no link out of it, so an author looking at fifty-seven rows
 * had no route from "this row" to "this exact variant and slide, actually
 * rendered" — the merged per-variant preview existed, one stage away, reachable
 * only by first selecting a variant and then its slide by hand.
 *
 * Three properties are load-bearing and all three are behavioural, which is why
 * this is a jsdom test and not a markup one. A markup string cannot say which
 * arguments a handler was called with, and the arguments *are* the feature: a
 * control that always reported the first row's variant and slide would render
 * exactly the right button and open exactly the wrong preview.
 *
 *  1. **The arguments.** Pressing row *n* requests row *n*'s variant and row
 *     *n*'s deck slide.
 *  2. **Reachability.** The control is a real `<button>` inside the row, not a
 *     click handler on the `<tr>` — which no keyboard can reach and no screen
 *     reader can name — and it carries a name that says which variant and slide.
 *  3. **One way in.** The row calls the same `onOpenVariantPreview` the variant
 *     list's own "Show on canvas" control calls, and both land on the one merged
 *     preview through the one `openVariantPreview` in the stage hook. The last
 *     test is the one that would catch a second, parallel mechanism: a preview
 *     position held inside the Refine stage would quietly overrule the row.
 */

afterEach(() => {
  cleanup()
})

const profile = exportProfiles[0]

/**
 * Nineteen slides and three variants: fifty-seven rows, the size the manifest
 * actually reaches. A three-row fixture would not exercise "which of the fifty-
 * seven buttons did I press", and costs the same to render.
 */
const SLIDE_COUNT = 19
const VARIANT_LABELS = [
  { id: 'variant-phone', name: 'Phone' },
  { id: 'variant-tablet', name: 'Tablet' },
  { id: 'variant-arabic', name: 'Arabic set' },
] as const

const makeDeck = (count = SLIDE_COUNT): Slide[] =>
  Array.from({ length: count }, (_, index) => createTestSlide({ id: `slide-${index + 1}` }))

const makeVariants = (slides: Slide[]): OutputVariant[] =>
  VARIANT_LABELS.map((label) => createDefaultOutputVariant({
    id: label.id,
    name: label.name,
    slideIds: slides.map((slide) => slide.id),
    locale: 'en-US',
    themeId: 'midnight',
    exportProfileId: profile.id,
  }))

/**
 * The Ship stage for one deck, with a plan built the way the App builds it.
 *
 * The plan and the variants are minted from the very slides the stage renders.
 * A variant built from a second call's slides names nothing, and every assertion
 * below would then fail for a reason that has nothing to do with the code under
 * test — a fixture bug that reads exactly like a product bug.
 */
const renderShip = (overrides: Partial<ShipStageProps> = {}) => {
  const slides = overrides.slides ?? makeDeck()
  const variants = overrides.variants ?? makeVariants(slides)
  const plan = planExportEntries({
    slides,
    variants,
    profileId: profile.id,
    requiresScreenshot: true,
  })
  const preflight = runExportPreflight({ profile, slides, activeLocale: 'en-US', variants })
  const noop = () => undefined
  const props: ShipStageProps = {
    projectName: 'Manifest deck',
    slides,
    selectedSlide: slides[0],
    profile,
    onProfileChange: noop,
    preflight,
    variants,
    activeVariantId: variants[0].id,
    onVariantPreviewChange: noop,
    onVariantProfileChange: noop,
    onVariantLocaleChange: noop,
    onVariantToggleEnabled: noop,
    onVariantRename: noop,
    onVariantAdd: noop,
    onVariantRemove: noop,
    onVariantOverrideChange: noop,
    onVariantCaptureChange: noop,
    exportEntries: plan.entries,
    exportBlockedVariant: plan.blocked,
    exportGate: resolveFlowboardExportGate({ exportStatus: 'idle', preflight, slideCount: slides.length }),
    exportDetail: '',
    onExport: noop,
    onSaveProject: noop,
    onOpenProject: noop,
    onGoToSlide: noop,
    onOpenVariantPreview: noop,
    activeLocale: 'en-US',
    ...overrides,
  }
  return { ...render(<ShipStage {...props} />), props }
}

/** The manifest's body rows, in the order the export will write the files. */
const manifestRows = (): HTMLTableRowElement[] =>
  [...document.querySelectorAll('.ship-manifest__table tbody tr')] as HTMLTableRowElement[]

/** The one control a manifest row carries. */
const rowButton = (index: number): HTMLButtonElement => {
  const button = manifestRows()[index]?.querySelector('button')
  if (!button) throw new Error(`manifest row ${index} carries no control`)
  return button as HTMLButtonElement
}

/** The filenames the stage is showing, rebuilt from the same plan rather than read. */
const manifestNames = (props: ShipStageProps): string[] =>
  buildExportManifest({
    plan: { entries: props.exportEntries, blocked: props.exportBlockedVariant },
    profile: props.profile,
    variants: props.variants,
    locale: props.activeLocale ?? 'en-US',
  }).entries.map((entry) => entry.filename)

describe('the export manifest rows as a way to see a file', () => {
  it('gives every one of the fifty-seven rows a control the keyboard can reach', () => {
    // A <tr onclick> is the specific thing to avoid: it is not focusable, Enter
    // does nothing on it, and a screen reader has nothing to announce. A real
    // button in the row is both operable and nameable.
    renderShip()
    const rows = manifestRows()
    expect(rows).toHaveLength(SLIDE_COUNT * VARIANT_LABELS.length)

    const buttons = [...document.querySelectorAll('.ship-manifest__table tbody button')]
    expect(buttons).toHaveLength(rows.length)
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      expect(button.closest('tr')).not.toBeNull()
    }
  })

  it('leaves the row itself inert, so a click outside the control does nothing', () => {
    // The failure this guards: a handler on the <tr> would fire for a click on the
    // row and on any cell in it, which is exactly the mouse-only affordance the
    // control was supposed to replace.
    const onOpenVariantPreview = vi.fn()
    renderShip({ onOpenVariantPreview })
    const row = manifestRows()[4]

    fireEvent.click(row)
    fireEvent.click(row.querySelector('td') as HTMLTableCellElement)
    expect(onOpenVariantPreview).not.toHaveBeenCalled()

    fireEvent.click(row.querySelector('button') as HTMLButtonElement)
    expect(onOpenVariantPreview).toHaveBeenCalledTimes(1)
  })

  it('asks for the pressed row’s own variant and the pressed row’s own deck slide', () => {
    const onOpenVariantPreview = vi.fn()
    renderShip({ onOpenVariantPreview })

    // Row 0 is the first variant's slide 1. Row 21 is the second variant's slide
    // 3: a control that always reported the first entry's pair would render the
    // right button and open the wrong preview, and the string of that button
    // would be identical either way.
    fireEvent.click(rowButton(21))

    expect(onOpenVariantPreview).toHaveBeenCalledTimes(1)
    expect(onOpenVariantPreview).toHaveBeenCalledWith('variant-tablet', 'slide-3')
  })

  it('asks for the third variant’s own slides too, not the first variant’s', () => {
    // The last variant's last row, which no amount of "the first slide of the
    // selected variant" gets right.
    const onOpenVariantPreview = vi.fn()
    renderShip({ onOpenVariantPreview })

    fireEvent.click(rowButton(SLIDE_COUNT * 2 + SLIDE_COUNT - 1))

    expect(onOpenVariantPreview).toHaveBeenCalledWith('variant-arabic', `slide-${SLIDE_COUNT}`)
  })

  it('names each control for its own variant and slide, and no two names collide', () => {
    // "Preview" fifty-seven times over is not a name. A screen reader user
    // stepping through the table has to be able to tell the rows apart, and the
    // collision check is what keeps a variant rename from collapsing them.
    renderShip()
    const names = manifestRows().map((row) => row.querySelector('button')?.getAttribute('aria-label'))

    expect(names).toHaveLength(57)
    expect(new Set(names).size).toBe(names.length)
    expect(names[21]).toBe('Preview Tablet, deck slide 3')
    expect(names[0]).toBe('Preview Phone, deck slide 1')
  })

  it('claims nothing about exporting, and nothing about a file that already exists', () => {
    // The row names a file that has not been written. A control that said
    // "Export", "Download", or "Open" would describe a bundle that does not exist
    // yet, and the author would press it expecting a file.
    renderShip()
    for (const row of manifestRows()) {
      const button = row.querySelector('button') as HTMLButtonElement
      const said = `${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`
      expect(said, said).not.toMatch(/\b(export|download|save|open|get|retrieve|already|exists|written|attached)\b/i)
    }
  })

  it('leaves the filename as visible text, and the control beside it', () => {
    // The name is the row's identity and it is what the bundle will carry, so it
    // stays plain text. The control is a sibling of it, not a wrapper around it:
    // a button inside the <code> would make the filename itself look activatable.
    const { props } = renderShip()
    const header = manifestRows()[0].querySelector('th[scope="row"]') as HTMLTableCellElement

    expect(header.querySelector('code')?.textContent).toBe(manifestNames(props)[0])
    expect(header.querySelector('code button')).toBeNull()
    expect(header.querySelector('button')).not.toBeNull()
  })

  it('leaves the table a table: five columns and one row header per planned file', () => {
    // A sixth column would be a data cell with no header of its own, and a control
    // on the <tr> would break the row's association with its header entirely.
    renderShip()
    expect(document.querySelectorAll('.ship-manifest__table thead th[scope="col"]')).toHaveLength(5)
    expect(document.querySelectorAll('.ship-manifest__table tbody th[scope="row"]')).toHaveLength(57)
    expect(document.querySelectorAll('.ship-manifest__table tbody td')).toHaveLength(57 * 4)
  })

  it('adds no control when the caller has nowhere to send the author', () => {
    // The same rule the variant list's "Show on canvas" already follows: a control
    // that cannot do anything teaches an author the feature is broken.
    renderShip({ onOpenVariantPreview: undefined })
    expect(document.querySelectorAll('.ship-manifest__table tbody button')).toHaveLength(0)
    expect(manifestRows()).toHaveLength(57)
  })

  it('sends the variant list’s own control through the same handler, at the selected slide', () => {
    // The one-way-in property, at the level of the stage: the row is not a second
    // mechanism bolted beside the variant list, it is the same call. The variant
    // list asks for the deck's selected slide, which is what it has always meant.
    const onOpenVariantPreview = vi.fn()
    const slides = makeDeck()
    renderShip({ onOpenVariantPreview, slides, selectedSlide: slides[6] })

    const showOnCanvas = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Show on canvas'))
    expect(showOnCanvas).toBeTruthy()
    fireEvent.click(showOnCanvas as HTMLButtonElement)

    expect(onOpenVariantPreview).toHaveBeenCalledTimes(1)
    expect(onOpenVariantPreview).toHaveBeenCalledWith('variant-phone', 'slide-7')
  })
})

/**
 * A miniature of the editor shell.
 *
 * `Flowboard` owns the active stage and hands the stage panels their navigation,
 * and `GuidedShell` does the same; that is why the wiring lives in
 * `useFlowboardStagePanels` rather than in either shell. The host below owns the
 * stage the same way, so a row asking for Refine is answered the way the real
 * shells answer it.
 */
function StageHost({ props }: { props: FlowboardProps }) {
  const [stage, setStage] = useState<FlowboardStageId>('ship')
  const panels = useFlowboardStagePanels(props, () => setStage('refine'))
  const body: ReactNode = panels.getStagePanel(stage, setStage)
  return (
    <div data-stage={stage}>
      <button type="button" onClick={() => setStage('ship')}>Go to Ship</button>
      <button type="button" onClick={() => setStage('refine')}>Go to Refine</button>
      {body}
    </div>
  )
}

const renderShell = (overrides: Partial<FlowboardProps> = {}, slideCount = 4) => {
  const base = makeFlowboardProps()
  const slides = makeDeck(slideCount)
  const variants = makeVariants(slides)
  const plan = planExportEntries({
    slides,
    variants,
    profileId: profile.id,
    requiresScreenshot: true,
  })
  const props: FlowboardProps = {
    ...base,
    ...overrides,
    slides,
    selectedSlide: slides[0],
    selectedIndex: 0,
    profile,
    preflight: runExportPreflight({ profile, slides, activeLocale: 'en-US', variants }),
    variants,
    activeVariantId: variants[0].id,
    exportEntries: plan.entries,
    exportBlockedVariant: plan.blocked,
  }
  return { ...render(<StageHost props={props} />), props }
}

/** Which deck slide the merged preview is actually showing, from its own File row. */
const previewedFile = (): string | null =>
  document.querySelector('.variant-preview__file')?.textContent ?? null

describe('one route from a manifest row to the merged preview', () => {
  it('moves the author to Refine and draws the file the row named', () => {
    const onVariantPreviewChange = vi.fn()
    renderShell({ onVariantPreviewChange })
    expect(document.querySelector('[data-stage]')?.getAttribute('data-stage')).toBe('ship')

    // Row 5 is the second variant's second slide.
    fireEvent.click(rowButton(5))

    // The shell was asked to navigate, rather than the row navigating behind it.
    expect(document.querySelector('[data-stage]')?.getAttribute('data-stage')).toBe('refine')
    expect(onVariantPreviewChange).toHaveBeenCalledWith('variant-tablet')
    // The read-only merged render, not the editable canvas.
    expect(document.querySelector('[data-variant-preview="read-only"]')).toBeTruthy()
    // The proof that the *slide* is right: the preview names the very file the
    // row named, minted by the same function for both.
    expect(previewedFile()).toBe('app-store--tablet--slide-02.png')
  })

  it('draws the second variant’s own device, not the deck’s', () => {
    // Row 5 asked for a variant, and a variant is only worth previewing if the
    // device it exports is what comes up. The file name above already proves the
    // variant; this proves the render is that variant's.
    renderShell()
    fireEvent.click(rowButton(5))

    expect(document.querySelector('.variant-preview')?.textContent)
      .toContain('Read-only preview of “Tablet”, slide 2 of 4')
  })

  it('keeps one slide position, so a row is never overruled by the preview’s last step', () => {
    // The failure a second mechanism causes, stated as a sequence. The preview's
    // stepper is a request for a slide; a manifest row is a request for a slide.
    // If the stepper kept its answer inside the Refine stage, walking back to Ship
    // and pressing a row for slide 3 would still open slide 1 — the row's request
    // lost to a value it cannot see, and nothing on screen would say so.
    renderShell()

    fireEvent.click(rowButton(5))
    expect(previewedFile()).toBe('app-store--tablet--slide-02.png')

    // Step the preview on to slide 4 through the preview's own control.
    const stepper = document.querySelector('#refine-variant-slide') as HTMLSelectElement
    expect(stepper).toBeTruthy()
    fireEvent.change(stepper, { target: { value: 'slide-4' } })
    expect(previewedFile()).toBe('app-store--tablet--slide-04.png')

    // Back to the manifest, and ask for slide 3.
    fireEvent.click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Go to Ship') as HTMLButtonElement)
    fireEvent.click(rowButton(6))

    expect(previewedFile()).toBe('app-store--tablet--slide-03.png')
  })

  it('leaves the deck and the plan untouched, because a preview writes nothing', () => {
    // The row is navigation. It selects no slide, renames no variant, and adds no
    // history entry, so there is nothing to undo afterwards and nothing in the
    // document to diff.
    const onSelect = vi.fn()
    const onVariantRename = vi.fn()
    const onVariantToggleEnabled = vi.fn()
    renderShell({ onSelect, onVariantRename, onVariantToggleEnabled })

    fireEvent.click(rowButton(5))

    expect(onSelect).not.toHaveBeenCalled()
    expect(onVariantRename).not.toHaveBeenCalled()
    expect(onVariantToggleEnabled).not.toHaveBeenCalled()
  })
})
