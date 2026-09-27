/**
 * The one asset path security boundary.
 *
 * This rule used to exist twice. `projectValidation.ts` rejected a `..` path
 * segment and the restore path in `project.ts` did not, so a hand-edited
 * document whose background pointed at `../../foo.png` was reported as unsafe
 * by the validator that runs first and then accepted by the restore that runs
 * after it — the divergence was invisible because neither copy was the truth.
 *
 * There is now one exported function and both call sites read it, so a rule
 * cannot be tightened in one place and left loose in the other.
 *
 * Intended semantics, in one sentence: a stored asset path is accepted only if
 * it is a non-empty string that carries no control character and no `..` path
 * segment, and — once it has survived those two — names one of the forms below.
 *
 * That is why the two scheme-independent checks run *first*. The allowlist
 * branches used to come first and `return true` before either check could run,
 * so `https://example.com/../secret.png` and a `data:` URL carrying a newline
 * were both accepted while this file promised they were not: the checks existed
 * and never executed. Order is part of this rule, not an implementation detail,
 * and the tests pin every branch interaction so a reordering fails.
 *
 * Why the pathological forms are refused everywhere rather than per branch: a
 * path with a control character or a parent-directory segment is never
 * something the editor writes, in any form. The editor writes a data URL it
 * just base64-encoded, a URL the user pasted, or a relative path inside the
 * bundle. Refusing those two shapes before deciding *which* allowlist branch
 * applies is one rule with no carve-outs to remember; a per-branch exception
 * would be four rules, and the next branch added would be the one that forgets.
 *
 * What is allowed, and why:
 *
 * - `data:image/(png|jpeg|webp|svg+xml);base64,` — the four types the editor
 *   imports and encodes inline, and nothing else. `data:text/html` would turn
 *   the JSON document into a script source, and an unlisted image type would be
 *   one the renderer cannot draw anyway.
 * - `http(s)://` and `blob:` — a capture pasted from a hosted URL, and the
 *   object URL an import creates before it is re-encoded.
 * - Anything else that survives the two checks below, which is a relative path
 *   inside the project folder.
 *
 * Rejected for every input, before any allowlist branch:
 *
 * - Any C0 control or DEL, which is how a newline is smuggled past a naive
 *   prefix check. Nothing this function allows can legitimately hold one.
 * - Any `..` segment, with either separator. A document travels between
 *   machines and a `..` path is only ever an escape from the bundle it was
 *   meant to describe. A name that merely contains dots, such as
 *   `my..hero.png`, is not a segment and stays allowed, and neither is `..`
 *   inside a query string. Base64 has no `.`, so this cannot reject a data URL
 *   the editor actually wrote.
 *
 * Rejected only if neither allowlist branch matched:
 *
 * - Any other scheme prefix. A relative path never has one, so its presence
 *   means the string is a URL the editor did not write. Whatever is left has
 *   no scheme, so it is accepted as a relative path inside the bundle.
 *
 * Known limits, stated here so the comment cannot drift from the code again:
 *
 * - The control-character rule is C0 plus DEL. C1 (U+0080-U+009F) and the
 *   Unicode line separators U+2028/U+2029 are not refused, and none of them
 *   splits a path or ends a `data:` prefix the way a newline does.
 * - `ANY_SCHEME_PREFIX` cannot tell a scheme from a Windows drive letter, so
 *   `C:\hero.png` is refused as a scheme rather than accepted as a path. That
 *   is the strict direction, and the editor never writes such a path.
 * - The data URL rule checks the mime prefix only. The payload is never
 *   decoded, so a document that claims `image/svg+xml` is believed about its
 *   bytes. That type is one of the four the editor imports, and the renderer
 *   draws these as images.
 */

/** The data URL mime types the editor and renderer both understand. */
const ALLOWED_DATA_URL = /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i

/** The only network schemes a stored path may name. */
const ALLOWED_NETWORK_URL = /^(?:https?:\/\/|blob:)/i

/** Any RFC 3986 scheme prefix, which a relative path never has. */
const ANY_SCHEME_PREFIX = /^[a-z][a-z\d+.-]*:/i

/** C0 controls and DEL. Not C1, not U+2028/U+2029 — see the known limits above. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/

/** Both separators, so a Windows-authored path is caught too. */
const PATH_SEPARATORS = /[\\/]/

/**
 * Whether a stored asset path may be used.
 *
 * The order below is the rule. `CONTROL_CHARACTER` and the `..` segment test
 * are scheme-independent and must run before either allowlist branch can
 * `return true`; the tests fail if these two lines are moved down.
 *
 * Never throws: a non-string is refused rather than passed to a regular
 * expression, so a hand-edited document cannot make the editor throw while it
 * is deciding whether to open.
 */
export const isSafeAssetPath = (path: unknown): path is string => {
  if (typeof path !== 'string' || path.length === 0) return false
  if (CONTROL_CHARACTER.test(path)) return false
  if (path.split(PATH_SEPARATORS).includes('..')) return false
  if (ALLOWED_DATA_URL.test(path)) return true
  if (ALLOWED_NETWORK_URL.test(path)) return true
  if (ANY_SCHEME_PREFIX.test(path)) return false
  return true
}
