import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { migrateProjectDocument } from './projectMigration'
import { parseProjectDocument, serializeProject, type EditorProject } from './project'
import { validateProjectDocument } from './projectValidation'
import { createProjectDocument, createTestSlide } from '../test/projectFixtures'
import type { Slide } from '../types'

const projectWith = (slides: Slide[]): EditorProject => ({
  name: 'Status bar project',
  slides,
  activeLocale: 'en-US',
  canvasMode: 'isolated',
  selectedExportProfileId: exportProfiles[0].id,
})

const migratedFixture = () => {
  const result = migrateProjectDocument(createProjectDocument())
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const slidesOf = (document: object) =>
  (document as { slides?: unknown }).slides as Array<Record<string, unknown>>

describe('device status bar persistence', () => {
  it('round-trips the per-slide flag through the project document', () => {
    const original = projectWith([
      createTestSlide({ id: 'framed', deviceFrameId: 'iphone', showDeviceStatusBar: false }),
      createTestSlide({ id: 'frameless', deviceFrameId: 'none', showDeviceStatusBar: true }),
    ])

    const document = serializeProject(original)
    expect(validateProjectDocument(document).valid).toBe(true)
    expect(slidesOf(document).map((slide) => slide.showDeviceStatusBar)).toEqual([false, true])

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides.map((slide) => [slide.deviceFrameId, slide.showDeviceStatusBar])).toEqual([
      ['iphone', false],
      ['none', true],
    ])
  })

  it('applies a backward-compatible default when an older project omits the flag', () => {
    const legacy = createProjectDocument()
    expect(slidesOf(legacy)[0].deviceFrameId).toBe('iphone')
    delete slidesOf(legacy)[0].showDeviceStatusBar

    const result = parseProjectDocument(JSON.stringify(legacy))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].deviceFrameId).toBe('iphone')
    expect(result.project.slides[0].showDeviceStatusBar).toBe(true)

    const migrated = migratedFixture()
    expect(validateProjectDocument(migrated).valid).toBe(true)
    expect(slidesOf(migrated)[0].showDeviceStatusBar).toBe(true)
  })

  it('keeps frameless projects frameless when the flag is missing', () => {
    const document = migratedFixture()
    const slide = slidesOf(document)[0]
    slide.deviceFrameId = 'none'
    delete slide.showDeviceStatusBar

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].showDeviceStatusBar).toBe(false)
  })

  it('rejects a non-boolean status bar flag', () => {
    const document = migratedFixture()
    slidesOf(document)[0].showDeviceStatusBar = 'yes'

    const report = validateProjectDocument(document)
    expect(report.valid).toBe(false)
    expect(report.issues).toContainEqual({
      path: '$.slides[0].showDeviceStatusBar',
      code: 'invalid-device-setting',
      message: 'The device status bar flag must be a boolean.',
      severity: 'error',
    })
  })
})
