import { describe, expect, it } from 'vitest'
import { migrateProjectDocument } from './projectMigration'
import { parseProjectDocument } from './project'
import { validateProjectDocument } from './projectValidation'
import { createProjectDocument } from '../test/projectFixtures'

const findIssue = (issues: ReturnType<typeof validateProjectDocument>['issues'], code: string) =>
  issues.find((entry) => entry.code === code)

describe('project validation and migration', () => {
  it('accepts the tracked project only when the known legacy layout is explicitly allowed', () => {
    const source = createProjectDocument()

    expect(validateProjectDocument(source).valid).toBe(false)
    expect(findIssue(validateProjectDocument(source).issues, 'unsupported-layout')).toBeDefined()
    expect(validateProjectDocument(source, { allowLegacyLayouts: true }).valid).toBe(true)
  })

  it('migrates legacy IDs, applies defaults, and does not mutate its input', () => {
    const source = createProjectDocument()
    const result = migrateProjectDocument(source)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const document = result.document
    const slides = document.slides as Array<Record<string, unknown>>
    const layouts = document.layouts as Array<Record<string, unknown>>
    const layers = slides[0].layers as Array<Record<string, unknown>>

    expect(slides[0].layoutId).toBe('hero')
    expect(layouts[0].id).toBe('hero')
    expect(slides[0].deviceFrameId).toBe('iphone')
    expect(slides[0].transform).toBeDefined()
    expect(layers[0].transform).toBeDefined()
    expect(layers[0].opacity).toBe(1)
    expect(layers[0].visible).toBe(true)
    expect(result.report.applied).toContain('v1: normalize legacy layout id')
    expect(result.report.applied).toContain('v1: apply optional field defaults')
    expect(validateProjectDocument(document).valid).toBe(true)

    const originalSlides = source.slides as Array<Record<string, unknown>>
    const originalLayouts = source.layouts as Array<Record<string, unknown>>
    expect(originalSlides[0].layoutId).toBe('portrait-store')
    expect(originalLayouts[0].id).toBe('portrait-store')
  })

  it('rejects newer versions without attempting a downgrade', () => {
    const source = createProjectDocument()
    source.version = 2

    const result = migrateProjectDocument(source)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues[0].code).toBe('newer-version')
    expect(result.error).toContain('will not downgrade')
  })

  it('blocks unsafe asset paths after migration', () => {
    const result = migrateProjectDocument(createProjectDocument())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    result.document.assets = [{
      id: 'unsafe-asset',
      kind: 'screenshot',
      path: '../../private/screenshot.png',
      mimeType: 'image/png',
    }]

    const report = validateProjectDocument(result.document)
    expect(report.valid).toBe(false)
    expect(findIssue(report.issues, 'unsafe-asset-path')).toMatchObject({
      path: '$.assets[0].path',
      severity: 'error',
    })
  })

  it('keeps the public parse boundary non-mutating and reports validation failures', () => {
    const source = createProjectDocument()
    const project = source.project as Record<string, unknown>
    project.name = ''

    const result = parseProjectDocument(JSON.stringify(source))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues?.some((entry) => entry.path === '$.project.name')).toBe(true)
  })
})
