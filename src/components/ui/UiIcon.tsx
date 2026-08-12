type UiIconName = 'play' | 'pending' | 'download' | 'pause' | 'close' | 'check';

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export default function UiIcon({
  name,
  className = '',
  size = 14,
}: {
  name: UiIconName;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden
      className={`shrink-0 ${className}`.trim()}
      {...common}
    >
      {name === 'play' ? <path d="M5 3.5v9l8-4.5z" fill="currentColor" stroke="none" /> : null}
      {name === 'pending' ? (
        <>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M8 5v3.25L10.25 10" />
        </>
      ) : null}
      {name === 'download' ? (
        <>
          <path d="M8 3v7.5" />
          <path d="M5.25 8.25 8 11l2.75-2.75" />
          <path d="M3.5 13h9" />
        </>
      ) : null}
      {name === 'pause' ? (
        <>
          <path d="M5.5 4v8" />
          <path d="M10.5 4v8" />
        </>
      ) : null}
      {name === 'close' ? (
        <>
          <path d="M4.5 4.5l7 7" />
          <path d="M11.5 4.5l-7 7" />
        </>
      ) : null}
      {name === 'check' ? <path d="M3.5 8.25 6.5 11l6-6.5" /> : null}
    </svg>
  );
}
