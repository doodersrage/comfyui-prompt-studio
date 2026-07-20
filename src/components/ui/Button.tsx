import Link from "next/link";
import type { LinkProps } from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "info" | "accent-outline";
type ButtonSize = "default" | "sm";

type LoadingProps = {
  loading?: boolean;
  loadingLabel?: string;
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  LoadingProps & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    children: ReactNode;
  };

const variantClasses: Record<ButtonVariant, string> = {
  primary: "ui-btn-primary",
  secondary: "ui-btn-secondary",
  ghost: "ui-btn-ghost",
  danger: "ui-btn-danger",
  info: "ui-btn-info",
  "accent-outline": "ui-btn-accent-outline",
};

function buttonClassName({
  variant = "secondary",
  size = "default",
  fullWidth = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}) {
  const sizeClass = size === "sm" ? "ui-btn-sm" : "";
  return `${variantClasses[variant]} ${sizeClass} ${fullWidth ? "ui-btn-full" : ""} ${className}`.trim();
}

function ButtonContent({
  loading,
  loadingLabel,
  children,
}: {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}) {
  return (
    <>
      {loading ? (
        <span className="ui-spinner ui-spinner-sm" aria-hidden />
      ) : null}
      <span className={loading ? "opacity-90" : undefined}>{children}</span>
      {loading && loadingLabel ? (
        <span className="sr-only">{loadingLabel}</span>
      ) : null}
    </>
  );
}

export function Spinner({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "sm" ? "ui-spinner-sm" : size === "lg" ? "ui-spinner-lg" : "";
  return (
    <span
      className={`ui-spinner ${sizeClass} ${className}`.trim()}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Skeleton({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-skeleton ${className}`.trim()} {...props} />;
}

export function Button({
  variant = "secondary",
  size = "default",
  fullWidth = false,
  loading = false,
  loadingLabel,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    >
      <ButtonContent loading={loading} loadingLabel={loadingLabel}>
        {children}
      </ButtonContent>
    </button>
  );
}

type ButtonLinkProps = Omit<LinkProps, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export function ButtonLink({
  variant = "secondary",
  size = "default",
  className = "",
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}

export function PrimaryButton({
  accentClassName = "ui-btn-primary",
  className = "",
  loading = false,
  loadingLabel,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  LoadingProps & {
    accentClassName?: string;
    children: ReactNode;
  }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${accentClassName} ${className}`.trim()}
      {...props}
    >
      <ButtonContent loading={loading} loadingLabel={loadingLabel}>
        {children}
      </ButtonContent>
    </button>
  );
}
