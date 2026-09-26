import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { DEVICE_FRAME_IDS, getDeviceGeometry, isFramelessDeviceId, isKnownDeviceFrameId } from './devicePresets'
import { shouldShowDeviceStatusBar } from './deviceStatusBar'
import { migrateProjectDocument } from './projectMigration'
import { parseProjectDocument, serializeProject, type EditorProject } from './project'
import { validateProjectDocument } from './projectValidation'
import { createProjectDocument, createTestSlide } from '../test/projectFixtures'
import type { DeviceFrameId, Slide } from '../types'

/**
 * A device preset is one string in the project file, so the guarantee that
 * matters is that every catalog ID survives a save and an open, that an older
 * spelling still opens on the frame it meant, and that an unknown value lands on
 * the default instead of breaking the document.
 */

const projectWith = (slides: Slide[]): EditorProject => ({
  name: 'Device catalog project',
  slides,
  activeLocale: 'en-US',
  canvasMode: 'isolated',
  selectedExportProfileId: exportProfiles[0].id,
})

const slidesOf = (document: object) =>
  (document as { slides?: unknown }).slides as Array<Record<string, unknown>>

const migratedFixture = () => {
  const result = migrateProjectDocument(createProjectDocument())
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

/** The migrated fixture with a second slide, for tests that need two values. */
const migratedFixtureWithTwoSlides = () => {
  const document = migratedFixture()
  const slides = slidesOf(document)
  slides.push({ ...structuredClone(slides[0]), id: 'slide-legacy-2' })
  const canvases = (document as { canvases?: Array<Record<string, unknown>> }).canvases ?? []
  canvases.forEach((canvas) => {
    if (Array.isArray(canvas.slideIds)) canvas.slideIds.push('slide-legacy-2')
  })
  return document
}

describe('device preset persistence', () => {
  it('round-trips every catalog preset through the project document', () => {
    const original = projectWith(
      DEVICE_FRAME_IDS.map((id, index) => createTestSlide({
        id: `slide-${index}`,
        deviceFrameId: id,
        showDeviceStatusBar: !isFramelessDeviceId(id),
      })),
    )

    const document = serializeProject(original)
    expect(validateProjectDocument(document).valid).toBe(true)
    expect(slidesOf(document).map((slide) => slide.deviceFrameId)).toEqual([...DEVICE_FRAME_IDS])

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides.map((slide) => slide.deviceFrameId)).toEqual([...DEVICE_FRAME_IDS])
    // The restored status bar choice still matches what can be drawn.
    for (const slide of result.project.slides) {
      expect(shouldShowDeviceStatusBar(slide)).toBe(slide.showDeviceStatusBar && !isFramelessDeviceId(slide.deviceFrameId))
    }
  })

  it('keeps the safe area of a restored preset identical to the catalog', () => {
    const original = projectWith([createTestSlide({ deviceFrameId: 'android-galaxy' })])

    const result = parseProjectDocument(JSON.stringify(serializeProject(original)))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const geometry = getDeviceGeometry('android-galaxy')
    expect(result.project.slides[0].deviceFrameId).toBe('android-galaxy')
    expect(getDeviceGeometry(result.project.slides[0].deviceFrameId)).toBe(geometry)
  })

  it('falls back to the default preset for a value the catalog does not know', () => {
    const document = migratedFixture()
    slidesOf(document)[0].deviceFrameId = 'nokia-3310'

    const report = validateProjectDocument(document)
    expect(report.valid).toBe(false)
    expect(report.issues).toContainEqual({
      path: '$.slides[0].deviceFrameId',
      code: 'unsupported-device-frame',
      message: 'Device frame is not supported by this editor.',
      severity: 'error',
    })

    const stored = serializeProject(projectWith([createTestSlide({ deviceFrameId: 'nokia-3310' as DeviceFrameId })]))
    expect(slidesOf(stored)[0].deviceFrameId).toBe('iphone')
  })
})

describe('legacy device values on open', () => {
  it('opens an older spelling on the preset it meant', () => {
    const document = migratedFixtureWithTwoSlides()
    slidesOf(document)[0].deviceFrameId = 'iphone-x'
    slidesOf(document)[1].deviceFrameId = 'android-generic'

    const report = validateProjectDocument(document)
    // Openable, and honest about what is about to change.
    expect(report.valid).toBe(true)
    expect(report.issues).toContainEqual({
      path: '$.slides[0].deviceFrameId',
      code: 'legacy-device-frame',
      message: 'Device frame uses an older name and will be updated on open.',
      severity: 'warning',
    })

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].deviceFrameId).toBe('iphone')
    expect(result.project.slides[1].deviceFrameId).toBe('android')
  })

  it('migrates a legacy spelling to the current ID without changing the version', () => {
    const document = migratedFixture()
    slidesOf(document)[0].deviceFrameId = 'feature-graphic'
    const before = slidesOf(document).length

    const result = migrateProjectDocument(document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.version).toBe(1)
    expect(result.report.fromVersion).toBe(1)
    expect(result.report.toVersion).toBe(1)
    expect(result.report.applied).toContain('v1: normalize legacy device frame id')
    expect(slidesOf(result.document).map((slide) => slide.deviceFrameId)).toEqual(['canvas', ...slidesOf(document).slice(1).map((slide) => slide.deviceFrameId)])
    expect(slidesOf(result.document)).toHaveLength(before)
    // The migrated document validates with nothing left to report.
    expect(validateProjectDocument(result.document).issues).toEqual([])
  })

  it('leaves a document that already uses current IDs alone', () => {
    const document = migratedFixture()
    const before = JSON.stringify(document)

    const result = migrateProjectDocument(document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.report.applied).not.toContain('v1: normalize legacy device frame id')
    expect(JSON.stringify(result.document)).toBe(before)
  })

  it('applies the default preset to a project that predates the field', () => {
    const legacy = migratedFixture()
    delete slidesOf(legacy)[0].deviceFrameId

    const result = parseProjectDocument(JSON.stringify(legacy))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].deviceFrameId).toBe('iphone')
    expect(result.project.slides[0].showDeviceStatusBar).toBe(true)
  })

  it('keeps the values the tracked project already ships with openable', () => {
    for (const slide of slidesOf(createProjectDocument())) {
      expect(isKnownDeviceFrameId(slide.deviceFrameId)).toBe(true)
    }
    expect(validateProjectDocument(createProjectDocument(), { allowLegacyLayouts: true }).valid).toBe(true)
  })
})
