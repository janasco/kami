import { describe, expect, it } from 'vitest'
import {
  classifyDroppedFile,
  decodeKamiCapture,
  encodeKamiCapture,
  isDroppableDrag,
  isProjectDropFile,
  KAMI_CAPTURE_DRAG_TYPE,
  planScreenshotDrop,
  readDropIntent,
  resolveCaptureDropStrategy,
  type CaptureDropSlide,
  type DataTransferLike,
  type DroppedFileLike,
} from './screenshotDrop'
import { SCREENSHOT_IMPORT_MAX_BYTES } from './screenshotImport'
import { createTestSlide } from '../test/projectFixtures'

/**
 * Tests for the drop planner and the drop vocabulary.
 *
 * The planner is pure, so it is tested with plain objects shaped like the files
 * the browser hands over rather than with a real `File`: what matters is the
 * decision, and the same file object is what the caller reads afterwards. The
 * deck is built from the project fixture so a slide is a real slide and only the
 * two fields the planner reads are ever set.
 */

const png = (name: string, size = 1024): DroppedFileLike => ({ name, type: 'image/png', size })
const jpeg = (name: string, size = 1024): DroppedFileLike => ({ name, type: 'image/jpeg', size })
const project = (name = 'screenshot-studio.json'): DroppedFileLike => ({ name, type: 'application/json', size: 2048 })

/** A deck of `count` slides, every one holding a capture unless it is empty. */
const deck = (count: number, captures: boolean[] = []): CaptureDropSlide[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `slide-${index + 1}`,
    screenshot: captures[index] === false ? null : `data:image/png;base64,slide${index + 1}`,
  }))

/** A data transfer carrying files, as a native file drop reports one. */
const fileTransfer = (files: DroppedFileLike[]): DataTransferLike<DroppedFileLike> => ({
  types: ['Files'],
  getData: () => '',
  files,
})

/** A data transfer carrying a Kami capture, as our own drag reports one. */
const captureTransfer = (slideId: string, name: string | null = 'home.png'): DataTransferLike<DroppedFileLike> => {
  const encoded = encodeKamiCapture({ slideId, name })
  return {
    types: [KAMI_CAPTURE_DRAG_TYPE, 'text/plain'],
    getData: (format) => (format === KAMI_CAPTURE_DRAG_TYPE || format === 'text/plain' ? encoded : ''),
    files: [],
  }
}

describe('file classification', () => {
  it('accepts the three capture types the importer accepts', () => {
    expect(classifyDroppedFile(png('a.png'))).toEqual({ kind: 'capture', reason: null })
    expect(classifyDroppedFile(jpeg('b.jpg'))).toEqual({ kind: 'capture', reason: null })
    expect(classifyDroppedFile({ name: 'c.webp' })).toEqual({ kind: 'capture', reason: null })
  })

  it('reads a project document before the image checks', () => {
    expect(classifyDroppedFile(project())).toEqual({ kind: 'project', reason: null })
    // The type is what decides, so a JSON file with no extension still opens.
    expect(classifyDroppedFile({ name: 'deck', type: 'application/json' })).toEqual({ kind: 'project', reason: null })
    // And the extension is enough, so a project saved with no MIME type works.
    expect(isProjectDropFile({ name: 'Draft.JSON' })).toBe(true)
    expect(isProjectDropFile(png('a.png'))).toBe(false)
  })

  it('names the reason a file is refused instead of dropping it silently', () => {
    expect(classifyDroppedFile({ name: 'notes.txt', type: 'text/plain', size: 10 })).toEqual({
      kind: 'rejected',
      reason: 'notes.txt is not a PNG, JPG, or WebP image.',
    })
    expect(classifyDroppedFile({ name: 'icon.svg', type: 'image/svg+xml', size: 10 }).kind).toBe('rejected')
  })

  it('refuses a capture over the size limit and says how large it is', () => {
    const tooBig = png('huge.png', SCREENSHOT_IMPORT_MAX_BYTES + 1)
    const classified = classifyDroppedFile(tooBig)
    expect(classified.kind).toBe('rejected')
    expect(classified.reason).toContain('Too large')
    expect(classified.reason).toContain('10 MB')
    // The boundary itself is still accepted.
    expect(classifyDroppedFile(png('exact.png', SCREENSHOT_IMPORT_MAX_BYTES)).kind).toBe('capture')
  })
})

describe('drop strategy', () => {
  it('replaces the target for one capture and assigns forward for several', () => {
    expect(resolveCaptureDropStrategy(1)).toBe('replace-target')
    expect(resolveCaptureDropStrategy(0)).toBe('replace-target')
    expect(resolveCaptureDropStrategy(2)).toBe('assign-forward')
  })
})

describe('planning a drop on one slide', () => {
  it('replaces the capture on the slide that was dropped on', () => {
    const plan = planScreenshotDrop({ files: [png('home.png')], slides: deck(3), targetSlideId: 'slide-2' })

    expect(plan.strategy).toBe('replace-target')
    expect(plan.assignedCount).toBe(1)
    expect(plan.replacedCount).toBe(1)
    expect(plan.createdSlideCount).toBe(0)
    expect(plan.slideCountAfter).toBe(3)
    expect(plan.captures[0]).toMatchObject({
      name: 'home.png',
      slideId: 'slide-2',
      slideNumber: 2,
      replaces: true,
      createsSlide: false,
    })
    expect(plan.empty).toBe(false)
    expect(plan.notice).toBe('Replaced the capture on slide 2 with home.png. Undo is available.')
  })

  it('fills an empty slide without calling it a replacement', () => {
    const plan = planScreenshotDrop({
      files: [png('first.png')],
      slides: deck(3, [false]),
      targetSlideId: 'slide-1',
    })

    expect(plan.replacedCount).toBe(0)
    expect(plan.captures[0].replaces).toBe(false)
    expect(plan.notice).toBe('Added first.png to slide 1. Undo is available.')
  })

  it('leaves every other slide alone when one capture is dropped', () => {
    const plan = planScreenshotDrop({ files: [png('one.png')], slides: deck(4), targetSlideId: 'slide-3' })
    // A single capture never reaches past the slide it was aimed at, so no other
    // slide is even named by the plan.
    expect(plan.captures.map((capture) => capture.slideId)).toEqual(['slide-3'])
    expect(plan.createdSlideCount).toBe(0)
  })
})

describe('planning a multi-file drop', () => {
  it('assigns several captures in order from the target slide forward', () => {
    const plan = planScreenshotDrop({
      files: [png('one.png'), jpeg('two.jpg'), png('three.png')],
      slides: deck(4),
      targetSlideId: 'slide-2',
    })

    expect(plan.strategy).toBe('assign-forward')
    expect(plan.captures.map((capture) => [capture.name, capture.slideId, capture.slideNumber])).toEqual([
      ['one.png', 'slide-2', 2],
      ['two.jpg', 'slide-3', 3],
      ['three.png', 'slide-4', 4],
    ])
    expect(plan.replacedCount).toBe(3)
    expect(plan.createdSlideCount).toBe(0)
    expect(plan.slideCountAfter).toBe(4)
    expect(plan.notice).toBe(
      '3 captures placed in order on slides 2 to 4, replacing 3 existing captures. Undo is available.',
    )
  })

  it('creates a slide for every capture past the end of the deck', () => {
    const plan = planScreenshotDrop({
      files: [png('a.png'), png('b.png'), png('c.png'), png('d.png'), png('e.png')],
      slides: deck(3),
      targetSlideId: 'slide-1',
    })

    // Two land on real slides and three need slides the deck does not have.
    expect(plan.captures.map((capture) => capture.slideId)).toEqual(['slide-1', 'slide-2', 'slide-3', null, null])
    expect(plan.captures.map((capture) => capture.createsSlide)).toEqual([false, false, false, true, true])
    // A created slide still gets the deck number it will have, so the notice can
    // say where the deck grew.
    expect(plan.captures.map((capture) => capture.slideNumber)).toEqual([1, 2, 3, 4, 5])
    expect(plan.createdSlideCount).toBe(2)
    expect(plan.slideCountAfter).toBe(5)
    expect(plan.notice).toBe(
      '5 captures placed in order on slides 1 to 5, replacing 3 existing captures. 2 new slides added. Undo is available.',
    )
  })

  it('keeps the order the files were dropped in', () => {
    const plan = planScreenshotDrop({
      files: [png('z.png'), png('a.png'), png('m.png')],
      slides: deck(1),
      targetSlideId: 'slide-1',
    })
    expect(plan.captures.map((capture) => capture.name)).toEqual(['z.png', 'a.png', 'm.png'])
  })

  it('mixes replacements, additions, and new slides in one drop', () => {
    const plan = planScreenshotDrop({
      // Slide 1 has a capture, slide 2 is empty, and there is no slide 3.
      files: [png('a.png'), png('b.png'), png('c.png')],
      slides: deck(2, [true, false]),
      targetSlideId: 'slide-1',
    })

    expect(plan.captures.map((capture) => capture.replaces)).toEqual([true, false, false])
    expect(plan.replacedCount).toBe(1)
    expect(plan.createdSlideCount).toBe(1)
    expect(plan.notice).toBe(
      '3 captures placed in order on slides 1 to 3, replacing 1 existing capture. 1 new slide added. Undo is available.',
    )
  })

  it('places every capture on a new slide when the deck is empty', () => {
    const plan = planScreenshotDrop({ files: [png('a.png'), png('b.png')], slides: [], targetSlideId: 'slide-none' })

    expect(plan.assignedCount).toBe(2)
    expect(plan.createdSlideCount).toBe(2)
    expect(plan.captures.map((capture) => capture.slideNumber)).toEqual([1, 2])
    expect(plan.slideCountAfter).toBe(2)
  })
})

describe('files that are not captures', () => {
  it('refuses a non-capture and reports it in the notice', () => {
    const plan = planScreenshotDrop({
      files: [png('home.png'), { name: 'notes.txt', type: 'text/plain', size: 12 }],
      slides: deck(2),
      targetSlideId: 'slide-1',
    })

    expect(plan.assignedCount).toBe(1)
    expect(plan.rejected).toHaveLength(1)
    expect(plan.rejected[0]).toMatchObject({ name: 'notes.txt' })
    expect(plan.rejected[0].reason).toBe('notes.txt is not a PNG, JPG, or WebP image.')
    // The capture is still placed, and the refusal is stated rather than hidden.
    expect(plan.notice).toBe('Replaced the capture on slide 1 with home.png. Not placed: notes.txt. Undo is available.')
  })

  it('refuses a capture that is too large and names the limit', () => {
    const plan = planScreenshotDrop({
      files: [png('huge.png', SCREENSHOT_IMPORT_MAX_BYTES + 1)],
      slides: deck(2),
      targetSlideId: 'slide-1',
    })

    expect(plan.assignedCount).toBe(0)
    expect(plan.empty).toBe(true)
    expect(plan.rejected[0].reason).toContain('Too large')
    expect(plan.notice).toBe('Nothing was placed. Not placed: huge.png.')
  })

  it('lists several refusals without listing every one', () => {
    const plan = planScreenshotDrop({
      files: [{ name: 'a.txt', type: 'text/plain' }, { name: 'b.pdf', type: 'application/pdf' }, { name: 'c.gif', type: 'image/gif' }],
      slides: deck(1),
      targetSlideId: 'slide-1',
    })
    expect(plan.rejected).toHaveLength(3)
    expect(plan.notice).toBe('Nothing was placed. Not placed: a.txt and b.pdf and 1 more.')
  })

  it('does not open a project document that was dropped on a slide', () => {
    const plan = planScreenshotDrop({
      files: [png('home.png'), project()],
      slides: deck(2),
      targetSlideId: 'slide-1',
    })

    // The plan separates the two, and says a project is not a capture, so a
    // drop onto one card can never be read as opening a whole project.
    expect(plan.captures.map((capture) => capture.name)).toEqual(['home.png'])
    expect(plan.projects.map((entry) => entry.name)).toEqual(['screenshot-studio.json'])
    expect(plan.notice).toContain('screenshot-studio.json is a project file, not a capture')
  })

  it('refuses every capture when the target slide is gone from the deck', () => {
    const plan = planScreenshotDrop({ files: [png('home.png')], slides: deck(2), targetSlideId: 'slide-deleted' })

    expect(plan.targetSlideNumber).toBe(0)
    expect(plan.assignedCount).toBe(0)
    expect(plan.rejected[0].reason).toBe('Slide slide-deleted is no longer in the deck.')
    // No slide is guessed at, so nothing can land on the wrong capture.
    expect(plan.empty).toBe(true)
  })

  it('accepts one capture at a time when a replace is asked for explicitly', () => {
    const plan = planScreenshotDrop({
      files: [png('one.png'), png('two.png')],
      slides: deck(3),
      targetSlideId: 'slide-1',
      strategy: 'replace-target',
    })

    expect(plan.captures).toHaveLength(1)
    expect(plan.rejected.map((entry) => entry.name)).toEqual(['two.png'])
    expect(plan.rejected[0].reason).toBe('Only one capture can replace the capture on a slide.')
  })
})

describe('the Kami capture drag type', () => {
  it('round-trips a payload', () => {
    const payload = { slideId: 'slide-2', name: 'home.png' }
    expect(decodeKamiCapture(encodeKamiCapture(payload))).toEqual(payload)
    // A capture with no remembered name still round-trips.
    expect(decodeKamiCapture(encodeKamiCapture({ slideId: 'slide-2', name: null }))).toEqual({
      slideId: 'slide-2',
      name: null,
    })
  })

  it('refuses a payload it cannot trust', () => {
    expect(decodeKamiCapture(null)).toBeNull()
    expect(decodeKamiCapture('')).toBeNull()
    expect(decodeKamiCapture('not json')).toBeNull()
    expect(decodeKamiCapture('[]')).toBeNull()
    expect(decodeKamiCapture('{"name":"home.png"}')).toBeNull()
    expect(decodeKamiCapture('{"slideId":""}')).toBeNull()
    expect(decodeKamiCapture('{"slideId":7}')).toBeNull()
  })

  it('claims a drag only when it carries files or a Kami capture', () => {
    expect(isDroppableDrag(fileTransfer([]))).toBe(true)
    expect(isDroppableDrag(captureTransfer('slide-1'))).toBe(true)
    // A text selection, a link, or a drag Kami did not start is left alone.
    expect(isDroppableDrag({ types: ['text/plain'], getData: () => 'x', files: [] })).toBe(false)
    expect(isDroppableDrag({ types: ['text/html', 'text/uri-list'], getData: () => '', files: [] })).toBe(false)
    expect(isDroppableDrag(null)).toBe(false)
  })

  it('reads a file drop as files and a card drag as a capture', () => {
    const files = [png('one.png'), png('two.png')]
    const fromFiles = readDropIntent(fileTransfer(files))
    expect(fromFiles.kind).toBe('files')
    expect(fromFiles.files.map((file) => file.name)).toEqual(['one.png', 'two.png'])

    const fromCapture = readDropIntent(captureTransfer('slide-2'))
    expect(fromCapture.kind).toBe('capture')
    expect(fromCapture.capture).toEqual({ slideId: 'slide-2', name: 'home.png' })
  })

  it('prefers the capture when a drag somehow offers both', () => {
    const encoded = encodeKamiCapture({ slideId: 'slide-3', name: 'a.png' })
    const both = readDropIntent<DroppedFileLike>({
      types: [KAMI_CAPTURE_DRAG_TYPE, 'Files'],
      getData: () => encoded,
      files: [png('a.png')],
    })
    expect(both.kind).toBe('capture')
    expect(both.capture?.slideId).toBe('slide-3')
  })

  it('reports a drop that carried nothing as empty rather than as files', () => {
    expect(readDropIntent(fileTransfer([])).kind).toBe('none')
    // A Kami type with a payload this version cannot read is not a capture.
    expect(readDropIntent({ types: [KAMI_CAPTURE_DRAG_TYPE], getData: () => 'garbage', files: [] }).kind).toBe('none')
    expect(readDropIntent({ types: [], getData: () => '', files: [] }).kind).toBe('none')
    expect(readDropIntent(null).kind).toBe('none')
  })
})

describe('the plan against a real slide', () => {
  it('reads the capture off a project slide without touching the rest of it', () => {
    const slide = createTestSlide({ id: 'slide-real' })
    const plan = planScreenshotDrop({
      files: [png('replacement.png')],
      slides: [{ id: slide.id, screenshot: slide.screenshot }],
      targetSlideId: slide.id,
    })

    expect(plan.captures[0]).toMatchObject({ slideId: 'slide-real', slideNumber: 1, replaces: true })
    // The plan is a description: it hands back the file it was given and never a
    // rebuilt slide, so nothing about the fixture can be lost by planning a drop.
    expect(plan.captures[0].file.name).toBe('replacement.png')
    expect(slide.screenshot).toBe(createTestSlide().screenshot)
  })
})
