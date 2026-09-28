/**
 * Reconciliation: a deck must survive a save/load round trip unchanged.
 *
 * Why this is the anchor, and not "the tests pass"
 * -------------------------------------------------
 * "All tests pass" is a weak done-criterion, because it can be satisfied by
 * loosening an assertion, stubbing a failure, or deleting the test that was
 * annoying. Every one of those is green.
 *
 * This check cannot be satisfied that way. It runs the app's real parse and
 * serialise code and compares the bytes. To make it pass you would have to
 * change what the document *is* — which means changing the schema, the
 * migration, or the serializer, and all three are visible to the other checks.
 *
 * What the invariant actually is
 * ------------------------------
 * The property the project commits to in writing is that "an untouched deck
 * still serializes byte-identically". That is a statement about the *serializer
 * being idempotent*, not about matching the file on disk:
 *
 *     serialize(parse(serialize(p))) === serialize(p)
 *
 * It is deliberately not "the checked-in file equals the serializer output".
 * `screenshot-studio.json` is a hand-authored document that omits every optional
 * field, so the serializer legitimately expands it — 162 lines on disk become
 * 633 canonical lines. Demanding they match would be asserting that nobody ever
 * hand-writes a project, which is not true and not the promise. What must hold is
 * that opening a project and saving it again is a *fixed point*: the second save
 * is identical to the first, so a user's Git history does not churn every time
 * they open the editor.
 *
 * That is the thing a rewrite endangers. A field added to the restore path but
 * not the serializer, or a migration that is not idempotent, shows up here as a
 * byte diff rather than as a passing test.
 *
 * Coverage: the tracked project, all six templates, and the demo project. A bug
 * that only affects a template with no captures, or only the demo deck, would
 * slip past a check that only looked at one document.
 *
 * It lives outside the vitest run on purpose. As a test it would be one green
 * tick among 752, and "the tests are green" is the claim this is meant to be
 * independent of. Run by `scripts/gate.mjs`, its exit code is the verdict.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseProjectDocument, serializeProject, type ProjectFile } from '../../src/lib/project'
import { projectTemplates, createSlidesFromProjectTemplate } from '../../src/lib/projectTemplates'
import { createDemoProject } from '../../src/lib/demoProject'

/** The format the download button writes. Must match App.tsx exactly. */
const formatProjectDocument = (file: ProjectFile): string => `${JSON.stringify(file, null, 2)}\n`

/**
 * Nothing is excluded from the comparison any more.
 *
 * This check used to delete the document's `revision` block before diffing,
 * because `serializeProject` hardcoded `revision.number = 1` and stamped
 * `revision.createdAt = new Date()`, so the field moved on every save. That
 * exclusion was a permanent hole in the strongest check in the gate: it proved
 * 633 of 634 lines were a fixed point and quietly let the one volatile line
 * through — and it invited the next volatile field to be exempted the same way.
 *
 * `revision` is gone. The comparison is now full-byte, which is the point: a
 * document whose save is not a pure function of its content will fail here, and
 * nothing in the format is allowed to be unstable any more.
 */

/**
 * Stop the run, loudly, and exit non-zero.
 *
 * The explicit type annotation on the *variable* is load-bearing, not decoration.
 * TypeScript only treats a call as a control-flow terminator when the callee is an
 * identifier carrying an explicit type annotation whose return type is `never`.
 * Written as `const fail = (...): never => {}` the annotation sits on the arrow
 * function, the variable's own type is inferred, and every `if (!result.ok) fail(...)`
 * below stops narrowing — so the code after it reached into the *error* arm of a
 * discriminated union. That is exactly the class of mistake a gate must not make,
 * and it was only visible once `scripts/` entered `tsconfig`.
 *
 * Being in the tsconfig is what puts this file under `tsc`; it is not what
 * typechecks what runs. `scripts/gate.mjs` bundles this file with esbuild and
 * executes the bundle, and esbuild erases `import type` without reading it — so
 * the gate compares esbuild's metafile against `tsc --listFiles` and fails the
 * round-trip check if the bundle contains a file no tsconfig covers. Without
 * that, "this file is typechecked" would be a claim about a source file rather
 * than about the thing being executed.
 */
const fail: (message: string, detail?: string) => never = (message, detail) => {
  process.stdout.write(`  round trip FAILED: ${message}\n`)
  if (detail) process.stdout.write(`${detail}\n`)
  process.exit(1)
}

const firstDifference = (a: string, b: string): string => {
  const left = a.split('\n')
  const right = b.split('\n')
  const at = left.findIndex((line, i) => line !== right[i])
  return (
    `    first difference on line ${at + 1}\n` +
    `    before: ${left[at] ?? '<end of file>'}\n` +
    `    after:  ${right[at] ?? '<end of file>'}\n` +
    `    line count ${left.length} -> ${right.length}`
  )
}

/**
 * Assert that serialise is a fixed point for this project: saving what was just
 * loaded produces exactly the bytes that were saved.
 */
const reconcile = (label: string, project: Parameters<typeof serializeProject>[0]): string => {
  const canonical = formatProjectDocument(serializeProject(project))
  const reparsed = parseProjectDocument(canonical)
  if (!reparsed.ok) fail(`${label} did not re-parse`, `    ${reparsed.error}`)
  const again = formatProjectDocument(serializeProject(reparsed.project))

  if (again !== canonical) {
    fail(`${label} is not a fixed point after one round trip`, firstDifference(canonical, again))
  }
  return canonical
}

// ---------------------------------------------------------------------------
// 1. The tracked project, read from disk through the real parse path.
// ---------------------------------------------------------------------------
const trackedPath = resolve(process.cwd(), 'screenshot-studio.json')
const readTracked = (): string => {
  try {
    return readFileSync(trackedPath, 'utf8')
  } catch (error) {
    return fail('screenshot-studio.json could not be read', error instanceof Error ? error.message : undefined)
  }
}
const trackedText = readTracked()

const tracked = parseProjectDocument(trackedText)
if (!tracked.ok) {
  fail(
    'screenshot-studio.json did not parse',
    `    ${tracked.error}\n` + (tracked.issues ?? []).map((i) => `    - ${JSON.stringify(i)}`).join('\n'),
  )
}
// `ValidationReport` is `{ valid, issues }`. This used to test `.ok`, which does
// not exist, and then cast the report to reach `.issues` — so `validity === false`
// could never have been true and the check was inert.
if (!tracked.validation.valid) {
  const issues = tracked.validation.issues
  fail(
    `screenshot-studio.json reported ${issues.length} validation issue(s) on read`,
    issues.map((i) => `    - ${JSON.stringify(i)}`).join('\n'),
  )
}

const trackedCanonical = reconcile('screenshot-studio.json', tracked.project)
process.stdout.write('  ok  screenshot-studio.json round-trips to a fixed point\n')

// Informational only: the tracked file is hand-authored and omits optional
// fields, so it is normally *not* already canonical. Worth seeing, not worth
// failing over.
const trackedIsCanonical = trackedCanonical === trackedText
process.stdout.write(
  `  --  screenshot-studio.json is ${trackedIsCanonical ? 'already' : 'not'} in canonical form ` +
    `(${trackedText.split('\n').length} lines on disk, ${trackedCanonical.split('\n').length} canonical)\n`,
)
if (!trackedIsCanonical) {
  const eol = trackedText.includes('\r\n') ? 'CRLF' : 'LF'
  process.stdout.write(`      tracked file uses ${eol} line endings\n`)
}

// ---------------------------------------------------------------------------
// 2. Every template, built by the app's own function. A bug that only affects a
//    template with no captures, or only a template with a device override, must
//    not slip through.
//
//    This used to hand-roll the slides from `template.slides`, reading
//    `slide.name`, `slide.layoutId`, and `slide.themeId` — none of which exist on
//    `ProjectTemplateSlide`, whose fields are `title`, `layout`, and `theme` — and
//    nesting the deck under a `project` key that `EditorProject` does not have.
//    Every wrong field was spread into the slide and quietly ignored, so the six
//    template checks were reconciling a deck that was really just the tracked
//    project's slides wearing new ids. They passed, and they were not testing the
//    templates. `createSlidesFromProjectTemplate` is what the editor calls, so the
//    gate now reconciles exactly what a user gets.
// ---------------------------------------------------------------------------
for (const template of projectTemplates) {
  const slides = createSlidesFromProjectTemplate(template)
  reconcile(`template "${template.id}"`, {
    ...tracked.project,
    name: template.projectName,
    slides,
    outputVariants: undefined,
  })
  process.stdout.write(`  ok  template "${template.id}" (${slides.length} slides) round-trips to a fixed point\n`)
}

// ---------------------------------------------------------------------------
// 3. The demo project, which is what a first-time visitor actually opens.
// ---------------------------------------------------------------------------
reconcile('demo project', createDemoProject())
process.stdout.write('  ok  demo project round-trips to a fixed point\n')

process.stdout.write(
  `  ${projectTemplates.length + 2} documents reconciled; serialisation is idempotent\n`,
)
