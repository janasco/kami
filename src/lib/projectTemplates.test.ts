import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSlidesFromProjectTemplate,
  projectTemplates,
  validateProjectTemplateCatalog,
  type ProjectTemplate,
} from './projectTemplates'

beforeEach(() => {
  let sequence = 0
  vi.stubGlobal('crypto', {
    randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('project template catalog', () => {
  it('validates every built-in template', () => {
    expect(validateProjectTemplateCatalog()).toEqual({ valid: true, errors: [] })
    expect(new Set(projectTemplates.map((template) => template.id)).size).toBe(projectTemplates.length)
  })

  it('instantiates asset-free slides with deterministic unique IDs', () => {
    const slideIds = new Set<string>()

    for (const template of projectTemplates) {
      const slides = createSlidesFromProjectTemplate(template)
      expect(slides).toHaveLength(template.slides.length)

      for (const slide of slides) {
        expect(slide.appIcon).toBeNull()
        expect(slide.backgroundImage).toBeNull()
        expect(slide.screenshot).toBeNull()
        expect(slideIds.has(slide.id)).toBe(false)
        slideIds.add(slide.id)
      }
    }

    expect(slideIds).toHaveLength(18)
  })

  it('reports asset-bearing and malformed template entries', () => {
    const malformed = structuredClone(projectTemplates[0]) as ProjectTemplate & {
      slides: Array<Record<string, unknown>>
    }
    malformed.slides[0].screenshot = 'data:image/png;base64,unsafe'
    malformed.slides[0].layerTransforms = { unknownLayer: { scale: 0 } } as unknown as NonNullable<
      ProjectTemplate['slides'][number]['layerTransforms']
    >

    const report = validateProjectTemplateCatalog([malformed])

    expect(report.valid).toBe(false)
    expect(report.errors).toContain('templates[0].slides[0].screenshot is forbidden; templates cannot include assets')
    expect(report.errors).toContain('templates[0].slides[0].layerTransforms has unsupported layer unknownLayer')
    expect(report.errors).toContain('templates[0].slides[0].layerTransforms.unknownLayer.scale must be greater than zero')
  })
})
