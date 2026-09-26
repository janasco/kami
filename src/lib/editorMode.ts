/**
 * Editor mode preference: Guided or Full editor.
 *
 * This is a UI-only browser preference. It is stored in localStorage under its
 * own key and is never written into the project document, so opening a project
 * on another machine cannot change the mode, and the project schema, project
 * migration, and validation are untouched.
 *
 * The rule for a first-time visitor is deliberately narrow: Guided mode is the
 * default only when there is no restored project to work on and the first-run
 * onboarding has not been completed. Anyone with an existing deck, and anyone
 * who has already been through onboarding, keeps the Full Editor they know.
 */

export type EditorMode = 'guided' | 'full'

export const EDITOR_MODE_STORAGE_KEY = 'kami.editor.mode'

export const editorModeOptions: Array<{
  id: EditorMode
  label: string
  description: string
}> = [
  {
    id: 'guided',
    label: 'Guided',
    description: 'Four steps: add screenshots, choose a look, write your words, download.',
  },
  {
    id: 'full',
    label: 'Full editor',
    description: 'Every stage, control, and shortcut, with nothing hidden.',
  },
]

/** Only the two known ids are accepted, so a stale value falls back. */
export const parseEditorMode = (value: unknown): EditorMode | null =>
  value === 'guided' || value === 'full' ? value : null

/** The slice of Storage this module needs, so a test can pass a stub. */
export type EditorModeStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Resolves the storage to use. `window` is absent in the Node test
 * environment, and a browser can refuse storage access outright, so both
 * failures return null and the caller falls back to its default mode.
 */
const resolveStorage = (storage?: EditorModeStorage | null): EditorModeStorage | null => {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The stored preference, or null when there is none or it is unreadable. */
export function readEditorMode(storage?: EditorModeStorage | null): EditorMode | null {
  const target = resolveStorage(storage)
  if (!target) return null
  try {
    return parseEditorMode(target.getItem(EDITOR_MODE_STORAGE_KEY))
  } catch {
    return null
  }
}

/** Stores the preference. A failure is ignored: the editor stays usable. */
export function writeEditorMode(mode: EditorMode, storage?: EditorModeStorage | null): void {
  const target = resolveStorage(storage)
  if (!target) return
  try {
    target.setItem(EDITOR_MODE_STORAGE_KEY, parseEditorMode(mode) ?? mode)
  } catch {
    // Private browsing and full quotas must not break the editor.
  }
}

export interface EditorModeDefaults {
  /** True when a local draft or an opened project supplied the deck. */
  restoredProject: boolean
  /** True when the first-run onboarding has already been dismissed. */
  onboardingComplete: boolean
}

/**
 * The mode to open with.
 *
 * An explicit stored choice always wins, because a returning author who
 * picked a mode did it on purpose. Otherwise the default is Guided only for a
 * genuinely first-time visitor: no restored project and onboarding still
 * outstanding. Everyone else gets the Full Editor.
 */
export function resolveInitialEditorMode(
  defaults: EditorModeDefaults,
  storedMode: EditorMode | null,
): EditorMode {
  const stored = parseEditorMode(storedMode)
  if (stored) return stored
  return !defaults.restoredProject && !defaults.onboardingComplete ? 'guided' : 'full'
}
