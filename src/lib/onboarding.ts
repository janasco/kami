const ONBOARDING_COMPLETION_KEY = 'kami.editor.onboarding.completed'

export function hasCompletedOnboarding(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_COMPLETION_KEY) === 'true'
  } catch {
    return false
  }
}

export function markOnboardingComplete(): void {
  try {
    window.localStorage.setItem(ONBOARDING_COMPLETION_KEY, 'true')
  } catch {
    // The editor remains usable when browser storage is unavailable.
  }
}
