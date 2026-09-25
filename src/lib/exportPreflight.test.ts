import { describe, expect, it } from 'vitest'
import { exportProfiles } from '../data'
import { createTestSlide } from '../test/projectFixtures'
import { isValidImageDataUrl, runExportPreflight } from './exportPreflight'

const profile = (id: string) => {
  const found = exportProfiles.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Missing test profile: ${id}`)
  return found
}

describe('image data URL validation', () => {
  it.each([
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'data:image/jpeg;base64,/9j/2Q==',
    'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==',
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGlzb21pc28=',
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
    'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E',
  ])('accepts a supported image payload: %s', (value) => {
    expect(isValidImageDataUrl(value)).toBe(true)
  })

  it.each([
    'not-a-data-url',
    'data:text/plain;base64,dGV4dA==',
    'data:image/png;base64,',
    'data:image/png;base64,not*base64',
    'data:image/png;base64,SGVsbG8=',
    'data:image/jpeg;base64,iVBORw0KGgo=',
  ])('rejects a malformed, empty, or mismatched image payload: %s', (value) => {
    expect(isValidImageDataUrl(value)).toBe(false)
  })
})

describe('export preflight rules', () => {
  it('returns ready for valid supported images without a DOM', () => {
    const result = runExportPreflight({
      profile: profile('app-store-1125'),
      slides: [createTestSlide()],
      activeLocale: 'en-US',
    })

    expect(result).toMatchObject({
      status: 'ready',
      issues: [],
      checkedSlides: 1,
      profileId: 'app-store-1125',
    })
  })

  it('blocks missing required screenshots and hidden required layers', () => {
    const slide = createTestSlide({ screenshot: null })
    slide.layerSettings.headline.visible = false

    const result = runExportPreflight({
      profile: profile('app-store-1125'),
      slides: [slide],
      activeLocale: 'en-US',
    })

    expect(result.status).toBe('blocked')
    expect(result.blockingIssues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'hidden-required-layer',
      'missing-screenshot',
    ]))
  })

  it('keeps optional screenshots and strongly recommended app icons as warnings', () => {
    const slide = createTestSlide({ screenshot: null, appIcon: null })
    const result = runExportPreflight({
      profile: profile('google-play-feature-graphic'),
      slides: [slide],
      activeLocale: 'en-US',
    })

    expect(result.status).toBe('warnings')
    expect(result.blockingIssues).toEqual([])
    expect(result.warningIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-screenshot', severity: 'warning' }),
      expect.objectContaining({ code: 'missing-app-icon', severity: 'warning' }),
    ]))
  })

  it('warns for mismatched dimensions, orientation, and out-of-bounds layers', () => {
    const activeProfile = profile('app-store-1125')
    const mismatchedProfile = {
      ...activeProfile,
      width: 600,
      height: 1300,
      orientation: 'landscape' as const,
    }
    const slide = createTestSlide()

    const result = runExportPreflight({
      profile: mismatchedProfile,
      slides: [slide],
      activeLocale: 'en-US',
      layerBounds: {
        [slide.id]: {
          headline: { left: 0, top: 0, right: 601, bottom: 100 },
        },
      },
    })

    expect(result.status).toBe('warnings')
    expect(result.warningIssues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'dimension-warning',
      'orientation-warning',
      'bounds-outside-canvas',
    ]))
  })

  it('blocks malformed image data while allowing explicitly external URLs', () => {
    const malformed = runExportPreflight({
      profile: profile('app-store-1125'),
      slides: [createTestSlide({ screenshot: 'data:image/png;base64,not-an-image' })],
      activeLocale: 'en-US',
    })
    const external = runExportPreflight({
      profile: profile('app-store-1125'),
      slides: [createTestSlide({ screenshot: 'https://example.com/screenshot.png' })],
      activeLocale: 'en-US',
    })

    expect(malformed.status).toBe('blocked')
    expect(malformed.blockingIssues[0]).toMatchObject({ code: 'invalid-image-data', layerId: 'screenshot' })
    expect(external.status).toBe('ready')
  })
})
