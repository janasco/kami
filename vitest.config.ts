import { defineConfig } from 'vitest/config'

/**
 * One project, two environments, chosen per file.
 *
 * The suite mixes two kinds of test that used to be forced through a single
 * environment:
 *
 *  - Most of it is pure logic in `src/lib`, plus assertions about a stylesheet's
 *    declarations and one-shot server-rendered markup. None of that needs a DOM,
 *    and all of it runs in `node`.
 *  - A few tests genuinely need to mount a component, let an effect run, fire an
 *    event, and assert on the resulting state. Those opt in per file with a
 *    `// @vitest-environment jsdom` docblock, so only those files pay for the
 *    jsdom environment rather than the whole suite.
 *
 * Two things this deliberately does not do:
 *
 *  - It does not set `environment: 'jsdom'` globally. Doing that cost roughly
 *    520 seconds of environment setup for the static half and gained nothing,
 *    while actively breaking the stylesheet tests: under jsdom `import.meta.url`
 *    is an http URL, so `new URL('./x.css', import.meta.url)` throws
 *    "The URL must be of scheme file". The stylesheet tests use
 *    `src/test/stylesheet.ts`, which resolves from the repo root instead.
 *  - It does not add `.test.tsx` to a global include by accident. JSX tests must
 *    be written in `.tsx`; the previous glob was `.ts` only, which made such a
 *    test impossible to even name.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,

    /**
     * The gate depends on a stable baseline. Randomised order would make a red
     * run impossible to reproduce, which is the opposite of what a regression
     * gate is for.
     */
    sequence: {
      shuffle: false,
    },
  },
})
