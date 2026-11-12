// Line icons for navigation and controls. They take the colour of the text around them.

import type { ReactNode } from 'react'

const paths = {
  today: (
    <>
      <path d="M4 17.5c0-5 3.5-8.5 8-8.5s8 3.5 8 8.5H4Z" />
      <path d="M2.5 17.5h19M12 9V6.5" />
      <circle cx="12" cy="5.5" r="1.1" />
    </>
  ),
  wishlist: <path d="M12 20.5C5 15.5 3 11.5 3.5 8.5c.5-3 3-4.5 5.5-4 1.5.3 2.5 1.3 3 2.5.5-1.2 1.5-2.2 3-2.5 2.5-.5 5 1 5.5 4 .5 3-1.5 7-8.5 12Z" />,
  week: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M12 17.2c-1.9-1.3-2.4-2.4-2.2-3.2.2-.9 1.3-1.2 1.8-.3l.4.5.4-.5c.5-.9 1.6-.6 1.8.3.2.8-.3 1.9-2.2 3.2Z" />
    </>
  ),
  cockpit: (
    <>
      <path d="M3.5 17a8.5 8.5 0 1 1 17 0" />
      <path d="m12 17 4-6.5" />
      <circle cx="12" cy="17" r="1.4" />
      <path d="M6.5 12.5 5.2 11.7M12 8.5V7M17.5 12.5l1.3-.8" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10.5 5 8 4.5 4 4.5v13.5c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2V4.5c-4 0-6.5.5-8 2Z" />
      <path d="M12 6.5V20" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  bell: <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2ZM10 20.5a2 2 0 0 0 4 0" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  next: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  camera: (
    <>
      <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flame: <path d="M12 21c-4 0-6.5-2.7-6.5-6 0-3 2-4.5 3-7 .5 1.5 1.3 2.3 2.5 2.5C10.5 7.5 12 5 14 3c0 3.5 4.5 6 4.5 11.5 0 3.5-2.5 6.5-6.5 6.5Z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  synced: (
    <>
      <path d="M7 18.5a4.5 4.5 0 0 1-.7-8.9 6 6 0 0 1 11.6 1.5A3.8 3.8 0 0 1 17.5 18.5H7Z" />
      <path d="m9.5 13.5 2 2 3.5-3.5" />
    </>
  ),
  offline: (
    <>
      <path d="M7 18.5a4.5 4.5 0 0 1-.7-8.9 6 6 0 0 1 11.6 1.5A3.8 3.8 0 0 1 17.5 18.5H7Z" />
      <path d="M4 4l16 16" />
    </>
  ),
  sending: (
    <>
      <path d="M7 18.5a4.5 4.5 0 0 1-.7-8.9 6 6 0 0 1 11.6 1.5A3.8 3.8 0 0 1 17.5 18.5H7Z" />
      <path d="M12 16v-4.5M9.8 13.5 12 11.3l2.2 2.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  note: (
    <>
      <path d="M5 4.5h14v10l-5 5H5v-15Z" />
      <path d="M14 19.5v-5h5M8.5 9h7M8.5 12.5h4" />
    </>
  ),

} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

export function Icon({ name, size = 24, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths[name]}
    </svg>
  )
}
