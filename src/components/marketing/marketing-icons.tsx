import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    ...props,
  };
}

export function IconInquiry(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

export function IconPreferences(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

export function IconProposal(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3h6l4 4v14H8z" />
      <path d="M14 3v4h4M10 13h6M10 17h4" />
    </svg>
  );
}

export function IconHold(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconSchedule(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </svg>
  );
}

export function IconVenue(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V8l8-4 8 4v12" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export function IconGroup(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16 11a3 3 0 1 0-2-5.2M8 11a3 3 0 1 1 2-5.2M4 20a4 4 0 0 1 4-4h2M20 20a4 4 0 0 0-4-4h-2" />
    </svg>
  );
}

export function IconParty(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18M8 7h8M7 21h10" />
    </svg>
  );
}

export function IconCorporate(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V8l8-4 8 4v12M9 20v-6h6v6" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
