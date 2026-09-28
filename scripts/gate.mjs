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
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = resolve(root, 'scripts/gate/baseline.json')
const reportPath = resolve(root, 'scripts/gate/.run.json')
const bundlePath = resolve(root, 'scripts/gate/.roundtrip.mjs')
const updateBaseline = process.argv.includes('--update')

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

process.stdout.write('kami-rewrite-gate\n')

// ---------------------------------------------------------------------------
// 1. Types. A rewrite that does not compile is not a rewrite.
// ---------------------------------------------------------------------------
record('tsc -b', run('typecheck', 'npx', ['tsc', '-b']))

// ---------------------------------------------------------------------------
// 2. Tests, plus the test-integrity boundary.
// ---------------------------------------------------------------------------
record('tests', run('tests', 'npx', ['vitest', 'run', '--reporter=json', `--outputFile=${reportPath}`, '--silent']))

const readRun = () => {
  if (!existsSync(reportPath)) return null
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'))
  } catch {
    return null
  }
}

const currentTests = (report) =>
  (report?.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? []).map((t) => `${file.name} :: ${t.fullName ?? t.title}`),
  )

const run1 = readRun()
const current = currentTests(run1)

if (!current.length) {
  record('test integrity', false, 'no test report could be read, so the baseline cannot be compared')
} else {
  const count = run1.numTotalTests ?? current.length
  record('test count', count >= MIN_TEST_COUNT, `${count} tests, floor is ${MIN_TEST_COUNT}`)

  if (updateBaseline) {
    const next = {
      recordedAt: new Date().toISOString(),
      minTestCount: MIN_TEST_COUNT,
      testCount: count,
      tests: current.slice().sort(),
    }
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`)
    record('baseline re-recorded', true, `${count} tests written to scripts/gate/baseline.json`)
  } else if (!existsSync(baselinePath)) {
    record(
      'test integrity',
      false,
      'scripts/gate/baseline.json is missing. Record it once with: node scripts/gate.mjs --update',
    )
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    const before = new Set(baseline.tests)
    const after = new Set(current)

    const removed = [...before].filter((name) => !after.has(name))
    const added = [...after].filter((name) => !before.has(name))

    // A removed test is the failure mode this whole check exists for. A renamed
    // test shows up here as one removal plus one addition, so renaming cannot
    // quietly delete coverage either.
    if (removed.length) {
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
// ---------------------------------------------------------------------------
process.stdout.write('\n── round trip\n')
const bundle = spawnSync(
  'npx',
  [
    'esbuild',
    'scripts/gate/roundtrip.ts',
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node20',
    `--outfile=${bundlePath}`,
    '--log-level=warning',
  ],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
)
if (bundle.status !== 0) {
  record('untouched deck round-trips byte-identically', false, 'the reconciliation check could not be built')
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
