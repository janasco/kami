import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { JSDOM } from 'jsdom'

/**
 * Read a stylesheet and expose its declarations structurally.
 *
 * Why this exists
 * ---------------
 * The suite used to assert on stylesheets by reading the file and regexing the
 * raw text:
 *
 *     expect(css).toContain('.flowboard-drawer__panel {\n  display: flex;')
 *
 * That asserts on *formatting*, not on behaviour, and it breaks for reasons that
 * have nothing to do with the code:
 *
 *  - a CRLF checkout (no `.gitattributes`) failed three of these on line
 *    endings alone;
 *  - reindenting the block, collapsing the selector onto one line, or
 *    reordering the declarations all fail it;
 *  - `[\s\S]*?` between a selector and a property matches across rule
 *    boundaries, so several of them could pass while asserting nothing.
 *
 * Parsing with a real CSS parser fixes all of that. The assertions below are
 * about "this selector declares this property", which is what the test actually
 * meant, and they survive reformatting, reordering, and line-ending changes.
 *
 * What it still cannot do
 * -----------------------
 * jsdom has no layout engine. These helpers verify that a *declaration exists*,
 * not that a browser would *compute* a particular result. A test that needs
 * real geometry has to be a behaviour test in the `dom` project, not a
 * stylesheet assertion here.
 */

export interface Stylesheet {
  /** Every declaration for `selector`, merged across all rules that match it. */
  declarations(selector: string): Record<string, string>
  /** The value of one property on `selector`, or `undefined` if undeclared. */
  value(selector: string, property: string): string | undefined
  /** Whether any rule declares anything for `selector`. */
  hasRule(selector: string): boolean
  /** Every selector in scope that contains `needle`, for "is this styled at all". */
  selectorsContaining(needle: string): string[]
  /** Every at-rule prelude in scope, e.g. `(max-width: 1199px)`. */
  mediaConditions(): string[]
  /** A view scoped to the rules inside the first at-rule matching `condition`. */
  withinMedia(condition: string): Stylesheet
  /** Every rule body in scope, for the rare "is this rule present at all" check. */
  raw(): string
  /**
   * The original text. Only for the region-scoped assertions that have to be
   * anchored to a comment banner, which is line-ending agnostic because it
   * matches the comment string and not a newline.
   */
  source(): string
}

interface Rule {
  selectorText: string
  style: {
    length: number
    item(i: number): string
    getPropertyValue(p: string): string
  }
}

const repoRoot = (() => {
  let dir = process.cwd()
  for (let i = 0; i < 12; i += 1) {
    try {
      readFileSync(resolve(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return process.cwd()
})()

/** Read a stylesheet by a path relative to the repository root. */
export function parseStylesheet(relativePath: string): Stylesheet {
  const absolute = resolve(repoRoot, relativePath)
  const source = readFileSync(absolute, 'utf8')
  return build(source)
}

/** Parse stylesheet text that is already in hand. */
export function parseStylesheetSource(source: string): Stylesheet {
  return build(source)
}

function build(source: string): Stylesheet {
  const dom = new JSDOM(`<!doctype html><html><head><style>${source}</style></head><body></body></html>`)
  const sheet = dom.window.document.styleSheets[0]
  return view(Array.from(sheet.cssRules) as unknown as Rule[], source)
}

function view(rules: Rule[], text: string): Stylesheet {
  const styleRules = rules.filter((r) => typeof r.selectorText === 'string')

  const matching = (selector: string) =>
    styleRules.filter((r) =>
      r.selectorText
        .split(',')
        .map((s) => s.trim())
        .includes(selector),
    )

  return {
    declarations(selector: string) {
      const out: Record<string, string> = {}
      for (const rule of matching(selector)) {
        for (let i = 0; i < rule.style.length; i += 1) {
          const prop = rule.style.item(i)
          out[prop] = rule.style.getPropertyValue(prop)
        }
      }
      return out
    },

    value(selector: string, property: string) {
      return this.declarations(selector)[property]
    },

    hasRule(selector: string) {
      return matching(selector).length > 0
    },

    selectorsContaining(needle: string) {
      return styleRules
        .flatMap((r) => r.selectorText.split(',').map((s) => s.trim()))
        .filter((s) => s.includes(needle))
    },

    mediaConditions() {
      return rules
        .filter((r) => typeof (r as { cssText?: string }).cssText === 'string' && (r as { type?: number }).type === 4)
        .map((r) => (r as unknown as { conditionText?: string }).conditionText ?? '')
        .filter(Boolean)
    },

    withinMedia(condition: string) {
      const found = rules.find(
        (r) => (r as { type?: number }).type === 4 && (r as unknown as { conditionText?: string }).conditionText === condition,
      )
      if (!found) return view([], text)
      const inner = Array.from((found as unknown as { cssRules: Rule[] }).cssRules)
      return view(inner, text)
    },

    raw() {
      return rules.map((r) => (r as unknown as { cssText: string }).cssText).join('\n')
    },

    source() {
      return text
    },
  }
}
