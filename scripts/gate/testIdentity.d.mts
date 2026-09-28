/**
 * Types for `testIdentity.mjs`.
 *
 * The implementation is plain JavaScript because `scripts/gate.mjs` runs it
 * directly under `node` with no build step, and the gate's own typecheck
 * (`tsconfig.app.json`) is the only thing that sees a test importing it — that
 * test is `src/gate/repoRelative.test.ts`. This declaration is what lets
 * `tsc -b` see through the import instead of failing with TS7016.
 *
 * Hand-written rather than generated, so it carries the same intent as the
 * implementation: a path that cannot be made repo-relative is an error, never a
 * fallback. Keep the two in step — the test in `src/gate/` asserts the runtime
 * behaviour, and this file is what makes a signature change a compile error
 * rather than a silent `any`.
 */

/** What separates the file part of an identity from the test's name. */
export const IDENTITY_SEPARATOR: string

/**
 * A test file whose path could not be turned into a portable identity.
 *
 * Carries the offending path so the caller can name it in the failure rather
 * than print a generic "something is wrong with the baseline".
 */
export declare class TestIdentityError extends Error {
  constructor(file: string, reason: string)
  /** The path that could not be resolved, verbatim. */
  readonly file: string
}

/**
 * The test's file, as a repo-relative POSIX path.
 *
 * Throws {@link TestIdentityError} rather than returning anything at all when
 * the path is not inside the checkout, or when either argument is not a
 * non-empty string. There is no unshortened fallback, on purpose.
 */
export declare function repoRelative(file: string, root: string): string

/** The file half of an identity, i.e. everything before the separator. */
export declare function identityFile(identity: string): string

/** One identity, as recorded in `scripts/gate/baseline.json`. */
export declare function testIdentity(file: string, testName: string, root: string): string

/** The identities that cannot be compared to a baseline recorded elsewhere. */
export declare function nonPortableIdentities(identities: readonly string[]): string[]
