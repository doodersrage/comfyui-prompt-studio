import type { ReactNode } from "react";
import {
  ROUTE_TINT_CLASSES,
  type ToolAccent,
} from "@/lib/tool-theme";

export type ToolPageWidth = "default" | "wide" | "full";
export type ToolSectionVariant = "primary" | "secondary";

const widthClasses: Record<ToolPageWidth, string> = {
  default: "max-w-5xl",
  wide: "max-w-6xl",
  full: "max-w-7xl",
};

const sectionSurfaceClasses: Record<ToolSectionVariant, string> = {
  primary: "ui-card",
  secondary: "ui-meta-panel shadow-none",
};

export function ToolBadge({
  accent = "violet",
  children,
}: {
  accent?: ToolAccent;
  children: ReactNode;
}) {
  const theme = ROUTE_TINT_CLASSES[accent];
  return (
    <div
      className={`type-overline inline-flex max-w-full items-center gap-2 rounded-[var(--radius-full)] border px-3 py-1 ${theme.badge}`}
    >
      {children}
    </div>
  );
}

export function ToolPageHeader({
  badge,
  title,
  description,
}: {
  badge?: ReactNode;
  title: string;
  description?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      {badge}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <h1 className="type-display min-w-0">{title}</h1>
        {description ? (
          typeof description === "string" ? (
            <p
              className="type-caption max-w-xl shrink-0 text-[var(--text-secondary)] sm:max-w-sm sm:text-right"
              title={description}
            >
              <span className="line-clamp-2">{description}</span>
            </p>
          ) : (
            <div className="type-caption max-w-xl shrink-0 text-[var(--text-secondary)] sm:max-w-sm sm:text-right">
              <div className="line-clamp-2">{description}</div>
            </div>
          )
        ) : null}
      </div>
    </header>
  );
}

export function ToolMetaPanel({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div className={`ui-meta-panel ${className}`.trim()}>
      {title ? <h3 className="type-heading mb-4">{title}</h3> : null}
      <div className="ui-block-group">{children}</div>
    </div>
  );
}

export function ToolContentPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`ui-content-panel ${className}`.trim()}>{children}</div>;
}

export function ToolBlockGroup({
  children,
  title,
  className = "",
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <section className={`ui-block-group ${className}`.trim()}>
      {title ? <h3 className="type-heading">{title}</h3> : null}
      {children}
    </section>
  );
}

export function ToolSection({
  children,
  className = "",
  padded = true,
  title,
  description,
  variant = "primary",
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  title?: string;
  description?: string;
  variant?: ToolSectionVariant;
}) {
  return (
    <section
      className={`${sectionSurfaceClasses[variant]} ${padded ? "p-[var(--card-padding)] sm:p-[var(--card-padding-lg)]" : ""} ${className}`.trim()}
    >
      {title ? (
        <div className="mb-6 space-y-2">
          <h2 className={variant === "primary" ? "type-title" : "type-heading"}>
            {title}
          </h2>
          {description ? <p className="type-caption">{description}</p> : null}
        </div>
      ) : null}
      <div className="ui-block-group">{children}</div>
    </section>
  );
}

export { CollapsibleSection } from "@/components/ui/CollapsibleSection";

export function ActionButtonBar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function ToolActionRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>{children}</div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  valueClassName = "",
}: {
  label: string;
  value: string;
  detail?: string;
  valueClassName?: string;
}) {
  return (
    <div className="ui-stat-card">
      <p className="ui-stat-card-label">{label}</p>
      <p className={`ui-stat-card-value ${valueClassName}`.trim()}>{value}</p>
      {detail ? <p className="type-caption mt-1">{detail}</p> : null}
    </div>
  );
}

export function HealthCard({
  title,
  ok,
  detail,
}: {
  title: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="ui-health-card">
      <div className="ui-health-card-title">
        <span
          className="ui-health-dot"
          data-status={ok ? "ok" : "error"}
          aria-hidden
        />
        {title}
      </div>
      <p className="type-caption mt-2 break-all">{detail || "—"}</p>
    </div>
  );
}

export function CodeBlock({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <pre className={`ui-code-block ${className}`.trim()}>{children}</pre>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{
    value: T;
    label: string;
    tone?: "default" | "danger";
  }>;
  "aria-label"?: string;
}) {
  return (
    <div className="ui-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          data-active={value === option.value ? "true" : "false"}
          data-tone={option.tone}
          className="ui-segmented-item"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export const actionButtonClassName = "ui-btn-secondary ui-btn-full";

export function ToolPageShell({
  children,
  width = "default",
  className = "",
}: {
  children: ReactNode;
  width?: ToolPageWidth;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-[var(--section-gap)] px-[var(--page-gutter)] py-10 sm:py-12 lg:py-14 ${widthClasses[width]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function ToolLayout({
  accent = "violet",
  width = "default",
  badge,
  title,
  description,
  sidebar,
  sidebarTitle = "Shared settings",
  sidebarDescription = "Model, detail, wardrobe, and workflow selection persist across tools.",
  children,
}: {
  accent?: ToolAccent;
  width?: ToolPageWidth;
  badge: ReactNode;
  title: string;
  description?: ReactNode;
  sidebar?: ReactNode;
  sidebarTitle?: string | false;
  sidebarDescription?: string;
  children: ReactNode;
}) {
  return (
    <ToolPageShell width={width}>
      <ToolPageHeader badge={badge} title={title} description={description} />

      <div
        className={
          sidebar
            ? "grid items-start gap-[var(--block-gap)] xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-12"
            : "ui-section-stack"
        }
      >
        <div className="ui-section-stack min-w-0">{children}</div>

        {sidebar ? (
          <aside className="xl:sticky xl:top-24">
            <ToolSection
              variant="secondary"
              title={sidebarTitle === false ? undefined : sidebarTitle}
              description={
                sidebarTitle === false ? undefined : sidebarDescription
              }
              className="sidebar-scroll xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto"
            >
              {sidebar}
            </ToolSection>
          </aside>
        ) : null}
      </div>
    </ToolPageShell>
  );
}

export {
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from "@/lib/tool-theme";

/** @deprecated Use ROUTE_TINT_CLASSES */
export { ROUTE_TINT_CLASSES as TOOL_ACCENT_CLASSES } from "@/lib/tool-theme";
