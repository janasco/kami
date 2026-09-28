import { describe, expect, it } from 'vitest'
import {
  IDENTITY_SEPARATOR,
  TestIdentityError,
  identityFile,
  nonPortableIdentities,
  repoRelative,
  testIdentity,
} from '../../scripts/gate/testIdentity.mjs'

/**
 * The gate's test-identity function, pinned.
 *
 * Why this test lives under `src/`: `vitest.config.ts` includes only
 * `src/**\/*.test.ts(x)`, so a test beside the script it covers would simply
 * never run. Putting it here means the gate's own vitest run executes it, and
 * therefore `npm run gate` fails if this regresses. The alternative — widening
 * the include to `scripts/**` — would put a second test root in a project whose
 * include is documented as the reason the old absolute-path bug was invisible,
 * and `tsconfig.app.json` only covers `src`, so a test there would not be
 * typechecked by the gate's first check either.
 *
 * Why it imports from `scripts/`, not from `gate.mjs`: `gate.mjs` runs checks
 * and calls `process.exit` as a side effect of being imported, so it is not
 * importable from a test. The identity rules were extracted into
 * `scripts/gate/testIdentity.mjs` — a module with no side effects, no I/O, and
 * no dependency on anything but `node:path`. `gate.mjs` now imports it, so this
 * test and the gate run the same code rather than a copy of it. A test that
 * reimplemented the rule would pass while the gate drifted.
 *
 * The bug this exists to prevent: `repoRelative` used to search the path for the
 * last `/src/` and, failing that, return the path unshortened. The baseline
 * recorded before that fix held absolute Windows paths, so on Linux CI all 835
 * tests read as *removed* and the deletion check failed on every push. The fix
 * was verified by hand, in a scratch file, which is gone. These are the cases
 * that verification covered plus the ones it missed.
 */

const WINDOWS_ROOT = 'C:/Users/janasco/Documents/OpencodeProject/Kami'
const LINUX_ROOT = '/home/runner/work/kami/kami'

describe('repoRelative', () => {
  it('shortens a Windows absolute path to a repo-relative POSIX path', () => {
    expect(repoRelative(`${WINDOWS_ROOT}/src/lib/x.test.ts`, WINDOWS_ROOT)).toBe('src/lib/x.test.ts')
  })

  it('shortens a Linux absolute path to the same identity', () => {
    expect(repoRelative(`${LINUX_ROOT}/src/lib/x.test.ts`, LINUX_ROOT)).toBe('src/lib/x.test.ts')
  })

  it('gives the same file the same identity on both platforms', () => {
    // The property the whole baseline depends on: one test, one identity,
    // whatever machine ran it. Asserted as equality rather than as two literals
    // so the two platform cases above cannot be edited apart.
    const windows = testIdentity(`${WINDOWS_ROOT}/src/components/Flowboard.test.ts`, 'a describe > a test', WINDOWS_ROOT)
    const linux = testIdentity(`${LINUX_ROOT}/src/components/Flowboard.test.ts`, 'a describe > a test', LINUX_ROOT)
    expect(windows).toBe(linux)
    expect(windows).toBe(`src/components/Flowboard.test.ts${IDENTITY_SEPARATOR}a describe > a test`)
  })

  it('normalises backslashes, so a Windows report and a Windows checkout agree', () => {
    const backslashed = `${WINDOWS_ROOT}\\src\\lib\\x.test.ts`
    expect(repoRelative(backslashed, WINDOWS_ROOT)).toBe('src/lib/x.test.ts')
    expect(repoRelative(backslashed, WINDOWS_ROOT.replaceAll('/', '\\'))).toBe('src/lib/x.test.ts')
  })

  it('resolves against the root, not by searching for /src/', () => {
    // A checkout that is itself under a directory named `src`. Searching for the
    // last `/src/` here would return `src/Kami/src/lib/x.test.ts` — the
    // checkout's own directory, folded into the identity — and that string still
    // starts with `src/`, so the old "is it under src/" check would have
    // passed it. It is machine-specific and looks portable, which is the worst
    // of both, and it is the case a hand verification with a normal checkout
    // path cannot reach.
    const root = '/home/src/Kami'
    expect(repoRelative(`${root}/src/lib/x.test.ts`, root)).toBe('src/lib/x.test.ts')
    expect(nonPortableIdentities([testIdentity(`${root}/src/lib/x.test.ts`, 't', root)])).toEqual([])
  })

  it('does not treat a nested src directory inside the repo as the repo root', () => {
    // Same hazard from the other side: `src/` appearing *after* the root must
    // not be mistaken for the root itself, or a real path loses its prefix.
    const root = '/home/runner/work/kami/kami'
    expect(repoRelative(`${root}/src/test/src/lib/x.test.ts`, root)).toBe('src/test/src/lib/x.test.ts')
  })

  it('is case-insensitive about the Windows path, which vitest can re-case', () => {
    // `fileURLToPath` and the JSON report do not always agree on the casing of
    // the checkout directory, and a case-sensitive compare would call a file that
    // is plainly inside the checkout "outside" it.
    expect(repoRelative('c:/users/janasco/documents/opencodeproject/kami/src/lib/x.test.ts', WINDOWS_ROOT))
      .toBe('src/lib/x.test.ts')
  })

  it('ignores a trailing separator on the root', () => {
    expect(repoRelative(`${LINUX_ROOT}/src/lib/x.test.ts`, `${LINUX_ROOT}/`)).toBe('src/lib/x.test.ts')
  })

  describe('a test file outside src/', () => {
    // The decision, stated as a test: a file inside the checkout but outside
    // `src/` gets a real repo-relative identity, and a file outside the
    // checkout is an error. It is deliberately not "return the path as given",
    // which is what the old fallback did and what made such a test invisibly
    // deletable on every machine but the one that recorded it.
    const root = LINUX_ROOT

    it('names a file inside the checkout but outside src/ by its repo-relative path', () => {
      expect(repoRelative(`${root}/scripts/gate/x.test.ts`, root)).toBe('scripts/gate/x.test.ts')
      expect(repoRelative(`${root}/vitest.config.ts`, root)).toBe('vitest.config.ts')
    })

    it('gives that identity the same protection as one under src/', () => {
      // A test outside `src/` is still a test the deletion check must see, so
      // its identity must compare equal across machines like any other.
      const windowsRoot = 'C:/src/Kami'
      const identity = testIdentity(`${root}/scripts/gate/x.test.ts`, 't', root)
      const fromWindows = testIdentity(`${windowsRoot}\\scripts\\gate\\x.test.ts`, 't', windowsRoot)
      expect(identity).toBe(fromWindows)
      expect(nonPortableIdentities([identity])).toEqual([])
    })

    it('throws rather than returning a machine-specific identity for a file outside the checkout', () => {
      // Failing loudly is the point. The alternatives were both worse: returning
      // the absolute path (the original bug — portable-looking on one machine,
      // wrong on every other) and inventing a synthetic prefix (a string that
      // collides with a real path and would hide a genuine move).
      // A sibling checkout.
      expect(() => repoRelative('/home/runner/work/other/kami/src/lib/x.test.ts', root)).toThrow(TestIdentityError)
      // A different Windows drive, which `path.win32.relative` answers with an
      // absolute path rather than a `..` chain.
      expect(() => repoRelative('D:/elsewhere/src/lib/x.test.ts', WINDOWS_ROOT)).toThrow(TestIdentityError)
      // Climbing out of the checkout. Note the direction: `src/../x` normalises
      // back *inside* and is legitimately answerable, so it is `../x` that must
      // be refused. A test that got this backwards would reject valid paths and
      // look strict while doing it.
      expect(() => repoRelative(`${root}/../outside.test.ts`, root)).toThrow(TestIdentityError)
      expect(repoRelative(`${root}/src/lib/../x.test.ts`, root)).toBe('src/x.test.ts')
      // The root itself is not a test file.
      expect(() => repoRelative(root, root)).toThrow(TestIdentityError)
    })

    it('says which file and why, so the gate failure names the path', () => {
      let thrown: unknown
      try {
        repoRelative('/home/runner/work/other/kami/src/lib/x.test.ts', root)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(TestIdentityError)
      const error = thrown as TestIdentityError
      expect(error.file).toBe('/home/runner/work/other/kami/src/lib/x.test.ts')
      expect(error.message).toContain('not inside the checkout')
      expect(error.message).toContain(root)
    })

    it('rejects an empty or non-string path instead of shortening it to nonsense', () => {
      expect(() => repoRelative('', root)).toThrow(TestIdentityError)
      expect(() => repoRelative(`${root}/src/lib/x.test.ts`, '')).toThrow(TestIdentityError)
      expect(() => repoRelative(undefined as unknown as string, root)).toThrow(TestIdentityError)
    })
  })
})

describe('identityFile', () => {
  it('recovers the file half, which is what the portability check reads', () => {
    expect(identityFile(`src/lib/x.test.ts${IDENTITY_SEPARATOR}describe > it`)).toBe('src/lib/x.test.ts')
  })

  it('keeps only the first separator, so a " :: " inside a test name cannot fool it', () => {
    // describe > it is how vitest joins a suite and a case; a test named with a
    // literal " :: " would otherwise shift the boundary and hide the real file.
    expect(identityFile(`src/lib/x.test.ts${IDENTITY_SEPARATOR}a${IDENTITY_SEPARATOR}b`)).toBe('src/lib/x.test.ts')
  })
})

describe('nonPortableIdentities', () => {
  it('accepts every identity the gate can now produce', () => {
    const identities = [
      `src/lib/x.test.ts${IDENTITY_SEPARATOR}a`,
      `scripts/gate/x.test.ts${IDENTITY_SEPARATOR}b`,
      `src/components/Flowboard.test.tsx${IDENTITY_SEPARATOR}describe > c`,
    ]
    expect(nonPortableIdentities(identities)).toEqual([])
  })

  it('flags an identity that still embeds a Windows absolute path', () => {
    // The recorded state before the fix: this is what made all 835 tests look
    // removed on Linux CI.
    const absolute = `C:/Users/janasco/Documents/OpencodeProject/Kami/src/lib/x.test.ts${IDENTITY_SEPARATOR}a`
    expect(nonPortableIdentities([absolute])).toEqual([absolute])
  })

  it('flags a Linux absolute path for the same reason', () => {
    const absolute = `/home/runner/work/kami/kami/src/lib/x.test.ts${IDENTITY_SEPARATOR}a`
    expect(nonPortableIdentities([absolute])).toEqual([absolute])
  })

  it('flags a backslash path left unnormalised', () => {
    const unnormalised = `src\\lib\\x.test.ts${IDENTITY_SEPARATOR}a`
    expect(nonPortableIdentities([unnormalised])).toEqual([unnormalised])
  })

  it('flags a path that escapes the root with ..', () => {
    const escaping = `../elsewhere/x.test.ts${IDENTITY_SEPARATOR}a`
    expect(nonPortableIdentities([escaping])).toEqual([escaping])
  })

  it('flags a missing file half rather than treating it as portable', () => {
    const empty = `${IDENTITY_SEPARATOR}a`
    expect(nonPortableIdentities([empty])).toEqual([empty])
  })

  it('cannot be fooled by a test name, only by the file half', () => {
    // The check reads the file half, so a test name containing anything at all
    // is irrelevant. Asserted because a future "just grep the string" shortcut
    // would fail this and pass everything else in the file.
    const clean = `src/lib/x.test.ts${IDENTITY_SEPARATOR}C:/Users/someone/else.ts`
    expect(nonPortableIdentities([clean])).toEqual([])
  })
})
