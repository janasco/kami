import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { AUTHORING_CANVAS_ID } from './deviceVariants'
import { exportRenderProps, type ExportRenderProps } from './exportRenderProps'
import { createTestSlide } from '../test/projectFixtures'
import type { OutputVariant } from '../types'

/**
 * The read-only guarantee, stated as a type.
 *
 * The export stage and the merged variant preview both render slides through the
 * one renderer, and both do it in export mode. If they each built that prop
 * object themselves, the day somebody added an `onLayerTransformChange` to one of
 * them the merged preview would silently become an edit target and nothing would
 * fail. So the object is built once, here, and its shape is the contract.
 */

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'variant-iphone',
  name: 'iPhone',
  canvasId: AUTHORING_CANVAS_ID,
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

const noop = () => undefined

const slide = createTestSlide({ id: 'slide-1' })

describe('exportRenderProps', () => {
  it('carries exactly the six props the export stage needs, and nothing else', () => {
    const props = exportRenderProps({
      slide,
      slideNumber: 3,
      variantId: 'variant-iphone',
      profile: exportProfiles[0],
      variants: [variant()],
      locale: 'en-US',
      onImport: noop,
    })

    expect(Object.keys(props).sort()).toEqual([
      'exportMode',
      'locale',
      'onImport',
      'profile',
      'slide',
      'slideNumber',
    ])
  })

  /**
   * The load-bearing assertion. There is no key here through which a transform,
   * a selection, a nudge, or a drop could be written back into the project, so a
   * read-only render is not a promise made by the call site — it is the only
   * shape the object can take, and the type says so too.
   */
  it('has no write path at all: no transform, select, nudge, or drop handler', () => {
    const props = exportRenderProps({
      slide,
      slideNumber: 1,
      variantId: 'variant-iphone',
      profile: exportProfiles[0],
      variants: [variant()],
      locale: 'en-US',
      onImport: noop,
    })

    const writing = Object.keys(props).filter((key) =>
      /transform|select|nudge|drop|change|update|commit/i.test(key))
    expect(writing).toEqual([])
    // And the declared type admits no extra key, so a future caller cannot add one
    // without this test failing to compile.
    const typed: ExportRenderProps = props
    expect(typed.exportMode).toBe(true)
  })

  it('always asks for export mode, which is what disables dragging in the renderer', () => {
    const props = exportRenderProps({
      slide,
      slideNumber: 1,
      variantId: 'variant-iphone',
      profile: exportProfiles[0],
      variants: [variant()],
      locale: 'en-US',
      onImport: noop,
    })

    expect(props.exportMode).toBe(true)
  })

  it('resolves the locale from the variant, not the editor', () => {
    const variants = [variant({ locale: 'ar-SA' })]
    const props = exportRenderProps({
      slide,
      slideNumber: 1,
      variantId: 'variant-iphone',
      profile: exportProfiles[0],
      variants,
      locale: 'en-US',
      onImport: noop,
    })

    expect(props.locale).toBe('ar-SA')
  })

  it('falls back to the editor locale for a variant that names none', () => {
    const props = exportRenderProps({
      slide,
      slideNumber: 1,
      variantId: 'variant-unknown',
      profile: exportProfiles[0],
      variants: [variant()],
      locale: 'es-ES',
      onImport: noop,
    })

    expect(props.locale).toBe('es-ES')
  })

  it('renders the slide it is handed, by identity, so a merge is visible', () => {
    const merged = { ...slide, deviceFrameId: 'android-pixel' as const }
    const props = exportRenderProps({
      slide: merged,
      slideNumber: 1,
      variantId: 'variant-pixel',
      profile: exportProfiles[0],
      variants: [variant({ id: 'variant-pixel', name: 'Pixel' })],
      locale: 'en-US',
      onImport: noop,
    })

    expect(props.slide).toBe(merged)
    expect(props.slide.deviceFrameId).toBe('android-pixel')
  })
})
