import { T } from "../../i18n/LanguageContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { useCommerce } from "../../context/CommerceContext";
import { api, errorMessage } from "../../services/api";
import { Button, Notice } from "../../components/UI";
import { PageHeading } from "../../components/MarketUI";
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number."),
  addresses: z
    .array(
      z.object({
        label: z.string().max(50),
        line: z.string().min(3).max(300),
        city: z.string().min(2).max(100),
        pinCode: z.string().regex(/^[1-9]\d{5}$/, "Enter a valid PIN."),
      }),
    )
    .max(10),
});
export function Account() {
  const { t } = useLanguage();
  const { user, reloadUser, logout } = useAuth();
  const { notify } = useCommerce();
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user.name,
      phone: user.phone,
      addresses: (user.addresses || []).map(
        ({ label, line, city, pinCode }) => ({ label, line, city, pinCode }),
      ),
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "addresses",
  });
  return (
    <section className="container market-page">
      <PageHeading
        eyebrow="Your LocalCart account"
        title={t("Hello, {name}.", { name: user.name.split(" ")[0] })}
      />
      <div className="cart-layout">
        <div className="panel">
          <h2>
            <T>{"Profile & saved addresses"}</T>
          </h2>
          <p className="muted">
            {user.email} · {user.role} account
          </p>
          <Notice>{error}</Notice>
          <form
            className="market-form"
            onSubmit={handleSubmit(async (values) => {
              setError("");
              try {
                await api.patch("/profile", values);
                await reloadUser();
                cache.invalidateQueries();
                notify("Profile updated.");
              } catch (err) {
                setError(errorMessage(err));
              }
            })}
          >
            <div className="form-grid">
              {[
                ["name", "Full name"],
                ["phone", "Mobile number"],
              ].map(([name, label]) => (
                <div className="field" key={name}>
                  <label htmlFor={name}>
                    <T>{label}</T>
                  </label>
                  <input id={name} {...register(name)} />
                  {errors[name] && (
                    <span className="field-error">{errors[name].message}</span>
                  )}
                </div>
              ))}
            </div>
            <h3>
              <T>{"Saved addresses"}</T>
            </h3>
            {fields.map((field, index) => (
              <div className="address-card" key={field.id}>
                <div className="form-grid">
                  {[
                    ["label", "Label"],
                    ["line", "Street address"],
                    ["city", "City"],
                    ["pinCode", "PIN code"],
                  ].map(([name, label]) => (
                    <div className="field" key={name}>
                      <label htmlFor={`address-${index}-${name}`}>
                        <T>{label}</T>
                      </label>
                      <input
                        id={`address-${index}-${name}`}
                        {...register(`addresses.${index}.${name}`)}
                      />
                      {errors.addresses?.[index]?.[name] && (
                        <span className="field-error">
                          {errors.addresses[index][name].message}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  className="secondary"
                  onClick={() => remove(index)}
                >
                  <T>{"Remove address"}</T>
                </Button>
              </div>
            ))}
            <div className="row-actions">
              <Button
                type="button"
                className="secondary"
                disabled={fields.length >= 10}
                onClick={() =>
                  append({ label: "Home", line: "", city: "", pinCode: "" })
                }
              >
                <T>{"+ Add address"}</T>
              </Button>
              <Button busy={isSubmitting} type="submit">
                <T>{"Save profile"}</T>
              </Button>
            </div>
          </form>
        </div>
        <aside className="panel">
          <h2>
            <T>{"Your neighborhood shortcuts"}</T>
          </h2>
          <div className="account-links">
            {user.role === "admin" ? (
              <Link to="/admin">Open admin dashboard →</Link>
            ) : user.role === "shopkeeper" ? (
              <Link to="/shopkeeper">
                <T>{"Open shopkeeper dashboard →"}</T>
              </Link>
            ) : (
              <>
                <Link to="/orders">
                  <T>{"Track your orders →"}</T>
                </Link>
                <Link to="/bookings">
                  <T>{"My bookings"}</T> →
                </Link>
                <Link to="/shops">
                  <T>{"Explore stores →"}</T>
                </Link>
                <Link to="/apply">
                  <T>{"Register your shop →"}</T>
                </Link>
              </>
            )}
            <Link to="/notifications">
              <T>{"Notifications →"}</T>
            </Link>
          </div>
          <Button
            className="secondary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await logout();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <T>{"Sign out"}</T>
          </Button>
        </aside>
      </div>
    </section>
  );
}
