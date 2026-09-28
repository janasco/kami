import { describe, expect, it } from 'vitest'
import { serializeProject, parseProjectDocument, type EditorProject } from './project'
import { createTestSlide } from '../test/projectFixtures'
import { createDefaultOutputVariant, reconcileVariantSlideIds } from './deviceVariants'
import type { OutputVariant, Slide } from '../types'

/**
 * Saving is a pure function of the project.
 *
 * The document is pitched as something that lives in Git next to the code, so a
 * save that changes bytes without the deck having changed is a defect, not a
 * detail. It was one: `serializeProject` wrote a `revision` block it never read
 * back — `number: 1` hardcoded, `createdAt: new Date().toISOString()`, `message`
 * a constant — so opening the app and saving with no edits produced a diff every
 * time, and a user could not tell a real change from a no-op save.
 *
 * Two tests in the suite used to blank `revision.createdAt` before comparing
 * documents, and the gate's own round-trip check deleted the whole block, so the
 * field was quietly tolerated in three places at once. It is gone, and these tests
 * are the reason it cannot come back the same way.
 */

const deck = (count: number): Slide[] =>
  Array.from({ length: count }, (_, i) => createTestSlide({ id: `slide-${i + 1}`, title: `Slide ${i + 1}` }))

const project = (overrides: Partial<EditorProject> = {}): EditorProject => {
  const slides = overrides.slides ?? deck(3)
  const variants: OutputVariant[] = [
    createDefaultOutputVariant({
      slideIds: slides.map((s) => s.id),
      locale: 'en-US',
      themeId: 'midnight',
      exportProfileId: 'app-store',
    }),
  ]
  return {
    name: 'A deck',
    slides,
    activeLocale: 'en-US',
    canvasMode: 'isolated',
    selectedExportProfileId: 'app-store',
    outputVariants: reconcileVariantSlideIds(slides, variants),
    ...overrides,
  }
}

const bytes = (value: EditorProject) => JSON.stringify(serializeProject(value), null, 2)

describe('serialisation stability', () => {
  it('produces identical bytes when the same project is saved twice', () => {
    // The regression. With a clock in the document this was never equal, so a
    // no-op save always showed up in the diff.
    const value = project()
    expect(bytes(value)).toBe(bytes(project()))
  })

  it('produces identical bytes for two independently built copies', () => {
    // Not just back to back on one object: the old failure was a wall clock, so
    // the gap between two saves was exactly what made them differ.
    expect(bytes(project())).toBe(bytes(project()))
  })

  it('writes no timestamp anywhere in the document', () => {
    // Belt and braces. The equality tests above would still pass if a timestamp
    // were derived deterministically, so the property is asserted directly: this
    // document is not supposed to know what time it is.
    expect(bytes(project())).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('carries no revision block at all', () => {
    const document = serializeProject(project()) as unknown as Record<string, unknown>
    expect(document).not.toHaveProperty('revision')
  })

  it('still changes when the deck actually changes', () => {
    // The other half. A serializer that never changed anything would also pass
    // the stability tests, and would be worse than useless.
    expect(bytes(project({ name: 'A different deck' }))).not.toBe(bytes(project()))
  })

  it('round-trips a save through the parser and back to the same bytes', () => {
    const first = bytes(project())
    const parsed = parseProjectDocument(first)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(bytes(parsed.project)).toBe(first)
  })
})
