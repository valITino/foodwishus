// What every chart shares: the card around it, its size, growing in once, picking a
// value by tap or keyboard, and the line underneath that reads the picked value out.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { Card, cx } from '../../../ui/components'
import { Mascot } from '../../../ui/deco/Deco'
import { hasGrown, markGrown } from '../filterStore'
import './charts.css'

// ------------------------------------------------------------------ colours --
// Marks wear the design tokens. Text never wears a mark's colour: it stays ink.

export const INK = 'var(--color-ink)'
export const INK_SOFT = 'var(--color-ink-soft)'
export const LINE = 'var(--color-line)'
export const LINE_STRONG = 'var(--color-line-strong)'
export const SURFACE = 'var(--color-surface)'
export const ROSE = 'var(--color-rose)'
export const ROSE_EDGE = 'var(--color-rose-edge)'
export const ROSE_INK = 'var(--color-rose-ink)'
export const CHERRY = 'var(--color-cherry)'
export const BLUSH = 'var(--color-blush)'
export const SAGE = 'var(--color-sage)'
export const BUTTER = 'var(--color-butter)'

export const AXIS_TEXT = { fontSize: 11, fontWeight: 700, fill: INK_SOFT } as const

/** A label on an axis is centred on its spot, but leans inwards at the edges so it is never cut off. */
export function leanIn(at: number, text: string, min: number, max: number, size = 11): { x: number; textAnchor: 'start' | 'middle' | 'end' } {
  const half = (text.length * size * 0.58) / 2
  if (at - half < min) return { x: Math.max(min, at - 2), textAnchor: 'start' }
  if (at + half > max) return { x: Math.min(max, at + 2), textAnchor: 'end' }
  return { x: at, textAnchor: 'middle' }
}

// --------------------------------------------------------------------- size --

/** The width of an element in pixels, kept up to date. Charts draw one unit per pixel. */
export function useWidth<T extends HTMLElement>(fallback = 320): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const next = Math.floor(element.getBoundingClientRect().width)
      if (next > 0) setWidth(next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/**
 * A plot that scrolls sideways starts at its right end, where the newest days are.
 *
 * Give the scrolling element `key={contentWidth}` as well. The page-wide reduced-motion
 * rule turns every change of size into a transition (a very short one, but it ends some
 * frames later), so an element that merely grows still reports its old width here.
 * A fresh element has its final width from the start.
 */
export function useStartAtEnd(scroller: RefObject<HTMLElement | null>, scrolls: boolean, contentWidth: number): void {
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && scrolls) element.scrollLeft = element.scrollWidth
  }, [scroller, scrolls, contentWidth])
}

// ------------------------------------------------------------------ grow in --

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** "wait" until the chart first scrolls into view, then "in" for good. */
export function useGrowIn<T extends HTMLElement>(id: string): [RefObject<T | null>, 'in' | 'wait'] {
  const ref = useRef<T>(null)
  const [grow, setGrow] = useState<'in' | 'wait'>(() => (hasGrown(id) || calm() || typeof IntersectionObserver === 'undefined' ? 'in' : 'wait'))
  useEffect(() => {
    const element = ref.current
    if (grow === 'in' || !element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        markGrown(id)
        setGrow('in')
        observer.disconnect()
      },
      { threshold: 0.15 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [grow, id])
  return [ref, grow]
}

// --------------------------------------------------------------------- card --

interface ChartCardProps {
  /** Names the chart for tests and remembers that it has grown in. */
  id: string
  /** One plain line that says what the chart shows. */
  title: string
  sub?: ReactNode
  /** A small control in the corner. */
  aside?: ReactNode
  /** Set when there is nothing to draw: Fork naps and this line explains. */
  empty?: string | false
  children?: ReactNode
  className?: string
}

/** A chart on its card: title, optional controls, the plot, or a nap when there is no data. */
export function ChartCard({ id, title, sub, aside, empty, children, className }: ChartCardProps) {
  const [ref, grow] = useGrowIn<HTMLDivElement>(id)
  return (
    <div ref={ref} className={cx('fw-chart min-w-0', className)} data-chart={id} data-grow={grow} data-empty={empty ? 'true' : undefined}>
      <Card pad={false}>
        <section aria-labelledby={`chart-${id}`}>
          <div className="flex items-start justify-between gap-3 px-4 pt-4">
            <div className="min-w-0">
              <h3 id={`chart-${id}`} className="text-base">
                {title}
              </h3>
              {sub && !empty && <p className="mt-1 text-xs text-ink-soft">{sub}</p>}
            </div>
            {!empty && aside}
          </div>
          {empty ? <ChartEmpty>{empty}</ChartEmpty> : children}
        </section>
      </Card>
    </div>
  )
}

/** Nothing to draw yet: Fork sleeps next to one friendly line. */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-4 pt-2" data-testid="chart-empty">
      <Mascot size={52} mood="sleepy" label="" className="shrink-0" />
      <p className="min-w-0 text-sm text-ink-soft">{children}</p>
    </div>
  )
}

// --------------------------------------------------------------------- pick --

export interface Pick {
  picked: number | null
  setPicked: (index: number | null) => void
  onKeyDown: (event: KeyboardEvent) => void
}

/**
 * Which value of a chart is picked. Tapping picks the nearest one (the chart decides
 * what "nearest" means); the arrow keys walk through all of them. `reset` is anything
 * that changes when the data does: the pick is dropped then.
 */
export function usePick(count: number, reset: unknown): Pick {
  const [picked, setPicked] = useState<number | null>(null)
  const [seen, setSeen] = useState(reset)
  if (seen !== reset) {
    setSeen(reset)
    setPicked(null)
  }
  const current = picked !== null && picked < count ? picked : null
  const onKeyDown = (event: KeyboardEvent) => {
    if (count === 0) return
    let next: number | null | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = current === null ? 0 : Math.min(count - 1, current + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = current === null ? count - 1 : Math.max(0, current - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = count - 1
    else if (event.key === 'Escape') next = null
    if (next === undefined) return
    event.preventDefault()
    setPicked(next)
  }
  return { picked: current, setPicked, onKeyDown }
}

/** Where a tap landed inside the element it was on, in pixels from its top-left corner. */
export function tapPoint(event: MouseEvent<Element>): [number, number] {
  const box = event.currentTarget.getBoundingClientRect()
  return [event.clientX - box.left, event.clientY - box.top]
}

interface PlotProps {
  /** Read to screen readers: what the chart shows and its main numbers. */
  label: string
  width: number
  height: number
  onTap?: (x: number, y: number) => void
  onKeyDown?: (event: KeyboardEvent) => void
  children: ReactNode
  className?: string
}

/**
 * The drawing itself. Screen readers get the summary; a tap or the arrow keys pick a
 * value, which the Readout underneath then spells out.
 */
export function Plot({ label, width, height, onTap, onKeyDown, children, className }: PlotProps) {
  const interactive = Boolean(onTap || onKeyDown)
  return (
    <div role={interactive ? 'group' : 'img'} aria-label={label} tabIndex={interactive ? 0 : undefined} onKeyDown={onKeyDown} className={cx('rounded-md outline-offset-2', className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
        className={cx('block select-none', interactive && 'cursor-pointer touch-manipulation')}
        onClick={onTap ? (event) => onTap(...tapPoint(event)) : undefined}
      >
        {children}
      </svg>
    </div>
  )
}

interface ReadoutProps {
  /** Shown while nothing is picked. */
  hint: string
  /** The picked value in words. */
  children?: ReactNode
  /** Something to do with the picked value, usually "See dish". */
  action?: ReactNode
  className?: string
}

/** One line under a chart: the picked value, announced to screen readers as it changes. */
export function Readout({ hint, children, action, className }: ReadoutProps) {
  const picked = children !== null && children !== undefined && children !== false && children !== ''
  return (
    <div className={cx('flex min-h-12 items-center justify-between gap-2 px-4 pb-2 pt-1.5 text-xs', className)} data-testid="readout">
      <p role="status" className={cx('min-w-0', picked ? 'font-bold text-ink' : 'text-ink-soft')}>
        {picked ? children : hint}
      </p>
      {picked ? action : null}
    </div>
  )
}

/** A quiet text button that takes little room: "See dish" in a readout, "Reset" in the filter bar. */
export function TextButton({ onClick, children, label }: { onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-xs font-extrabold text-rose-ink underline decoration-transparent decoration-2 underline-offset-4 active:decoration-current"
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------------- legend --

/** What a mark stands for: a small sample of the mark next to plain words. */
export function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-ink-soft">
      <span aria-hidden className="inline-flex shrink-0 items-center">
        {swatch}
      </span>
      {children}
    </span>
  )
}

/** A short piece of line, drawn like the line it explains. */
export function LineKey({ stroke, dash, width = 2.25 }: { stroke: string; dash?: string; width?: number }) {
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden>
      <path d="M2 4h18" stroke={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" fill="none" />
    </svg>
  )
}

export const HEART = 'M24 40C10 30 6 22 7 16c1-6 6-9 11-8 3 .5 5 2.5 6 5 1-2.5 3-4.5 6-5 5-1 10 2 11 8 1 6-3 14-17 24Z'
