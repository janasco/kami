/**
 * kami-rewrite-gate
 * ================
 *
 * A deterministic judge for the editor rewrite. It runs the checks and exits
 * with a code. It does not decide what to build, and it never edits a test to
 * make itself pass.
 *
 * Why this exists
 * ---------------
 * A rewrite is judged on two very different questions, and only one of them can
 * be settled by a machine:
 *
 *   - "is the new editor better?"  -> human judgement. Not here. See STOP 1.
 *   - "did the rewrite break what worked?" -> decidable. This is the script.
 *
 * The suite's weak spot is exactly where a rewrite lands. Before this gate, the
 * 744 tests could not render React at all (`environment: 'node'`, no jsdom), the
 * interactive layer had no coverage, and 13 tests asserted on CSS source text
 * rather than behaviour. So "all tests pass" was a weak signal precisely on the
 * files a rewrite is most likely to change. This gate is only as strong as the
 * checks in it, which is why the checks are explicit and why STOP 1 exists.
 *
 * The exit code is the contract. If this script says 1, the rewrite is not
 * ready, whatever an agent believes about its own work.
 *
 * Usage
 * -----
 *   node scripts/gate.mjs            run every check
 *   node scripts/gate.mjs --update   re-record the baseline (a deliberate act)
 *   node scripts/gate.mjs --update --allow-removals N
 *                                    re-record, acknowledging that this run
 *                                    removes exactly N test(s)
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TestIdentityError, nonPortableIdentities, testIdentity } from './gate/testIdentity.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = resolve(root, 'scripts/gate/baseline.json')
const reportPath = resolve(root, 'scripts/gate/.run.json')
const bundlePath = resolve(root, 'scripts/gate/.roundtrip.mjs')
const metaPath = resolve(root, 'scripts/gate/.roundtrip-meta.json')

// ---------------------------------------------------------------------------
// The two flags, and the one thing that must not be a flag.
// ---------------------------------------------------------------------------
const updateBaseline = process.argv.includes('--update')
// Presence and value are read separately on purpose. A trailing `--allow-removals`
// with no value makes the value `undefined`, and testing the value alone would let
// that typo through as a plain `--update` — the one spelling of this flag that must
// never be mistaken for consent.
const allowRemovalsAt = process.argv.indexOf('--allow-removals')
const allowRemovalsRaw = allowRemovalsAt === -1 ? undefined : process.argv[allowRemovalsAt + 1]

/**
 * `--update` is the deletion check's own escape hatch, so it gets a receipt.
 *
 * `--update` overwrites the manifest that makes deleting a test a failure. Run
 * it after deleting a test file and the manifest forgets the deletion, which is
 * precisely what `no test removed or renamed` exists to prevent; the only thing
 * left catching it is the `test count` floor, so 121 of 744 tests could go
 * without anyone being told a single test was removed.
 *
 * The floor cannot be the fix, because `--update` has to be *able* to record a
 * lower number. A refactor that merges six tests into one, or deletes a module
 * along with its now-pointless coverage, is a legitimate act and refusing it
 * would push people back to hand-editing the baseline — which is strictly
 * worse, because a hand edit is invisible in the diff that records it. So the
 * gate distinguishes the two cases instead of the two numbers: a re-record that
 * loses no test needs no permission, and one that does needs the operator to
 * say how many it is losing.
 *
 * A count, not a `--yes`
 * ----------------------
 * A boolean says "I meant to delete tests" without saying which ones, so it
 * cannot notice that the delta is not the one you had in mind — and the delta is
 * the entire risk. A number is a claim about this specific run, so it stops
 * being true the moment the tree changes underneath it: approving 3 and then
 * deleting a fourth test fails again, which is the behaviour a tripwire should
 * have. It is also self-describing in a log, a shell history, and a PR body,
 * which is where the evidence of a deliberate deletion has to be.
 *
 * A prompt would be wrong here
 * ----------------------------
 * This script's contract is that the exit code says what happened, and a prompt
 * makes that depend on whether a human was watching: piped stdin answers EOF,
 * `--ci` and a CI runner have nobody to answer at all, and the failure mode of
 * the unattended case is a gate that hangs rather than a gate that refuses. The
 * flag has the same force and the same receipt wherever it is typed.
 */
const usageError = (problem) => {
  process.stderr.write(
    `\nGate not run: ${problem}\n\n` +
      '  node scripts/gate.mjs [--update [--allow-removals N]]\n\n' +
      '  --update            re-record scripts/gate/baseline.json\n' +
      '  --allow-removals N  acknowledge that this run removes exactly N test(s)\n',
  )
  process.exit(1)
}

let allowedRemovals
if (allowRemovalsAt !== -1) {
  if (!updateBaseline) usageError('--allow-removals only means something together with --update')
  if (allowRemovalsRaw === undefined || !/^\d+$/.test(allowRemovalsRaw)) {
    usageError(`--allow-removals takes a whole number of tests, got "${String(allowRemovalsRaw)}"`)
  }
  allowedRemovals = Number(allowRemovalsRaw)
  if (allowedRemovals === 0) usageError('--allow-removals 0 acknowledges nothing; leave the flag off instead')
}

/**
 * The boundary conditions, in code.
 *
 * Failure mode 3 of a goal that is only "all tests pass" is that the agent
 * deletes the failing test to win. These are the clauses that make that
 * unprofitable: a removed, renamed, or skipped test is a gate failure in its
 * own right, independent of whether the suite is green.
 */
const MIN_TEST_COUNT = 744

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  const mark = ok ? 'PASS' : 'FAIL'
  process.stdout.write(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}\n`)
}

const run = (label, command, args) => {
  process.stdout.write(`\n── ${label}\n`)
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, CI: 'true' },
  })
  return result.status === 0
}

/**
 * One line of `tsc --listFiles` output, as opposed to one line of a diagnostic.
 *
 * The file list is absolute paths and the diagnostics are cwd-relative, so the
 * two are separable without asking `tsc` to tell them apart. That has to be done:
 * a red typecheck that also printed the whole 769-entry file list would bury the
 * three errors that caused it, and this gate's output is read by people.
 */
const isListedFile = (line) => /^[A-Za-z]:[\\/]/.test(line) || line.startsWith('/')

/**
 * Run a check, keeping stdout instead of streaming it.
 *
 * Used for the typecheck only, and for one reason: check 4 needs the list of
 * files `tsc` actually typechecked, so it can refuse to run a bundle built from
 * anything else (see the round-trip step). `--listFiles` costs nothing on top of
 * a `tsc -b` that has to build its program either way, so this is not a second
 * typecheck — it is the same one, with the answer kept instead of thrown away.
 *
 * Output is buffered rather than inherited, and only the diagnostics are written
 * back when the check fails, so a red typecheck reads as it did before.
 */
const runCapturing = (label, command, args) => {
  process.stdout.write(`\n── ${label}\n`)
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, CI: 'true' },
    // `tsc` prints one absolute path per line for the whole program, and a
    // catastrophic failure can print a diagnostic per error. The default 1 MB
    // would turn "a lot of output" into ENOBUFS and a truncated file list.
    maxBuffer: 64 * 1024 * 1024,
  })
  const ok = result.status === 0 && !result.error
  const lines = (result.stdout ?? '').split(/\r?\n/)
  if (!ok) {
    process.stdout.write(lines.filter((line) => line.trim() && !isListedFile(line.trim())).join('\n') + '\n')
    process.stderr.write(result.stderr ?? '')
    if (result.error) process.stderr.write(`\n${result.error.message}\n`)
  }
  return { ok, listed: lines.map((line) => line.trim()).filter(isListedFile) }
}

/** One path as the two sides of a comparison both spell it. */
const comparePath = (file) => file.replace(/\\/g, '/').toLowerCase()

/**
 * Resolve tools from this checkout only, never from the registry.
 *
 * Plain `npx <tool>` silently downloads the tool if it is not in
 * `node_modules/.bin`, and it is *worse* in CI, where `CI=true` makes npm
 * answer yes to the install prompt instead of asking. So a missing dependency
 * would not fail the gate, it would run the newest version published that
 * minute and report the result as if it were the pinned one. For the round
 * trip that is the most damaging possible failure: the strongest check in the
 * gate would be executed by a tool the project never chose.
 *
 * `--offline` resolves the local binary and turns a missing one into a hard
 * ENOTCACHED error. (`--no-install` looks like the obvious spelling of this and
 * is not: npm 11 ignores it and fetches anyway.) Verified against a cold cache,
 * which is the condition on a fresh runner, where the local binary is all
 * there is.
 */
const npx = ['--offline', '--']

process.stdout.write('kami-rewrite-gate\n')

// ---------------------------------------------------------------------------
// 1. Types. A rewrite that does not compile is not a rewrite.
//
//    `--listFiles` is here for check 4, not for this check: the round trip runs
//    an esbuild bundle of a `.ts` file, and the file list is the only evidence
//    that what runs is what was checked. See the round-trip step.
// ---------------------------------------------------------------------------
const typecheck = runCapturing('typecheck', 'npx', [...npx, 'tsc', '-b', '--listFiles'])
const typecheckedFiles = new Set(
  typecheck.listed
    .filter((line) => line.endsWith('.ts') || line.endsWith('.tsx') || line.endsWith('.mts') || line.endsWith('.cts'))
    .map(comparePath),
)
record('tsc -b', typecheck.ok)

// ---------------------------------------------------------------------------
// 2. Tests, plus the test-integrity boundary.
// ---------------------------------------------------------------------------

/**
 * Delete the previous report *before* vitest runs, never after.
 *
 * `readRun()` below compares test names, and it reads `scripts/gate/.run.json` —
 * a file vitest writes and nothing else owns. vitest does not write that file
 * when it dies before the reporter runs: an OOM kill, a worker that segfaults, a
 * setup file that throws while the runner is still being constructed. In each of
 * those cases the file on disk is the *previous* run's, it parses, and it names a
 * full suite. The integrity check then compares yesterday's test list to the
 * recorded baseline and can report "all 835 baseline tests still present" about a
 * suite that never started. The `tests` check does exit non-zero in that case, so
 * the gate is red either way — but the verdict is being read off an artifact
 * nothing has confirmed belongs to this run, and a red gate that prints a
 * confident green sub-result teaches the next reader to skip the red one.
 *
 * A timestamp would be the softer version: write the start time, call any report
 * older than it stale. It is also wrong in a way that only shows up on someone
 * else's machine — mtime resolution is filesystem-dependent, and the test
 * compares two writes milliseconds apart using a clock the gate does not own.
 * Absence is unambiguous. If the report is there after the run, this run put it
 * there; if it is not, there is nothing to compare and the gate says so instead
 * of guessing.
 */
const startedAt = new Date().toISOString()
let clearedReport = true
try {
  rmSync(reportPath, { force: true, recursive: true })
} catch {
  clearedReport = false
}

const testsPassed = run('tests', 'npx', [...npx, 'vitest', 'run', '--reporter=json', `--outputFile=${reportPath}`, '--silent'])
record('tests', testsPassed)

const readRun = () => {
  if (!existsSync(reportPath)) return null
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * A test's identity, independent of where the machine happens to be.
 *
 * The rule, and the reasoning behind it, live in `./gate/testIdentity.mjs`,
 * which is where `src/gate/repoRelative.test.ts` tests it. The short version:
 * the identity is the repo-relative POSIX path plus the test's full name, and a
 * path that cannot be expressed relative to *this* checkout is an error rather
 * than an identity, because an identity that embeds `C:/Users/...` compares
 * equal only on the machine that recorded it and is invisibly deletable
 * everywhere else.
 */
const identityFor = (file, testName) => {
  try {
    return { identity: testIdentity(file, testName, root), error: null }
  } catch (error) {
    // Returned rather than pushed onto a module-level array, because the gate
    // walks this report twice — once to compare identities, once to print
    // failures — and a shared accumulator reports the same broken path once per
    // walk per call. It reads as correct today only because each walk happens to
    // be called exactly once, which is a property of the call site rather than
    // of this function, and the next caller gets double the errors.
    //
    // The identity is deliberately the unshortened path: it is the one thing
    // guaranteed to be rejected by `nonPortableIdentities` below, so the failure
    // is reported by the same check that catches a hand-edited baseline.
    return {
      identity: `${file} :: ${testName}`,
      error: error instanceof TestIdentityError ? error : new TestIdentityError(String(file), String(error)),
    }
  }
}

const currentTests = (report) => {
  const errors = []
  const tests = (report?.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? []).map((t) => {
      const { identity, error } = identityFor(file.name, t.fullName ?? t.title)
      if (error) errors.push(error)
      return identity
    }),
  )
  return { tests, errors }
}

/**
 * Diagnostics, not a check.
 *
 * The gate runs vitest with `--reporter=json --silent` and reads the machine
 * report rather than the console, which is what makes the baseline comparison
 * possible. The cost is that the familiar per-file output is gone, so a red run
 * in CI used to say only "tests: undefined". The report has the names and
 * messages, so print them. This records nothing and changes no exit code; it
 * only makes a failure legible.
 */
const failuresIn = (report) => {
  const errors = []
  const failures = (report?.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? [])
      .filter((t) => t.status && t.status !== 'passed')
      .map((t) => {
        const { identity, error } = identityFor(file.name, t.fullName ?? t.title)
        if (error) errors.push(error)
        return `  FAIL ${identity}\n${(t.failureMessages ?? []).join('\n')}`
      }),
  )
  return { failures, errors }
}

/**
 * The delta between the recorded baseline and this run, in full.
 *
 * `--update` overwrites the manifest that makes deleting a test a failure, so
 * the one thing a reader needs from it is the list of what it is about to
 * forget. `first: ...` — all the comparison path used to print — makes a bulk
 * deletion of 121 tests legible as "121 gone" and not as one arbitrary name, and
 * an operator who cannot see the list is the operator who approves it. So print
 * every name, in both directions, whenever the delta decides something.
 */
const printDelta = ({ removed, added }) => {
  if (removed.length) {
    process.stdout.write(`\n── baseline delta: ${removed.length} test(s) removed\n`)
    for (const name of removed) process.stdout.write(`  - ${name}\n`)
  }
  if (added.length) {
    process.stdout.write(`\n── baseline delta: ${added.length} test(s) added\n`)
    for (const name of added) process.stdout.write(`  + ${name}\n`)
  }
  if (!removed.length && !added.length) {
    process.stdout.write('\n── baseline delta: no test removed, none added\n')
  }
}

const run1 = readRun()
const { tests: current, errors: currentIdentityErrors } = currentTests(run1)
const { failures: failedTests, errors: failureIdentityErrors } = failuresIn(run1)
// The two walks visit the same tests, so one broken path is reported by both.
// Keyed on the message, which names the file and the reason — the whole of what
// is reported downstream.
const identityErrors = [...new Map([...currentIdentityErrors, ...failureIdentityErrors].map((e) => [e.message, e])).values()]
const after = new Set(current)
if (failedTests.length) {
  process.stdout.write(`\n${failedTests.length} failing test(s):\n${failedTests.join('\n')}\n`)
}

/**
 * A skipped test fails the gate.
 *
 * The manifest stops a test being *deleted*, and that is not enough, because
 * deleting one is the expensive way to neuter a suite. `it.skip` is free: the
 * test keeps its name, so the baseline comparison finds nothing missing; the
 * count does not move; and vitest exits 0. Proven against this gate — one test
 * marked `.skip` and the gate still reported 7/7 and printed "nothing that
 * worked has broken".
 *
 * That was a hole in a gate whose own comment claimed to close it, and it is the
 * cheapest possible version of the failure the gate exists to prevent: nothing
 * fails, nothing is flagged, and the check that should have noticed reports
 * green. It is enforced inside the `tests` check rather than as an eighth, since
 * "the suite is not entirely passing" is already that check's subject.
 *
 * `todo` is allowed, deliberately. `it.todo` is a written statement that a test
 * is not written yet, which is information; `.skip` is a written test switched
 * off, which is the loss of one.
 */
const disabledTests = (report) =>
  (report?.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? [])
      .filter((t) => t.status === 'pending' || t.status === 'skipped')
      .map((t) => identityFor(file.name, t.fullName ?? t.title).identity),
  )

const disabled = disabledTests(run1)
if (disabled.length) {
  process.stdout.write(`\n${disabled.length} disabled test(s):\n${disabled.map((n) => `  SKIP ${n}`).join('\n')}\n`)
  // Re-recorded below as a failure of the `tests` check, which is the check that
  // owns whether the suite ran. Doing it here rather than in `record` keeps the
  // report read in one place.
  results[results.findIndex((r) => r.name === 'tests')].ok = false
  results[results.findIndex((r) => r.name === 'tests')].detail =
    `${disabled.length} test(s) are skipped. A skipped test is a test that is not running, and the manifest cannot see that. Un-skip it, or mark it \`it.todo\` if it was never written.`
}

if (!current.length) {
  record(
    'test integrity',
    false,
    `the run that started at ${startedAt} wrote no report, so the baseline cannot be compared` +
      (clearedReport
        ? ''
        : ' — and scripts/gate/.run.json could not be cleared first, so what is on disk may be an older run'),
  )
} else {
  const count = run1.numTotalTests ?? current.length
  record('test count', count >= MIN_TEST_COUNT, `${count} tests, floor is ${MIN_TEST_COUNT}`)

  /**
   * What the recorded baseline says, and whether it can be read at all.
   *
   * `--update` needs it now: a re-record that cannot be compared to the file it
   * is replacing is not a re-record, it is a replacement. A corrupt baseline is
   * refused rather than overwritten, because the corrupt file is the only
   * remaining record of what it said.
   */
  const readBaseline = () => {
    if (!existsSync(baselinePath)) return { present: false, baseline: null, problem: null }
    try {
      return { present: true, baseline: JSON.parse(readFileSync(baselinePath, 'utf8')), problem: null }
    } catch (error) {
      return {
        present: true,
        baseline: null,
        problem: `scripts/gate/baseline.json is not readable JSON (${error instanceof Error ? error.message : String(error)})`,
      }
    }
  }

  if (updateBaseline) {
    // `--update` is the one path that *writes* identities, so it is the one path
    // where a bad identity is not merely a failed comparison but a corrupted
    // baseline that every machine then inherits. Refuse rather than record.
    const unportable = [...nonPortableIdentities(current), ...identityErrors.map((error) => error.message)]
    const { baseline: previous, problem } = readBaseline()
    const before = new Set(Array.isArray(previous?.tests) ? previous.tests : [])
    const removed = [...before].filter((name) => !after.has(name))
    const added = [...after].filter((name) => !before.has(name))
    printDelta({ removed, added })

    if (unportable.length) {
      record(
        'baseline re-recorded',
        false,
        `refusing to re-record: ${unportable.length} test(s) have no portable identity, so the baseline would only ` +
          `ever compare on the machine that wrote it. First: ${unportable[0]}`,
      )
    } else if (problem) {
      record('baseline re-recorded', false, `refusing to re-record over an unreadable baseline: ${problem}`)
    } else if (removed.length && allowedRemovals !== removed.length) {
      // The confirmation. A run that forgets nothing needs none, so `--update`
      // on an unchanged tree stays a single command with no argument to remember
      // and no output to read. A run that forgets something has to say how much
      // it is forgetting, out loud, with the names in front of the operator.
      const said =
        allowedRemovals === undefined
          ? 'no acknowledgement was given'
          : `--allow-removals ${allowedRemovals} acknowledged ${allowedRemovals} and this run removes ${removed.length}`
      record(
        'baseline re-recorded',
        false,
        `refusing to re-record: ${removed.length} test(s) in the recorded baseline are gone and ${said}. ` +
          'scripts/gate/baseline.json still lists them, so nothing has been forgotten and the deletion check is intact — ' +
          'but an unacknowledged deletion and a deliberate one are indistinguishable here, which is the whole risk. ' +
          'If the deletions above are intended, re-run with: node scripts/gate.mjs --update --allow-removals ' +
          `${removed.length}`,
      )
    } else {
      const sorted = current.slice().sort()
      // Re-recording an identical baseline writes a file that differs only in
      // `recordedAt`, which is a diff that means nothing and trains people to
      // distrust the manifest. Say it is already current and leave it alone.
      const alreadyCurrent =
        previous !== null
        && Array.isArray(previous.tests)
        && previous.tests.length === sorted.length
        && sorted.every((name, at) => previous.tests[at] === name)
        && previous.minTestCount === MIN_TEST_COUNT
      if (alreadyCurrent) {
        record('baseline re-recorded', true, `already current, ${count} tests, scripts/gate/baseline.json not rewritten`)
      } else {
        writeFileSync(baselinePath, `${JSON.stringify({ recordedAt: new Date().toISOString(), minTestCount: MIN_TEST_COUNT, testCount: count, tests: sorted }, null, 2)}\n`)
        const acknowledged = removed.length ? `, ${removed.length} removal(s) acknowledged with --allow-removals ${allowedRemovals}` : ''
        record('baseline re-recorded', true, `${count} tests written to scripts/gate/baseline.json${acknowledged}`)
      }
    }
  } else if (!existsSync(baselinePath)) {
    record(
      'test integrity',
      false,
      'scripts/gate/baseline.json is missing. Record it once with: node scripts/gate.mjs --update',
    )
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    const before = new Set(baseline.tests)
    const removed = [...before].filter((name) => !after.has(name))
    const added = [...after].filter((name) => !before.has(name))

    // A test whose identity still says where the checkout lives cannot be
    // compared to a baseline recorded anywhere else: the comparison is
    // meaningless in both directions, so refuse rather than report a confident
    // wrong answer. This shares the verdict slot with the removal check below,
    // so the gate still records exactly seven results.
    const unportable = [
      ...nonPortableIdentities(current),
      ...nonPortableIdentities([...before]),
      ...identityErrors.map((error) => error.message),
    ]

    if (unportable.length) {
      record(
        'no test removed or renamed',
        false,
        `${unportable.length} test(s) have a non-portable identity, so the baseline cannot be compared: ` +
          `${identityErrors.length ? identityErrors[0].message : unportable[0]}. ` +
          'An identity must be a repo-relative path (e.g. src/lib/x.test.ts) plus " :: " plus the test name; ' +
          'one that embeds the absolute checkout path only ever matches the machine that recorded it',
      )
    } else if (removed.length) {
      // A removed test is the failure mode this whole check exists for. A renamed
      // test shows up here as one removal plus one addition, so renaming cannot
      // quietly delete coverage either. Every name, not a sample: the operator
      // fixing this has to decide whether each one was supposed to go.
      printDelta({ removed, added })
      record(
        'no test removed or renamed',
        false,
        `${removed.length} baseline test(s) are gone, first: ${removed[0]}`,
      )
    } else {
      record('no test removed or renamed', true, `all ${before.size} baseline tests still present`)
    }
    record('tests added', true, `${added.length} new test(s) since the baseline`)
  }
}

// ---------------------------------------------------------------------------
// 3. The schema, the template catalog, and the demo project.
//    An external fact, not our own assertion: these are checked against
//    schemas/screenshot-studio.v1.json and the six templates on disk.
// ---------------------------------------------------------------------------
record(
  'project validators',
  run('schema + templates + demo', 'npm', ['run', '--silent', 'check:project']),
)

// ---------------------------------------------------------------------------
// 4. Reconciliation: serialisation must be idempotent.
//    This is the anti-Goodhart anchor. "All tests pass" can be gamed by loosening
//    an assert, faking a mock, or swallowing an exception. "A deck round-trips to
//    a fixed point across 8 documents" cannot be gamed without changing the
//    schema, the migration, or the serializer — and check 3 sees all three.
//
//    The check is TypeScript and this project sets `noEmit`, so there is no
//    compiled output to import. esbuild ships with Vite, so bundle with that
//    rather than adding a runner dependency.
//
//    Which means the thing that runs is not the thing `tsc` checked
//    ---------------------------------------------------------------
//    The source is typechecked — `tsconfig.node.json` covers `scripts/**/*.ts` —
//    but the artefact that runs is esbuild's output, and esbuild does not
//    typecheck and erases `import type` without reading it. Type erasure alone
//    cannot turn a checked file into a broken one, so the source being checked is
//    most of the story. The part it does not cover is the module graph: esbuild
//    resolves imports itself, with its own rules, and nothing asserts that it
//    resolved the same files `tsc` did. Add an import that lands outside every
//    tsconfig — a `.js` sibling, a new top-level directory, a `.ts` file no
//    project includes — and the bundle silently grows a file that has never been
//    typechecked, while check 1 stays green.
//
//    So the gate closes it rather than asserting it. `--metafile` is
//    esbuild's own list of what went into the bundle, and check 1's `--listFiles`
//    is `tsc`'s list of what it typechecked. If a bundled file is not in the
//    second, the bundle is not the checked artefact and this check fails in the
//    slot that already means "the reconciliation check could not be built". It
//    is a build failure, not a verdict about a document, so it shares that slot
//    and the gate still records exactly seven results.
// ---------------------------------------------------------------------------
process.stdout.write('\n── round trip\n')
const bundle = spawnSync(
  'npx',
  [
    ...npx,
    'esbuild',
    'scripts/gate/roundtrip.ts',
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node20',
    `--outfile=${bundlePath}`,
    `--metafile=${metaPath}`,
    '--log-level=warning',
  ],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
)

/**
 * The bundle's inputs that `tsc -b` never typechecked.
 *
 * The metafile's keys are relative to the checkout; `tsc` prints absolute
 * paths, and the two disagree about case as readily as about separators — a
 * Windows machine will happily re-case a path in transit, which is the same
 * hazard `testIdentity.mjs` exists for. Hence `comparePath` on both sides.
 */
const uncheckedInputs = () => {
  if (!existsSync(metaPath)) return ['<esbuild wrote no metafile>']
  let inputs
  try {
    inputs = Object.keys(JSON.parse(readFileSync(metaPath, 'utf8')).inputs ?? {})
  } catch (error) {
    return [`<the metafile could not be read: ${error instanceof Error ? error.message : String(error)}>`]
  }
  return inputs.map((file) => comparePath(resolve(root, file))).filter((file) => !typecheckedFiles.has(file))
}

const unchecked = bundle.status === 0 ? uncheckedInputs() : []
if (bundle.status !== 0) {
  record('untouched deck round-trips byte-identically', false, 'the reconciliation check could not be built')
} else if (unchecked.length) {
  record(
    'untouched deck round-trips byte-identically',
    false,
    `the bundle would run ${unchecked.length} file(s) the typecheck never saw, so it is not the checked artefact: ` +
      `${unchecked.slice(0, 3).join(', ')}${unchecked.length > 3 ? ', …' : ''}. ` +
      (typecheck.ok
        ? 'Put them in a tsconfig that `tsc -b` builds.'
        : 'The typecheck also failed, so its file list may be incomplete.'),
  )
} else {
  const roundTrip = spawnSync('node', [bundlePath], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  process.stdout.write(roundTrip.stdout ?? '')
  if (roundTrip.stderr) process.stdout.write(roundTrip.stderr)
  record(
    'serialisation is idempotent across every document',
    roundTrip.status === 0,
    roundTrip.status === 0 ? undefined : 'a deck does not round-trip to a fixed point',
  )
}

// ---------------------------------------------------------------------------
// STOP 1 — what this script deliberately cannot judge.
// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok)

process.stdout.write('\n──────────────────────────────────────────\n')
process.stdout.write(`${results.length - failed.length}/${results.length} checks passed\n`)

if (failed.length) {
  process.stdout.write('\nFailed:\n')
  for (const f of failed) process.stdout.write(`  - ${f.name}: ${f.detail}\n`)
  process.stdout.write('\nGate says NO. A rewrite is not ready while this is red.\n')
  process.exit(1)
}

process.stdout.write(
  '\nGate says YES to "nothing that worked has broken".\n' +
    'It does NOT say the new editor is better. That is the human call, and it\n' +
    'is not automatable: a script cannot tell whether a redesign is an\n' +
    'improvement, only whether it cost you the deck round trip.\n',
)
process.exit(0)
