import { T } from "../i18n/LanguageContext";
import { Children } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { LoaderCircle } from "lucide-react";
export function Button({ children, busy, disabled, className = "", ...props }) {
  const { t } = useLanguage();
  return (
    <button
      className={`button ${className}`}
      {...props}
      disabled={!!(busy || disabled)}
      aria-busy={busy || undefined}
    >
      {busy && <LoaderCircle size={18} className="animate-spin" />}
      {Children.map(children, (child) =>
        typeof child === "string" ? t(child) : child,
      )}
    </button>
  );
}
export function Field({ label, error, id, ...props }) {
  const { t } = useLanguage();
  return (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <span id={`${id}-error`} className="field-error">
          {t(error)}
        </span>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="animate-spin" />{" "}
      <T>{"Loading your neighborhood…"}</T>
    </div>
  );
}
export function Notice({ children }) {
  const { t } = useLanguage();
  return children ? (
    <div className="notice" role="alert">
      {typeof children === "string" ? t(children) : children}
    </div>
  ) : null;
}
