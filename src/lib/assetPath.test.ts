import { describe, expect, it } from 'vitest'
import { isSafeAssetPath } from './assetPath'

/**
 * The two call sites this module replaces used to disagree.
 *
 * `projectValidation.ts` rejected a `..` path segment and `project.ts` did not,
 * so a hand-edited document with `../../foo.png` as an asset path was reported
 * as unsafe by the validator that runs first and accepted by the restore path
 * that runs after it. Both now read the one function below, and this file pins
 * every case both copies used to agree on *and* the one they disagreed on, so a
 * second copy cannot reappear and drift again.
 *
 * The `branch order` block that follows pins a second, subtler drift: the one
 * function existed and still did not enforce what its own comment promised,
 * because both allowlist branches returned `true` before the control-character
 * and `..` checks could run.
 */
describe('isSafeAssetPath', () => {
  it('accepts the four forms an editor actually writes', () => {
    expect(isSafeAssetPath('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isSafeAssetPath('data:image/jpeg;base64,/9j/4AAQSkZJRg=')).toBe(true)
    expect(isSafeAssetPath('data:image/webp;base64,UklGRhIAAABXRUJQ')).toBe(true)
    expect(isSafeAssetPath('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true)
    expect(isSafeAssetPath('https://cdn.example.com/hero.png')).toBe(true)
    expect(isSafeAssetPath('http://cdn.example.com/hero.png')).toBe(true)
    expect(isSafeAssetPath('blob:https://janasco.github.io/2f0c-4a11')).toBe(true)
    expect(isSafeAssetPath('hero.png')).toBe(true)
    expect(isSafeAssetPath('assets/hero.png')).toBe(true)
    expect(isSafeAssetPath('./assets/hero.png')).toBe(true)
  })

  it('is case-insensitive about the data URL mime type, as both copies were', () => {
    expect(isSafeAssetPath('DATA:IMAGE/PNG;BASE64,iVBORw0KGgo=')).toBe(true)
    expect(isSafeAssetPath('data:IMAGE/SVG+XML;base64,PHN2Zz48L3N2Zz4=')).toBe(true)
    expect(isSafeAssetPath('HTTPS://cdn.example.com/hero.png')).toBe(true)
  })

  it('rejects a scheme other than the four allowed ones', () => {
    expect(isSafeAssetPath('javascript:alert(1)')).toBe(false)
    expect(isSafeAssetPath('JavaScript:alert(1)')).toBe(false)
    expect(isSafeAssetPath('file:///etc/passwd')).toBe(false)
    expect(isSafeAssetPath('ftp://example.com/hero.png')).toBe(false)
    expect(isSafeAssetPath('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
    expect(isSafeAssetPath('data:image/gif;base64,R0lGODlhAQABAAAAACw=')).toBe(false)
  })

  it('rejects a control character anywhere in the path', () => {
    expect(isSafeAssetPath('hero\u0000.png')).toBe(false)
    expect(isSafeAssetPath('hero\n.png')).toBe(false)
    expect(isSafeAssetPath('hero\u001f.png')).toBe(false)
    expect(isSafeAssetPath('assets/hero\u0007.png')).toBe(false)
  })

  /**
   * The divergence. The restore path used to accept every one of these, so a
   * hand-edited document could point an asset outside the bundle and still open.
   */
  it('rejects a parent-directory segment, which is the case the two copies disagreed on', () => {
    expect(isSafeAssetPath('../../foo.png')).toBe(false)
    expect(isSafeAssetPath('../foo.png')).toBe(false)
    expect(isSafeAssetPath('assets/../../foo.png')).toBe(false)
    expect(isSafeAssetPath('assets\\..\\..\\foo.png')).toBe(false)
    expect(isSafeAssetPath('..\\foo.png')).toBe(false)
    expect(isSafeAssetPath('a/../../b')).toBe(false)
  })

  it('keeps a name that merely contains dots', () => {
    expect(isSafeAssetPath('my..hero.png')).toBe(true)
    expect(isSafeAssetPath('./..hidden/hero.png')).toBe(true)
    expect(isSafeAssetPath('assets/hero..png')).toBe(true)
  })

  it('rejects a non-string or empty value rather than throwing', () => {
    expect(isSafeAssetPath('')).toBe(false)
    expect(isSafeAssetPath(undefined as unknown as string)).toBe(false)
    expect(isSafeAssetPath(null as unknown as string)).toBe(false)
    expect(isSafeAssetPath(42 as unknown as string)).toBe(false)
    expect(isSafeAssetPath({} as unknown as string)).toBe(false)
    expect(isSafeAssetPath([] as unknown as string)).toBe(false)
  })

  /*
   * Branch order is part of the rule, and the rest of this file cannot see it.
   *
   * Every case below is one an allowlist branch used to return `true` for
   * before the control-character and `..` checks ever ran, while this module's
   * documentation claimed they were refused. The comment described a boundary
   * the code did not have. Intended semantics, in one sentence: a stored asset
   * path is accepted only if it is a non-empty string with no control character
   * and no `..` path segment, and then only if it names one of the four forms
   * the editor writes — which is why the two scheme-independent checks run
   * first.
   *
   * If someone moves either check below the allowlist branches, these fail.
   */
  describe('branch order', () => {
    it('refuses a `..` segment inside an https path, which the old order allowed', () => {
      expect(isSafeAssetPath('https://example.com/../secret.png')).toBe(false)
      expect(isSafeAssetPath('https://example.com/a/../../b.png')).toBe(false)
      expect(isSafeAssetPath('https://example.com/assets/..')).toBe(false)
      expect(isSafeAssetPath('https://example.com/a/../b/../c.png')).toBe(false)
    })

    it('refuses a `..` segment inside an http or blob path too', () => {
      expect(isSafeAssetPath('http://example.com/../secret.png')).toBe(false)
      expect(isSafeAssetPath('blob:https://janasco.github.io/../2f0c-4a11')).toBe(false)
      expect(isSafeAssetPath('https://cdn.example.com/..\\..\\hero.png')).toBe(false)
    })

    it('refuses a `..` segment inside a data URL, with either separator', () => {
      expect(isSafeAssetPath('data:image/png;base64,../../etc/passwd')).toBe(false)
      expect(isSafeAssetPath('data:image/png;base64,..\\..\\secret')).toBe(false)
      expect(isSafeAssetPath('data:image/svg+xml;base64,PHN2Zz4/../x')).toBe(false)
    })

    it('refuses a control character inside an https path, which the old order allowed', () => {
      expect(isSafeAssetPath('https://example.com/hero\n.png')).toBe(false)
      expect(isSafeAssetPath('https://exa\tmple.com/hero.png')).toBe(false)
      expect(isSafeAssetPath('https://example.com/hero\u0000.png')).toBe(false)
      expect(isSafeAssetPath('https://example.com/hero\u007f.png')).toBe(false)
    })

    it('refuses a control character inside a data URL, which the old order allowed', () => {
      expect(isSafeAssetPath('data:image/png;base64,iVBORw0KGgo=\n')).toBe(false)
      expect(isSafeAssetPath('data:image/svg+xml;base64,\tPHN2Zz48L3N2Zz4=')).toBe(false)
      expect(isSafeAssetPath('data:image/webp;base64,UklGRh\u0000IAAABXRUJQ')).toBe(false)
      expect(isSafeAssetPath('data:image/jpeg;base64,\u007f/9j/4AAQSkZJRg=')).toBe(false)
    })

    it('refuses a control character in a relative path with either separator', () => {
      expect(isSafeAssetPath('assets/hero\n.png')).toBe(false)
      expect(isSafeAssetPath('assets\\hero\t.png')).toBe(false)
      expect(isSafeAssetPath('\u0000assets/hero.png')).toBe(false)
      expect(isSafeAssetPath('assets/hero\u007f.png')).toBe(false)
    })

    it('refuses a `..` segment in a relative path with either separator', () => {
      expect(isSafeAssetPath('a/b/../../../c.png')).toBe(false)
      expect(isSafeAssetPath('a\\b\\..\\..\\..\\c.png')).toBe(false)
      expect(isSafeAssetPath('assets/./../hero.png')).toBe(false)
      expect(isSafeAssetPath('..')).toBe(false)
    })

    it('still allows the forms the editor writes, so the tightening costs nothing', () => {
      expect(isSafeAssetPath('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
      expect(isSafeAssetPath('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true)
      expect(isSafeAssetPath('https://cdn.example.com/hero.png')).toBe(true)
      expect(isSafeAssetPath('http://cdn.example.com/a.b.c/hero.png')).toBe(true)
      expect(isSafeAssetPath('blob:https://janasco.github.io/2f0c-4a11')).toBe(true)
      expect(isSafeAssetPath('assets/bg.png')).toBe(true)
    })

    it('keeps `..` allowed where it is not a segment', () => {
      // The rule is segment-based, not substring-based, so a name or a query
      // that merely holds two dots is not an escape from the bundle.
      expect(isSafeAssetPath('my..hero.png')).toBe(true)
      expect(isSafeAssetPath('https://cdn.example.com/hero..png')).toBe(true)
      expect(isSafeAssetPath('https://cdn.example.com/hero.png?rev=1..2')).toBe(true)
      expect(isSafeAssetPath('https://cdn.example.com/..hidden/hero.png')).toBe(true)
    })
  })

  /*
   * The two limits the module documents as known, pinned here so the comment
   * cannot quietly become wrong. Neither is a gap the editor can reach; they
   * are stated because "refuses anything unusual" would be a lie.
   */
  describe('documented limits', () => {
    it('does not refuse a C1 control or a Unicode line separator', () => {
      // Named in the known limits: C0 plus DEL only. Neither character splits a
      // path nor terminates a `data:` prefix, so nothing downstream depends on
      // it. If this ever starts failing, the comment must be updated instead.
      expect(isSafeAssetPath('hero\u0085.png')).toBe(true)
      expect(isSafeAssetPath('hero\u2028.png')).toBe(true)
    })

    it('reads a Windows drive letter as a scheme, and refuses it', () => {
      // `ANY_SCHEME_PREFIX` cannot tell `C:` from a scheme. Strict direction,
      // and the editor never writes one.
      expect(isSafeAssetPath('C:\\hero.png')).toBe(false)
    })
  })
})
