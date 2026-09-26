import { describe, expect, it } from 'vitest'
import { DEFAULT_SCREENSHOT_FIT, exportProfiles } from '../data'
import { migrateProjectDocument } from './projectMigration'
import { parseProjectDocument, serializeProject, type EditorProject } from './project'
import { validateProjectDocument } from './projectValidation'
import { createProjectDocument, createTestSlide } from '../test/projectFixtures'
import type { Slide } from '../types'

const projectWith = (slides: Slide[]): EditorProject => ({
  name: 'Screenshot fit project',
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

describe('screenshot fit persistence', () => {
  it('round-trips the per-slide fit through the project document', () => {
    const original = projectWith([
      createTestSlide({ id: 'contained', screenshotFit: 'contain' }),
      createTestSlide({ id: 'covered', screenshotFit: 'cover' }),
    ])

    const document = serializeProject(original)
    expect(validateProjectDocument(document).valid).toBe(true)
    expect(slidesOf(document).map((slide) => slide.screenshotFit)).toEqual(['contain', 'cover'])

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides.map((slide) => slide.screenshotFit)).toEqual(['contain', 'cover'])
  })

  it('restores older projects with the safe contain default', () => {
    const legacy = createProjectDocument()
    delete slidesOf(legacy)[0].screenshotFit

    const result = parseProjectDocument(JSON.stringify(legacy))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].screenshotFit).toBe(DEFAULT_SCREENSHOT_FIT)

    const migrated = migratedFixture()
    expect(validateProjectDocument(migrated).valid).toBe(true)
    expect(slidesOf(migrated)[0].screenshotFit).toBe(DEFAULT_SCREENSHOT_FIT)
  })

  it('keeps a stored cover choice through a migration', () => {
    const document = migratedFixture()
    slidesOf(document)[0].screenshotFit = 'cover'

    const result = parseProjectDocument(JSON.stringify(document))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.slides[0].screenshotFit).toBe('cover')
  })

  it('rejects an unsupported fit value', () => {
    const document = migratedFixture()
    slidesOf(document)[0].screenshotFit = 'stretch'

    const report = validateProjectDocument(document)
    expect(report.valid).toBe(false)
    expect(report.issues).toContainEqual({
      path: '$.slides[0].screenshotFit',
      code: 'invalid-device-setting',
      message: 'The screenshot fit must be one of: contain, cover.',
      severity: 'error',
    })
  })
})
