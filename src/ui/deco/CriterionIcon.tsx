// Little line icons for review criteria, drawn like the icons in Icon.tsx. A criterion
// stores the name of its icon; a name this version does not know draws the spoon.

import type { ReactNode } from 'react'

const paths = {
  spoon: (
    <>
      <ellipse cx="12" cy="7.6" rx="3.7" ry="4.6" />
      <path d="M12 12.2V21" />
    </>
  ),
  tongue: (
    <>
      <path d="M4.5 8c2.3 1.7 4.8 2.5 7.5 2.5S17.2 9.7 19.5 8" />
      <path d="M8.3 10V14.3a3.7 3.7 0 0 0 7.4 0V10M12 10.5v3.5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.5 8.5 4.3-8.5 4.3-8.5-4.3L12 3.5Z" />
      <path d="m3.5 12 8.5 4.3 8.5-4.3M3.5 16.2l8.5 4.3 8.5-4.3" />
    </>
  ),
  steam: (
    <>
      <path d="M8 3.5c-1.3 1.5 1.3 2.7 0 4.2M12 2.8c-1.3 1.5 1.3 2.7 0 4.2M16 3.5c-1.3 1.5 1.3 2.7 0 4.2" />
      <path d="M3.5 11.5h17c0 4.7-3.8 8.5-8.5 8.5s-8.5-3.8-8.5-8.5Z" />
    </>
  ),
  sparkle: (
    <>
      <path d="M10.5 3.5c.9 4.8 2.2 6.1 7 7-4.8.9-6.1 2.2-7 7-.9-4.8-2.2-6.1-7-7 4.8-.9 6.1-2.2 7-7Z" />
      <path d="M18.5 15c.3 1.7 1 2.4 2.7 2.7-1.7.3-2.4 1-2.7 2.7-.3-1.7-1-2.4-2.7-2.7 1.7-.3 2.4-1 2.7-2.7Z" />
    </>
  ),
  plate: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.6" />
    </>
  ),
  flame: <path d="M12 21c-4 0-6.5-2.7-6.5-6 0-3 2-4.5 3-7 .5 1.5 1.3 2.3 2.5 2.5C10.5 7.5 12 5 14 3c0 3.5 4.5 6 4.5 11.5 0 3.5-2.5 6.5-6.5 6.5Z" />,
  heart: <path d="M12 20.5C5 15.5 3 11.5 3.5 8.5c.5-3 3-4.5 5.5-4 1.5.3 2.5 1.3 3 2.5.5-1.2 1.5-2.2 3-2.5 2.5-.5 5 1 5.5 4 .5 3-1.5 7-8.5 12Z" />,
  chili: (
    <>
      <path d="M14.2 6.8c3.8.3 6 3.4 5.2 7.3-.9 4.6-6.2 7.4-14.4 6 5.2-1.4 7.2-3.8 7.3-7.6 0-2.6.4-4.7 1.9-5.7Z" />
      <path d="M14.2 6.8c-.2-1.7.6-2.9 2.1-3.5" />
    </>
  ),
  salt: (
    <>
      <path d="M8 9.5h8l1 9.8a1.5 1.5 0 0 1-1.5 1.7h-7A1.5 1.5 0 0 1 7 19.3l1-9.8Z" />
      <path d="M8.3 9.5a3.7 3.7 0 0 1 7.4 0" />
      <path d="M10.4 13.6h.01M13.6 13.6h.01M12 16.6h.01" />
    </>
  ),
  drop: <path d="M12 3.5c3.3 4.1 5.7 7 5.7 10.2a5.7 5.7 0 0 1-11.4 0C6.3 10.5 8.7 7.6 12 3.5Z" />,
  leaf: (
    <>
      <path d="M5 19.5C4.5 11 9.5 5.5 19.5 4.5c.5 9.5-4.5 15-14.5 15Z" />
      <path d="m5 19.5 8.5-8.5" />
    </>
  ),
  crunch: (
    <>
      <path d="M20.3 12.3a8.5 8.5 0 1 1-8.6-8.8c-.2 2 1.1 3.4 3.1 3.4-.1 2.5 1.5 4.1 4 4 .2.7.7 1.1 1.5 1.4Z" />
      <path d="M8.8 10.2h.01M8.3 15h.01M13.3 15.8h.01M12.3 11.8h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3.5Z" />,
} satisfies Record<string, ReactNode>

export type CriterionIconName = keyof typeof paths

/** Every icon a criterion can have, in the order the picker shows them. */
export const CRITERION_ICONS = Object.keys(paths) as CriterionIconName[]

export const isCriterionIcon = (name: string): name is CriterionIconName => name in paths

export function CriterionIcon({ name, size = 22, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[isCriterionIcon(name) ? name : 'spoon']}
    </svg>
  )
}
