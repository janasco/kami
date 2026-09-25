import projectFixture from '../../screenshot-studio.json'
import { starterSlide } from '../data'
import type { Slide } from '../types'

export const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
export const VALID_SVG_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='

export const createProjectDocument = (): Record<string, unknown> =>
  structuredClone(projectFixture) as Record<string, unknown>

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
  return { ...slide, ...overrides }
}
