import { useLanguage } from "../../i18n/LanguageContext";
import { T } from "../../i18n/LanguageContext";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Button, Field, Loading, Notice } from "../../components/UI";
import { errorMessage } from "../../services/api";
const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2, "Enter at least two characters.").max(100),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number."),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(72)
    .refine(
      (value) => new TextEncoder().encode(value).length <= 72,
      "Use at most 72 UTF-8 bytes.",
    ),
});
export function AuthPage({ register = false }) {
  const { t } = useLanguage();
  const { user, loading, authenticate } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const {
    register: bind,
    handleSubmit,
    setError: setFieldError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(register ? registerSchema : loginSchema),
  });
  const email = watch("email") || "";
  const parts = email.split("@");
  const suggestGmail =
    emailFocused &&
    parts.length === 2 &&
    parts[0].length > 0 &&
    !/\s/.test(email) &&
    "gmail.com".startsWith(parts[1].toLowerCase()) &&
    parts[1].toLowerCase() !== "gmail.com";
  const suggestedEmail = `${parts[0]}@gmail.com`;
  const emailBinding = bind("email");
  const acceptEmail = () => {
    setValue("email", suggestedEmail, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setEmailFocused(false);
  };
  if (loading) return <Loading />;
  if (user) return <Navigate to="/account" replace />;
  async function submit(values) {
    setError("");
    try {
      await authenticate(register ? "register" : "login", values);
      navigate("/account", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      err.response?.data?.errors?.forEach((issue) =>
        setFieldError(issue.field, { message: issue.message }),
      );
    }
  }
  return (
    <section className="container auth-layout">
      <div className="auth-story">
        <span className="eyebrow">
          <T>{"Welcome to your neighborhood"}</T>
        </span>
        <h1>
          <T>{register ? "Local starts" : "Good to have"}</T>
          <br />
          <em>
            <T>{register ? "with you." : "you back."}</T>
          </em>
        </h1>
        <p>
          <T>
            {
              "A familiar shop. A friendly face. Your everyday essentials, a little easier."
            }
          </T>
        </p>
        <div className="security-note">
          <ShieldCheck />{" "}
          <T>{"Secure sign-in. Built around your community."}</T>
        </div>
      </div>
      <div className="auth-card">
        <h2>
          <T>{register ? "Create your account" : "Sign in to LocalCart"}</T>
        </h2>
        <p>
          <T>
            {register
              ? "Your next chapter of shopping local starts here."
              : "Welcome back to your corner of the world."}
          </T>
        </p>
        <Notice>{error}</Notice>
        <form onSubmit={handleSubmit(submit)} noValidate>
          {register && (
            <Field
              label="Full name"
              id="name"
              autoComplete="name"
              error={errors.name?.message}
              {...bind("name")}
            />
          )}
          <div className="email-autocomplete">
            <Field
              label="Email address"
              id="email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...emailBinding}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestGmail}
              aria-controls={suggestGmail ? "email-suggestions" : undefined}
              aria-activedescendant={
                suggestGmail ? "gmail-suggestion" : undefined
              }
              onFocus={() => setEmailFocused(true)}
              onBlur={(event) => {
                emailBinding.onBlur(event);
                setEmailFocused(false);
              }}
              onChange={(event) => {
                emailBinding.onChange(event);
                setEmailFocused(true);
              }}
              onKeyDown={(event) => {
                if (suggestGmail && ["Enter", "Tab"].includes(event.key)) {
                  if (event.key === "Enter") event.preventDefault();
                  acceptEmail();
                } else if (event.key === "Escape") setEmailFocused(false);
              }}
            />
            {suggestGmail && (
              <div
                id="email-suggestions"
                role="listbox"
                aria-label="Email suggestions"
              >
                <button
                  id="gmail-suggestion"
                  className="email-suggestion"
                  type="button"
                  role="option"
                  aria-selected="true"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={acceptEmail}
                >
                  {suggestedEmail}
                  <small>
                    <T>{"Use Gmail · Enter to select"}</T>
                  </small>
                </button>
              </div>
            )}
          </div>
          {register && (
            <Field
              label="Mobile number"
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder={t("10-digit mobile number")}
              error={errors.phone?.message}
              {...bind("phone")}
            />
          )}
          <Field
            label="Password"
            id="password"
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            error={errors.password?.message}
            {...bind("password")}
          />
          {register && (
            <small className="form-hint">
              <T>
                {
                  "Use 12–72 characters. A longer, unique passphrase works well."
                }
              </T>
            </small>
          )}
          <Button type="submit" busy={isSubmitting}>
            <T>{register ? "Create account" : "Sign in"}</T>
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="auth-switch">
          <T>
            {register
              ? "Already part of the neighborhood?"
              : "New to LocalCart?"}
          </T>{" "}
          <Link to={register ? "/login" : "/register"}>
            <T>{register ? "Sign in" : "Create an account"}</T>
          </Link>
        </p>
        {register && (
          <p className="form-hint">
            <T>
              {
                "Shop owner? Create an account, then apply to bring your store online."
              }
            </T>
          </p>
        )}
      </div>
    </section>
  );
}
