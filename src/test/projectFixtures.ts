import projectFixture from '../../screenshot-studio.json'
import { starterSlide } from '../data'
import type { Slide } from '../types'

export const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
/**
 * A second valid PNG, for the tests that need two *different* sets of bytes.
 * Asset identity is the payload, so a capture shared with a slide's own capture
 * resolves to the slide's asset and its stored name.
 */
export const VALID_PNG_DATA_URL_ALT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC'
export const VALID_SVG_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='

export const createProjectDocument = (): Record<string, unknown> =>
  structuredClone(projectFixture) as Record<string, unknown>

/**
 * A slide with a capture and an app icon already attached, so a test only has to
 * describe the one field it is about. The background image is present too, with
 * an intrinsic size hint, because every background fill kind except the theme
 * depends on there being a backdrop to fill with.
 */
export const createTestSlide = (overrides: Partial<Slide> = {}): Slide => {
  const slide = structuredClone(starterSlide)
  slide.id = 'test-slide'
  slide.screenshot = VALID_PNG_DATA_URL
  slide.screenshotName = 'test.png'
  slide.appIcon = {
    name: 'test-icon.svg',
    dataUrl: VALID_SVG_DATA_URL,
    mimeType: 'image/svg+xml',
  }
  slide.backgroundImage = {
    name: 'test-backdrop.png',
    dataUrl: VALID_PNG_DATA_URL,
    mimeType: 'image/png',
    width: 3000,
    height: 1000,
  }
  return { ...slide, ...overrides }
}
