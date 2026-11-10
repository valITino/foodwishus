// "Discard your changes?" for forms. It covers the back arrow in the header and also
// Android's own back button or swipe, which never asks anyone.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface LeaveGuard {
  /** True while the "discard?" question is showing. */
  asking: boolean
  /** Call from the header's back arrow. Leaves at once when nothing has changed. */
  tryLeave: () => void
  /** "Keep editing". */
  stay: () => void
  /** "Discard changes". */
  discard: () => void
  /** Call right before leaving on purpose (after saving), so the guard stands down. */
  release: () => void
}

/**
 * @param dirty Whether the form holds changes that are not saved.
 * @param leave How to leave the page, for example () => back('/recipes').
 */
export function useLeaveGuard(dirty: boolean, leave: () => void): LeaveGuard {
  const [asking, setAsking] = useState(false)
  const allowed = useRef(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const leaveRef = useRef(leave)
  leaveRef.current = leave

  useEffect(() => {
    const home = window.location.hash
    // The phone's back button changes the address before anyone can object. "popstate"
    // is the first event to hear of it, ahead of the "hashchange" the router listens to.
    // Putting the address straight back here means the router never sees another page,
    // the form never unmounts and nothing typed is lost. Then we ask.
    const onPopState = () => {
      if (allowed.current || !dirtyRef.current || window.location.hash === home) return
      window.location.hash = home
      setAsking(true)
    }
    const onUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && !allowed.current) event.preventDefault()
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  const release = useCallback(() => {
    allowed.current = true
  }, [])

  const tryLeave = useCallback(() => {
    if (dirtyRef.current) setAsking(true)
    else {
      allowed.current = true
      leaveRef.current()
    }
  }, [])

  const stay = useCallback(() => setAsking(false), [])

  const discard = useCallback(() => {
    allowed.current = true
    setAsking(false)
    leaveRef.current()
  }, [])

  return { asking, tryLeave, stay, discard, release }
}
