export function GalleryMenuGroup({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[var(--border-subtle)]/80 py-1 first:border-t-0 first:pt-0">
      {label ? (
        <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function GalleryMenuButton(props: {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={props['data-testid']}
      onClick={props.onClick}
      className={`block w-full rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-base)]/70 px-3.5 py-2 text-left text-xs backdrop-blur-xs transition ${
        props.tone === 'danger'
          ? 'text-[var(--tint-danger-text)] hover:bg-[var(--tint-danger-bg)] hover:text-[var(--tint-danger-text)] hover:border-[var(--tint-danger-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--accent-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]'
      }`}
    >
      {props.label}
    </button>
  );
}
