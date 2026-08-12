/** Mark-derived studio illustration — viewport + prompt bars, for welcome/empty moments. */
export default function BrandStudioIllustration({
  className = '',
  size = 120,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 120 96"
      width={size}
      height={Math.round(size * 0.8)}
      aria-hidden
      className={`shrink-0 ${className}`.trim()}
    >
      <defs>
        <linearGradient
          id="bsi-glow"
          x1="20"
          y1="8"
          x2="100"
          y2="88"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="55%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#f0ab7c" />
        </linearGradient>
        <linearGradient
          id="bsi-panel"
          x1="30"
          y1="20"
          x2="90"
          y2="76"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#1a2332" />
          <stop offset="100%" stopColor="#0f141c" />
        </linearGradient>
      </defs>
      <rect
        x="18"
        y="12"
        width="84"
        height="72"
        rx="16"
        fill="url(#bsi-panel)"
        stroke="url(#bsi-glow)"
        strokeWidth="1.75"
        strokeOpacity="0.55"
      />
      <rect x="34" y="32" width="42" height="5" rx="2.5" fill="#5eead4" opacity="0.95" />
      <rect x="34" y="44" width="30" height="5" rx="2.5" fill="#38bdf8" opacity="0.8" />
      <rect x="34" y="56" width="36" height="5" rx="2.5" fill="#f0ab7c" opacity="0.7" />
      <rect x="82" y="30" width="4" height="16" rx="2" fill="#f0ab7c" opacity="0.85" />
      <circle cx="96" cy="70" r="3" fill="#38bdf8" opacity="0.35" />
      <circle cx="28" cy="24" r="2.5" fill="#5eead4" opacity="0.3" />
    </svg>
  );
}
