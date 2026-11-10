// Logging this device out, carefully. It needs a connection (the cloud must know the
// device is gone), and it wipes the device's copy of the kitchen, so changes that were
// never sent would be lost: those are sent first, and if some are still waiting the
// person is asked, with the number.

import { useState, type ReactNode } from 'react'
import { logOut, sync } from '../../data/app'
import { isBackendError } from '../../data/backend'
import { useCopy } from '../../i18n'
import { pairingCopy } from './copy'
import { ConfirmSheet } from './parts'
import { useExplain } from './useExplain'

interface LogOut {
  /** Call from the "Log out" button. */
  start: () => void
  working: boolean
  /** Why it did not work, in words, or null. */
  problem: string | null
  /** Render this once on the page: the "lose changes?" question. */
  sheet: ReactNode
}

const waiting = () => sync.status.pending + sync.status.uploads

export function useLogOut(): LogOut {
  const c = useCopy(pairingCopy)
  const explain = useExplain()
  const [working, setWorking] = useState(false)
  const [asking, setAsking] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const really = async () => {
    setWorking(true)
    try {
      // On success the page reloads to the start screen.
      await logOut()
    } catch (e) {
      setAsking(null)
      setWorking(false)
      setProblem(isBackendError(e) && e.kind === 'network' ? c.logOut.needsConnection : explain(e))
    }
  }

  const start = async () => {
    setProblem(null)
    setWorking(true)
    if (waiting() > 0) await sync.sync()
    if (sync.status.state === 'offline') {
      setWorking(false)
      return setProblem(c.logOut.needsConnection)
    }
    if (waiting() > 0) {
      setWorking(false)
      return setAsking(waiting())
    }
    await really()
  }

  const sheet = (
    <ConfirmSheet
      open={asking !== null}
      title={c.logOut.loseTitle}
      confirmLabel={c.logOut.loseConfirm}
      cancelLabel={c.logOut.stay}
      busy={working}
      onClose={() => setAsking(null)}
      onConfirm={() => void really()}
    >
      <p>{c.logOut.loseBody(asking ?? 0)}</p>
    </ConfirmSheet>
  )

  return { start: () => void start(), working, problem, sheet }
}
