/**
 * Global test setup.
 *
 * Deliberately imports nothing that needs a DOM. This file runs for every test
 * file, including the ones running in the `node` environment, and an earlier
 * version imported `@testing-library/react` here — which made all 51 static
 * suites fail to load, because testing-library cannot be imported without a
 * document. A setup file is the wrong place for a DOM-only dependency.
 *
 * DOM-only concerns (React unmounting between tests) live in the `.tsx` tests
 * that actually have a DOM.
 */

/**
 * jsdom implements no Pointer Events capture API.
 *
 * `setPointerCapture` is how the canvas keeps receiving moves after the pointer
 * leaves the element, so a drag test cannot get past the first handler without
 * it. These are inert no-ops: the capture bookkeeping is not what these tests
 * are asserting, and faking the pointerId bookkeeping would only hide bugs.
 */
for (const method of ['setPointerCapture', 'releasePointerCapture'] as const) {
  if (typeof Element !== 'undefined' && !(method in Element.prototype)) {
    Object.defineProperty(Element.prototype, method, {
      configurable: true,
      writable: true,
      value: () => undefined,
    })
  }
}

if (typeof Element !== 'undefined' && !('hasPointerCapture' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    configurable: true,
    writable: true,
    value: () => false,
  })
}

/**
 * A layout box for a test that needs one.
 *
 * jsdom has no layout engine, so every `getBoundingClientRect()` is a zero box.
 * The canvas drag maths divides by the measured width and bails out when it is
 * zero, which is correct behaviour and means a drag test must supply a real
 * size or it asserts nothing.
 *
 * Deliberately per-element and explicit: a blanket `Element.prototype` override
 * that answered a plausible size for everything would let the zero-guard pass
 * vacuously, which is the bug this file exists to make reachable.
 */
export function stubRect(element: Element, rect: { width: number; height: number; left?: number; top?: number }) {
  const left = rect.left ?? 0
  const top = rect.top ?? 0
  const box: DOMRect = {
    x: left,
    y: top,
    left,
    top,
    width: rect.width,
    height: rect.height,
    right: left + rect.width,
    bottom: top + rect.height,
    toJSON: () => box,
  }
  element.getBoundingClientRect = () => box
  return box
}
