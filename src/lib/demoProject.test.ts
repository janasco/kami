import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoProject } from './demoProject'
import { parseProjectDocument, serializeProject } from './project'
import { validateProjectDocument } from './projectValidation'

beforeEach(() => {
  let sequence = 0
  vi.stubGlobal('crypto', {
    randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('demo project portability', () => {
  it('serializes to a valid document with only safe inline SVG assets', () => {
    const project = createDemoProject()
    const document = serializeProject(project)
    const inlineAssets = project.slides
      .flatMap((slide) => [slide.screenshot, slide.appIcon?.dataUrl])
      .filter((asset): asset is string => typeof asset === 'string')

    expect(validateProjectDocument(document).valid).toBe(true)
    expect(project.slides.map((slide) => slide.id)).toEqual([
      'demo-slide-00000000-0000-4000-8000-000000000001',
      'demo-slide-00000000-0000-4000-8000-000000000002',
      'demo-slide-00000000-0000-4000-8000-000000000003',
    ])
    expect(inlineAssets).toHaveLength(6)
    expect(new Set(inlineAssets)).toHaveLength(4)
    expect(document.assets).toHaveLength(6)

    for (const asset of inlineAssets) {
      expect(asset).toMatch(/^data:image\/svg\+xml;base64,[a-z\d+/=]+$/i)
      const svg = atob(asset.slice('data:image/svg+xml;base64,'.length))
      expect(svg).toMatch(/^<svg\b/i)
      expect(svg).not.toMatch(/<script|<foreignObject|\b(?:href|src)\s*=/i)
    }
  })

  it('survives a JSON-only project export/import round trip', () => {
    const original = createDemoProject()
    const portableText = JSON.stringify(serializeProject(original))
    const result = parseProjectDocument(portableText)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.name).toBe(original.name)
    expect(result.project.slides).toHaveLength(3)
    expect(result.project.slides.map((slide) => slide.title)).toEqual(original.slides.map((slide) => slide.title))
    expect(result.project.slides.every((slide) => slide.screenshot?.startsWith('data:image/svg+xml;base64,'))).toBe(true)
    expect(result.project.slides.every((slide) => slide.appIcon?.dataUrl.startsWith('data:image/svg+xml;base64,'))).toBe(true)
  })

  it('keeps device status chrome on framed demo slides and off frameless ones', () => {
    const original = createDemoProject()
    const result = parseProjectDocument(JSON.stringify(serializeProject(original)))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.project.slides.map((slide) => [slide.deviceFrameId, slide.showDeviceStatusBar])).toEqual([
      ['iphone', true],
      ['iphone', true],
      ['none', false],
    ])
  })

  it('keeps the demo captures fully visible with the contain fit', () => {
    const original = createDemoProject()
    const result = parseProjectDocument(JSON.stringify(serializeProject(original)))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.project.slides.map((slide) => slide.screenshotFit)).toEqual(['contain', 'contain', 'contain'])
  })
})
