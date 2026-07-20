import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const inputClassName =
  "ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body";

const selectClassName = `${inputClassName} ui-select`;

export function FieldLabel({
  children,
  htmlFor,
  hint,
}: {
  children: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="type-heading">
        {children}
      </label>
      {hint ? <p className="type-caption">{hint}</p> : null}
    </div>
  );
}

export function TextInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClassName} ${className}`.trim()} {...props} />;
}

export function SelectInput({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${selectClassName} ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

export function TextArea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${inputClassName} resize-y py-3 type-body-lg ${className}`.trim()}
      {...props}
    />
  );
}

export function MonoTextArea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${inputClassName} ui-input-mono resize-y py-3 ${className}`.trim()}
      {...props}
    />
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) {
    return null;
  }

  return <p className="ui-alert-danger">{children}</p>;
}

export function FieldDivider() {
  return <div className="ui-divider" />;
}

export function ChipButton({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? "true" : "false"}
      className={`ui-chip ${className}`.trim()}
    >
      {children}
    </button>
  );
}
