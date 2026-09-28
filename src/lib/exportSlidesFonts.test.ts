// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FONT_READY_TIMEOUT_MS, fontReadyTimeoutMessage, waitForFonts } from './exportSlides'

/**
 * The export's font wait, bounded.
 *
 * The bug this pins: `await document.fonts.ready` had no timeout. If that
 * promise never settles — a request the browser has given up on but not
 * resolved, a font that 404s in a way the FontFaceSet never reports, an
 * extension that wedges the loader — the export stops at "Exporting PNG 0 of N…"
 * forever. No error, no file, and the only way out is a reload, which loses the
 * click that started it.
 *
 * jsdom because the guard is `'fonts' in document` and jsdom has no FontFaceSet
 * by default, so each case installs one. The property is defined per test and
 * removed after, rather than stubbed globally, so the "no FontFaceSet" case can
 * be a real assertion instead of a comment.
 */

const installFontSet = (ready: Promise<unknown>) => {
  const fonts = { ready }
  Object.defineProperty(document, 'fonts', { configurable: true, writable: true, value: fonts })
  return fonts
}

const removeFontSet = () => {
  Reflect.deleteProperty(document, 'fonts')
}

afterEach(() => {
  removeFontSet()
  vi.useRealTimers()
})

describe('waiting for fonts before an export', () => {
  it('resolves when the fonts settle', async () => {
    installFontSet(Promise.resolve())
    await expect(waitForFonts(1000)).resolves.toBeUndefined()
  })

  it('still waits while the fonts are pending', async () => {
    // A guard against "fixed" meaning "removed": the race must not resolve
    // immediately just because a timer exists.
    let settled = ''
    installFontSet(new Promise<void>((resolve) => {
      window.setTimeout(() => {
        settled = 'fonts'
        resolve()
      }, 20)
    }))
    const wait = waitForFonts(1000).then(() => { settled += ' then wait' })
    await wait
    expect(settled).toBe('fonts then wait')
  })

  it('fails with an actionable message instead of hanging forever', async () => {
    vi.useFakeTimers()
    installFontSet(new Promise<void>(() => { /* never settles */ }))

    const wait = waitForFonts(FONT_READY_TIMEOUT_MS)
    const assertion = expect(wait).rejects.toThrow(/Fonts did not finish loading/)
    await vi.advanceTimersByTimeAsync(FONT_READY_TIMEOUT_MS)
    await assertion
  })

  it('names the cause, the consequence, and the next step', async () => {
    // The message is the user interface here. Asserted word for word because a
    // reworded string is a changed interface, and "it timed out" is the version
    // that leaves a user staring at a failed export with no idea why.
    const message = fontReadyTimeoutMessage(15_000)
    expect(message).toContain('Fonts did not finish loading within 15 seconds')
    expect(message).toContain('wrong typeface')
    expect(message).toContain('Nothing was downloaded')
    expect(message).toMatch(/connection|try again/i)
  })

  it('reports the timeout it actually waited, not a hard-coded number', async () => {
    expect(fontReadyTimeoutMessage(2_500)).toContain('within 3 seconds')
  })

  it('disarms its timer once the fonts arrive', async () => {
    // The wait arms a 15-second timer. If a fast export left it armed, every
    // successful export would leave a live timer pending for the rest of the
    // session — a slow leak on a page whose whole job is long editing sessions,
    // and one that shows up as an unexplained task much later.
    //
    // Asserted through the timer itself, not through an unhandled-rejection
    // listener: `Promise.race` attaches handlers to *both* promises, so a losing
    // `expiry` rejection is always handled and never surfaces as an unhandled
    // rejection. A listener here would pass against the bug. This was tried, and
    // it stayed green with the `clearTimeout` deleted.
    const armed: number[] = []
    const cleared: number[] = []
    const realSetTimeout = window.setTimeout.bind(window)
    const realClearTimeout = window.clearTimeout.bind(window)
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, ms?: number, ...rest: unknown[]) => {
      const id = realSetTimeout(handler as () => void, ms, ...rest)
      armed.push(id as unknown as number)
      return id
    }) as typeof window.setTimeout)
    vi.spyOn(window, 'clearTimeout').mockImplementation(((id?: number) => {
      cleared.push(id as number)
      realClearTimeout(id)
    }) as typeof window.clearTimeout)

    try {
      installFontSet(Promise.resolve())
      await waitForFonts(50)
    } finally {
      vi.restoreAllMocks()
    }

    expect(armed.length).toBeGreaterThan(0)
    expect(cleared).toEqual(armed)
  })

  it('does not wait at all where there is no FontFaceSet', async () => {
    // The old `'fonts' in document` guard, preserved: a browser without the API
    // has nothing pending, and blocking for the full timeout there would trade a
    // hang for a frozen export.
    removeFontSet()
    expect('fonts' in document).toBe(false)
    await expect(waitForFonts(60_000)).resolves.toBeUndefined()
  })

  it('gives a slow connection real headroom rather than a token bound', async () => {
    // The number is a judgement, so the judgement is asserted: 15s is far above
    // any real font load here, which is the property that makes failing at 15s
    // safe. A regression to 1s would pass every test above and break real users.
    expect(FONT_READY_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000)
  })
})
