import type { HTMLAttributes, ReactNode } from 'react';

export function DataList({
  children,
  className = '',
  scrollable = true,
  maxHeightClass = 'max-h-[22rem]',
}: {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
  maxHeightClass?: string;
}) {
  return (
    <div
      className={`ui-list ${scrollable ? `ui-list-scroll sidebar-scroll ${maxHeightClass}` : ''} ${className}`.trim()}
      role="list"
    >
      {children}
    </div>
  );
}

export function DataListRow({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`ui-list-row ${className}`.trim()} role="listitem" {...props}>
      {children}
    </div>
  );
}

export function DataListPrimary({
  title,
  subtitle,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ui-list-primary ${className}`.trim()}>
      {title ? <p className="type-heading ui-truncate">{title}</p> : null}
      {subtitle ? <p className="type-caption ui-truncate-2 mt-1">{subtitle}</p> : null}
      {children}
    </div>
  );
}

export function DataListSecondary({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`ui-list-secondary ui-truncate ${className}`.trim()}>{children}</p>;
}

export function DataListActions({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`ui-list-actions ${className}`.trim()}>{children}</div>;
}
