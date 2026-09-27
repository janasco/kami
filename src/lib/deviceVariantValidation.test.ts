import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { isSafeAssetPath } from './assetPath'
import { AUTHORING_CANVAS_ID, DEFAULT_VARIANT_ID } from './deviceVariants'
import { migrateProjectDocument } from './projectMigration'
import { parseProjectDocument, serializeProject, type EditorProject } from './project'
import { validateProjectDocument } from './projectValidation'
import { createProjectDocument, createTestSlide } from '../test/projectFixtures'
import type { OutputVariant, Slide } from '../types'

/**
 * The variant record the validator is asked to police, built on top of a document
 * the serializer produced, so a test cannot pass because of an inconsistency it
 * introduced itself.
 */
const documentWithVariant = (overrides: Record<string, unknown> = {}, variantOverrides: Partial<OutputVariant> = {}) => {
  const slides: Slide[] = ['a', 'b'].map((id) => createTestSlide({ id }))
  const project: EditorProject = {
    name: 'Variant validation',
    slides,
    activeLocale: 'en-US',
    canvasMode: 'isolated',
    selectedExportProfileId: exportProfiles[0].id,
    outputVariants: [{
      id: 'variant-pixel',
      name: 'Pixel',
      canvasId: AUTHORING_CANVAS_ID,
      locale: 'en-US',
      themeId: 'midnight',
      slideIds: ['a', 'b'],
      enabled: true,
      exportProfileId: 'app-store',
      deviceOverrides: [{ slideId: 'a' }],
      ...variantOverrides,
    }],
  }
  const document = serializeProject(project) as unknown as Record<string, unknown>
  const variant = (document as { outputVariants: Array<Record<string, unknown>> }).outputVariants[0]
  variant.deviceOverrides = [{ slideId: 'a', ...overrides }]
  return document
}

const issueAt = (document: object, path: string) =>
  validateProjectDocument(document).issues.find((issue) => issue.path === path)

describe('device variant validation', () => {
  it('accepts a well formed override', () => {
    const report = validateProjectDocument(documentWithVariant({
      deviceFrameId: 'android-pixel',
      showDeviceStatusBar: false,
      screenshotFit: 'cover',
    }))
    expect(report.issues).toEqual([])
    expect(report.valid).toBe(true)
  })

  /**
   * The asymmetry the field list follows: an enum is an error with its exact
   * path, because the editor cannot know which device was meant, while a
   * continuous value is a warning and is clamped on open.
   */
  it('reports a bad device frame as an error with the precise path', () => {
    const document = documentWithVariant({ deviceFrameId: 'pixel-99' })
    expect(issueAt(document, '$.outputVariants[0].deviceOverrides[0].deviceFrameId')).toEqual({
      path: '$.outputVariants[0].deviceOverrides[0].deviceFrameId',
      code: 'unsupported-device-frame',
      message: 'Device frame is not supported by this editor.',
      severity: 'error',
    })
    expect(validateProjectDocument(document).valid).toBe(false)
  })

  it('reports an older device frame spelling as a warning, because it is migratable', () => {
    const document = documentWithVariant({ deviceFrameId: 'iphone-x' })
    expect(issueAt(document, '$.outputVariants[0].deviceOverrides[0].deviceFrameId')).toEqual({
      path: '$.outputVariants[0].deviceOverrides[0].deviceFrameId',
      code: 'legacy-device-frame',
      message: 'Device frame uses an older name and will be updated on open.',
      severity: 'warning',
    })
    expect(validateProjectDocument(document).valid).toBe(true)
  })

  it('reports a bad fit as an error, naming the two values', () => {
    const document = documentWithVariant({ screenshotFit: 'stretch' })
    expect(issueAt(document, '$.outputVariants[0].deviceOverrides[0].screenshotFit')).toEqual({
      path: '$.outputVariants[0].deviceOverrides[0].screenshotFit',
      code: 'invalid-device-setting',
      message: 'The screenshot fit must be one of: contain, cover.',
      severity: 'error',
    })
  })

  it('reports a non-boolean status bar flag as an error', () => {
    const document = documentWithVariant({ showDeviceStatusBar: 'yes' })
    expect(issueAt(document, '$.outputVariants[0].deviceOverrides[0].showDeviceStatusBar')?.code).toBe('invalid-device-setting')
    expect(issueAt(document, '$.outputVariants[0].deviceOverrides[0].showDeviceStatusBar')?.severity).toBe('error')
  })

  it('reports a missing capture asset as an error with the precise path', () => {
    const document = documentWithVariant({ assetId: 'asset-999' })
    expect(issueAt(document, '$.outputVariants[0].deviceOverrides[0].assetId')).toEqual({
      path: '$.outputVariants[0].deviceOverrides[0].assetId',
      code: 'missing-reference',
      message: 'Device variant override references an asset that does not exist.',
      severity: 'error',
    })
  })

  it('clamps a continuous transform value with a warning rather than refusing', () => {
    const document = documentWithVariant({ layerTransforms: { screenshot: { widthScale: 900, x: 12 } } })
    const report = validateProjectDocument(document)

    expect(report.valid).toBe(true)
    expect(issueAt(document, '$.outputVariants[0].deviceOverrides[0].layerTransforms.screenshot.widthScale')).toEqual({
      path: '$.outputVariants[0].deviceOverrides[0].layerTransforms.screenshot.widthScale',
      code: 'invalid-variant',
      message: 'Size scale must be between 0.25 and 4; it is clamped on open.',
      severity: 'warning',
    })
  })

  it('rejects a non-finite transform value, which cannot be repaired into a position', () => {
    const document = documentWithVariant({ layerTransforms: { headline: { x: 'left' } } })
    expect(issueAt(document, '$.outputVariants[0].deviceOverrides[0].layerTransforms.headline.x')?.severity).toBe('error')
  })

  it('rejects a transform for a layer the editor does not have', () => {
    const document = documentWithVariant({ layerTransforms: { hologram: { x: 1 } } })
    expect(issueAt(document, '$.outputVariants[0].deviceOverrides[0].layerTransforms.hologram')).toEqual({
      path: '$.outputVariants[0].deviceOverrides[0].layerTransforms.hologram',
      code: 'invalid-variant',
      message: 'Device variant layer transform names a layer this editor does not have.',
      severity: 'error',
    })
  })

  it('leaves a project with no overrides entirely alone', () => {
    const slides: Slide[] = [createTestSlide({ id: 'a' })]
    const document = serializeProject({
      name: 'Plain',
      slides,
      activeLocale: 'en-US',
      canvasMode: 'isolated',
      selectedExportProfileId: exportProfiles[0].id,
    })
    expect(JSON.stringify(document)).not.toContain('deviceOverrides')
    expect(validateProjectDocument(document).issues).toEqual([])
  })
})

describe('device variant migration defaults', () => {
  const base = (): Record<string, unknown> => {
    const migrated = migrateProjectDocument(createProjectDocument())
    if (!migrated.ok) throw new Error(migrated.error)
    return migrated.document
  }

  /**
   * The fixture's profiles link `variant-en-us`, so a document that gains a
   * different variant has to drop that link or the validator refuses it for an
   * unrelated reason.
   */
  const withVariant = (variant: Record<string, unknown>) => {
    const document = base()
    for (const profile of (document as { exportProfiles: Array<Record<string, unknown>> }).exportProfiles) {
      profile.variantIds = [variant.id]
    }
    ;(document as { outputVariants: unknown }).outputVariants = [variant]
    return document
  }

  const goodVariant = () => ({
    id: 'variant-pixel',
    name: 'Pixel',
    canvasId: AUTHORING_CANVAS_ID,
    locale: 'en-US',
    themeId: 'midnight',
    slideIds: [((base().slides as Array<Record<string, unknown>>)[0]).id],
    enabled: true,
    exportProfileId: 'app-store',
  })

  it('does not change the applied-migration notice for a project that needs none', () => {
    const before = migrateProjectDocument(createProjectDocument())
    const after = migrateProjectDocument(structuredClone(createProjectDocument()))
    expect(after.ok && after.report.applied).toEqual(before.ok ? before.report.applied : [])
  })

  it('completes a variant that lost its enabled flag', () => {
    const variant = { ...goodVariant() } as Record<string, unknown>
    delete variant.enabled
    const result = migrateProjectDocument(withVariant(variant))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const restored = (result.document as { outputVariants: Array<Record<string, unknown>> }).outputVariants
    expect(restored[0].enabled).toBe(true)
  })

  it('normalizes an older device frame spelling inside an override', () => {
    const result = migrateProjectDocument(withVariant({
      ...goodVariant(),
      deviceOverrides: [{ slideId: 'a', deviceFrameId: 'android-generic' }],
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const overrides = (result.document as { outputVariants: Array<{ deviceOverrides: Array<Record<string, unknown>> }> })
      .outputVariants[0].deviceOverrides
    expect(overrides[0].deviceFrameId).toBe('android')
  })

  it('adds nothing to a document with no variants', () => {
    const document = base()
    // A variant with no device overrides is completed in no way at all: the
    // migration must not grow a `deviceOverrides` array or a flag nobody wrote.
    const variants = (document as { outputVariants: Array<Record<string, unknown>> }).outputVariants
    for (const variant of variants) expect(variant).not.toHaveProperty('deviceOverrides')

    const result = migrateProjectDocument(structuredClone(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.outputVariants).toEqual(variants)
  })
})

describe('the shared asset path rule, from both call sites', () => {
  const documentWithPath = (path: string) => {
    const slides: Slide[] = [createTestSlide({ id: 'a' })]
    const document = serializeProject({
      name: 'Paths',
      slides,
      activeLocale: 'en-US',
      canvasMode: 'isolated',
      selectedExportProfileId: exportProfiles[0].id,
    }) as unknown as Record<string, unknown>
    const assets = document.assets as Array<Record<string, unknown>>
    assets[0].path = path
    return document
  }

  /**
   * The divergence this pins shut. The restore path used to accept a `..`
   * segment that the validator rejected, so a hand-edited document could pass
   * restore and be reported as unsafe afterwards. Both now read `lib/assetPath`.
   */
  it('is rejected by the validator', () => {
    const report = validateProjectDocument(documentWithPath('../../foo.png'))
    expect(report.valid).toBe(false)
    expect(issueAt(documentWithPath('../../foo.png'), '$.assets[0].path')).toEqual({
      path: '$.assets[0].path',
      code: 'unsafe-asset-path',
      message: 'Asset path is unsafe or uses an unsupported scheme.',
      severity: 'error',
    })
  })

  it('never opens, so the loose second copy cannot be the one that decides', () => {
    const result = parseProjectDocument(JSON.stringify(documentWithPath('../../foo.png')))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('unsafe')
  })

  it('still accepts the four legitimate forms through both call sites', () => {
    for (const path of [
      'data:image/png;base64,iVBORw0KGgo=',
      'https://cdn.example.com/hero.png',
      'blob:https://janasco.github.io/2f0c-4a11',
      'assets/hero.png',
    ]) {
      expect(isSafeAssetPath(path)).toBe(true)
      expect(validateProjectDocument(documentWithPath(path)).valid).toBe(true)
      expect(parseProjectDocument(JSON.stringify(documentWithPath(path))).ok).toBe(true)
    }
  })

  it('is declared in exactly one module, and both call sites read that one', () => {
    /*
     * The structural guard, and the reason this test exists.
     *
     * The two copies were behaviourally identical for every case except `..`, so
     * no behavioural test could tell a re-split apart from a fixed file. This
     * one can: the rule may be *defined* once, and both the validator and the
     * restore path must import it rather than re-implement it.
     */
    const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
    const declare = (source: string) => /^export const isSafeAssetPath/m.test(source)

    expect(declare(read('./assetPath.ts'))).toBe(true)
    for (const consumer of ['./projectValidation.ts', './project.ts']) {
      const source = read(consumer)
      expect(declare(source), consumer).toBe(false)
      expect(source, consumer).toMatch(/import \{[^}]*isSafeAssetPath[^}]*\} from '\.\/assetPath'/)
    }
  })

  it('keeps the legacy default variant id out of the migration notice', () => {
    // A guard on the constant the serializer pins its bytes to: if this moved,
    // every existing project would be rewritten on its next autosave.
    expect(DEFAULT_VARIANT_ID).toBe('variant-en-us')
  })
})
