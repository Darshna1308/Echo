/*
  Small shared building blocks: buttons, fields, dialogs, loaders and
  empty/error states. Styles live in ui.css.
*/
import { forwardRef, useEffect, useId, useRef } from "react";
import { Link } from "react-router";
import "./ui.css";

export function Button({ variant = "primary", size, busy = false, children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`btn btn--${variant}${size ? ` btn--${size}` : ""}${busy ? " is-busy" : ""} ${className}`}
      aria-busy={busy || undefined}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy && <span className="btn-spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

export function ButtonLink({ variant = "primary", size, className = "", ...props }) {
  return <Link className={`btn btn--${variant}${size ? ` btn--${size}` : ""} ${className}`} {...props} />;
}

export const Field = forwardRef(function Field(
  { label, hint, error, multiline = false, className = "", inputClassName = "", optional = false, id: givenId, ...props },
  ref
) {
  const generatedId = useId();
  const id = givenId || generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const Control = multiline ? "textarea" : "input";
  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="field-optional">optional</span>}
      </label>
      <Control
        ref={ref}
        id={id}
        className={`field-control ${inputClassName}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
});

export function Spinner({ label = "Loading" }) {
  return (
    <span className="spinner" role="status">
      <span className="spinner-arch" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export function PageLoader({ label = "Loading…" }) {
  return (
    <div className="page-loader">
      <Spinner label={label} />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ title, children, action, art = "arch" }) {
  return (
    <section className={`empty-state empty-state--${art}`}>
      <div className="empty-state-art" aria-hidden="true">
        <span />
      </div>
      <h2>{title}</h2>
      {children && <div className="empty-state-body">{children}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </section>
  );
}

export function ErrorState({ error, onRetry, title = "This page couldn't load." }) {
  return (
    <section className="error-state" role="alert">
      <h2>{title}</h2>
      <p>{error?.message || "Something went wrong."}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </section>
  );
}

/*
  Accessible modal built on <dialog>: focus is trapped, Esc closes,
  and focus returns to the trigger afterwards.
*/
export function Dialog({ open, onClose, title, children, actions, tone }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${tone ? `dialog--${tone}` : ""}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose?.();
      }}
    >
      {open && (
        <div className="dialog-body">
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          <div className="dialog-content">{children}</div>
          {actions && <div className="dialog-actions">{actions}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Chip({ children, onRemove, tone, as: Tag = "span", ...props }) {
  return (
    <Tag className={`chip ${tone ? `chip--${tone}` : ""}`} {...props}>
      <span>{children}</span>
      {onRemove && (
        <button type="button" className="chip-remove" onClick={onRemove} aria-label={`Remove ${children}`}>
          ×
        </button>
      )}
    </Tag>
  );
}

export function VisuallyHidden({ children }) {
  return <span className="visually-hidden">{children}</span>;
}
