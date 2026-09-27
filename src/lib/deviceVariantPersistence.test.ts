import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { AUTHORING_CANVAS_ID, DEFAULT_VARIANT_ID, DEFAULT_VARIANT_NAME } from './deviceVariants'
import { parseProjectDocument, serializeProject, type EditorProject } from './project'
import { validateProjectDocument } from './projectValidation'
import { createTestSlide, VALID_PNG_DATA_URL, VALID_PNG_DATA_URL_ALT } from '../test/projectFixtures'
import type { OutputVariant, Slide } from '../types'

/**
 * The serializer rewrites the whole document, so anything it decides to
 * overwrite is lost on the next autosave. These tests are about what it must
 * *keep*: the user-authored variants, the deterministic profile selection, the
 * per-variant readiness, and — above all — the exact bytes of a project that
 * never used a device variant at all.
 */

const projectWith = (slides: Slide[], overrides: Partial<EditorProject> = {}): EditorProject => ({
  name: 'Variant project',
  slides,
  activeLocale: 'en-US',
  canvasMode: 'isolated',
  selectedExportProfileId: exportProfiles[0].id,
  ...overrides,
})

const variant = (overrides: Partial<OutputVariant> = {}): OutputVariant => ({
  id: 'variant-iphone',
  name: 'iPhone',
  canvasId: AUTHORING_CANVAS_ID,
  locale: 'en-US',
  themeId: 'midnight',
  slideIds: ['slide-1', 'slide-2'],
  enabled: true,
  exportProfileId: 'app-store',
  ...overrides,
})

const deck = (ids: string[] = ['slide-1', 'slide-2']): Slide[] =>
  ids.map((id, index) => createTestSlide({ id, title: `Slide ${index + 1}` }))

/** The serialized bytes with the wall-clock stamp neutralised. */
const serializeBytes = (project: EditorProject) => {
  const document = serializeProject(project) as unknown as Record<string, unknown>
  return JSON.stringify({ ...document, revision: { ...(document.revision as object), createdAt: '' } })
}

const variantsOf = (document: object) =>
  (document as { outputVariants?: unknown }).outputVariants as Array<Record<string, unknown>>
const profilesOf = (document: object) =>
  (document as { exportProfiles?: unknown }).exportProfiles as Array<Record<string, unknown>>
const profileNamed = (document: object, id: string) =>
  profilesOf(document).find((profile) => profile.id === id) as Record<string, unknown>

const slidesOf = (document: object) =>
  (document as { slides?: unknown }).slides as Array<Record<string, unknown>>

describe('serializing a project with no device variants', () => {
  /**
   * The guarantee that makes the feature additive. Before this change the
   * serializer hard-coded one variant and computed every profile's `variantIds`
   * and `status` from it; if any of that moved, every existing project would
   * have been rewritten on its next autosave.
   */
  it('still writes exactly the one hard-coded variant record', () => {
    const document = serializeProject(projectWith(deck()))

    expect(variantsOf(document)).toEqual([{
      id: DEFAULT_VARIANT_ID,
      name: DEFAULT_VARIANT_NAME,
      canvasId: AUTHORING_CANVAS_ID,
      locale: 'en-US',
      themeId: 'midnight',
      slideIds: ['slide-1', 'slide-2'],
      enabled: true,
      exportProfileId: 'app-store',
    }])
  })

  it('writes no deviceOverrides key at all when nothing is customised', () => {
    expect(JSON.stringify(serializeProject(projectWith(deck())))).not.toContain('deviceOverrides')
  })

  it('links every supported profile to that one variant, as before', () => {
    const document = serializeProject(projectWith(deck()))
    for (const profile of profilesOf(document)) {
      if (profile.status === 'planned') continue
      expect(profile.variantIds).toEqual([DEFAULT_VARIANT_ID])
    }
  })

  it('marks only the selected profile as selected, as before', () => {
    const document = serializeProject(projectWith(deck()))
    expect(profilesOf(document).filter((profile) => profile.selected === true).map((profile) => profile.id))
      .toEqual(['app-store'])
  })

  it('keeps scene.width describing the authoring canvas, not the variant renders', () => {
    const document = serializeProject(projectWith(deck()))
    const scene = (document as { scene: { width: number; height: number } }).scene
    const appStore = exportProfiles[0]
    expect(scene.width).toBe(appStore.width * 2)
    expect(scene.height).toBe(appStore.height)
  })
})

describe('serializing user-authored variants', () => {
  it('round-trips two variants instead of collapsing them to one record', () => {
    const original = projectWith(deck(), {
      outputVariants: [
        variant(),
        variant({ id: 'variant-pixel', name: 'Pixel', slideIds: ['slide-1', 'slide-2'] }),
      ],
    })

    const document = serializeProject(original)
    expect(validateProjectDocument(document).valid).toBe(true)
    expect(variantsOf(document).map((entry) => entry.id)).toEqual(['variant-iphone', 'variant-pixel'])
    expect(variantsOf(document).map((entry) => entry.name)).toEqual(['iPhone', 'Pixel'])

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.outputVariants?.map((entry) => entry.id)).toEqual(['variant-iphone', 'variant-pixel'])
  })

  it('writes deviceOverrides only for the variants that have them', () => {
    const document = serializeProject(projectWith(deck(), {
      outputVariants: [
        variant({ deviceOverrides: [{ slideId: 'slide-2', deviceFrameId: 'android-pixel', showDeviceStatusBar: false, screenshotFit: 'cover' }] }),
        variant({ id: 'variant-pixel', name: 'Pixel' }),
      ],
    }))

    expect(variantsOf(document)[0].deviceOverrides).toEqual([
      { slideId: 'slide-2', deviceFrameId: 'android-pixel', showDeviceStatusBar: false, screenshotFit: 'cover' },
    ])
    expect(variantsOf(document)[1]).not.toHaveProperty('deviceOverrides')
  })

  it('stores a variant capture as an asset id and shares one asset across variants', () => {
    const document = serializeProject(projectWith(deck(), {
      outputVariants: [
        variant({ deviceOverrides: [{ slideId: 'slide-1', screenshot: { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' } }] }),
        variant({ id: 'variant-pixel', name: 'Pixel', deviceOverrides: [{ slideId: 'slide-1', screenshot: { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' } }] }),
      ],
    }))

    const assets = (document as { assets: Array<{ id: string; path: string }> }).assets
    const overrides = variantsOf(document).flatMap((entry) => (entry.deviceOverrides ?? []) as Array<Record<string, unknown>>)
    expect(overrides.map((entry) => entry.assetId)).toHaveLength(2)
    // The same bytes are one asset, not two copies.
    expect(new Set(overrides.map((entry) => entry.assetId)).size).toBe(1)
    expect(assets.filter((asset) => overrides.some((entry) => entry.assetId === asset.id))).toHaveLength(1)
  })

  it('does not write a layer transform override that resolves back to the slide', () => {
    const slides = deck(['slide-1'])
    const document = serializeProject(projectWith(slides, {
      outputVariants: [
        variant({
          slideIds: ['slide-1'],
          deviceOverrides: [{ slideId: 'slide-1', layerTransforms: { screenshot: { ...slides[0].layerTransforms.screenshot } } }],
        }),
      ],
    }))

    // Not an empty override record: the field is absent, so the document is
    // exactly the one it was before the override was set and cleared.
    expect(variantsOf(document)[0]).not.toHaveProperty('deviceOverrides')
  })

  it('writes a layer transform override that differs from the slide', () => {
    const slides = deck(['slide-1'])
    const moved = { ...slides[0].layerTransforms.headline, y: 64, rotation: 4 }
    const document = serializeProject(projectWith(slides, {
      outputVariants: [variant({ slideIds: ['slide-1'], deviceOverrides: [{ slideId: 'slide-1', layerTransforms: { headline: moved } }] })],
    }))

    const overrides = variantsOf(document)[0].deviceOverrides as Array<Record<string, unknown>>
    expect(overrides[0].layerTransforms).toEqual({ headline: moved })
  })

  it('restores a variant capture as a usable slide screenshot', () => {
    const document = serializeProject(projectWith(deck(), {
      outputVariants: [variant({ deviceOverrides: [{ slideId: 'slide-1', screenshot: { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL_ALT, mimeType: 'image/png' } }] })],
    }))

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.outputVariants?.[0].deviceOverrides?.[0]).toEqual({
      slideId: 'slide-1',
      screenshot: { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL_ALT, mimeType: 'image/png' },
    })
  })

  it('shares one asset when a variant reuses the slide capture bytes', () => {
    const document = serializeProject(projectWith(deck(), {
      outputVariants: [variant({ deviceOverrides: [{ slideId: 'slide-1', screenshot: { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' } }] })],
    }))

    const assets = (document as { assets: Array<{ id: string; path: string }> }).assets
    const override = (variantsOf(document)[0].deviceOverrides as Array<Record<string, unknown>>)[0]
    const screenshotLayer = (slidesOf(document)[0].layers as Array<Record<string, unknown>>)
      .find((layer) => layer.id === 'screenshot')
    // The variant points at the very asset the slide's own capture already uses,
    // so the file does not carry the same PNG twice.
    expect(override.assetId).toBe(screenshotLayer?.assetId)
    expect(assets.some((asset) => asset.id === override.assetId)).toBe(true)
  })
})

describe('selectedExportProfileId authority', () => {
  /*
   * The document is built by serializing a deck and then rewriting only the
   * `selected` flags, so a test cannot pass or fail because of an unrelated
   * inconsistency it introduced into the fixture.
   */
  const documentWith = (variants: OutputVariant[] | undefined, selectedIds: string[] | null) => {
    const document = serializeProject(projectWith(deck(), { outputVariants: variants })) as unknown as Record<string, unknown>
    const profiles = profilesOf(document)
    for (const profile of profiles) delete profile.selected
    if (selectedIds) {
      for (const id of selectedIds) {
        const profile = profiles.find((entry) => entry.id === id)
        if (profile) profile.selected = true
      }
    }
    return document
  }

  const selectedIdOf = (document: object) => {
    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    return result.project.selectedExportProfileId
  }

  /**
   * The rule, pinned: `selected === true` on the profile is the authority. The
   * variant fallback is consulted only when no profile claims selection, and it
   * is deterministic: the first **enabled** variant in array order, not the
   * first variant that happens to name a known profile.
   */
  it('takes the profile that says selected === true, over any variant', () => {
    const document = documentWith([
      variant({ exportProfileId: 'app-store' }),
      variant({ id: 'variant-play', name: 'Play', exportProfileId: 'google-play' }),
    ], ['google-play'])
    expect(selectedIdOf(document)).toBe('google-play')
  })

  it('falls back to the first enabled variant, not the first variant naming a profile', () => {
    const document = documentWith([
      variant({ id: 'variant-off', name: 'Off', enabled: false, exportProfileId: 'google-play' }),
      variant({ id: 'variant-on', name: 'On', enabled: true, exportProfileId: 'app-store-1125' }),
      variant({ id: 'variant-later', name: 'Later', enabled: true, exportProfileId: 'google-play' }),
    ], null)
    expect(selectedIdOf(document)).toBe('app-store-1125')
  })

  /**
   * A variant naming a profile this editor does not have never reaches the
   * restore path: the validator rejects it, with the offending path named, so
   * the authority question never has to be answered for it.
   */
  it('rejects a variant naming a profile this editor does not have, with a precise path', () => {
    const document = documentWith([
      variant({ id: 'variant-unknown', name: 'Unknown', exportProfileId: 'play-station' as never }),
    ], null)
    const report = validateProjectDocument(document)
    expect(report.valid).toBe(false)
    expect(report.issues).toContainEqual({
      path: '$.outputVariants[0].exportProfileId',
      code: 'unsupported-profile',
      message: 'Output variant export profile is not supported.',
      severity: 'error',
    })
  })

  it('falls back to the built-in default when no profile and no variant claims it', () => {
    expect(selectedIdOf(documentWith([], null))).toBe('app-store')
  })

  it('resolves several profiles claiming selected to the first in document order', () => {
    const document = documentWith([variant()], ['google-play', 'app-store-1125'])
    // `app-store-1125` is the earlier of the two in `exportProfiles`, so the
    // answer is a property of the document rather than of which claim was read
    // last.
    expect(selectedIdOf(document)).toBe('app-store-1125')
  })

  it('reads a single-variant project exactly as before', () => {
    const document = documentWith([variant({ exportProfileId: 'app-store' })], ['app-store'])
    expect(selectedIdOf(document)).toBe('app-store')
  })
})

describe('export profile status across variants', () => {
  it('is ready when every enabled variant targeting it has its captures', () => {
    const document = serializeProject(projectWith(deck(), { outputVariants: [variant()] }))
    expect(profileNamed(document, 'app-store').status).toBe('ready')
  })

  it('is needs-assets when one enabled variant renders a slide with no capture', () => {
    const slides = [createTestSlide({ id: 'slide-1' }), createTestSlide({ id: 'slide-2', screenshot: null, screenshotName: null })]
    const document = serializeProject(projectWith(slides, { outputVariants: [variant()] }))

    expect(profileNamed(document, 'app-store').status).toBe('needs-assets')
  })

  it('ignores a disabled variant that has no captures', () => {
    const slides = [createTestSlide({ id: 'slide-1' }), createTestSlide({ id: 'slide-2', screenshot: null, screenshotName: null })]
    const capture = { name: 'tablet.png', dataUrl: VALID_PNG_DATA_URL, mimeType: 'image/png' }
    const document = serializeProject(projectWith(slides, {
      outputVariants: [
        variant({ deviceOverrides: [{ slideId: 'slide-2', screenshot: capture }] }),
        variant({ id: 'off', name: 'Off', enabled: false }),
      ],
    }))

    expect(profileNamed(document, 'app-store').status).toBe('ready')
  })

  it('gives a profile no variant ids at all rather than a stale one', () => {
    const document = serializeProject(projectWith(deck(), { outputVariants: [variant({ exportProfileId: 'google-play' })] }))
    expect(profileNamed(document, 'app-store').variantIds).toEqual([])
    expect(profileNamed(document, 'google-play').variantIds).toEqual(['variant-iphone'])
  })

  it('never marks a pending profile ready', () => {
    const document = serializeProject(projectWith(deck(), { outputVariants: [variant()] }))
    for (const profile of profilesOf(document)) {
      if (profile.status === 'planned') expect(profile.variantIds).toEqual([])
    }
  })
})

describe('restoring a project that has variants', () => {
  it('keeps the variant list, its slide sets, and its overrides', () => {
    const document = serializeProject(projectWith(deck(['slide-1', 'slide-2', 'slide-3']), {
      outputVariants: [
        variant({ slideIds: ['slide-1', 'slide-2'] }),
        variant({ id: 'variant-pixel', name: 'Pixel', slideIds: ['slide-1', 'slide-2', 'slide-3'], locale: 'es-ES', deviceOverrides: [{ slideId: 'slide-1', deviceFrameId: 'android-galaxy' }] }),
      ],
    }))

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const restored = result.project.outputVariants ?? []
    expect(restored.map((entry) => entry.id)).toEqual(['variant-iphone', 'variant-pixel'])
    expect(restored[0].slideIds).toEqual(['slide-1', 'slide-2'])
    expect(restored[1].slideIds).toEqual(['slide-1', 'slide-2', 'slide-3'])
    expect(restored[1].locale).toBe('es-ES')
    expect(restored[1].deviceOverrides).toEqual([{ slideId: 'slide-1', deviceFrameId: 'android-galaxy' }])
  })

  it('keeps every enabled flag', () => {
    const document = serializeProject(projectWith(deck(), {
      outputVariants: [variant(), variant({ id: 'off', name: 'Off', enabled: false })],
    }))
    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.outputVariants?.map((entry) => entry.enabled)).toEqual([true, false])
  })

  it('round-trips the default record, so a pre-variant project gains nothing', () => {
    const result = parseProjectDocument(JSON.stringify(serializeProject(projectWith(deck()))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.outputVariants).toEqual([{
      id: DEFAULT_VARIANT_ID,
      name: DEFAULT_VARIANT_NAME,
      canvasId: AUTHORING_CANVAS_ID,
      locale: 'en-US',
      themeId: 'midnight',
      slideIds: ['slide-1', 'slide-2'],
      enabled: true,
      exportProfileId: 'app-store',
    }])
  })

  it('restores a document whose variants were all removed as no variants at all', () => {
    const document = serializeProject(projectWith(deck())) as unknown as Record<string, unknown>
    ;(document as { outputVariants: unknown }).outputVariants = []
    // A profile may not keep linking a variant that is gone, which is the
    // validator's job and is also why the serializer never produces this shape.
    for (const profile of profilesOf(document)) profile.variantIds = []

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Absent rather than an empty list, so the editor can tell "never used the
    // feature" from "deleted everything" and re-serialize the first as the
    // record it always wrote.
    expect(result.project.outputVariants).toBeUndefined()
  })

  it('survives a round trip with the same bytes, so autosave does not churn', () => {
    const original = projectWith(deck(), { outputVariants: [variant(), variant({ id: 'variant-pixel', name: 'Pixel' })] })
    const first = serializeBytes(original)
    const parsed = parseProjectDocument(first)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const second = serializeBytes({ ...parsed.project, name: original.name })
    expect(second).toBe(first)
  })
})
