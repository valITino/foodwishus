// What cook mode remembers while the app is open: which step you are on, which
// ingredients are ticked off, how many servings you chose, and the kitchen timers.
// Timers live here, outside any screen, so they keep running when you move between
// steps or leave cook mode for a moment.

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ID } from '../../data/types'
import { buzz, toast } from '../../ui/components'

let version = 0
const listeners = new Set<() => void>()

function emit(): void {
  version += 1
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Re-renders the caller whenever a session or a timer changes (timers tick four times a second). */
export function useCookStore(): number {
  return useSyncExternalStore(subscribe, () => version)
}

// ---------------------------------------------------------------- servings --

const chosenServings = new Map<ID, number>()

/** The servings picked on the dish page, remembered so cook mode and a later visit agree. */
export function getChosenServings(dishId: ID): number | undefined {
  return chosenServings.get(dishId)
}

export function setChosenServings(dishId: ID, servings: number | null): void {
  if (servings === null) chosenServings.delete(dishId)
  else chosenServings.set(dishId, servings)
  emit()
}

// ---------------------------------------------------------------- sessions --

interface Session {
  step: number
  checked: Set<number>
}

const sessions = new Map<ID, Session>()

function session(dishId: ID): Session {
  let current = sessions.get(dishId)
  if (!current) {
    current = { step: 0, checked: new Set() }
    sessions.set(dishId, current)
  }
  return current
}

/** True when cooking this dish was started and not finished: the dish page offers "Continue cooking". */
export function isCooking(dishId: ID): boolean {
  const current = sessions.get(dishId)
  return Boolean(current && (current.step > 0 || current.checked.size > 0)) || timersOf(dishId).length > 0
}

export function getStep(dishId: ID): number {
  return sessions.get(dishId)?.step ?? 0
}

export function setStep(dishId: ID, step: number): void {
  session(dishId).step = step
  emit()
}

export function isChecked(dishId: ID, index: number): boolean {
  return sessions.get(dishId)?.checked.has(index) ?? false
}

export function checkedCount(dishId: ID): number {
  return sessions.get(dishId)?.checked.size ?? 0
}

export function toggleChecked(dishId: ID, index: number): void {
  const { checked } = session(dishId)
  if (!checked.delete(index)) checked.add(index)
  emit()
}

export function uncheckAll(dishId: ID): void {
  sessions.get(dishId)?.checked.clear()
  emit()
}

/** Cooking is finished: forget the step, the ticks and the timers of this dish. */
export function endSession(dishId: ID): void {
  sessions.delete(dishId)
  for (const timer of timersOf(dishId)) timers.delete(timer.key)
  emit()
}

// ------------------------------------------------------------------ timers --

export interface KitchenTimer {
  key: string
  dishId: ID
  step: number
  totalMs: number
  state: 'running' | 'paused' | 'done'
  /** When a running timer ends, on the phone's clock. */
  endsAt: number
  /** What is left on a paused timer. */
  leftMs: number
  /** Said in a toast when the timer ends while cook mode is not showing it. */
  doneMessage: string
}

const timers = new Map<string, KitchenTimer>()
let ticker: ReturnType<typeof setInterval> | null = null
/** The dish whose cook mode is on screen right now. Its timers announce themselves there. */
let watching: ID | null = null

const timerKey = (dishId: ID, step: number) => `${dishId}:${step}`

export function getTimer(dishId: ID, step: number): KitchenTimer | undefined {
  return timers.get(timerKey(dishId, step))
}

export function timersOf(dishId: ID): KitchenTimer[] {
  return [...timers.values()].filter((t) => t.dishId === dishId).sort((a, b) => a.step - b.step)
}

export function remainingMs(timer: KitchenTimer): number {
  if (timer.state === 'running') return Math.max(0, timer.endsAt - Date.now())
  return timer.state === 'done' ? 0 : timer.leftMs
}

function tick(): void {
  const now = Date.now()
  let running = false
  for (const timer of timers.values()) {
    if (timer.state !== 'running') continue
    if (timer.endsAt <= now) {
      timer.state = 'done'
      timer.leftMs = 0
      announce(timer)
    } else {
      running = true
    }
  }
  if (!running && ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
  emit()
}

function announce(timer: KitchenTimer): void {
  buzz([300, 120, 300, 120, 500])
  if (soundOn()) chime()
  if (watching !== timer.dishId || document.visibilityState !== 'visible') toast(timer.doneMessage)
}

function ensureTicking(): void {
  if (ticker === null) ticker = setInterval(tick, 250)
}

// A phone that slept through the end of a timer catches up the moment it wakes.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && timers.size > 0) tick()
  })
}

/** Start a fresh timer, or carry on with a paused one. */
export function startTimer(input: { dishId: ID; step: number; totalMs: number; doneMessage: string }): void {
  const key = timerKey(input.dishId, input.step)
  const existing = timers.get(key)
  const left = existing?.state === 'paused' ? existing.leftMs : input.totalMs
  timers.set(key, { key, ...input, state: 'running', endsAt: Date.now() + left, leftMs: left })
  if (soundOn()) primeAudio()
  ensureTicking()
  buzz(10)
  emit()
}

export function pauseTimer(key: string): void {
  const timer = timers.get(key)
  if (!timer || timer.state !== 'running') return
  timer.leftMs = remainingMs(timer)
  timer.state = 'paused'
  emit()
}

/** Back to "tap to start". Also how a finished timer is put away. */
export function resetTimer(key: string): void {
  timers.delete(key)
  emit()
}

/** Tell the store which dish's cook mode is showing, so finished timers know where to speak up. */
export function useWatching(dishId: ID): void {
  useEffect(() => {
    watching = dishId
    return () => {
      if (watching === dishId) watching = null
    }
  }, [dishId])
}

// ------------------------------------------------------------------- sound --

const SOUND_KEY = 'foodwishus.recipes.timerSound'
let audio: AudioContext | null = null

function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === '1'
  } catch {
    return false
  }
}

/** Browsers only let sound start from a tap, so the audio is woken when a timer is started. */
function primeAudio(): void {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = null
  }
}

/** Three soft bell notes. */
function chime(): void {
  if (!audio) return
  try {
    const start = audio.currentTime + 0.05
    ;[880, 1108.73, 1318.51].forEach((frequency, i) => {
      const ctx = audio as AudioContext
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency
      const at = start + i * 0.28
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 1)
    })
  } catch {
    /* no sound is fine */
  }
}

/** The timer chime: off unless switched on in cook mode. Remembered on this phone. */
export function useTimerSound(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(soundOn)
  const change = (next: boolean) => {
    try {
      localStorage.setItem(SOUND_KEY, next ? '1' : '0')
    } catch {
      /* private mode: this session only */
    }
    setOn(next)
    if (next) {
      primeAudio()
      chime()
    }
  }
  return [on, change]
}

// --------------------------------------------------------------- wake lock --

/**
 * Keeps the screen awake while the calling screen is showing. The lock is dropped by
 * the browser whenever the app goes to the background, so it is asked for again each
 * time the app comes back. Where wake locks do not exist, nothing happens.
 */
export function useWakeLock(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null
    let gone = false

    const acquire = async () => {
      if (sentinel || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (gone) {
          void lock.release().catch(() => {})
          return
        }
        sentinel = lock
        setHeld(true)
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null
          if (!gone) setHeld(false)
        })
      } catch {
        /* battery saver, or not allowed: cook mode works without it */
      }
    }
    const onVisible = () => void acquire()

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [])
  return held
}
