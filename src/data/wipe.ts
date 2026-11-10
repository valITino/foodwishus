// Logging out wipes this device's copy of the kitchen. The wipe happens on the next
// start, before anything opens the database: deleting it while screens are still
// reading from it would make every one of them fail on the way out.

import Dexie from 'dexie'

const KEY = 'foodwishus.wipeOnStart'

/** Ask for the named database to be deleted when the app starts next. */
export function wipeOnNextStart(name: string): void {
  try {
    localStorage.setItem(KEY, name)
  } catch {
    /* private mode: the copy stays until the browser clears it */
  }
}

/** Call once, before the first screen is shown. */
export async function wipeIfAsked(): Promise<void> {
  let name: string | null = null
  try {
    name = localStorage.getItem(KEY)
  } catch {
    return
  }
  if (!name) return
  try {
    await Dexie.delete(name)
    localStorage.removeItem(KEY)
  } catch {
    /* another tab still has it open: try again on the next start */
  }
}
