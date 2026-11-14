import { T } from "../i18n/LanguageContext";
import { useLanguage } from "../i18n/LanguageContext";
import { useEffect, useState, useId } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, errorMessage } from "../services/api";
import { useCommerce } from "../context/CommerceContext";
import { Button, Notice } from "./UI";
export const useData = (key, url, options = {}) =>
  useQuery({
    queryKey: Array.isArray(key) ? key : [key, url],
    queryFn: async () => (await api.get(url)).data,
    ...options,
  });
export function useAction() {
  const cache = useQueryClient();
  const { notify } = useCommerce();
  return useMutation({
    mutationFn: async ({ method = "post", url, data, headers }) =>
      (await api({ method, url, data, headers })).data,
    onSuccess: () => {
      cache.invalidateQueries();
      notify("Saved successfully.");
    },
    onError: (error) => notify(errorMessage(error)),
  });
}
export function QueryState({ query, children, empty }) {
  const { t } = useLanguage();
  if (query.isPending)
    return (
      <div className="skeleton-grid" role="status" aria-label={t("Loading")}>
        <div />
        <div />
        <div />
      </div>
    );
  if (query.error)
    return (
      <div>
        <Notice>{errorMessage(query.error)}</Notice>
        <Button className="secondary" onClick={() => query.refetch()}>
          <T>{"Try again"}</T>
        </Button>
      </div>
    );
  if (empty)
    return (
      <div className="empty">
        <h3>
          <T>{"Nothing here yet"}</T>
        </h3>
        <p>
          <T>{"Try changing your filters or check back soon."}</T>
        </p>
      </div>
    );
  return children;
}
export function Pagination({ data, page, setPage }) {
  const { t } = useLanguage();
  return data?.pages > 1 ? (
    <div className="pagination">
      <Button
        className="secondary"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        <T>{"Previous"}</T>
      </Button>
      <span>{t("Page {page} of {pages}", { page, pages: data.pages })}</span>
      <Button
        className="secondary"
        disabled={page >= data.pages}
        onClick={() => setPage(page + 1)}
      >
        <T>{"Next"}</T>
      </Button>
    </div>
  ) : null;
}
export function Status({ value }) {
  const { t } = useLanguage();
  return (
    <span className={`badge badge-${String(value).toLowerCase()}`}>
      {t(String(value).replaceAll("_", " "))}
    </span>
  );
}
export function Image({ image, alt, detail = false, className = "" }) {
  const [failed, setFailed] = useState(false);
  const url = detail ? image?.detailUrl : image?.thumbnailUrl;
  useEffect(() => setFailed(false), [url]);
  return (
    <img
      className={`catalog-image ${className}`}
      src={!failed && url ? url : "/placeholder.svg"}
      alt={alt}
      width={detail ? 960 : 320}
      height={detail ? 960 : 320}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
export function Form({
  schema,
  defaults,
  fields,
  onSubmit,
  submitLabel = "Save changes",
  children,
  busy,
}) {
  const { t } = useLanguage();
  const formId = useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError: setFieldError,
  } = useForm({ resolver: zodResolver(schema), defaultValues: defaults });
  const [error, setError] = useState("");
  return (
    <form
      className="market-form"
      onSubmit={handleSubmit(async (values) => {
        setError("");
        try {
          await onSubmit(values, reset);
        } catch (err) {
          const issues = err.response?.data?.errors || [];
          for (const issue of issues) {
            if (fields.some((field) => field.name === issue.field))
              setFieldError(
                issue.field,
                { type: "server", message: issue.message },
                { shouldFocus: true },
              );
          }
          setError(
            issues.length
              ? issues.map((issue) => issue.message).join(" ")
              : err.isAxiosError
                ? errorMessage(err)
                : err.message || errorMessage(err),
          );
        }
      })}
      noValidate
    >
      <Notice>{error}</Notice>
      <div className="form-grid">
        {fields.map((field) => (
          <div className={`field ${field.wide ? "wide" : ""}`} key={field.name}>
            <label htmlFor={`${formId}-${field.name}`}>{t(field.label)}</label>
            {field.type === "select" ? (
              <select
                id={`${formId}-${field.name}`}
                aria-invalid={!!errors[field.name]}
                aria-describedby={
                  errors[field.name]
                    ? `${formId}-${field.name}-error`
                    : undefined
                }
                {...register(field.name)}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                id={`${formId}-${field.name}`}
                rows={3}
                aria-invalid={!!errors[field.name]}
                aria-describedby={
                  errors[field.name]
                    ? `${formId}-${field.name}-error`
                    : undefined
                }
                {...register(field.name)}
              />
            ) : (
              <input
                id={`${formId}-${field.name}`}
                aria-invalid={!!errors[field.name]}
                aria-describedby={
                  errors[field.name]
                    ? `${formId}-${field.name}-error`
                    : undefined
                }
                type={field.type || "text"}
                step={field.step}
                min={field.min}
                placeholder={t(field.placeholder)}
                {...register(
                  field.name,
                  field.type === "number" ? { valueAsNumber: true } : {},
                )}
              />
            )}{" "}
            {errors[field.name] && (
              <span
                id={`${formId}-${field.name}-error`}
                role="alert"
                className="field-error"
              >
                {t(errors[field.name].message)}
              </span>
            )}
            {field.help && <small className="form-hint">{t(field.help)}</small>}
          </div>
        ))}
      </div>
      {children}
      <Button busy={isSubmitting || busy} type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}
export function PageHeading({ eyebrow, title, children }) {
  const { t } = useLanguage();
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{t(eyebrow)}</span>
        <h1>{t(title)}</h1>
      </div>
      {children}
    </div>
  );
}
export function Metric({ name, value, tone }) {
  const { t } = useLanguage();
  return (
    <div className="metric">
      <small>{t(name)}</small>
      <strong className={tone === "danger" ? "metric-value-danger" : undefined}>
        {value}
      </strong>
    </div>
  );
}
