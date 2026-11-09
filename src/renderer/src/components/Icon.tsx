import type { SVGProps } from 'react'

/**
 * Hand-drawn placeholder icon set (24×24, stroke-based so they take the text colour).
 * Swap any of these for the artist's own art later; components only refer to them by name.
 */
const paths: Record<string, React.ReactNode> = {
  // ---- connection presets
  crystal: (
    <>
      <circle cx="12" cy="10" r="6.5" />
      <path d="M8.5 8.2a4 4 0 0 1 3-2.6" />
      <path d="M7 19.5h10M8.5 16.6l-1.2 2.9M15.5 16.6l1.2 2.9" />
      <path d="M13.8 11.6l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6z" fill="currentColor" stroke="none" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3.5h5M10.5 3.5v5.2L5.6 17a2.2 2.2 0 0 0 1.9 3.4h9a2.2 2.2 0 0 0 1.9-3.4l-4.9-8.3V3.5" />
      <path d="M7.4 14h9.2" />
      <circle cx="10.5" cy="17" r=".9" fill="currentColor" stroke="none" />
      <circle cx="13.6" cy="15.9" r=".6" fill="currentColor" stroke="none" />
    </>
  ),
  strata: (
    <>
      <path d="M3.5 17.5l8.5 3.5 8.5-3.5" />
      <path d="M3.5 13.5l8.5 3.5 8.5-3.5" />
      <path d="M12 3l8.5 6.5L12 13 3.5 9.5z" />
    </>
  ),
  candle: (
    <>
      <path d="M12 3.2c1.6 1.9 2.2 3.1 2.2 4.1a2.2 2.2 0 0 1-4.4 0c0-1 .6-2.2 2.2-4.1z" />
      <path d="M8.5 11.5h7v8h-7z" />
      <path d="M6 19.5h12" />
      <path d="M12 9.5v2" />
    </>
  ),
  signpost: (
    <>
      <path d="M12 2.8v18.4M8.5 21.2h7" />
      <path d="M12 5h6.5l2 2-2 2H12" />
      <path d="M12 11H5.5l-2 2 2 2H12" />
    </>
  ),
  star: (
    <>
      <path d="M12 2.8l1.9 6.6 6.6 1.9-6.6 1.9L12 19.8l-1.9-6.6-6.6-1.9 6.6-1.9z" />
      <path d="M18.5 3.8l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" fill="currentColor" stroke="none" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="12" r="3.8" />
      <circle cx="7.5" cy="12" r="1.2" />
      <path d="M11.3 12h9.2M17.5 12v3M20.5 12v2.2" />
    </>
  ),

  // ---- interface
  d20: (
    <>
      <path d="M12 2.5l8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4z" />
      <path d="M12 2.5L7.6 9.8h8.8zM7.6 9.8L12 17l4.4-7.2M3.5 7.4l4.1 2.4M20.5 7.4l-4.1 2.4M7.6 9.8l-4.1 6.8M16.4 9.8l4.1 6.8M12 17v4.5M12 17l-8.5-.4M12 17l8.5-.4" />
    </>
  ),
  quill: (
    <>
      <path d="M20 3.5C12 4.5 7.5 9.5 5.2 18.8" />
      <path d="M20 3.5c-.4 5.6-3.8 10-9.6 11.6M9.3 9.7l4.6 1.2" />
      <path d="M4 20.5l1.2-1.7" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  back: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  reroll: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 4.2v4.6h-4.6" />
    </>
  ),
  check: <path d="M5 12.5l4.2 4.2L19 7" />,

  // ---- skill groups & stats
  sword: (
    <>
      <path d="M19.5 3.5l-9.8 9.8M19.5 3.5v4l-9 9M19.5 3.5h-4l-9 9" />
      <path d="M7.5 13.5l3 3M5 16l3 3M6.5 17.5L3.5 20.5" />
    </>
  ),
  boot: (
    <>
      <path d="M7 3.5h5v8.5l6.2 2.6a2.4 2.4 0 0 1 1.5 2.2v1.7H5.5V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M5.5 20.5h14.2M12 8h-2M12 11h-2" />
    </>
  ),
  speech: (
    <>
      <path d="M4 5.5h16v10H9.5L5 19.5v-4H4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  pick: (
    <>
      <path d="M3.5 9C7 4.5 13.5 3.5 20.5 5.5 15 6 10.5 7.5 7.5 11" />
      <path d="M10.5 8.5l9.5 12" />
    </>
  ),
  hammer: (
    <>
      <path d="M4.5 9.5l5-5 3 3-5 5z" />
      <path d="M11 6l3.5-1.5 2.5 2.5-1.5 3.5" />
      <path d="M10.5 11.5l9 9" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  bolt: <path d="M13.5 2.5L5.5 13.5h5.5l-1 8 8-11h-5.5z" />,
  sparkle: (
    <>
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" />
      <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  laurel: (
    <>
      <path d="M12 21c-5 0-8-4-8-9 0-2 .5-4 1.5-5.5" />
      <path d="M12 21c5 0 8-4 8-9 0-2-.5-4-1.5-5.5" />
      <path d="M5 11c1.5-.2 2.5.6 3 2M4.5 15c1.6-.3 2.7.4 3.5 1.7M6.5 7.5c1.4.1 2.2 1 2.4 2.3M19 11c-1.5-.2-2.5.6-3 2M19.5 15c-1.6-.3-2.7.4-3.5 1.7M17.5 7.5c-1.4.1-2.2 1-2.4 2.3" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 9.5v5" />
    </>
  ),
  bag: (
    <>
      <path d="M8 7.5V6a4 4 0 0 1 8 0v1.5" />
      <path d="M5 7.5h14l-1.2 12.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z" />
      <path d="M9 11.5c.8 1.2 1.8 1.8 3 1.8s2.2-.6 3-1.8" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" />,
  hourglass: (
    <>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M7.5 3.5c0 4.5 4.5 5.5 4.5 8.5s-4.5 4-4.5 8.5M16.5 3.5c0 4.5-4.5 5.5-4.5 8.5s4.5 4 4.5 8.5" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  skull: (
    <>
      <path d="M12 3.5a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.4 3 5.4v3.6h9v-3.6c1.7-1 3-2.8 3-5.4A7.5 7.5 0 0 0 12 3.5z" />
      <circle cx="9" cy="11.5" r="1.6" />
      <circle cx="15" cy="11.5" r="1.6" />
      <path d="M10.5 20v-2.5M13.5 20v-2.5" />
    </>
  ),
  drop: <path d="M12 3.5s6 6.6 6 10.7a6 6 0 0 1-12 0c0-4.1 6-10.7 6-10.7z" />,
  chain: (
    <>
      <rect x="3" y="9" width="9" height="6" rx="3" transform="rotate(-35 7.5 12)" />
      <rect x="12" y="9" width="9" height="6" rx="3" transform="rotate(-35 16.5 12)" />
    </>
  ),
  bread: (
    <>
      <path d="M4.5 14.5c0-4.5 3.5-8 7.5-8s7.5 3.5 7.5 8v3a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M9 10.5l1.5 2M12.5 9.5l1 2.5M16 10.5l-1 2" />
    </>
  ),
  fork: <path d="M12 21V10M8 3.5v4.5a4 4 0 0 0 8 0V3.5M12 3.5V8" />,
  armor: (
    <>
      <path d="M8 3.5l-4 2.5v5l2 1v8.5h12V12l2-1V6l-4-2.5c-.8 1.6-2.2 2.5-4 2.5s-3.2-.9-4-2.5z" />
      <path d="M12 6v14.5M8.5 12h7" />
    </>
  ),
  amulet: (
    <>
      <path d="M6 3.5c0 4.5 2.7 7.5 6 7.5s6-3 6-7.5" />
      <path d="M12 11l4.5 4.5L12 21l-4.5-5.5z" />
    </>
  ),
  bandage: (
    <>
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-35 12 12)" />
      <path d="M10.5 11h.01M13.5 11h.01M10.5 13h.01M13.5 13h.01" strokeWidth="2.2" />
    </>
  ),
  dagger: (
    <>
      <path d="M19.5 4.5L11 13l-1.5-1.5L18 3z" />
      <path d="M8 10l6 6M8.5 15.5l-4 4M7 13l-1.5 1.5L9.5 18.5 11 17" />
    </>
  ),
  bow: (
    <>
      <path d="M5.5 3.5c8 2 13 7 15 15" />
      <path d="M5.5 3.5l15 15" />
      <path d="M4 12l8-8" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 20L18.5 5.5" />
      <path d="M14 5h5v5M4 20l1-4M4 20l4-1" />
    </>
  ),
  herb: (
    <>
      <path d="M12 21V9" />
      <path d="M12 13c-4 0-6.5-2.5-6.5-6.5 4 0 6.5 2.5 6.5 6.5zM12 10c0-3.5 2.2-6 6.5-6.5 0 4-2.5 6.5-6.5 6.5z" />
    </>
  ),
  rod: (
    <>
      <path d="M3.5 20.5L17 4" />
      <path d="M17 4c2.5 2.5 3 7 3 11.5" />
      <path d="M20 15.5c0 1.5-.7 2.5-1.8 2.5" />
    </>
  ),
  net: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5v17M6 6l12 12M18 6L6 18" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c1-4 4.2-6 8-6s7 2 8 6" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  save: (
    <>
      <path d="M5 3.5h11l3.5 3.5v13.5h-14.5z" />
      <path d="M8 3.5v5h7v-5M8 20.5v-6h8v6" />
    </>
  ),
  rewind: (
    <>
      <path d="M11 6.5l-7 5.5 7 5.5z" />
      <path d="M20 6.5l-7 5.5 7 5.5z" />
    </>
  ),
  left: <path d="M14.5 6l-6 6 6 6" />,
  right: <path d="M9.5 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="10" rx="2" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),

  // ---- races
  'race-human': (
    <>
      <circle cx="12" cy="9" r="4.5" />
      <path d="M5 21c.6-4.2 3.5-6.5 7-6.5s6.4 2.3 7 6.5" />
    </>
  ),
  'race-dwarf': (
    <>
      <path d="M7.5 9.5a4.5 4.5 0 0 1 9 0" />
      <path d="M6 9.5h12v1.5c0 2-1 3-1 3l-1.5 7-1.5-2-1 2.5-1-2.5-1.5 2-1.5-7s-1-1-1-3z" />
      <path d="M10 12.5h4" />
    </>
  ),
  'race-elf': (
    <>
      <path d="M8 10c-3-1.5-4.5-4.5-4.5-6.5 2.5.8 4.5 2 5.5 3.5" />
      <path d="M16 10c3-1.5 4.5-4.5 4.5-6.5-2.5.8-4.5 2-5.5 3.5" />
      <ellipse cx="12" cy="11.5" rx="4.5" ry="5.5" />
      <path d="M8 21c1-2.6 2.4-4 4-4s3 1.4 4 4" />
    </>
  ),
  'race-halfling': (
    <>
      <circle cx="12" cy="11" r="4" />
      <path d="M8 9c-1-3 1-5.5 4-5.5s5 2.5 4 5.5" />
      <path d="M6.5 21c.6-3 2.8-5 5.5-5s4.9 2 5.5 5" />
    </>
  ),
  'race-orc': (
    <>
      <path d="M6.5 8.5C6.5 5.5 9 3.5 12 3.5s5.5 2 5.5 5V13c0 3.5-2.5 6-5.5 6s-5.5-2.5-5.5-6z" />
      <path d="M9 14.5l.5-2.5M15 14.5l-.5-2.5" />
      <path d="M9 9.5l2 .8M15 9.5l-2 .8" />
    </>
  ),

  warn: (
    <>
      <path d="M12 3.5l9.2 16H2.8z" />
      <path d="M12 9.5v4.6" />
      <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  chevron: <path d="M8 10l4 4 4-4" />,
  scroll: (
    <>
      <path d="M7 4.5h10.5a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H16" />
      <path d="M7 4.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5" />
      <path d="M8.5 10.5h6M8.5 13.5h6M8.5 16.5h4" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.5v4M15 3.5v4" />
      <path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16v4.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 14.5v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
    </>
  ),
  party: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M2.8 19.5c.8-3.4 3.2-5.2 6.2-5.2s5.4 1.8 6.2 5.2" />
      <path d="M15.2 5.6a3.2 3.2 0 1 1 1.3 6.1M17.5 14.6c2 .6 3.3 2.2 3.8 4.9" />
    </>
  ),
  cards: (
    <>
      <path d="M8.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v12" />
      <rect x="5" y="6.5" width="11" height="14" rx="1.5" />
      <circle cx="10.5" cy="11.5" r="2.2" />
      <path d="M7.5 17.5c.6-1.6 1.6-2.4 3-2.4s2.4.8 3 2.4" />
    </>
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  )
}

export function Icon({ name, size = 22, ...rest }: { name: string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name] ?? paths.d20}
    </svg>
  )
}
