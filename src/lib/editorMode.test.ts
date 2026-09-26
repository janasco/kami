import { describe, expect, it } from 'vitest'
import {
  EDITOR_MODE_STORAGE_KEY,
  parseEditorMode,
  readEditorMode,
  resolveInitialEditorMode,
  writeEditorMode,
  type EditorModeStorage,
} from './editorMode'

/**
 * Mode selection tests.
 *
 * The mode is a browser preference, so these cover the two decisions that
 * matter: what an explicit stored choice does, and who sees Guided mode as the
 * first-run default. The storage is passed in as a stub, because the test
 * environment has no window and no localStorage.
 */

const createStorage = (initial: Record<string, string> = {}): EditorModeStorage & { store: Map<string, string> } => {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

describe('parseEditorMode', () => {
  it('accepts only the two known mode ids', () => {
    expect(parseEditorMode('guided')).toBe('guided')
    expect(parseEditorMode('full')).toBe('full')
    expect(parseEditorMode('classic')).toBeNull()
    expect(parseEditorMode('')).toBeNull()
    expect(parseEditorMode(null)).toBeNull()
    expect(parseEditorMode(undefined)).toBeNull()
    expect(parseEditorMode(7)).toBeNull()
  })
})

describe('readEditorMode', () => {
  it('returns null when nothing has been stored', () => {
    expect(readEditorMode(createStorage())).toBeNull()
  })

  it('returns the stored mode', () => {
    const storage = createStorage({ [EDITOR_MODE_STORAGE_KEY]: 'guided' })
    expect(readEditorMode(storage)).toBe('guided')
  })

  it('ignores a stale or corrupted value', () => {
    const storage = createStorage({ [EDITOR_MODE_STORAGE_KEY]: 'wizard' })
    expect(readEditorMode(storage)).toBeNull()
  })

  it('survives storage that throws, so the editor keeps its default', () => {
    const hostile: EditorModeStorage = {
      getItem: () => {
        throw new Error('storage is blocked')
      },
      setItem: () => {
        throw new Error('storage is blocked')
      },
    }
    expect(readEditorMode(hostile)).toBeNull()
    expect(() => writeEditorMode('guided', hostile)).not.toThrow()
  })

  it('returns null when there is no storage at all', () => {
    expect(readEditorMode(undefined)).toBeNull()
    expect(() => writeEditorMode('full', undefined)).not.toThrow()
  })
})

describe('writeEditorMode', () => {
  it('stores the mode under its own key, separate from the project', () => {
    const storage = createStorage()
    writeEditorMode('guided', storage)
    expect(storage.store.get(EDITOR_MODE_STORAGE_KEY)).toBe('guided')
    expect(readEditorMode(storage)).toBe('guided')
  })
})

describe('resolveInitialEditorMode', () => {
  it('opens Guided mode for a first-time visitor with nothing to work on', () => {
    expect(resolveInitialEditorMode({ restoredProject: false, onboardingComplete: false }, null)).toBe('guided')
  })

  it('opens the Full editor when a project was restored', () => {
    expect(resolveInitialEditorMode({ restoredProject: true, onboardingComplete: false }, null)).toBe('full')
  })

  it('opens the Full editor once onboarding is complete, so a returning user is not reset', () => {
    expect(resolveInitialEditorMode({ restoredProject: false, onboardingComplete: true }, null)).toBe('full')
  })

  it('keeps an explicit stored choice in both directions', () => {
    // A returning author who asked for the full editor stays there even when
    // they have no project and the onboarding flag is still false.
    expect(resolveInitialEditorMode({ restoredProject: false, onboardingComplete: false }, 'full')).toBe('full')
    // And an author who asked for Guided keeps it while a project is restored.
    expect(resolveInitialEditorMode({ restoredProject: true, onboardingComplete: true }, 'guided')).toBe('guided')
  })

  it('falls back to the first-run rule for an unreadable stored value', () => {
    expect(resolveInitialEditorMode({ restoredProject: false, onboardingComplete: false }, 'nope' as never)).toBe('guided')
  })
})
