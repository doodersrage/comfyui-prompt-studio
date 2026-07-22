type BrandMarkProps = {
  className?: string;
  size?: number;
  /** Show wordmark beside the mark */
  withWordmark?: boolean;
  wordmarkClassName?: string;
};

/** Prompt Studio mark — teal → sky → warm sand, studio viewport + prompt bars. */
export default function BrandMark({
  className,
  size = 28,
  withWordmark = false,
  wordmarkClassName,
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset */}
      <img
        src="/brand-mark.svg"
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-[22%] shadow-[0_8px_24px_-12px_rgba(56,189,248,0.45)]"
        decoding="async"
      />
      {withWordmark ? (
        <span className={wordmarkClassName ?? "type-title tracking-tight"}>
          Prompt Studio
        </span>
      ) : (
        <span className="sr-only">Prompt Studio</span>
      )}
    </span>
  );
}
