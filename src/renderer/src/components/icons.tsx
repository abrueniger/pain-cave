// Inline SVG icons (24 viewBox, stroke = currentColor). Size via CSS.
import type { ReactNode } from 'react'

const S = ({ children, fill }: { children: ReactNode; fill?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const IconStep = () => <S><path d="M3 18h4v-5h4V8h4v5h6" /></S>
export const IconPlay = () => <S fill><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" /></S>
export const IconPause = () => <S fill><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></S>
export const IconStop = () => <S fill><rect x="5" y="5" width="14" height="14" rx="2" /></S>
export const IconPlus = () => <S><path d="M12 5v14M5 12h14" /></S>
export const IconCopy = () => <S><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></S>
export const IconTrash = () => <S><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></S>
export const IconEdit = () => <S><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" /></S>
export const IconChevronRight = () => <S><path d="M9 6l6 6-6 6" /></S>
export const IconChevronLeft = () => <S><path d="M15 6l-6 6 6 6" /></S>
export const IconX = () => <S><path d="M6 6l12 12M18 6L6 18" /></S>
export const IconInfo = () => <S><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></S>
export const IconAlert = () => <S><path d="M12 3l9.5 17h-19L12 3z" /><path d="M12 10v4M12 17h.01" /></S>
export const IconHeart = () => <S><path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.4 3.9 4 7.3 4c2 0 3.5 1.1 4.7 2.7C13.2 5.1 14.7 4 16.7 4c3.4 0 5.7 3.4 4.5 6.7C19.5 15.4 12 20 12 20z" /></S>
export const IconTrainer = () => <S><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /><path d="M12 4v5.5M12 14.5V20M4 12h5.5M14.5 12H20" /></S>
export const IconController = () => <S><path d="M7 7h10a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-2a4 4 0 0 1 4-4z" /><path d="M8 10v4M6 12h4M15.5 11h.01M17.5 13h.01" /></S>
export const IconBluetooth = () => <S><path d="M7 7l10 10-5 4V3l5 4L7 17" /></S>
export const IconSignal = ({ level }: { level: 1 | 2 | 3 }) => (
  <S>
    <path d="M5 18v-2" opacity={1} />
    <path d="M10 18v-6" opacity={level >= 2 ? 1 : 0.3} />
    <path d="M15 18V8" opacity={level >= 3 ? 1 : 0.3} />
  </S>
)

/** 6-dot drag grip. */
export const IconGrip = () => (
  <svg viewBox="0 0 12 18" fill="currentColor" aria-hidden="true">
    {[3, 9].flatMap((x) => [3, 9, 15].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.6} />))}
  </svg>
)
