/**
 * A test's identity, independent of where the machine happens to be.
 *
 * vitest reports absolute file paths, and the shape of that path is
 * platform-specific: `C:/Users/.../src/lib/x.test.ts` on Windows,
 * `/home/runner/work/kami/kami/src/lib/x.test.ts` on Linux. Recording those
 * verbatim meant the recorded baseline could only ever be compared on the
 * machine that produced it — on CI every single recorded test would have looked
 * removed, and the check that exists to stop a test being deleted would instead
 * have failed on a rename of the checkout directory.
 *
 * So the identity is the repo-relative path, POSIX-normalised, plus the test's
 * full name, and the repo-relative part is resolved against the checkout root
 * rather than by looking for `/src/` inside the path.
 *
 * Why the root and not `/src/`
 * -----------------------------
 * Searching the path for the last `/src/` is ambiguous the moment the checkout
 * is not itself at the root of a drive. A checkout at `/home/src/kami` with a
 * test at `/home/src/kami/lib/x.test.ts` has no `src/` in its repo-relative path
 * at all, and the search returns `src/kami/lib/x.test.ts` — the checkout's own
 * directory, presented as though it were part of the project. That is a
 * machine-specific identity that *looks* portable, which is the worst of both,
 * and it is the exact failure this file exists to prevent. Resolving against
 * the root has no such case: it either produces a path relative to the checkout
 * or there is nothing to produce.
 *
 * And what happens when there is nothing to produce is a throw, not a fallback
 * ---------------------------------------------------------------------------
 * The old fallback returned the path unshortened, which is the whole absolute
 * path and therefore machine-specific again: a test living outside `src/` would
 * be recorded with an absolute path, would compare equal only on the machine
 * that recorded it, and would be *invisibly deletable* on every machine —
 * deleting it would look like "an added/removed pair" at best and would corrupt
 * a subsequent `--update` at worst. Returning something that still looks like an
 * identity is precisely how that stays invisible, so a caller that cannot name a
 * test portably is told so instead.
 *
 * Why this is its own file
 * ------------------------
 * Because the gate is a script that runs checks, and this is the function the
 * gate trusts most and had no test for at all. `src/gate/repoRelative.test.ts`
 * covers it; see that file for the cases that matter.
 */

import path from 'node:path'

/** What separates the file part of an identity from the test's name. */
export const IDENTITY_SEPARATOR = ' :: '

/**
 * A test file whose path could not be turned into a portable identity.
 *
 * Carries the offending path so the caller can name it in the failure rather
 * than print a generic "something is wrong with the baseline".
 */
export class TestIdentityError extends Error {
  /**
   * @param {string} file The path that could not be resolved, verbatim.
   * @param {string} reason
   */
  constructor(file, reason) {
    super(`cannot give "${file}" a portable test identity: ${reason}`)
    this.name = 'TestIdentityError'
    this.file = file
  }
}

/** @param {string} value */
const toPosix = (value) => value.replace(/\\/g, '/')

/**
 * Windows path rules, chosen from the shape of the string rather than the host.
 *
 * `path.win32` is pure string arithmetic, so asking it to resolve a
 * `C:\...` path on a Linux runner gives the same answer it gives on a Windows
 * laptop. That is what lets one test assert both shapes on one machine, and it
 * is also what makes case-insensitive comparison (`C:` vs `c:`, `Users` vs
 * `users`) the right rule for a path vitest may have re-cased in transit.
 *
 * @param {string} value
 */
const windowsShaped = (value) => /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\')

/**
 * The test's file, as a repo-relative POSIX path.
 *
 * Throws {@link TestIdentityError} rather than returning anything at all when
 * the path is not inside the checkout, or when either argument is not a
 * non-empty string. There is no unshortened fallback, on purpose; see the file
 * header.
 *
 * @param {string} file
 * @param {string} root
 * @returns {string}
 */
export const repoRelative = (file, root) => {
  if (typeof file !== 'string' || file === '' || typeof root !== 'string' || root === '') {
    throw new TestIdentityError(String(file), 'the path or the checkout root is not a non-empty string')
  }
  const rules = windowsShaped(file) || windowsShaped(root) ? path.win32 : path.posix
  const relative = toPosix(rules.relative(root, file))
  // Empty means the file *is* the root. `..`, a `..`-prefixed path, or a
  // remaining absolute path (which is how win32.relative answers a different
  // drive) all mean the file is somewhere else entirely.
  if (relative === '') {
    throw new TestIdentityError(file, 'it is the checkout root itself, not a file inside it')
  }
  if (relative === '..' || relative.startsWith('../') || rules.isAbsolute(relative)) {
    throw new TestIdentityError(file, `it is not inside the checkout at ${toPosix(root)}`)
  }
  return relative
}

/**
 * The file half of an identity, i.e. everything before the separator.
 *
 * @param {string} identity
 * @returns {string}
 */
export const identityFile = (identity) => identity.slice(0, identity.indexOf(IDENTITY_SEPARATOR))

/**
 * One identity, as recorded in `scripts/gate/baseline.json`.
 *
 * @param {string} file
 * @param {string} testName
 * @param {string} root
 * @returns {string}
 */
export const testIdentity = (file, testName, root) => `${repoRelative(file, root)}${IDENTITY_SEPARATOR}${testName}`

/**
 * True when a file part still says where the machine is.
 *
 * The old check was "does this start with `src/`", which was a proxy for
 * "is this portable" and wrong in both directions: it passed a path like
 * `src/kami/lib/x.test.ts` (the checkout's own `src` directory, machine-specific)
 * and failed a perfectly portable `scripts/gate/x.test.ts`. This is the real
 * definition instead — relative, no drive, no backslashes, no `..`.
 *
 * @param {string} file
 * @returns {boolean}
 */
const isPortableRepoPath = (file) =>
  file !== ''
  && !file.startsWith('/')
  && !/^[A-Za-z]:\//.test(file)
  && !file.includes('\\')
  && !file.split('/').includes('..')

/**
 * The identities that cannot be compared to a baseline recorded elsewhere.
 *
 * A second net, not the only one: {@link repoRelative} refuses to build such an
 * identity at all. This catches an identity that arrived some other way — a
 * baseline hand-edited, or one written by an older gate — because a comparison
 * against those is meaningless in both directions, and reporting a confident
 * wrong answer is what this whole check exists to avoid.
 *
 * @param {readonly string[]} identities
 * @returns {string[]}
 */
export const nonPortableIdentities = (identities) =>
  identities.filter((identity) => !isPortableRepoPath(identityFile(identity)))
