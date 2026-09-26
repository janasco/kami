import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCREENSHOT_FIT, defaultShowDeviceStatusBar } from '../data'
import {
  createSlidesFromProjectTemplate,
  projectTemplates,
  validateProjectTemplateCatalog,
  type ProjectTemplate,
} from './projectTemplates'
import type { ScreenshotFit } from '../types'

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

  it('inherits the device status bar default from the frame preset', () => {
    for (const template of projectTemplates) {
      const slides = createSlidesFromProjectTemplate(template)
      slides.forEach((slide, index) => {
        expect(slide.showDeviceStatusBar).toBe(template.slides[index].deviceFrameId !== 'none')
        expect(slide.showDeviceStatusBar).toBe(defaultShowDeviceStatusBar(slide.deviceFrameId))
      })
    }
  })

  it('defaults template slides to a contained screenshot fit', () => {
    for (const template of projectTemplates) {
      for (const slide of createSlidesFromProjectTemplate(template)) {
        expect(slide.screenshotFit).toBe(DEFAULT_SCREENSHOT_FIT)
      }
    }
  })

  it('reports asset-bearing and malformed template entries', () => {
    const malformed = structuredClone(projectTemplates[0]) as ProjectTemplate & {
      slides: Array<Record<string, unknown>>
    }
    malformed.slides[0].screenshot = 'data:image/png;base64,unsafe'
    malformed.slides[0].showDeviceStatusBar = 'yes' as unknown as boolean
    malformed.slides[0].screenshotFit = 'stretch' as unknown as ScreenshotFit
    malformed.slides[0].layerTransforms = { unknownLayer: { scale: 0 } } as unknown as NonNullable<
      ProjectTemplate['slides'][number]['layerTransforms']
    >

    const report = validateProjectTemplateCatalog([malformed])

    expect(report.valid).toBe(false)
    expect(report.errors).toContain('templates[0].slides[0].screenshot is forbidden; templates cannot include assets')
    expect(report.errors).toContain('templates[0].slides[0].showDeviceStatusBar must be a boolean')
    expect(report.errors).toContain('templates[0].slides[0].screenshotFit must be one of: contain, cover')
    expect(report.errors).toContain('templates[0].slides[0].layerTransforms has unsupported layer unknownLayer')
    expect(report.errors).toContain('templates[0].slides[0].layerTransforms.unknownLayer.scale must be greater than zero')
  })
})
