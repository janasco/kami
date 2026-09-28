// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ShipStage, type ShipStageProps } from './ShipStage'
import { makeFlowboardProps } from '../../test/flowboardProps'
import { localeOptions, exportProfiles } from '../../data'
import { createTestSlide } from '../../test/projectFixtures'
import { runExportPreflight } from '../../lib/exportPreflight'
import type { OutputVariant, Slide } from '../../types'

/**
 * A variant's language, as a control rather than an unreachable field.
 *
 * `locale` has been on `OutputVariant` since the field was introduced. It is
 * persisted, it is validated, it decides what every PNG in that variant is drawn
 * in, and it is what the filename records. It never had a way to *set* it from
 * the editor: a new variant inherited the deck's active locale and nothing could
 * move it afterwards.
 *
 * So a deck could describe several devices but only ever one language, no matter
 * what the document said. This is the control that closes that, and it is the
 * prerequisite for previewing a deck "in every language" at all — there is
 * nothing to preview until a variant can be put in a language other than the
 * deck's.
 */

afterEach(() => {
  cleanup()
})

const noop = () => undefined

const deck = (count = 3): Slide[] =>
  Array.from({ length: count }, (_, i) => createTestSlide({ id: `slide-${i + 1}` }))

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'variant-en',
  name: 'English set',
  canvasId: 'main-story',
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1', 'slide-2', 'slide-3'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

/**
 * Two variants, because the row's Preview button is disabled below two — a
 * single-variant deck cannot be switched, so a test that used one would be
 * asserting against a control the author cannot reach either.
 */
const twoVariants = () => [
  variant({ id: 'v-en', name: 'English set', locale: 'en-US' }),
  variant({ id: 'v-ar', name: 'Arabic set', locale: 'ar-SA' }),
]

const renderShip = (overrides: Partial<ShipStageProps> = {}) => {
  const props = makeFlowboardProps()
  const slides = overrides.slides ?? deck()
  const base: ShipStageProps = {
    projectName: props.projectName,
    slides,
    selectedSlide: slides[0],
    profile: props.profile,
    onProfileChange: noop,
    preflight: runExportPreflight({ profile: props.profile, slides, activeLocale: 'en-US' }),
    variants: twoVariants(),
    activeVariantId: 'v-en',
    onVariantPreviewChange: noop,
    onVariantProfileChange: noop,
    onVariantLocaleChange: noop,
    onVariantToggleEnabled: noop,
    onVariantRename: noop,
    onVariantAdd: noop,
    onVariantRemove: noop,
    onVariantOverrideChange: noop,
    onVariantCaptureChange: noop,
    exportEntries: [],
    exportBlockedVariant: null,
    exportGate: {
      enabled: false,
      reason: 'blocked',
      exporting: false,
      blocked: true,
      slideNumbers: [1],
      message: 'Blocked in this test.',
      label: 'Export',
      warningCount: 0,
    },
    exportDetail: '',
    onExport: noop,
    onSaveProject: noop,
    onOpenProject: noop,
    onGoToSlide: noop,
    activeLocale: 'en-US',
  }
  const merged = { ...base, ...overrides }
  return { ...render(<ShipStage {...merged} />), base: merged }
}

/** The variant rows, in deck order. */
const rows = () => [...document.querySelectorAll('.ship-variant')] as HTMLElement[]

/** Activate a variant row by its position, the way an author clicks Preview. */
const activate = (index: number) => {
  const row = rows()[index]
  const button = [...row.querySelectorAll('button')].find((b) => /Preview/.test(b.textContent ?? ''))
  if (!button) throw new Error(`no Preview button on row ${index}`)
  fireEvent.click(button)
}

const languageSelects = () =>
  [...document.querySelectorAll('select')].filter((s) => s.id.startsWith('variant-locale-')) as HTMLSelectElement[]

describe('a variant language control', () => {
  it('offers every supported language, read from the locale catalog', () => {
    renderShip()
    const select = languageSelects()[0]
    expect(select).toBeTruthy()
    // One option per catalog entry, not a hand-kept list that can drift.
    expect([...select.options].map((o) => o.value)).toEqual(localeOptions.map((o) => o.id))
  })

  it('shows the active variant its own current language', () => {
    renderShip()
    expect(languageSelects()[0].value).toBe('en-US')
  })

  it('marks a right-to-left language, so direction is not a surprise', () => {
    renderShip()
    const select = languageSelects()[0]
    const rtl = localeOptions.filter((o) => o.direction === 'rtl')
    expect(rtl.length).toBeGreaterThan(0)
    for (const option of rtl) {
      const rendered = [...select.options].find((o) => o.value === option.id)
      expect(rendered?.textContent).toContain('right to left')
    }
  })

  it('reports the chosen language against the variant that owns the control', () => {
    const onVariantLocaleChange = vi.fn()
    renderShip({ onVariantLocaleChange })
    fireEvent.change(languageSelects()[0], { target: { value: 'es-ES' } })

    expect(onVariantLocaleChange).toHaveBeenCalledTimes(1)
    expect(onVariantLocaleChange).toHaveBeenCalledWith('v-en', 'es-ES')
  })

  it('reports a change against the second variant, not the first', () => {
    // The bug this guards: a control that always reported the deck's first
    // variant, so moving a language on any row but the first changed the wrong
    // one. Two rows, a different id, and the assertion is on that id.
    const onVariantLocaleChange = vi.fn()
    renderShip({ onVariantLocaleChange, activeVariantId: 'v-ar' })
    expect(languageSelects()[0].value).toBe('ar-SA')

    fireEvent.change(languageSelects()[0], { target: { value: 'es-ES' } })
    expect(onVariantLocaleChange).toHaveBeenCalledWith('v-ar', 'es-ES')
  })

  it('carries the variant id in the control, so two rows cannot collide', () => {
    renderShip({ activeVariantId: 'v-ar' })
    expect(languageSelects()[0].id).toBe('variant-locale-v-ar')
    const label = document.querySelector('label[for="variant-locale-v-ar"]')
    expect(label?.textContent).toBe('Language')
  })

  it('exists only on the active row, so a collapsed row has no control', () => {
    // A language control on every row would be one select per variant and no room
    // to read them. One active row keeps the panel to one decision at a time.
    //
    // `activeVariantId` is a controlled prop: the row's Preview button asks the
    // shell to change it and the shell passes the new value back down. The test
    // has to do what the shell does, or the panel would keep rendering the first
    // variant no matter which row was clicked.
    const { base, rerender } = renderShip({ activeVariantId: 'v-en' })
    expect(languageSelects()).toHaveLength(1)
    expect(languageSelects()[0].value).toBe('en-US')

    activate(1)
    rerender(<ShipStage {...base} activeVariantId="v-ar" />)

    expect(languageSelects()).toHaveLength(1)
    expect(languageSelects()[0].value).toBe('ar-SA')
  })

  it('duplicates no form id across the selects on the panel', () => {
    renderShip({ activeVariantId: 'v-ar' })
    const ids = [...document.querySelectorAll('select')].map((s) => s.id)
    expect(ids.length).toBeGreaterThan(1)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the store target control, so language did not displace it', () => {
    // Two settings on one variant, and neither may quietly replace the other.
    renderShip()
    const profile = document.querySelector('select[id^="variant-profile-"]') as HTMLSelectElement
    expect([...profile.options].map((o) => o.value)).toEqual(exportProfiles.map((p) => p.id))
    expect(languageSelects()).toHaveLength(1)
  })

  it('says what the language is for, in words next to the control', () => {
    renderShip()
    const row = rows()[0]
    expect(row.textContent).toMatch(/language every PNG in this variant is drawn in/i)
  })
})
