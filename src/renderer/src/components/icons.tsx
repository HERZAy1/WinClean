import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false
}

export function TreeIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps} {...props}>
      <path d="M6 4v10a3 3 0 0 0 3 3h9" />
      <path d="M6 8h5" />
      <path d="M6 14h3" />
      <circle
        cx="6"
        cy="4"
        r="1.5"
      />
      <circle
        cx="18"
        cy="17"
        r="1.5"
      />
      <circle
        cx="13"
        cy="8"
        r="1.5"
      />
      <circle
        cx="11"
        cy="14"
        r="1.5"
      />
    </svg>
  )
}

export function AppsIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps} {...props}>
      <rect
        x="4"
        y="4"
        width="6"
        height="6"
        rx="1.5"
      />
      <rect
        x="14"
        y="4"
        width="6"
        height="6"
        rx="1.5"
      />
      <rect
        x="4"
        y="14"
        width="6"
        height="6"
        rx="1.5"
      />
      <rect
        x="14"
        y="14"
        width="6"
        height="6"
        rx="1.5"
      />
    </svg>
  )
}

export function SettingsIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 7h7" />
      <path d="M15 7h5" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle
        cx="13"
        cy="7"
        r="2"
      />
      <circle
        cx="9"
        cy="17"
        r="2"
      />
    </svg>
  )
}

export function SunIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps} {...props}>
      <circle
        cx="12"
        cy="12"
        r="3.5"
      />
      <path d="M12 2.5v2" />
      <path d="M12 19.5v2" />
      <path d="M4.6 4.6 6 6" />
      <path d="m18 18 1.4 1.4" />
      <path d="M2.5 12h2" />
      <path d="M19.5 12h2" />
      <path d="M4.6 19.4 6 18" />
      <path d="m18 6 1.4-1.4" />
    </svg>
  )
}

export function MoonIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps} {...props}>
      <path d="M20 14.3A7.7 7.7 0 0 1 9.7 4a7.7 7.7 0 1 0 10.3 10.3Z" />
    </svg>
  )
}

export function ScanIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle
        cx="12"
        cy="12"
        r="3"
      />
    </svg>
  )
}

export function StopIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps} {...props}>
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="2"
      />
    </svg>
  )
}

export function DiskIcon(props: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps} {...props}>
      <ellipse
        cx="12"
        cy="6"
        rx="7"
        ry="3"
      />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  )
}
