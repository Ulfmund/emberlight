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
