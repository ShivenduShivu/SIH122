import type { ReactNode } from 'react';

const shapes: Record<string, ReactNode> = {
  timeline: (
    <>
      <path d="M3 5h9M7 10h13M4 15h10M10 20h11M3 3v4M7 8v4M4 13v4M10 18v4" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </>
  ),
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18M7 15h3M14 15h3M7 18h3" />
    </>
  ),
  reports: (
    <>
      <path d="M9 3h7l4 4v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM15 3v5h5M4 7H3v10a2 2 0 0 0 2 2" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="m9 13 2 2 4-4" />
    </>
  ),
  history: (
    <>
      <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  microphone: (
    <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
    </>
  ),
  camera: (
    <>
      <path d="m8 5 2-3h4l2 3h4a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  pen: (
    <>
      <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z" />
    </>
  ),
  external: (
    <>
      <path d="M14 3h7v7M21 3 11 13M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6" />
    </>
  ),
};

export type IconName =
  | 'timeline'
  | 'table'
  | 'overview'
  | 'calendar'
  | 'reports'
  | 'clipboard'
  | 'history'
  | 'home'
  | 'microphone'
  | 'camera'
  | 'pen'
  | 'external';
export function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  );
}
