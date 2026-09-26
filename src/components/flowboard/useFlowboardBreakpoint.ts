import { useEffect, useState } from 'react'

export type FlowboardBreakpoint = 'desktop' | 'tablet' | 'mobile'

/** Below this width the shell becomes a single-column review surface. */
export const FLOWBOARD_TABLET_MAX_WIDTH = 1199
export const FLOWBOARD_MOBILE_MAX_WIDTH = 767

const resolveBreakpoint = (): FlowboardBreakpoint => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  if (window.matchMedia(`(max-width: ${FLOWBOARD_MOBILE_MAX_WIDTH}px)`).matches) return 'mobile'
  if (window.matchMedia(`(max-width: ${FLOWBOARD_TABLET_MAX_WIDTH}px)`).matches) return 'tablet'
  return 'desktop'
}

/**
 * UI-only layout mode for the Flowboard shell. The value only changes how the
 * shell is arranged; it is never serialized with the project.
 */
export function useFlowboardBreakpoint(): FlowboardBreakpoint {
  const [breakpoint, setBreakpoint] = useState<FlowboardBreakpoint>(resolveBreakpoint)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const update = () => setBreakpoint(resolveBreakpoint())
    const queries = [
      window.matchMedia(`(max-width: ${FLOWBOARD_MOBILE_MAX_WIDTH}px)`),
      window.matchMedia(`(max-width: ${FLOWBOARD_TABLET_MAX_WIDTH}px)`),
    ]
    queries.forEach((query) => query.addEventListener('change', update))
    window.addEventListener('resize', update)
    update()
    return () => {
      queries.forEach((query) => query.removeEventListener('change', update))
      window.removeEventListener('resize', update)
    }
  }, [])

  return breakpoint
}
